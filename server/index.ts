import cors from "cors";
import express from "express";
import crypto from "node:crypto";
import { Pool, PoolClient } from "pg";

// -----------------------------
// Types
// -----------------------------

type Outcome = "yes" | "no";
type MarketStatus = "open" | "resolved";

type DemoUser = {
  id: string;
  name: string;
  balance: number;
};

type Market = {
  id: string;
  question: string;
  category: string;
  description: string;
  source: string;
  closesAt: string;
  yesPool: number;
  noPool: number;
  status: MarketStatus;
  resolvedOutcome?: Outcome;
  resolvedAt?: string;
  createdAt: string;
};

type Prediction = {
  id: string;
  userId: string;
  userName: string;
  marketId: string;
  marketQuestion: string;
  outcome: Outcome;
  amount: number;
  probabilityAtPurchase: number;
  createdAt: string;
  resolvedOutcome?: Outcome;
  payout?: number;
  settledAt?: string;
};

type MarketComment = {
  id: string;
  marketId: string;
  userId: string;
  userName: string;
  text: string;
  createdAt: string;
  mediaDataUrl?: string;
  mediaName?: string;
};

type BalanceTransaction = {
  id: string;
  userId: string;
  type: "start" | "prediction_buy" | "payout" | "refund" | "system";
  title: string;
  description: string;
  amount: number;
  marketId?: string;
  marketQuestion?: string;
  createdAt: string;
};

type DatabaseSnapshot = {
  users: DemoUser[];
  markets: Market[];
  predictions: Prediction[];
  comments: MarketComment[];
  transactions: BalanceTransaction[];
  favoriteMarketIdsByUser: Record<string, string[]>;
  adminUserIds: string[];
};

// -----------------------------
// Config
// -----------------------------

const PORT = Number(process.env.PORT || 4000);
const START_BALANCE = 10000;
const DATABASE_URL = process.env.DATABASE_URL;
const BOT_TOKEN = process.env.BOT_TOKEN || "";
const TELEGRAM_AUTH_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
const ADMIN_TELEGRAM_IDS = (process.env.ADMIN_TELEGRAM_IDS || "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);

const ADMIN_USER_IDS = ADMIN_TELEGRAM_IDS.flatMap((id) => [id, `telegram-${id}`]);

if (!DATABASE_URL) {
  console.error("Ошибка: не задана переменная окружения DATABASE_URL");
  console.error("На Render добавь DATABASE_URL в Environment сервиса backend.");
  process.exit(1);
}

if (!BOT_TOKEN) {
  console.warn("Предупреждение: не задан BOT_TOKEN. Проверка Telegram initData и админ-действия будут недоступны.");
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes("localhost")
    ? false
    : {
        rejectUnauthorized: false,
      },
});

// -----------------------------
// Helpers
// -----------------------------

function createId() {
  return crypto.randomUUID();
}

function nowRu() {
  return new Date().toLocaleString("ru-RU");
}

function nowIso() {
  return new Date().toISOString();
}

function formatDbDateTime(value: unknown) {
  if (!value) return nowRu();
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("ru-RU");
}

function getYesProbability(market: Pick<Market, "yesPool" | "noPool">) {
  const total = market.yesPool + market.noPool;

  if (total <= 0) {
    return 50;
  }

  return Math.round((market.yesPool / total) * 100);
}

function getUserDisplayName(user: DemoUser) {
  return user.name.trim() || "Участник";
}

function normalizeOutcome(value: unknown): Outcome | null {
  if (value === "yes" || value === "no") {
    return value;
  }

  return null;
}

type TelegramUserPayload = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
};

type TelegramAuthResult =
  | { ok: true; user: TelegramUserPayload; authDate?: number }
  | { ok: false; error: string };

function getTelegramInitData(request: express.Request) {
  const headerValue = request.header("x-telegram-init-data");
  const bodyValue = request.body?.initData;

  return String(headerValue || bodyValue || "").trim();
}

function validateTelegramInitData(initData: string): TelegramAuthResult {
  if (!BOT_TOKEN) {
    return { ok: false, error: "На сервере не настроен BOT_TOKEN" };
  }

  if (!initData) {
    return { ok: false, error: "Нет Telegram initData" };
  }

  const params = new URLSearchParams(initData);
  const receivedHash = params.get("hash");

  if (!receivedHash) {
    return { ok: false, error: "В Telegram initData нет hash" };
  }

  params.delete("hash");

  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(BOT_TOKEN)
    .digest();

  const calculatedHash = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  const receivedBuffer = Buffer.from(receivedHash, "hex");
  const calculatedBuffer = Buffer.from(calculatedHash, "hex");

  if (receivedBuffer.length !== calculatedBuffer.length) {
    return { ok: false, error: "Некорректная Telegram-подпись" };
  }

  if (!crypto.timingSafeEqual(receivedBuffer, calculatedBuffer)) {
    return { ok: false, error: "Некорректная Telegram-подпись" };
  }

  const authDate = Number(params.get("auth_date") || 0);

  if (authDate > 0) {
    const ageSeconds = Math.floor(Date.now() / 1000) - authDate;

    if (ageSeconds > TELEGRAM_AUTH_MAX_AGE_SECONDS) {
      return { ok: false, error: "Telegram-сессия устарела. Перезапусти Mini App." };
    }
  }

  const userRaw = params.get("user");

  if (!userRaw) {
    return { ok: false, error: "В Telegram initData нет пользователя" };
  }

  try {
    const user = JSON.parse(userRaw) as TelegramUserPayload;

    if (!user.id) {
      return { ok: false, error: "В Telegram initData нет user.id" };
    }

    return { ok: true, user, authDate };
  } catch {
    return { ok: false, error: "Не удалось прочитать Telegram-пользователя" };
  }
}

function isAdminUserId(userId: string) {
  return ADMIN_USER_IDS.includes(userId);
}

function requireAdmin(request: express.Request, response: express.Response) {
  const telegramAuth = validateTelegramInitData(getTelegramInitData(request));

  if (!telegramAuth.ok) {
    response.status(401).json({
      error: `Telegram-авторизация не пройдена: ${telegramAuth.error}`,
    });
    return false;
  }

  const telegramId = String(telegramAuth.user.id);
  const userId = `telegram-${telegramId}`;

  if (!isAdminUserId(telegramId) && !isAdminUserId(userId)) {
    response.status(403).json({
      error: "Недостаточно прав. Это действие доступно только администратору.",
    });
    return false;
  }

  return true;
}

async function withTransaction<T>(callback: (client: PoolClient) => Promise<T>) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function toUser(row: any): DemoUser {
  return {
    id: row.id,
    name: row.name,
    balance: Number(row.balance),
  };
}

function toMarket(row: any): Market {
  return {
    id: row.id,
    question: row.question,
    category: row.category,
    description: row.description,
    source: row.source,
    closesAt: row.closes_at,
    yesPool: Number(row.yes_pool),
    noPool: Number(row.no_pool),
    status: row.status,
    resolvedOutcome: row.resolved_outcome || undefined,
    resolvedAt: row.resolved_at || undefined,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
  };
}

function toPrediction(row: any): Prediction {
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    marketId: row.market_id,
    marketQuestion: row.market_question,
    outcome: row.outcome,
    amount: Number(row.amount),
    probabilityAtPurchase: Number(row.probability_at_purchase),
    createdAt: row.created_at,
    resolvedOutcome: row.resolved_outcome || undefined,
    payout: row.payout === null || row.payout === undefined ? undefined : Number(row.payout),
    settledAt: row.settled_at || undefined,
  };
}

function toComment(row: any): MarketComment {
  return {
    id: row.id,
    marketId: row.market_id,
    userId: row.user_id,
    userName: row.user_name,
    text: row.text,
    createdAt: row.created_at,
    mediaDataUrl: row.media_data_url || undefined,
    mediaName: row.media_name || undefined,
  };
}

function toTransaction(row: any): BalanceTransaction {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    title: row.title,
    description: row.description || "",
    amount: Number(row.amount),
    marketId: row.market_id || undefined,
    marketQuestion: row.market_question || undefined,
    createdAt: formatDbDateTime(row.created_at),
  };
}

type QueryRunner = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }>;
};

async function addBalanceTransaction(
  queryRunner: QueryRunner,
  input: Omit<BalanceTransaction, "id" | "createdAt">
) {
  const transaction: BalanceTransaction = {
    id: createId(),
    createdAt: nowRu(),
    ...input,
  };

  await queryRunner.query(
    `
      INSERT INTO transactions (
        id, user_id, type, title, description, amount, market_id, market_question, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
    `,
    [
      transaction.id,
      transaction.userId,
      transaction.type,
      transaction.title,
      transaction.description,
      transaction.amount,
      transaction.marketId || null,
      transaction.marketQuestion || null,
    ]
  );

  return transaction;
}

// -----------------------------
// Default seed data
// -----------------------------

const defaultUsers: DemoUser[] = [
  { id: "user-vladislav", name: "Владислав", balance: START_BALANCE },
  { id: "user-sasha", name: "Саша", balance: START_BALANCE },
  { id: "user-dima", name: "Дима", balance: START_BALANCE },
];

const defaultMarkets: Market[] = [
  {
    id: "cb-rate-2026",
    question: "Снизит ли ЦБ РФ ключевую ставку до конца 2026 года?",
    category: "Экономика",
    description:
      "Рынок будет рассчитан как «Да», если Банк России хотя бы один раз снизит ключевую ставку до 31.12.2026 включительно.",
    source: "Официальный сайт Банка России",
    closesAt: "2026-12-31",
    yesPool: 6200,
    noPool: 3800,
    status: "open",
    createdAt: nowIso(),
  },
  {
    id: "gta-6-2026",
    question: "Выйдет ли GTA 6 до конца 2026 года?",
    category: "Игры",
    description:
      "Рынок будет рассчитан как «Да», если официальный релиз GTA 6 состоится до 31.12.2026 включительно.",
    source: "Официальные сообщения Rockstar Games",
    closesAt: "2026-12-31",
    yesPool: 4800,
    noPool: 5200,
    status: "open",
    createdAt: nowIso(),
  },
  {
    id: "bitcoin-150k",
    question: "Достигнет ли Bitcoin отметки $150 000 до конца 2026 года?",
    category: "Крипто",
    description:
      "Рынок будет рассчитан как «Да», если цена Bitcoin хотя бы один раз достигнет $150 000 до конца 2026 года.",
    source: "Крупные публичные криптобиржи и агрегаторы цен",
    closesAt: "2026-12-31",
    yesPool: 3500,
    noPool: 6500,
    status: "open",
    createdAt: nowIso(),
  },
  {
    id: "iphone-september",
    question: "Представит ли Apple новый iPhone в сентябре 2026 года?",
    category: "Технологии",
    description:
      "Рынок будет рассчитан как «Да», если Apple проведет презентацию нового iPhone в сентябре 2026 года.",
    source: "Официальные материалы Apple",
    closesAt: "2026-09-30",
    yesPool: 7600,
    noPool: 2400,
    status: "open",
    createdAt: nowIso(),
  },
];

// -----------------------------
// Database setup
// -----------------------------

async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      balance INTEGER NOT NULL DEFAULT 10000
    );

    CREATE TABLE IF NOT EXISTS markets (
      id TEXT PRIMARY KEY,
      question TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      source TEXT NOT NULL,
      closes_at TEXT NOT NULL,
      yes_pool INTEGER NOT NULL,
      no_pool INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      resolved_outcome TEXT,
      resolved_at TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS predictions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      user_name TEXT NOT NULL,
      market_id TEXT NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
      market_question TEXT NOT NULL,
      outcome TEXT NOT NULL,
      amount INTEGER NOT NULL,
      probability_at_purchase INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      resolved_outcome TEXT,
      payout INTEGER,
      settled_at TEXT
    );

    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      market_id TEXT NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      user_name TEXT NOT NULL,
      text TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      media_data_url TEXT,
      media_name TEXT
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      amount INTEGER NOT NULL,
      market_id TEXT REFERENCES markets(id) ON DELETE SET NULL,
      market_question TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS favorites (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      market_id TEXT NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
      PRIMARY KEY (user_id, market_id)
    );

    CREATE INDEX IF NOT EXISTS predictions_market_id_idx ON predictions(market_id);
    CREATE INDEX IF NOT EXISTS predictions_user_id_idx ON predictions(user_id);
    CREATE INDEX IF NOT EXISTS comments_market_id_idx ON comments(market_id);
    CREATE INDEX IF NOT EXISTS transactions_user_id_idx ON transactions(user_id);
    CREATE INDEX IF NOT EXISTS transactions_created_at_idx ON transactions(created_at);
    CREATE INDEX IF NOT EXISTS favorites_user_id_idx ON favorites(user_id);
  `);
}

async function seedIfEmpty() {
  const usersCount = await pool.query("SELECT COUNT(*)::int AS count FROM users");
  const marketsCount = await pool.query("SELECT COUNT(*)::int AS count FROM markets");

  if (usersCount.rows[0].count === 0) {
    for (const user of defaultUsers) {
      await pool.query(
        `INSERT INTO users (id, name, balance) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`,
        [user.id, user.name, user.balance]
      );
      await addBalanceTransaction(pool, {
        userId: user.id,
        type: "start",
        title: "Стартовый баланс",
        description: "Начисление игровых баллов при создании профиля",
        amount: START_BALANCE,
      });
    }
  }

  if (marketsCount.rows[0].count === 0) {
    for (const market of defaultMarkets) {
      await pool.query(
        `
          INSERT INTO markets (
            id, question, category, description, source, closes_at,
            yes_pool, no_pool, status, resolved_outcome, resolved_at, created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          ON CONFLICT (id) DO NOTHING
        `,
        [
          market.id,
          market.question,
          market.category,
          market.description,
          market.source,
          market.closesAt,
          market.yesPool,
          market.noPool,
          market.status,
          market.resolvedOutcome || null,
          market.resolvedAt || null,
          market.createdAt,
        ]
      );
    }
  }

  const transactionCount = await pool.query("SELECT COUNT(*)::int AS count FROM transactions");

  if (transactionCount.rows[0].count === 0) {
    const existingUsers = await pool.query("SELECT * FROM users ORDER BY name ASC");

    for (const row of existingUsers.rows) {
      const user = toUser(row);
      await addBalanceTransaction(pool, {
        userId: user.id,
        type: "system",
        title: "Перенос баланса",
        description: "Текущий баланс перенесён в новую историю баллов",
        amount: user.balance,
      });
    }
  }
}

async function getSnapshot(): Promise<DatabaseSnapshot> {
  const [usersResult, marketsResult, predictionsResult, commentsResult, transactionsResult, favoritesResult] =
    await Promise.all([
      pool.query("SELECT * FROM users ORDER BY name ASC"),
      pool.query("SELECT * FROM markets ORDER BY created_at DESC"),
      pool.query("SELECT * FROM predictions ORDER BY id DESC"),
      pool.query("SELECT * FROM comments ORDER BY id DESC"),
      pool.query("SELECT * FROM transactions ORDER BY created_at DESC LIMIT 500"),
      pool.query("SELECT * FROM favorites ORDER BY user_id ASC, market_id ASC"),
    ]);

  const favoriteMarketIdsByUser: Record<string, string[]> = {};

  favoritesResult.rows.forEach((row) => {
    if (!favoriteMarketIdsByUser[row.user_id]) {
      favoriteMarketIdsByUser[row.user_id] = [];
    }

    favoriteMarketIdsByUser[row.user_id].push(row.market_id);
  });

  return {
    users: usersResult.rows.map(toUser),
    markets: marketsResult.rows.map(toMarket),
    predictions: predictionsResult.rows.map(toPrediction),
    comments: commentsResult.rows.map(toComment),
    transactions: transactionsResult.rows.map(toTransaction),
    favoriteMarketIdsByUser,
    adminUserIds: ADMIN_USER_IDS,
  };
}

// -----------------------------
// Express app
// -----------------------------

await migrate();
await seedIfEmpty();

const app = express();

app.use(
  cors({
    origin: true,
  })
);

app.use(
  express.json({
    limit: "8mb",
  })
);

app.get("/", (_request, response) => {
  response.json({
    ok: true,
    message: "Forecast Market API работает. Используй /api/health или /api/bootstrap",
  });
});

app.get("/api/health", async (_request, response) => {
  const dbCheck = await pool.query("SELECT NOW() AS now");

  response.json({
    ok: true,
    message: "Forecast Market API работает с PostgreSQL",
    databaseTime: dbCheck.rows[0].now,
    adminUsersConfigured: ADMIN_USER_IDS.length,
    telegramAuthConfigured: Boolean(BOT_TOKEN),
    time: new Date().toISOString(),
  });
});

app.get("/api/bootstrap", async (_request, response) => {
  response.json(await getSnapshot());
});

app.post("/api/users", async (request, response) => {
  const name = String(request.body?.name || "").trim();

  if (!name) {
    response.status(400).json({ error: "Введите имя участника" });
    return;
  }

  const user: DemoUser = {
    id: createId(),
    name,
    balance: START_BALANCE,
  };

  await pool.query(`INSERT INTO users (id, name, balance) VALUES ($1, $2, $3)`, [
    user.id,
    user.name,
    user.balance,
  ]);

  await addBalanceTransaction(pool, {
    userId: user.id,
    type: "start",
    title: "Стартовый баланс",
    description: "Начисление игровых баллов при создании профиля",
    amount: START_BALANCE,
  });

  response.status(201).json(user);
});

app.post("/api/telegram-user", async (request, response) => {
  const telegramAuth = validateTelegramInitData(getTelegramInitData(request));

  if (!telegramAuth.ok) {
    response.status(401).json({
      error: `Telegram-авторизация не пройдена: ${telegramAuth.error}`,
    });
    return;
  }

  const telegramUser = telegramAuth.user;
  const telegramId = String(telegramUser.id);
  const userId = `telegram-${telegramId}`;

  const existingUserResult = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);

  const name = [telegramUser.first_name, telegramUser.last_name]
    .filter(Boolean)
    .join(" ")
    .trim() || telegramUser.username || `Telegram ${telegramId}`;

  if (existingUserResult.rows[0]) {
    const existingUser = toUser(existingUserResult.rows[0]);

    if (name && existingUser.name !== name) {
      const updatedUser = await pool.query(
        "UPDATE users SET name = $2 WHERE id = $1 RETURNING *",
        [userId, name]
      );

      response.json(toUser(updatedUser.rows[0]));
      return;
    }

    response.json(existingUser);
    return;
  }

  const user: DemoUser = {
    id: userId,
    name,
    balance: START_BALANCE,
  };

  await pool.query(`INSERT INTO users (id, name, balance) VALUES ($1, $2, $3)`, [
    user.id,
    user.name,
    user.balance,
  ]);

  await addBalanceTransaction(pool, {
    userId: user.id,
    type: "start",
    title: "Стартовый баланс",
    description: "Начисление игровых баллов при первом входе через Telegram",
    amount: START_BALANCE,
  });

  response.status(201).json(user);
});

app.post("/api/markets", async (request, response) => {
  if (!requireAdmin(request, response)) {
    return;
  }

  const question = String(request.body?.question || "").trim();
  const category = String(request.body?.category || "").trim();
  const description = String(request.body?.description || "").trim();
  const source = String(request.body?.source || "").trim();
  const closesAt = String(request.body?.closesAt || "").trim();
  const yesProbability = Number(request.body?.yesProbability);

  if (!question) {
    response.status(400).json({ error: "Введите вопрос рынка" });
    return;
  }

  if (!category) {
    response.status(400).json({ error: "Введите категорию" });
    return;
  }

  if (!description) {
    response.status(400).json({ error: "Введите описание" });
    return;
  }

  if (!source) {
    response.status(400).json({ error: "Введите источник расчета" });
    return;
  }

  if (!closesAt) {
    response.status(400).json({ error: "Введите дату закрытия" });
    return;
  }

  if (!Number.isFinite(yesProbability) || yesProbability < 1 || yesProbability > 99) {
    response.status(400).json({ error: "Вероятность должна быть от 1 до 99" });
    return;
  }

  const market: Market = {
    id: createId(),
    question,
    category,
    description,
    source,
    closesAt,
    yesPool: yesProbability * 100,
    noPool: (100 - yesProbability) * 100,
    status: "open",
    createdAt: nowIso(),
  };

  await pool.query(
    `
      INSERT INTO markets (
        id, question, category, description, source, closes_at,
        yes_pool, no_pool, status, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `,
    [
      market.id,
      market.question,
      market.category,
      market.description,
      market.source,
      market.closesAt,
      market.yesPool,
      market.noPool,
      market.status,
      market.createdAt,
    ]
  );

  response.status(201).json(market);
});

app.patch("/api/markets/:marketId", async (request, response) => {
  if (!requireAdmin(request, response)) {
    return;
  }

  const marketId = request.params.marketId;

  const question = String(request.body?.question || "").trim();
  const category = String(request.body?.category || "").trim();
  const description = String(request.body?.description || "").trim();
  const source = String(request.body?.source || "").trim();
  const closesAt = String(request.body?.closesAt || "").trim();

  if (!question || !category || !description || !source || !closesAt) {
    response.status(400).json({ error: "Заполните все поля рынка" });
    return;
  }

  const result = await pool.query(
    `
      UPDATE markets
      SET question = $2, category = $3, description = $4, source = $5, closes_at = $6
      WHERE id = $1
      RETURNING *
    `,
    [marketId, question, category, description, source, closesAt]
  );

  if (!result.rows[0]) {
    response.status(404).json({ error: "Рынок не найден" });
    return;
  }

  await pool.query(`UPDATE predictions SET market_question = $2 WHERE market_id = $1`, [
    marketId,
    question,
  ]);

  response.json(toMarket(result.rows[0]));
});

app.delete("/api/markets/:marketId", async (request, response) => {
  if (!requireAdmin(request, response)) {
    return;
  }

  const marketId = request.params.marketId;

  const result = await withTransaction(async (client) => {
    const marketResult = await client.query("SELECT * FROM markets WHERE id = $1", [marketId]);
    const marketRow = marketResult.rows[0];

    if (!marketRow) {
      return null;
    }

    const refundsByUser: Record<string, number> = {};
    const market = toMarket(marketRow);

    if (market.status !== "resolved") {
      const activePredictions = await client.query(
        `SELECT * FROM predictions WHERE market_id = $1 AND settled_at IS NULL`,
        [marketId]
      );

      for (const prediction of activePredictions.rows.map(toPrediction)) {
        refundsByUser[prediction.userId] =
          (refundsByUser[prediction.userId] || 0) + prediction.amount;
      }

      for (const [userId, refund] of Object.entries(refundsByUser)) {
        await client.query(`UPDATE users SET balance = balance + $2 WHERE id = $1`, [
          userId,
          refund,
        ]);

        await addBalanceTransaction(client, {
          userId,
          type: "refund",
          title: "Возврат баллов",
          description: `Возврат активных прогнозов после удаления рынка «${market.question}»`,
          amount: refund,
          marketId: market.id,
          marketQuestion: market.question,
        });
      }
    }

    await client.query("DELETE FROM markets WHERE id = $1", [marketId]);

    return refundsByUser;
  });

  if (result === null) {
    response.status(404).json({ error: "Рынок не найден" });
    return;
  }

  response.json({ ok: true, refunded: result });
});

app.post("/api/markets/:marketId/duplicate", async (request, response) => {
  if (!requireAdmin(request, response)) {
    return;
  }

  const marketResult = await pool.query("SELECT * FROM markets WHERE id = $1", [
    request.params.marketId,
  ]);
  const sourceMarketRow = marketResult.rows[0];

  if (!sourceMarketRow) {
    response.status(404).json({ error: "Рынок не найден" });
    return;
  }

  const sourceMarket = toMarket(sourceMarketRow);
  const yesProbability = getYesProbability(sourceMarket);

  const duplicate: Market = {
    id: createId(),
    question: `Копия — ${sourceMarket.question}`,
    category: sourceMarket.category,
    description: sourceMarket.description,
    source: sourceMarket.source,
    closesAt: sourceMarket.closesAt,
    yesPool: yesProbability * 100,
    noPool: (100 - yesProbability) * 100,
    status: "open",
    createdAt: nowIso(),
  };

  await pool.query(
    `
      INSERT INTO markets (
        id, question, category, description, source, closes_at,
        yes_pool, no_pool, status, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `,
    [
      duplicate.id,
      duplicate.question,
      duplicate.category,
      duplicate.description,
      duplicate.source,
      duplicate.closesAt,
      duplicate.yesPool,
      duplicate.noPool,
      duplicate.status,
      duplicate.createdAt,
    ]
  );

  response.status(201).json(duplicate);
});

app.post("/api/markets/:marketId/predictions", async (request, response) => {
  const marketId = request.params.marketId;
  const userId = String(request.body?.userId || "");
  const outcome = normalizeOutcome(request.body?.outcome);
  const amount = Number(request.body?.amount);

  if (!outcome) {
    response.status(400).json({ error: "Некорректный исход" });
    return;
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    response.status(400).json({ error: "Введите корректную сумму" });
    return;
  }

  const result = await withTransaction(async (client) => {
    const userResult = await client.query("SELECT * FROM users WHERE id = $1 FOR UPDATE", [userId]);
    const marketResult = await client.query("SELECT * FROM markets WHERE id = $1 FOR UPDATE", [
      marketId,
    ]);

    const userRow = userResult.rows[0];
    const marketRow = marketResult.rows[0];

    if (!userRow) {
      return { error: "Участник не найден" } as const;
    }

    if (!marketRow) {
      return { error: "Рынок не найден" } as const;
    }

    const user = toUser(userRow);
    const market = toMarket(marketRow);

    if (market.status === "resolved") {
      return { error: "Рынок уже рассчитан" } as const;
    }

    if (amount > user.balance) {
      return { error: "Недостаточно баллов" } as const;
    }

    const probability = getYesProbability(market);

    await client.query("UPDATE users SET balance = balance - $2 WHERE id = $1", [
      user.id,
      amount,
    ]);

    await addBalanceTransaction(client, {
      userId: user.id,
      type: "prediction_buy",
      title: `Прогноз «${outcome === "yes" ? "Да" : "Нет"}»`,
      description: `Списание за прогноз по рынку «${market.question}»`,
      amount: -amount,
      marketId: market.id,
      marketQuestion: market.question,
    });

    if (outcome === "yes") {
      await client.query("UPDATE markets SET yes_pool = yes_pool + $2 WHERE id = $1", [
        market.id,
        amount,
      ]);
    } else {
      await client.query("UPDATE markets SET no_pool = no_pool + $2 WHERE id = $1", [
        market.id,
        amount,
      ]);
    }

    const prediction: Prediction = {
      id: createId(),
      userId: user.id,
      userName: getUserDisplayName(user),
      marketId: market.id,
      marketQuestion: market.question,
      outcome,
      amount,
      probabilityAtPurchase: outcome === "yes" ? probability : 100 - probability,
      createdAt: nowRu(),
    };

    await client.query(
      `
        INSERT INTO predictions (
          id, user_id, user_name, market_id, market_question,
          outcome, amount, probability_at_purchase, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `,
      [
        prediction.id,
        prediction.userId,
        prediction.userName,
        prediction.marketId,
        prediction.marketQuestion,
        prediction.outcome,
        prediction.amount,
        prediction.probabilityAtPurchase,
        prediction.createdAt,
      ]
    );

    return { prediction } as const;
  });

  if ("error" in result) {
    const status = result.error.includes("не найден") ? 404 : 400;
    response.status(status).json({ error: result.error });
    return;
  }

  response.status(201).json(result.prediction);
});

app.post("/api/markets/:marketId/resolve", async (request, response) => {
  if (!requireAdmin(request, response)) {
    return;
  }

  const marketId = request.params.marketId;
  const outcome = normalizeOutcome(request.body?.outcome);

  if (!outcome) {
    response.status(400).json({ error: "Некорректный исход" });
    return;
  }

  const result = await withTransaction(async (client) => {
    const marketResult = await client.query("SELECT * FROM markets WHERE id = $1 FOR UPDATE", [
      marketId,
    ]);
    const marketRow = marketResult.rows[0];

    if (!marketRow) {
      return { error: "Рынок не найден" } as const;
    }

    const market = toMarket(marketRow);

    if (market.status === "resolved") {
      return { error: "Рынок уже рассчитан" } as const;
    }

    const totalPool = market.yesPool + market.noPool;
    const winningPool = outcome === "yes" ? market.yesPool : market.noPool;
    const settledAt = nowRu();

    let totalPayout = 0;
    const payoutsByUser: Record<string, number> = {};

    const predictionResult = await client.query(
      "SELECT * FROM predictions WHERE market_id = $1 AND settled_at IS NULL",
      [market.id]
    );

    for (const prediction of predictionResult.rows.map(toPrediction)) {
      const isWinner = prediction.outcome === outcome;
      const payout =
        isWinner && winningPool > 0
          ? Math.round((prediction.amount / winningPool) * totalPool)
          : 0;

      totalPayout += payout;
      payoutsByUser[prediction.userId] =
        (payoutsByUser[prediction.userId] || 0) + payout;

      await client.query(
        `
          UPDATE predictions
          SET resolved_outcome = $2, payout = $3, settled_at = $4
          WHERE id = $1
        `,
        [prediction.id, outcome, payout, settledAt]
      );
    }

    for (const [userId, payout] of Object.entries(payoutsByUser)) {
      await client.query("UPDATE users SET balance = balance + $2 WHERE id = $1", [
        userId,
        payout,
      ]);

      if (payout > 0) {
        await addBalanceTransaction(client, {
          userId,
          type: "payout",
          title: "Выплата по рынку",
          description: `Рынок рассчитан как «${outcome === "yes" ? "Да" : "Нет"}»: «${market.question}»`,
          amount: payout,
          marketId: market.id,
          marketQuestion: market.question,
        });
      }
    }

    const updatedMarketResult = await client.query(
      `
        UPDATE markets
        SET status = 'resolved', resolved_outcome = $2, resolved_at = $3
        WHERE id = $1
        RETURNING *
      `,
      [market.id, outcome, settledAt]
    );

    return {
      market: toMarket(updatedMarketResult.rows[0]),
      totalPayout,
      payoutsByUser,
    } as const;
  });

  if ("error" in result) {
    const status = result.error.includes("не найден") ? 404 : 400;
    response.status(status).json({ error: result.error });
    return;
  }

  response.json(result);
});

app.post("/api/markets/:marketId/comments", async (request, response) => {
  const marketId = request.params.marketId;
  const userId = String(request.body?.userId || "");
  const text = String(request.body?.text || "").trim();
  const mediaDataUrl = String(request.body?.mediaDataUrl || "").trim();
  const mediaName = String(request.body?.mediaName || "").trim();

  const [marketResult, userResult] = await Promise.all([
    pool.query("SELECT * FROM markets WHERE id = $1", [marketId]),
    pool.query("SELECT * FROM users WHERE id = $1", [userId]),
  ]);

  if (!marketResult.rows[0]) {
    response.status(404).json({ error: "Рынок не найден" });
    return;
  }

  if (!userResult.rows[0]) {
    response.status(404).json({ error: "Участник не найден" });
    return;
  }

  if (!text && !mediaDataUrl) {
    response.status(400).json({ error: "Введите комментарий или прикрепите файл" });
    return;
  }

  const user = toUser(userResult.rows[0]);

  const comment: MarketComment = {
    id: createId(),
    marketId,
    userId: user.id,
    userName: getUserDisplayName(user),
    text,
    createdAt: nowRu(),
    mediaDataUrl: mediaDataUrl || undefined,
    mediaName: mediaName || undefined,
  };

  await pool.query(
    `
      INSERT INTO comments (
        id, market_id, user_id, user_name, text,
        created_at, media_data_url, media_name
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `,
    [
      comment.id,
      comment.marketId,
      comment.userId,
      comment.userName,
      comment.text,
      comment.createdAt,
      comment.mediaDataUrl || null,
      comment.mediaName || null,
    ]
  );

  response.status(201).json(comment);
});

app.delete("/api/comments/:commentId", async (request, response) => {
  if (!requireAdmin(request, response)) {
    return;
  }

  const result = await pool.query("DELETE FROM comments WHERE id = $1 RETURNING id", [
    request.params.commentId,
  ]);

  if (!result.rows[0]) {
    response.status(404).json({ error: "Комментарий не найден" });
    return;
  }

  response.json({ ok: true });
});

app.post("/api/users/:userId/favorites/:marketId", async (request, response) => {
  const { userId, marketId } = request.params;

  const [userResult, marketResult] = await Promise.all([
    pool.query("SELECT id FROM users WHERE id = $1", [userId]),
    pool.query("SELECT id FROM markets WHERE id = $1", [marketId]),
  ]);

  if (!userResult.rows[0]) {
    response.status(404).json({ error: "Участник не найден" });
    return;
  }

  if (!marketResult.rows[0]) {
    response.status(404).json({ error: "Рынок не найден" });
    return;
  }

  const existing = await pool.query(
    "SELECT * FROM favorites WHERE user_id = $1 AND market_id = $2",
    [userId, marketId]
  );

  if (existing.rows[0]) {
    await pool.query("DELETE FROM favorites WHERE user_id = $1 AND market_id = $2", [
      userId,
      marketId,
    ]);
  } else {
    await pool.query("INSERT INTO favorites (user_id, market_id) VALUES ($1, $2)", [
      userId,
      marketId,
    ]);
  }

  const favorites = await pool.query(
    "SELECT market_id FROM favorites WHERE user_id = $1 ORDER BY market_id ASC",
    [userId]
  );

  response.json({
    favoriteMarketIds: favorites.rows.map((row) => row.market_id),
  });
});

app.post("/api/reset", async (request, response) => {
  if (!requireAdmin(request, response)) {
    return;
  }

  await withTransaction(async (client) => {
    await client.query("TRUNCATE favorites, comments, predictions, transactions, markets, users RESTART IDENTITY CASCADE");

    for (const user of defaultUsers) {
      await client.query(
        `INSERT INTO users (id, name, balance) VALUES ($1, $2, $3)`,
        [user.id, user.name, user.balance]
      );
      await addBalanceTransaction(client, {
        userId: user.id,
        type: "start",
        title: "Стартовый баланс",
        description: "Начисление игровых баллов после сброса базы",
        amount: START_BALANCE,
      });
    }

    for (const market of defaultMarkets) {
      await client.query(
        `
          INSERT INTO markets (
            id, question, category, description, source, closes_at,
            yes_pool, no_pool, status, resolved_outcome, resolved_at, created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        `,
        [
          market.id,
          market.question,
          market.category,
          market.description,
          market.source,
          market.closesAt,
          market.yesPool,
          market.noPool,
          market.status,
          market.resolvedOutcome || null,
          market.resolvedAt || null,
          market.createdAt,
        ]
      );
    }
  });

  response.json({
    ok: true,
    message: "PostgreSQL-база сброшена",
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Forecast Market API запущен: http://localhost:${PORT}`);
});
