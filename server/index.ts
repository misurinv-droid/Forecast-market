import cors from "cors";
import express from "express";
import crypto from "node:crypto";
import { Pool, PoolClient } from "pg";

// -----------------------------
// Types
// -----------------------------

type Outcome = "yes" | "no";
type MarketStatus = "open" | "closed" | "resolved";
type SuggestionStatus = "pending" | "approved" | "rejected";

type DemoUser = {
  id: string;
  name: string;
  balance: number;
  lastDailyBonusAt?: string;
  dailyBonusStreak?: number;
  bestDailyBonusStreak?: number;
  lastDailyBonusAmount?: number;
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
  type: "start" | "prediction_buy" | "payout" | "refund" | "system" | "daily_bonus";
  title: string;
  description: string;
  amount: number;
  marketId?: string;
  marketQuestion?: string;
  createdAt: string;
};

type MarketSuggestion = {
  id: string;
  userId: string;
  userName: string;
  question: string;
  category: string;
  description: string;
  source: string;
  closesAt: string;
  status: SuggestionStatus;
  adminNote?: string;
  createdAt: string;
  reviewedAt?: string;
};

type DatabaseSnapshot = {
  users: DemoUser[];
  markets: Market[];
  predictions: Prediction[];
  comments: MarketComment[];
  transactions: BalanceTransaction[];
  marketSuggestions: MarketSuggestion[];
  favoriteMarketIdsByUser: Record<string, string[]>;
  adminUserIds: string[];
  polymarketImport?: {
    enabled: boolean;
    lastImportAt?: string;
    lastImportedCount?: number;
    lastCheckedAt?: string;
  };
};

// -----------------------------
// Config
// -----------------------------

const PORT = Number(process.env.PORT || 4000);
const START_BALANCE = 10000;
const DAILY_BONUS_AMOUNT = 500;
const DAILY_BONUS_INTERVAL_MS = 24 * 60 * 60 * 1000;
const DAILY_BONUS_GRACE_MS = 48 * 60 * 60 * 1000;
const DAILY_BONUS_STREAK_AMOUNTS = [500, 600, 700, 800, 1000, 1200, 1500];
const DATABASE_URL = process.env.DATABASE_URL;
const BOT_TOKEN = process.env.BOT_TOKEN || "";
const APP_PUBLIC_URL = (process.env.APP_PUBLIC_URL || process.env.FRONTEND_URL || "").trim();
const TELEGRAM_AUTH_MAX_AGE_SECONDS = Number(process.env.TELEGRAM_AUTH_MAX_AGE_SECONDS || 2 * 60);
const SESSION_MAX_AGE_DAYS = Number(process.env.SESSION_MAX_AGE_DAYS || 30);
const ADMIN_TELEGRAM_IDS = (process.env.ADMIN_TELEGRAM_IDS || "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);

const ADMIN_USER_IDS = ADMIN_TELEGRAM_IDS.flatMap((id) => [id, `telegram-${id}`]);

const POLYMARKET_GAMMA_BASE_URL = "https://gamma-api.polymarket.com";
const POLYMARKET_AUTO_IMPORT_ENABLED =
  (process.env.POLYMARKET_AUTO_IMPORT_ENABLED || "true").toLowerCase() !== "false";
const POLYMARKET_AUTO_IMPORT_LIMIT = Math.min(100, Math.max(1, Number(process.env.POLYMARKET_AUTO_IMPORT_LIMIT || 50)));
const POLYMARKET_AUTO_IMPORT_INTERVAL_MS = Math.max(
  30 * 60 * 1000,
  Number(process.env.POLYMARKET_AUTO_IMPORT_INTERVAL_MINUTES || 360) * 60 * 1000
);
const POLYMARKET_MIN_VOLUME = Math.max(0, Number(process.env.POLYMARKET_MIN_VOLUME || 1000));
const POLYMARKET_MAX_MARKETS_PER_EVENT = Math.min(10, Math.max(1, Number(process.env.POLYMARKET_MAX_MARKETS_PER_EVENT || 3)));

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

const POLYMARKET_GAME_DESCRIPTION =
  "Событие импортировано из Polymarket как идея для развлекательного прогноза. В Forecast Market используются только игровые баллы: они не являются деньгами, не покупаются, не продаются, не передаются и не выводятся.";

function isPolymarketSourceValue(source: unknown) {
  return /polymarket/i.test(String(source || ""));
}

function cleanPolymarketQuestionText(value: unknown) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\s+\?/g, "?")
    .trim();
}

function translateKnownPolymarketTerms(text: string) {
  return text
    .replace(/the 2028 US Presidential Election/gi, "президентских выборах США в 2028 году")
    .replace(/the 2024 US Presidential Election/gi, "президентских выборах США в 2024 году")
    .replace(/the 2026 US Presidential Election/gi, "президентских выборах США в 2026 году")
    .replace(/US Presidential Election/gi, "президентских выборах США")
    .replace(/Presidential Election/gi, "президентских выборах")
    .replace(/Democratic nomination/gi, "номинации Демократической партии")
    .replace(/Republican nomination/gi, "номинации Республиканской партии")
    .replace(/election/gi, "выборах")
    .replace(/Bitcoin/gi, "Bitcoin")
    .replace(/Ethereum/gi, "Ethereum")
    .replace(/Solana/gi, "Solana")
    .replace(/BTC/gi, "BTC")
    .replace(/ETH/gi, "ETH")
    .replace(/above/gi, "выше")
    .replace(/below/gi, "ниже")
    .replace(/over/gi, "выше")
    .replace(/under/gi, "ниже")
    .replace(/before/gi, "до")
    .replace(/after/gi, "после")
    .replace(/by/gi, "к")
    .replace(/in 2024/gi, "в 2024 году")
    .replace(/in 2025/gi, "в 2025 году")
    .replace(/in 2026/gi, "в 2026 году")
    .replace(/in 2027/gi, "в 2027 году")
    .replace(/in 2028/gi, "в 2028 году");
}

function translatePolymarketQuestion(rawQuestion: unknown) {
  const question = cleanPolymarketQuestionText(rawQuestion);
  if (!question) return "Событие Polymarket";

  let match = question.match(/^Will\s+(.+?)\s+win\s+(.+?)\?$/i);
  if (match) {
    return `Победит ли ${match[1]} на ${translateKnownPolymarketTerms(match[2])}?`;
  }

  match = question.match(/^Will\s+(.+?)\s+be\s+above\s+(.+?)\?$/i);
  if (match) {
    return `Будет ли ${translateKnownPolymarketTerms(match[1])} выше ${translateKnownPolymarketTerms(match[2])}?`;
  }

  match = question.match(/^Will\s+(.+?)\s+be\s+below\s+(.+?)\?$/i);
  if (match) {
    return `Будет ли ${translateKnownPolymarketTerms(match[1])} ниже ${translateKnownPolymarketTerms(match[2])}?`;
  }

  match = question.match(/^Will\s+(.+?)\s+hit\s+(.+?)\?$/i);
  if (match) {
    return `Достигнет ли ${translateKnownPolymarketTerms(match[1])} уровня ${translateKnownPolymarketTerms(match[2])}?`;
  }

  match = question.match(/^Will\s+(.+?)\s+reach\s+(.+?)\?$/i);
  if (match) {
    return `Достигнет ли ${translateKnownPolymarketTerms(match[1])} уровня ${translateKnownPolymarketTerms(match[2])}?`;
  }

  match = question.match(/^Will\s+(.+?)\?$/i);
  if (match) {
    return `Будет ли ${translateKnownPolymarketTerms(match[1])}?`;
  }

  match = question.match(/^Will there be\s+(.+?)\?$/i);
  if (match) {
    return `Будет ли ${translateKnownPolymarketTerms(match[1])}?`;
  }

  return translateKnownPolymarketTerms(question);
}

function getDisplayMarketRow(row: any) {
  if (!isPolymarketSourceValue(row.source) && !String(row.id || "").startsWith("polymarket-")) {
    return row;
  }

  return {
    ...row,
    question: translatePolymarketQuestion(row.question),
    category: row.category === "Polymarket" ? "Мировые события" : row.category,
    description: POLYMARKET_GAME_DESCRIPTION,
    source: "Polymarket",
  };
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

function getBearerToken(request: express.Request) {
  const value = String(request.header("authorization") || "").trim();
  if (!value.toLowerCase().startsWith("bearer ")) return "";
  return value.slice("bearer ".length).trim();
}

function createSessionToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function hashSessionToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function createAuthSession(userId: string, telegramId: string) {
  const token = createSessionToken();
  const tokenHash = hashSessionToken(token);
  const result = await pool.query(
    `INSERT INTO auth_sessions (token_hash, user_id, telegram_id, expires_at)
     VALUES ($1, $2, $3, NOW() + ($4::text || ' days')::interval)
     RETURNING expires_at`,
    [tokenHash, userId, telegramId, String(SESSION_MAX_AGE_DAYS)]
  );

  // Небольшая уборка старых сессий при каждом новом входе.
  await pool.query("DELETE FROM auth_sessions WHERE expires_at < NOW()");

  return {
    sessionToken: token,
    expiresAt: result.rows[0]?.expires_at?.toISOString?.() || new Date(Date.now() + SESSION_MAX_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString(),
  };
}

type RequestSession = {
  userId: string;
  telegramId: string;
};

async function getRequestSession(request: express.Request): Promise<RequestSession | null> {
  const token = getBearerToken(request);
  if (!token) return null;

  const tokenHash = hashSessionToken(token);
  const result = await pool.query(
    `SELECT user_id, telegram_id
     FROM auth_sessions
     WHERE token_hash = $1 AND expires_at > NOW()`,
    [tokenHash]
  );

  const row = result.rows[0];
  if (!row) return null;

  return {
    userId: String(row.user_id),
    telegramId: String(row.telegram_id),
  };
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

  if (!authDate) {
    return { ok: false, error: "В Telegram initData нет auth_date" };
  }

  const ageSeconds = Math.floor(Date.now() / 1000) - authDate;

  if (ageSeconds < -60) {
    return { ok: false, error: "Некорректное время Telegram-сессии" };
  }

  if (ageSeconds > TELEGRAM_AUTH_MAX_AGE_SECONDS) {
    return { ok: false, error: "Telegram-сессия устарела. Перезапусти Mini App." };
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

async function assertRequestMatchesUser(request: express.Request, response: express.Response, userId: string) {
  // После входа все действия идут только через наш короткий Bearer sessionToken.
  // Telegram initData больше не принимается как авторизация для действий, чтобы нельзя было
  // повторно использовать случайно расшаренный tgWebAppData.
  const session = await getRequestSession(request);

  if (!session) {
    response.status(401).json({
      error: "Требуется безопасная сессия. Перезапусти приложение через Telegram Mini App.",
    });
    return false;
  }

  if (userId !== session.telegramId && userId !== session.userId) {
    response.status(403).json({ error: "Нельзя выполнить действие за другого пользователя." });
    return false;
  }

  return true;
}

async function requireAdmin(request: express.Request, response: express.Response) {
  const session = await getRequestSession(request);

  if (!session) {
    response.status(401).json({
      error: "Требуется безопасная сессия администратора. Перезапусти приложение через Telegram Mini App.",
    });
    return false;
  }

  if (!isAdminUserId(session.telegramId) && !isAdminUserId(session.userId)) {
    response.status(403).json({
      error: "Недостаточно прав. Это действие доступно только администратору.",
    });
    return false;
  }

  return true;
}

function getNextDailyBonusAt(lastDailyBonusAt: unknown) {
  if (!lastDailyBonusAt) return null;
  const last = lastDailyBonusAt instanceof Date ? lastDailyBonusAt.getTime() : new Date(String(lastDailyBonusAt)).getTime();
  if (!Number.isFinite(last)) return null;
  return new Date(last + DAILY_BONUS_INTERVAL_MS);
}

function getDailyBonusStreakState(lastDailyBonusAt: unknown, currentStreakValue: unknown) {
  const currentStreak = Math.max(0, Number(currentStreakValue || 0));
  if (!lastDailyBonusAt) return { nextStreak: 1, amount: DAILY_BONUS_STREAK_AMOUNTS[0] || DAILY_BONUS_AMOUNT };

  const last = lastDailyBonusAt instanceof Date ? lastDailyBonusAt.getTime() : new Date(String(lastDailyBonusAt)).getTime();
  const isContinuing = Number.isFinite(last) && Date.now() - last <= DAILY_BONUS_GRACE_MS;
  const nextStreak = isContinuing ? currentStreak + 1 : 1;
  const amountIndex = Math.min(DAILY_BONUS_STREAK_AMOUNTS.length - 1, Math.max(0, nextStreak - 1));

  return {
    nextStreak,
    amount: DAILY_BONUS_STREAK_AMOUNTS[amountIndex] || DAILY_BONUS_AMOUNT,
  };
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
    lastDailyBonusAt: row.last_daily_bonus_at
      ? (row.last_daily_bonus_at instanceof Date
          ? row.last_daily_bonus_at.toISOString()
          : new Date(String(row.last_daily_bonus_at)).toISOString())
      : undefined,
    dailyBonusStreak: Number(row.daily_bonus_streak || 0),
    bestDailyBonusStreak: Number(row.best_daily_bonus_streak || 0),
    lastDailyBonusAmount: row.last_daily_bonus_amount ? Number(row.last_daily_bonus_amount) : undefined,
  };
}

function toMarket(row: any): Market {
  const displayRow = getDisplayMarketRow(row);

  return {
    id: displayRow.id,
    question: displayRow.question,
    category: displayRow.category,
    description: displayRow.description,
    source: displayRow.source,
    closesAt: displayRow.closes_at,
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

function toSuggestion(row: any): MarketSuggestion {
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    question: row.question,
    category: row.category,
    description: row.description || "",
    source: row.source || "",
    closesAt: row.closes_at,
    status: row.status,
    adminNote: row.admin_note || undefined,
    createdAt: formatDbDateTime(row.created_at),
    reviewedAt: row.reviewed_at ? formatDbDateTime(row.reviewed_at) : undefined,
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


function escapeTelegramHtml(value: unknown) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getTelegramChatIdFromUserId(userId: string) {
  const directId = String(userId || "").trim();

  if (/^\d+$/.test(directId)) {
    return directId;
  }

  const match = directId.match(/^telegram-(\d+)$/);
  return match?.[1] || null;
}

function getMarketAppUrl(marketId?: string) {
  if (!APP_PUBLIC_URL) return "";

  try {
    const url = new URL(APP_PUBLIC_URL);

    if (marketId) {
      url.searchParams.set("market", marketId);
    }

    return url.toString();
  } catch {
    const separator = APP_PUBLIC_URL.includes("?") ? "&" : "?";
    return marketId ? `${APP_PUBLIC_URL}${separator}market=${encodeURIComponent(marketId)}` : APP_PUBLIC_URL;
  }
}

async function sendTelegramMessageToUser(userId: string, html: string, marketId?: string) {
  if (!BOT_TOKEN) return { ok: false, reason: "BOT_TOKEN не настроен" } as const;

  const chatId = getTelegramChatIdFromUserId(userId);
  if (!chatId) return { ok: false, reason: "Пользователь не Telegram" } as const;

  const marketUrl = getMarketAppUrl(marketId);
  const payload: Record<string, unknown> = {
    chat_id: chatId,
    text: html,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  };

  if (marketUrl) {
    payload.reply_markup = {
      inline_keyboard: [[{ text: "Открыть Forecast Market", url: marketUrl }]],
    };
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.text();
      console.warn(`Telegram sendMessage failed for ${userId}: ${response.status} ${body}`);
      return { ok: false, reason: `Telegram ${response.status}` } as const;
    }

    return { ok: true } as const;
  } catch (error) {
    console.warn("Telegram sendMessage error:", error);
    return { ok: false, reason: "Ошибка сети Telegram" } as const;
  }
}

async function sendSettlementNotifications(market: Market, outcome: Outcome, payoutsByUser: Record<string, number>) {
  const userIds = Object.keys(payoutsByUser);
  if (userIds.length === 0) return;

  const usersResult = await pool.query(
    `SELECT id, name, balance FROM users WHERE id = ANY($1::text[])`,
    [userIds]
  );

  const usersById = new Map(usersResult.rows.map((row) => [String(row.id), toUser(row)]));
  const resultText = outcome === "yes" ? "Да" : "Нет";

  await Promise.allSettled(
    userIds.map(async (userId) => {
      const payout = payoutsByUser[userId] || 0;
      const user = usersById.get(userId);
      const isWinner = payout > 0;
      const userName = user?.name || "участник";
      const balanceText = user ? `\nБаланс: <b>${user.balance.toLocaleString("ru-RU")} баллов</b>` : "";

      const html = isWinner
        ? `🎯 <b>Рынок рассчитан</b>\n\n${escapeTelegramHtml(market.question)}\n\nРезультат: <b>${resultText}</b>\n${escapeTelegramHtml(userName)}, твой прогноз сыграл.\nНачислено: <b>+${payout.toLocaleString("ru-RU")} баллов</b>${balanceText}`
        : `🎯 <b>Рынок рассчитан</b>\n\n${escapeTelegramHtml(market.question)}\n\nРезультат: <b>${resultText}</b>\n${escapeTelegramHtml(userName)}, этот прогноз не сыграл. Попробуй следующий рынок 👀${balanceText}`;

      await sendTelegramMessageToUser(userId, html, market.id);
    })
  );
}

async function rememberNotificationEvent(queryRunner: QueryRunner, eventType: string, userId: string, marketId: string) {
  const result = await queryRunner.query(
    `
      INSERT INTO notification_events (id, event_type, user_id, market_id, created_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (event_type, user_id, market_id) DO NOTHING
      RETURNING id
    `,
    [createId(), eventType, userId, marketId]
  );

  return Boolean(result.rows[0]);
}

async function sendClosingTodayReminders() {
  if (!BOT_TOKEN) return;

  try {
    await closeExpiredMarkets();

    const result = await pool.query(
      `
        SELECT DISTINCT p.user_id, m.id AS market_id, m.question, m.closes_at
        FROM predictions p
        JOIN markets m ON m.id = p.market_id
        WHERE m.status = 'open'
          AND m.closes_at = CURRENT_DATE::TEXT
          AND p.settled_at IS NULL
        LIMIT 100
      `
    );

    for (const row of result.rows) {
      const userId = String(row.user_id);
      const marketId = String(row.market_id);
      const inserted = await rememberNotificationEvent(pool, "market_closing_today", userId, marketId);

      if (!inserted) continue;

      const html = `⏳ <b>Рынок закрывается сегодня</b>\n\n${escapeTelegramHtml(row.question)}\n\nПрогнозы скоро закроются, а после расчёта ты получишь результат в Forecast Market.`;
      await sendTelegramMessageToUser(userId, html, marketId);
    }
  } catch (error) {
    console.warn("Ошибка отправки напоминаний о закрытии рынков:", error);
  }
}


type PolymarketEvent = Record<string, any>;
type PolymarketMarket = Record<string, any>;

type PolymarketImportSummary = {
  ok: true;
  checked: number;
  imported: number;
  skipped: number;
  errors: string[];
  importedMarketIds: string[];
  lastImportAt: string;
};

let polymarketImportPromise: Promise<PolymarketImportSummary> | null = null;

function parseMaybeJsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;

  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
}

function normalizeForId(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

function getPolymarketItemId(event: PolymarketEvent, market: PolymarketMarket) {
  const rawId =
    market.conditionId ||
    market.condition_id ||
    market.questionID ||
    market.questionId ||
    market.id ||
    market.slug ||
    event.slug ||
    event.id ||
    market.question ||
    event.title;

  return `polymarket-${normalizeForId(rawId) || createId()}`;
}

function getPolymarketUrl(event: PolymarketEvent, market: PolymarketMarket) {
  const eventSlug = event.slug || event.ticker || event.id;
  const marketSlug = market.slug || market.marketSlug;

  if (eventSlug) {
    return `https://polymarket.com/event/${eventSlug}${marketSlug && marketSlug !== eventSlug ? `?market=${marketSlug}` : ""}`;
  }

  if (marketSlug) {
    return `https://polymarket.com/event/${marketSlug}`;
  }

  return "https://polymarket.com";
}

function getPolymarketQuestion(event: PolymarketEvent, market: PolymarketMarket) {
  const rawQuestion = String(
    market.question ||
      market.title ||
      event.title ||
      event.question ||
      event.slug ||
      "Polymarket event"
  ).trim();

  return translatePolymarketQuestion(rawQuestion);
}

function getPolymarketDescription(_event: PolymarketEvent, _market: PolymarketMarket) {
  return POLYMARKET_GAME_DESCRIPTION;
}

function mapPolymarketCategory(event: PolymarketEvent, market: PolymarketMarket) {
  const rawParts = [
    market.category,
    market.groupItemTitle,
    market.seriesSlug,
    event.category,
    event.groupItemTitle,
    event.seriesSlug,
    ...(parseMaybeJsonArray(market.tags).map((tag: any) => tag?.label || tag?.slug || tag?.name || tag)),
    ...(parseMaybeJsonArray(event.tags).map((tag: any) => tag?.label || tag?.slug || tag?.name || tag)),
  ];

  const raw = rawParts.filter(Boolean).join(" ").toLowerCase();

  if (/crypto|bitcoin|ethereum|solana|btc|eth/.test(raw)) return "Крипто";
  if (/sport|football|soccer|nba|nfl|nhl|mlb|ufc|tennis|formula/.test(raw)) return "Спорт";
  if (/politic|election|trump|biden|congress|senate|president/.test(raw)) return "Политика";
  if (/business|econom|fed|inflation|rate|stock|market|recession/.test(raw)) return "Экономика";
  if (/tech|ai|apple|google|tesla|openai|spacex|nvidia/.test(raw)) return "Технологии";
  if (/culture|music|movie|oscars|grammy|celebrity|tv/.test(raw)) return "Культура";
  if (/science|space|weather|climate/.test(raw)) return "Наука";

  return "Мировые события";
}

function getPolymarketCloseDate(event: PolymarketEvent, market: PolymarketMarket) {
  const raw =
    market.endDate ||
    market.end_date ||
    market.closeDate ||
    market.close_time ||
    event.endDate ||
    event.end_date ||
    event.closeDate ||
    event.close_time;

  const date = raw ? new Date(String(raw)) : null;

  if (date && !Number.isNaN(date.getTime())) {
    return date.toISOString().slice(0, 10);
  }

  const fallback = new Date();
  fallback.setMonth(fallback.getMonth() + 3);
  return fallback.toISOString().slice(0, 10);
}

function isBinaryYesNoMarket(market: PolymarketMarket) {
  const outcomes = parseMaybeJsonArray(market.outcomes).map((outcome) =>
    String(outcome).trim().toLowerCase()
  );

  if (outcomes.length === 0) return true;

  const hasYes = outcomes.some((outcome) => outcome === "yes" || outcome === "да");
  const hasNo = outcomes.some((outcome) => outcome === "no" || outcome === "нет");

  return outcomes.length === 2 && hasYes && hasNo;
}

function getInitialYesProbabilityFromPolymarket(market: PolymarketMarket) {
  const outcomes = parseMaybeJsonArray(market.outcomes).map((outcome) =>
    String(outcome).trim().toLowerCase()
  );
  const prices = parseMaybeJsonArray(market.outcomePrices || market.outcome_prices).map((price) =>
    Number(price)
  );

  if (outcomes.length === prices.length && outcomes.length > 0) {
    const yesIndex = outcomes.findIndex((outcome) => outcome === "yes" || outcome === "да");
    const price = prices[yesIndex];

    if (Number.isFinite(price) && price > 0 && price < 1) {
      return Math.min(99, Math.max(1, Math.round(price * 100)));
    }
  }

  const oneDayPrice = Number(market.oneDayPrice || market.lastTradePrice || market.bestAsk || market.bestBid);

  if (Number.isFinite(oneDayPrice) && oneDayPrice > 0 && oneDayPrice < 1) {
    return Math.min(99, Math.max(1, Math.round(oneDayPrice * 100)));
  }

  return 50;
}

function getPolymarketVolume(event: PolymarketEvent, market: PolymarketMarket) {
  const values = [
    market.volume24hr,
    market.volume_24hr,
    market.volume,
    market.liquidity,
    event.volume24hr,
    event.volume_24hr,
    event.volume,
    event.liquidity,
  ];

  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
  }

  return 0;
}

function isFutureOrCurrentPolymarketClose(event: PolymarketEvent, market: PolymarketMarket) {
  const raw =
    market.endDate ||
    market.end_date ||
    market.closeDate ||
    market.close_time ||
    event.endDate ||
    event.end_date ||
    event.closeDate ||
    event.close_time;

  if (!raw) return true;

  const timestamp = new Date(String(raw)).getTime();
  if (!Number.isFinite(timestamp)) return true;

  const yesterday = Date.now() - 24 * 60 * 60 * 1000;
  return timestamp > yesterday;
}

function isLikelyUsefulPolymarketQuestion(question: string) {
  const normalized = question.toLowerCase();

  if (question.length < 12 || question.length > 180) return false;
  if (/test market|do not use|sample market|deprecated/.test(normalized)) return false;
  if (/vs\.?/.test(normalized) && question.length < 25) return false;

  return true;
}

function rankPolymarketMarkets(event: PolymarketEvent, markets: PolymarketMarket[]) {
  return [...markets].sort((a, b) => getPolymarketVolume(event, b) - getPolymarketVolume(event, a));
}

function getMarketsFromPolymarketEvent(event: PolymarketEvent) {
  const markets = parseMaybeJsonArray(event.markets) as PolymarketMarket[];

  if (markets.length > 0) {
    return markets;
  }

  return [event as PolymarketMarket];
}

async function getAppSetting(key: string) {
  const result = await pool.query("SELECT value FROM app_settings WHERE key = $1", [key]);
  return result.rows[0]?.value ? String(result.rows[0].value) : "";
}

async function setAppSetting(key: string, value: string) {
  await pool.query(
    `
      INSERT INTO app_settings (key, value, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `,
    [key, value]
  );
}

async function fetchPolymarketEvents(limit: number) {
  const url = new URL(`${POLYMARKET_GAMMA_BASE_URL}/events`);
  url.searchParams.set("active", "true");
  url.searchParams.set("closed", "false");
  url.searchParams.set("order", "volume_24hr");
  url.searchParams.set("ascending", "false");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("offset", "0");

  const response = await fetch(url.toString(), {
    headers: {
      accept: "application/json",
      "user-agent": "ForecastMarket/1.0 (+https://forecast-market.onrender.com)",
    },
  });

  if (!response.ok) {
    throw new Error(`Polymarket API вернул ${response.status}`);
  }

  const data = await response.json();

  if (Array.isArray(data)) return data as PolymarketEvent[];
  if (Array.isArray(data?.events)) return data.events as PolymarketEvent[];
  if (Array.isArray(data?.data)) return data.data as PolymarketEvent[];

  return [];
}

async function importPolymarketMarkets(limit = POLYMARKET_AUTO_IMPORT_LIMIT): Promise<PolymarketImportSummary> {
  if (polymarketImportPromise) {
    return polymarketImportPromise;
  }

  polymarketImportPromise = (async () => {
    const errors: string[] = [];
    const importedMarketIds: string[] = [];
    let checked = 0;
    let skipped = 0;

    try {
      const events = await fetchPolymarketEvents(limit);

      for (const event of events) {
        const eventMarkets = rankPolymarketMarkets(event, getMarketsFromPolymarketEvent(event)).slice(0, POLYMARKET_MAX_MARKETS_PER_EVENT);

        for (const market of eventMarkets) {
          checked += 1;

          try {
            const question = getPolymarketQuestion(event, market);
            const volume = getPolymarketVolume(event, market);
            const closed = Boolean(market.closed || event.closed);
            const active = market.active ?? event.active ?? true;

            if (!question || closed || active === false || !isBinaryYesNoMarket(market)) {
              skipped += 1;
              continue;
            }

            if (!isLikelyUsefulPolymarketQuestion(question) || !isFutureOrCurrentPolymarketClose(event, market)) {
              skipped += 1;
              continue;
            }

            if (volume < POLYMARKET_MIN_VOLUME) {
              skipped += 1;
              continue;
            }

            const marketId = getPolymarketItemId(event, market);
            const yesProbability = getInitialYesProbabilityFromPolymarket(market);
            const closesAt = getPolymarketCloseDate(event, market);
            const category = mapPolymarketCategory(event, market);
            const source = "Polymarket";
            const description = getPolymarketDescription(event, market);

            const result = await pool.query(
              `
                INSERT INTO markets (
                  id, question, category, description, source, closes_at,
                  yes_pool, no_pool, status, resolved_outcome, resolved_at, created_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open', NULL, NULL, NOW())
                ON CONFLICT (id) DO UPDATE SET
                  question = EXCLUDED.question,
                  category = EXCLUDED.category,
                  description = EXCLUDED.description,
                  source = EXCLUDED.source,
                  closes_at = EXCLUDED.closes_at,
                  yes_pool = CASE WHEN markets.status = 'open' THEN EXCLUDED.yes_pool ELSE markets.yes_pool END,
                  no_pool = CASE WHEN markets.status = 'open' THEN EXCLUDED.no_pool ELSE markets.no_pool END
                RETURNING id, (xmax = 0) AS inserted
              `,
              [
                marketId,
                question,
                category,
                description,
                source,
                closesAt,
                yesProbability * 100,
                (100 - yesProbability) * 100,
              ]
            );

            if (result.rows[0]?.inserted) {
              importedMarketIds.push(result.rows[0].id);
            } else {
              skipped += 1;
            }
          } catch (error) {
            skipped += 1;
            errors.push(error instanceof Error ? error.message : "Неизвестная ошибка импорта рынка");
          }
        }
      }

      const imported = importedMarketIds.length;
      const lastImportAt = new Date().toISOString();

      await setAppSetting("polymarket_last_import_at", lastImportAt);
      await setAppSetting("polymarket_last_import_count", String(imported));
      await setAppSetting("polymarket_last_checked_at", String(checked));

      return {
        ok: true,
        checked,
        imported,
        skipped,
        errors: errors.slice(0, 10),
        importedMarketIds,
        lastImportAt,
      };
    } finally {
      polymarketImportPromise = null;
    }
  })();

  return polymarketImportPromise;
}

async function maybeAutoImportPolymarket(reason: "startup" | "interval" | "bootstrap") {
  if (!POLYMARKET_AUTO_IMPORT_ENABLED) return null;

  try {
    const lastImportValue = await getAppSetting("polymarket_last_import_at");
    const lastImportTime = lastImportValue ? new Date(lastImportValue).getTime() : 0;
    const shouldImport = !lastImportTime || Date.now() - lastImportTime >= POLYMARKET_AUTO_IMPORT_INTERVAL_MS;

    if (!shouldImport) return null;

    console.log(`Polymarket auto-import стартовал: ${reason}`);
    const result = await importPolymarketMarkets(POLYMARKET_AUTO_IMPORT_LIMIT);
    console.log(`Polymarket auto-import завершён: импортировано ${result.imported}, проверено ${result.checked}`);
    return result;
  } catch (error) {
    console.error("Ошибка Polymarket auto-import:", error);
    return null;
  }
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
      balance INTEGER NOT NULL DEFAULT 10000,
      last_daily_bonus_at TIMESTAMPTZ,
      daily_bonus_streak INTEGER NOT NULL DEFAULT 0,
      best_daily_bonus_streak INTEGER NOT NULL DEFAULT 0,
      last_daily_bonus_amount INTEGER
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

    CREATE TABLE IF NOT EXISTS market_suggestions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      user_name TEXT NOT NULL,
      question TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT '',
      closes_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      admin_note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      reviewed_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS favorites (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      market_id TEXT NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
      PRIMARY KEY (user_id, market_id)
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS notification_events (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      market_id TEXT REFERENCES markets(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (event_type, user_id, market_id)
    );

    CREATE TABLE IF NOT EXISTS auth_sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      telegram_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL
    );

    CREATE INDEX IF NOT EXISTS predictions_market_id_idx ON predictions(market_id);
    CREATE INDEX IF NOT EXISTS predictions_user_id_idx ON predictions(user_id);
    CREATE INDEX IF NOT EXISTS comments_market_id_idx ON comments(market_id);
    CREATE INDEX IF NOT EXISTS transactions_user_id_idx ON transactions(user_id);
    CREATE INDEX IF NOT EXISTS transactions_created_at_idx ON transactions(created_at);
    CREATE INDEX IF NOT EXISTS market_suggestions_user_id_idx ON market_suggestions(user_id);
    CREATE INDEX IF NOT EXISTS market_suggestions_status_idx ON market_suggestions(status);
    CREATE INDEX IF NOT EXISTS favorites_user_id_idx ON favorites(user_id);
    CREATE INDEX IF NOT EXISTS notification_events_user_id_idx ON notification_events(user_id);
    CREATE INDEX IF NOT EXISTS notification_events_market_id_idx ON notification_events(market_id);
    CREATE INDEX IF NOT EXISTS auth_sessions_user_id_idx ON auth_sessions(user_id);
    CREATE INDEX IF NOT EXISTS auth_sessions_expires_at_idx ON auth_sessions(expires_at);

    ALTER TABLE users ADD COLUMN IF NOT EXISTS last_daily_bonus_at TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_bonus_streak INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS best_daily_bonus_streak INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS last_daily_bonus_amount INTEGER;
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

async function closeExpiredMarkets(db: Pool | PoolClient = pool) {
  await db.query(`
    UPDATE markets
    SET status = 'closed'
    WHERE status = 'open'
      AND closes_at IS NOT NULL
      AND closes_at <> ''
      AND closes_at < CURRENT_DATE::TEXT
  `);
}

async function getSnapshot(): Promise<DatabaseSnapshot> {
  await closeExpiredMarkets();

  const [usersResult, marketsResult, predictionsResult, commentsResult, transactionsResult, suggestionsResult, favoritesResult] =
    await Promise.all([
      pool.query("SELECT * FROM users ORDER BY name ASC"),
      pool.query("SELECT * FROM markets ORDER BY created_at DESC"),
      pool.query("SELECT * FROM predictions ORDER BY id DESC"),
      pool.query("SELECT * FROM comments ORDER BY id DESC"),
      pool.query("SELECT * FROM transactions ORDER BY created_at DESC LIMIT 500"),
      pool.query("SELECT * FROM market_suggestions ORDER BY created_at DESC LIMIT 500"),
      pool.query("SELECT * FROM favorites ORDER BY user_id ASC, market_id ASC"),
    ]);

  const favoriteMarketIdsByUser: Record<string, string[]> = {};

  favoritesResult.rows.forEach((row) => {
    if (!favoriteMarketIdsByUser[row.user_id]) {
      favoriteMarketIdsByUser[row.user_id] = [];
    }

    favoriteMarketIdsByUser[row.user_id].push(row.market_id);
  });

  const [lastImportAt, lastImportedCount, lastCheckedAt] = await Promise.all([
    getAppSetting("polymarket_last_import_at"),
    getAppSetting("polymarket_last_import_count"),
    getAppSetting("polymarket_last_checked_at"),
  ]);

  return {
    users: usersResult.rows.map(toUser),
    markets: marketsResult.rows.map(toMarket),
    predictions: predictionsResult.rows.map(toPrediction),
    comments: commentsResult.rows.map(toComment),
    transactions: transactionsResult.rows.map(toTransaction),
    marketSuggestions: suggestionsResult.rows.map(toSuggestion),
    favoriteMarketIdsByUser,
    adminUserIds: ADMIN_USER_IDS,
    polymarketImport: {
      enabled: POLYMARKET_AUTO_IMPORT_ENABLED,
      lastImportAt: lastImportAt || undefined,
      lastImportedCount: lastImportedCount ? Number(lastImportedCount) : undefined,
      lastCheckedAt: lastCheckedAt || undefined,
    },
  };
}

// -----------------------------
// Express app
// -----------------------------

await migrate();
await seedIfEmpty();
void maybeAutoImportPolymarket("startup");
setInterval(() => {
  void maybeAutoImportPolymarket("interval");
}, POLYMARKET_AUTO_IMPORT_INTERVAL_MS);

setTimeout(() => {
  void sendClosingTodayReminders();
}, 15000);

setInterval(() => {
  void sendClosingTodayReminders();
}, 30 * 60 * 1000);

const app = express();

app.disable("x-powered-by");

app.use((_request, response, next) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Cache-Control", "no-store");
  next();
});

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
  await closeExpiredMarkets();
  const [dbCheck, pendingResult] = await Promise.all([
    pool.query("SELECT NOW() AS now"),
    pool.query("SELECT COUNT(*)::int AS count FROM markets WHERE status = 'closed'"),
  ]);

  response.json({
    ok: true,
    message: "Forecast Market API работает с PostgreSQL",
    databaseTime: dbCheck.rows[0].now,
    adminUsersConfigured: ADMIN_USER_IDS.length,
    telegramAuthConfigured: Boolean(BOT_TOKEN),
    telegramNotificationsConfigured: Boolean(BOT_TOKEN),
    secureSessionAuthEnabled: true,
    telegramAuthMaxAgeSeconds: TELEGRAM_AUTH_MAX_AGE_SECONDS,
    appPublicUrlConfigured: Boolean(APP_PUBLIC_URL),
    dailyBonusAmount: DAILY_BONUS_AMOUNT,
    dailyBonusStreakAmounts: DAILY_BONUS_STREAK_AMOUNTS,
    strictTelegramUserActions: true,
    publicUserCreationDisabled: true,
    polymarketAutoImportEnabled: POLYMARKET_AUTO_IMPORT_ENABLED,
    polymarketImportLimit: POLYMARKET_AUTO_IMPORT_LIMIT,
    polymarketImportIntervalMinutes: Math.round(POLYMARKET_AUTO_IMPORT_INTERVAL_MS / 60000),
    pendingResolutionMarkets: pendingResult.rows[0].count,
    time: new Date().toISOString(),
  });
});

app.get("/api/bootstrap", async (_request, response) => {
  await maybeAutoImportPolymarket("bootstrap");
  response.json(await getSnapshot());
});

app.post("/api/users", async (_request, response) => {
  response.status(410).json({
    error: "Создание тестовых пользователей отключено. Вход доступен только через Telegram Mini App.",
  });
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
    let existingUser = toUser(existingUserResult.rows[0]);

    if (name && existingUser.name !== name) {
      const updatedUser = await pool.query(
        "UPDATE users SET name = $2 WHERE id = $1 RETURNING *",
        [userId, name]
      );
      existingUser = toUser(updatedUser.rows[0]);
    }

    const session = await createAuthSession(existingUser.id, telegramId);
    response.json({ user: existingUser, ...session });
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

  const session = await createAuthSession(user.id, telegramId);
  response.status(201).json({ user, ...session });
});

app.post("/api/users/:userId/daily-bonus", async (request, response) => {
  const userId = String(request.params.userId || "").trim();

  if (!userId) {
    response.status(400).json({ error: "Не указан пользователь" });
    return;
  }

  if (!(await assertRequestMatchesUser(request, response, userId))) return;

  try {
    const result = await withTransaction(async (client) => {
      const userResult = await client.query("SELECT * FROM users WHERE id = $1 FOR UPDATE", [userId]);
      const userRow = userResult.rows[0];

      if (!userRow) {
        response.status(404).json({ error: "Пользователь не найден" });
        return null;
      }

      const nextDailyBonusAt = getNextDailyBonusAt(userRow.last_daily_bonus_at);

      if (nextDailyBonusAt && nextDailyBonusAt.getTime() > Date.now()) {
        response.status(429).json({
          error: "Ежедневный бонус уже забран. Возвращайся позже.",
          nextDailyBonusAt: nextDailyBonusAt.toISOString(),
        });
        return null;
      }

      const streakState = getDailyBonusStreakState(userRow.last_daily_bonus_at, userRow.daily_bonus_streak);

      const updatedUserResult = await client.query(
        `UPDATE users
         SET balance = balance + $2,
             last_daily_bonus_at = NOW(),
             daily_bonus_streak = $3,
             best_daily_bonus_streak = GREATEST(COALESCE(best_daily_bonus_streak, 0), $3),
             last_daily_bonus_amount = $2
         WHERE id = $1
         RETURNING *`,
        [userId, streakState.amount, streakState.nextStreak]
      );

      const transaction = await addBalanceTransaction(client, {
        userId,
        type: "daily_bonus",
        title: `Ежедневный бонус · день ${streakState.nextStreak}`,
        description: `Бонус за серию входов. Сегодня начислено ${streakState.amount} баллов.`,
        amount: streakState.amount,
      });

      return { user: toUser(updatedUserResult.rows[0]), transaction, dailyBonusAmount: streakState.amount, dailyBonusStreak: streakState.nextStreak };
    });

    if (!result) return;

    response.json({
      ...result,
      nextDailyBonusAt: new Date(Date.now() + DAILY_BONUS_INTERVAL_MS).toISOString(),
    });
  } catch (error) {
    console.error("daily bonus failed", error);
    response.status(500).json({ error: "Не удалось начислить ежедневный бонус" });
  }
});


app.get("/api/polymarket/import-status", async (_request, response) => {
  const [lastImportAt, lastImportedCount, lastCheckedAt] = await Promise.all([
    getAppSetting("polymarket_last_import_at"),
    getAppSetting("polymarket_last_import_count"),
    getAppSetting("polymarket_last_checked_at"),
  ]);

  response.json({
    ok: true,
    enabled: POLYMARKET_AUTO_IMPORT_ENABLED,
    baseUrl: POLYMARKET_GAMMA_BASE_URL,
    limit: POLYMARKET_AUTO_IMPORT_LIMIT,
    minVolume: POLYMARKET_MIN_VOLUME,
    maxMarketsPerEvent: POLYMARKET_MAX_MARKETS_PER_EVENT,
    intervalMinutes: Math.round(POLYMARKET_AUTO_IMPORT_INTERVAL_MS / 60000),
    lastImportAt: lastImportAt || null,
    lastImportedCount: lastImportedCount ? Number(lastImportedCount) : 0,
    lastCheckedAt: lastCheckedAt ? Number(lastCheckedAt) : 0,
  });
});

app.post("/api/polymarket/import", async (request, response) => {
  if (!(await requireAdmin(request, response))) return;

  try {
    const limit = Math.min(100, Math.max(1, Number(request.body?.limit || POLYMARKET_AUTO_IMPORT_LIMIT)));
    const result = await importPolymarketMarkets(limit);
    response.status(201).json(result);
  } catch (error) {
    console.error(error);
    response.status(500).json({
      error: error instanceof Error ? error.message : "Не удалось импортировать рынки Polymarket",
    });
  }
});

app.post("/api/market-suggestions", async (request, response) => {
  try {
    const { userId, question, category, description, source, closesAt } = request.body || {};
    const normalizedQuestion = String(question || "").trim();
    const normalizedCategory = String(category || "").trim() || "Другое";
    const normalizedDescription = String(description || "").trim();
    const normalizedSource = String(source || "").trim() || "Будет указан администратором";
    const normalizedClosesAt = String(closesAt || "").trim();

    if (!userId) {
      response.status(400).json({ error: "Не передан userId" });
      return;
    }

    if (!(await assertRequestMatchesUser(request, response, String(userId)))) return;

    if (normalizedQuestion.length < 8) {
      response.status(400).json({ error: "Сформулируй вопрос рынка подробнее" });
      return;
    }

    if (!normalizedClosesAt) {
      response.status(400).json({ error: "Укажи дату закрытия рынка" });
      return;
    }

    const userResult = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);
    if (userResult.rows.length === 0) {
      response.status(404).json({ error: "Пользователь не найден" });
      return;
    }

    const user = toUser(userResult.rows[0]);
    const suggestionId = createId();

    const result = await pool.query(
      `
        INSERT INTO market_suggestions (
          id, user_id, user_name, question, category, description, source, closes_at, status, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', NOW())
        RETURNING *
      `,
      [
        suggestionId,
        user.id,
        getUserDisplayName(user),
        normalizedQuestion,
        normalizedCategory,
        normalizedDescription,
        normalizedSource,
        normalizedClosesAt,
      ]
    );

    response.status(201).json(toSuggestion(result.rows[0]));
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: "Не удалось отправить заявку" });
  }
});

app.patch("/api/market-suggestions/:suggestionId", async (request, response) => {
  if (!(await requireAdmin(request, response))) return;

  try {
    const { suggestionId } = request.params;
    const { question, category, description, source, closesAt, adminNote } = request.body || {};

    const result = await pool.query(
      `
        UPDATE market_suggestions
        SET
          question = COALESCE($2, question),
          category = COALESCE($3, category),
          description = COALESCE($4, description),
          source = COALESCE($5, source),
          closes_at = COALESCE($6, closes_at),
          admin_note = COALESCE($7, admin_note)
        WHERE id = $1
        RETURNING *
      `,
      [
        suggestionId,
        typeof question === "string" ? question.trim() : null,
        typeof category === "string" ? category.trim() : null,
        typeof description === "string" ? description.trim() : null,
        typeof source === "string" ? source.trim() : null,
        typeof closesAt === "string" ? closesAt.trim() : null,
        typeof adminNote === "string" ? adminNote.trim() : null,
      ]
    );

    if (result.rows.length === 0) {
      response.status(404).json({ error: "Заявка не найдена" });
      return;
    }

    response.json(toSuggestion(result.rows[0]));
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: "Не удалось обновить заявку" });
  }
});

app.post("/api/market-suggestions/:suggestionId/approve", async (request, response) => {
  if (!(await requireAdmin(request, response))) return;

  try {
    const { suggestionId } = request.params;
    const { question, category, description, source, closesAt, yesProbability, adminNote } = request.body || {};

    const result = await withTransaction(async (client) => {
      const suggestionResult = await client.query("SELECT * FROM market_suggestions WHERE id = $1 FOR UPDATE", [suggestionId]);
      if (suggestionResult.rows.length === 0) {
        throw new Error("SUGGESTION_NOT_FOUND");
      }

      const suggestion = toSuggestion(suggestionResult.rows[0]);
      const finalQuestion = String(question || suggestion.question).trim();
      const finalCategory = String(category || suggestion.category).trim() || "Другое";
      const finalDescription = String(description || suggestion.description).trim() || "Правила расчета будут уточнены администратором.";
      const finalSource = String(source || suggestion.source).trim() || "Будет указан администратором";
      const finalClosesAt = String(closesAt || suggestion.closesAt).trim();
      const probability = Math.min(99, Math.max(1, Number(yesProbability || 50)));
      const yesPool = probability * 100;
      const noPool = (100 - probability) * 100;
      const marketId = createId();

      const marketResult = await client.query(
        `
          INSERT INTO markets (
            id, question, category, description, source, closes_at,
            yes_pool, no_pool, status, resolved_outcome, resolved_at, created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open', NULL, NULL, NOW())
          RETURNING *
        `,
        [marketId, finalQuestion, finalCategory, finalDescription, finalSource, finalClosesAt, yesPool, noPool]
      );

      const updatedSuggestionResult = await client.query(
        `
          UPDATE market_suggestions
          SET
            question = $2,
            category = $3,
            description = $4,
            source = $5,
            closes_at = $6,
            status = 'approved',
            admin_note = $7,
            reviewed_at = NOW()
          WHERE id = $1
          RETURNING *
        `,
        [suggestionId, finalQuestion, finalCategory, finalDescription, finalSource, finalClosesAt, String(adminNote || "Одобрено и опубликовано").trim()]
      );

      return {
        market: toMarket(marketResult.rows[0]),
        suggestion: toSuggestion(updatedSuggestionResult.rows[0]),
      };
    });

    response.status(201).json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "SUGGESTION_NOT_FOUND") {
      response.status(404).json({ error: "Заявка не найдена" });
      return;
    }
    console.error(error);
    response.status(500).json({ error: "Не удалось одобрить заявку" });
  }
});

app.post("/api/market-suggestions/:suggestionId/reject", async (request, response) => {
  if (!(await requireAdmin(request, response))) return;

  try {
    const { suggestionId } = request.params;
    const { adminNote } = request.body || {};

    const result = await pool.query(
      `
        UPDATE market_suggestions
        SET status = 'rejected', admin_note = $2, reviewed_at = NOW()
        WHERE id = $1
        RETURNING *
      `,
      [suggestionId, String(adminNote || "Отклонено администратором").trim()]
    );

    if (result.rows.length === 0) {
      response.status(404).json({ error: "Заявка не найдена" });
      return;
    }

    response.json(toSuggestion(result.rows[0]));
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: "Не удалось отклонить заявку" });
  }
});

app.post("/api/markets", async (request, response) => {
  if (!(await requireAdmin(request, response))) {
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
  if (!(await requireAdmin(request, response))) {
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
      SET
        question = $2,
        category = $3,
        description = $4,
        source = $5,
        closes_at = $6,
        status = CASE
          WHEN status = 'closed' AND $6 >= CURRENT_DATE::TEXT THEN 'open'
          ELSE status
        END
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

app.post("/api/markets/:marketId/extend", async (request, response) => {
  if (!(await requireAdmin(request, response))) {
    return;
  }

  const marketId = request.params.marketId;
  const closesAt = String(request.body?.closesAt || "").trim();

  if (!closesAt) {
    response.status(400).json({ error: "Укажите новую дату закрытия" });
    return;
  }

  const result = await pool.query(
    `
      UPDATE markets
      SET
        closes_at = $2,
        status = CASE
          WHEN status <> 'resolved' AND $2 >= CURRENT_DATE::TEXT THEN 'open'
          WHEN status <> 'resolved' AND $2 < CURRENT_DATE::TEXT THEN 'closed'
          ELSE status
        END
      WHERE id = $1
      RETURNING *
    `,
    [marketId, closesAt]
  );

  if (!result.rows[0]) {
    response.status(404).json({ error: "Рынок не найден" });
    return;
  }

  response.json(toMarket(result.rows[0]));
});

app.delete("/api/markets/:marketId", async (request, response) => {
  if (!(await requireAdmin(request, response))) {
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
  if (!(await requireAdmin(request, response))) {
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

  if (!userId) {
    response.status(400).json({ error: "Не передан userId" });
    return;
  }

  if (!(await assertRequestMatchesUser(request, response, userId))) return;

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

    if (market.status !== "open") {
      return { error: market.status === "closed" ? "Рынок закрыт и ожидает расчёта" : "Рынок уже рассчитан" } as const;
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
  if (!(await requireAdmin(request, response))) {
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

  void sendSettlementNotifications(result.market, outcome, result.payoutsByUser);

  response.json(result);
});

app.post("/api/markets/:marketId/comments", async (request, response) => {
  const marketId = request.params.marketId;
  const userId = String(request.body?.userId || "");
  const text = String(request.body?.text || "").trim();
  const mediaDataUrl = String(request.body?.mediaDataUrl || "").trim();
  const mediaName = String(request.body?.mediaName || "").trim();

  if (!userId) {
    response.status(400).json({ error: "Не передан userId" });
    return;
  }

  if (!(await assertRequestMatchesUser(request, response, userId))) return;

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
  if (!(await requireAdmin(request, response))) {
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

  if (!(await assertRequestMatchesUser(request, response, userId))) return;

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
  if (!(await requireAdmin(request, response))) {
    return;
  }

  await withTransaction(async (client) => {
    await client.query("TRUNCATE favorites, comments, predictions, transactions, market_suggestions, markets, users, app_settings RESTART IDENTITY CASCADE");

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
