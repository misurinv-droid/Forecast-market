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
  telegramNotifySettlement?: boolean;
  telegramNotifyBonus?: boolean;
  telegramNotifyClosing?: boolean;
  telegramNotifyAdmin?: boolean;
  activeTitleItemId?: string;
  activeFrameItemId?: string;
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
  type: "start" | "prediction_buy" | "payout" | "refund" | "system" | "daily_bonus" | "referral_bonus" | "welcome_bonus";
  title: string;
  description: string;
  amount: number;
  marketId?: string;
  marketQuestion?: string;
  createdAt: string;
};

type Referral = {
  id: string;
  referrerUserId: string;
  referrerName: string;
  referredUserId: string;
  referredName: string;
  status: "pending" | "qualified";
  rewardAmount: number;
  welcomeAmount: number;
  createdAt: string;
  qualifiedAt?: string;
  rewardClaimedAt?: string;
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

type DailyMissionClaim = {
  id: string;
  userId: string;
  missionId: string;
  missionDate: string;
  rewardAmount: number;
  createdAt: string;
};

type WeeklyTournamentAward = {
  id: string;
  weekKey: string;
  weekStart: string;
  weekEnd: string;
  userId: string;
  userName: string;
  place?: number;
  score: number;
  predictionsCount: number;
  wins: number;
  rewardAmount: number;
  awardType: "top" | "participation";
  createdAt: string;
};

type ShopItem = {
  id: string;
  type: "title" | "frame";
  name: string;
  description: string;
  price: number;
  emoji: string;
  styleKey: string;
  sortOrder: number;
  isActive: boolean;
};

type UserInventoryItem = {
  id: string;
  userId: string;
  itemId: string;
  createdAt: string;
};

type DatabaseSnapshot = {
  users: DemoUser[];
  markets: Market[];
  predictions: Prediction[];
  comments: MarketComment[];
  transactions: BalanceTransaction[];
  marketSuggestions: MarketSuggestion[];
  referrals: Referral[];
  dailyMissionClaims: DailyMissionClaim[];
  weeklyTournamentAwards: WeeklyTournamentAward[];
  shopItems: ShopItem[];
  userInventory: UserInventoryItem[];
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
const REFERRAL_REWARD_AMOUNT = Number(process.env.REFERRAL_REWARD_AMOUNT || 1000);
const REFERRAL_WELCOME_AMOUNT = Number(process.env.REFERRAL_WELCOME_AMOUNT || 500);
const DATABASE_URL = process.env.DATABASE_URL;
const BOT_TOKEN = process.env.BOT_TOKEN || "";
const APP_PUBLIC_URL = (process.env.APP_PUBLIC_URL || process.env.FRONTEND_URL || "").trim();
const TELEGRAM_MINI_APP_URL = (process.env.TELEGRAM_MINI_APP_URL || "").trim();
const BACKEND_PUBLIC_URL = (process.env.BACKEND_PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || "").trim();
const TELEGRAM_WEBHOOK_SECRET = (process.env.TELEGRAM_WEBHOOK_SECRET || "").trim();
const TELEGRAM_WELCOME_LOGO_URL = (
  process.env.TELEGRAM_WELCOME_LOGO_URL ||
  (APP_PUBLIC_URL ? `${APP_PUBLIC_URL.replace(/\/$/, "")}/forecast-market-logo-cropped.png` : "")
).trim();
const TELEGRAM_REMINDERS_ENABLED = (process.env.TELEGRAM_REMINDERS_ENABLED || "true").toLowerCase() !== "false";
const TELEGRAM_AUTH_MAX_AGE_SECONDS = Number(process.env.TELEGRAM_AUTH_MAX_AGE_SECONDS || 2 * 60);
const SESSION_MAX_AGE_DAYS = Number(process.env.SESSION_MAX_AGE_DAYS || 30);
const ADMIN_TELEGRAM_IDS = (process.env.ADMIN_TELEGRAM_IDS || "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);

const ADMIN_USER_IDS = ADMIN_TELEGRAM_IDS.flatMap((id) => [id, `telegram-${id}`]);

const DAILY_MISSION_REWARDS: Record<string, number> = {
  "first-prediction": 100,
  comment: 100,
  "hot-market": 150,
  referral: 1000,
};

const WEEKLY_TOURNAMENT_TOP_REWARDS = [5000, 3000, 1500];
const WEEKLY_TOURNAMENT_PARTICIPATION_REWARD = 300;
const WEEKLY_TOURNAMENT_MIN_PREDICTIONS = 3;

function getTodayDateKey() {
  return new Date().toISOString().slice(0, 10);
}

function getRuDatePrefix(date = new Date()) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear());
  return `${day}.${month}.${year}`;
}

function getWeekStartDate(date = new Date()) {
  const start = new Date(date);
  start.setUTCHours(0, 0, 0, 0);
  const day = start.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  start.setUTCDate(start.getUTCDate() + diff);
  return start;
}

function getWeekEndDate(date = new Date()) {
  const end = getWeekStartDate(date);
  end.setUTCDate(end.getUTCDate() + 7);
  end.setUTCMilliseconds(-1);
  return end;
}

function getDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

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
  | { ok: true; user: TelegramUserPayload; authDate?: number; startParam?: string }
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

    return { ok: true, user, authDate, startParam: params.get("start_param") || undefined };
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
    telegramNotifySettlement: row.telegram_notify_settlement !== false,
    telegramNotifyBonus: row.telegram_notify_bonus !== false,
    telegramNotifyClosing: row.telegram_notify_closing !== false,
    telegramNotifyAdmin: row.telegram_notify_admin !== false,
    activeTitleItemId: row.active_title_item_id || undefined,
    activeFrameItemId: row.active_frame_item_id || undefined,
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

function toReferral(row: any): Referral {
  return {
    id: row.id,
    referrerUserId: row.referrer_user_id,
    referrerName: row.referrer_name,
    referredUserId: row.referred_user_id,
    referredName: row.referred_name,
    status: row.status,
    rewardAmount: Number(row.reward_amount || REFERRAL_REWARD_AMOUNT),
    welcomeAmount: Number(row.welcome_amount || REFERRAL_WELCOME_AMOUNT),
    createdAt: formatDbDateTime(row.created_at),
    qualifiedAt: row.qualified_at ? formatDbDateTime(row.qualified_at) : undefined,
    rewardClaimedAt: row.reward_claimed_at ? formatDbDateTime(row.reward_claimed_at) : undefined,
  };
}

function toDailyMissionClaim(row: any): DailyMissionClaim {
  const missionDate = row.mission_date instanceof Date
    ? row.mission_date.toISOString().slice(0, 10)
    : String(row.mission_date).slice(0, 10);

  return {
    id: row.id,
    userId: row.user_id,
    missionId: row.mission_id,
    missionDate,
    rewardAmount: Number(row.reward_amount || 0),
    createdAt: formatDbDateTime(row.created_at),
  };
}

function toWeeklyTournamentAward(row: any): WeeklyTournamentAward {
  const weekStart = row.week_start instanceof Date ? row.week_start.toISOString().slice(0, 10) : String(row.week_start).slice(0, 10);
  const weekEnd = row.week_end instanceof Date ? row.week_end.toISOString().slice(0, 10) : String(row.week_end).slice(0, 10);

  return {
    id: row.id,
    weekKey: row.week_key,
    weekStart,
    weekEnd,
    userId: row.user_id,
    userName: row.user_name,
    place: row.place === null || row.place === undefined ? undefined : Number(row.place),
    score: Number(row.score || 0),
    predictionsCount: Number(row.predictions_count || 0),
    wins: Number(row.wins || 0),
    rewardAmount: Number(row.reward_amount || 0),
    awardType: row.award_type === "participation" ? "participation" : "top",
    createdAt: formatDbDateTime(row.created_at),
  };
}

function toShopItem(row: any): ShopItem {
  return {
    id: row.id,
    type: row.type === "frame" ? "frame" : "title",
    name: row.name,
    description: row.description || "",
    price: Number(row.price || 0),
    emoji: row.emoji || "✨",
    styleKey: row.style_key || "default",
    sortOrder: Number(row.sort_order || 0),
    isActive: row.is_active !== false,
  };
}

function toUserInventoryItem(row: any): UserInventoryItem {
  return {
    id: row.id,
    userId: row.user_id,
    itemId: row.item_id,
    createdAt: formatDbDateTime(row.created_at),
  };
}

type QueryRunner = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }>;
};

async function ensureDefaultShopItems(queryRunner: QueryRunner = pool) {
  const defaultShopItems = [
    ["title-oracle", "title", "Оракул", "Предсказывает рынки на холодную голову.", 1500, "🔮", "oracle", 10],
    ["title-insider", "title", "Инсайдер", "Всегда знает, где движуха.", 1200, "🕵️", "insider", 20],
    ["title-risk-manager", "title", "Риск-менеджер", "Ставит аккуратно и считает вероятности.", 1000, "🛡️", "risk", 30],
    ["title-market-shark", "title", "Акула рынка", "Для тех, кто не боится спорных исходов.", 1800, "🦈", "shark", 40],
    ["title-week-king", "title", "Король недели", "Титул для охотника за турнирами.", 2500, "👑", "king", 50],
    ["frame-gold", "frame", "Золотая рамка", "Тёплая рамка для профиля победителя.", 3000, "🏆", "gold", 110],
    ["frame-neon", "frame", "Неоновая рамка", "Яркая подсветка в стиле игровой арены.", 2500, "💠", "neon", 120],
    ["frame-cyber", "frame", "Кибер рамка", "Холодная технологичная рамка для профиля.", 2200, "🤖", "cyber", 130],
    ["frame-emerald", "frame", "Изумрудная рамка", "Спокойная зелёная рамка для уверенной игры.", 1800, "💚", "emerald", 140],
  ];

  for (const item of defaultShopItems) {
    await queryRunner.query(
      `
        INSERT INTO shop_items (id, type, name, description, price, emoji, style_key, sort_order, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)
        ON CONFLICT (id) DO UPDATE
        SET type = EXCLUDED.type,
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            price = EXCLUDED.price,
            emoji = EXCLUDED.emoji,
            style_key = EXCLUDED.style_key,
            sort_order = EXCLUDED.sort_order,
            is_active = TRUE
      `,
      item
    );
  }
}

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


async function isDailyMissionCompleted(queryRunner: QueryRunner, userId: string, missionId: string) {
  const todayKey = getTodayDateKey();
  const ruPrefix = getRuDatePrefix();

  if (missionId === "first-prediction") {
    const result = await queryRunner.query(
      `SELECT id FROM predictions WHERE user_id = $1 AND (created_at LIKE $2 OR created_at LIKE $3) LIMIT 1`,
      [userId, `${todayKey}%`, `${ruPrefix}%`]
    );
    return Boolean(result.rows[0]);
  }

  if (missionId === "comment") {
    const result = await queryRunner.query(
      `SELECT id FROM comments WHERE user_id = $1 AND (created_at LIKE $2 OR created_at LIKE $3) LIMIT 1`,
      [userId, `${todayKey}%`, `${ruPrefix}%`]
    );
    return Boolean(result.rows[0]);
  }

  if (missionId === "hot-market") {
    const result = await queryRunner.query(
      `
        SELECT p.id
        FROM predictions p
        WHERE p.user_id = $1
          AND (p.created_at LIKE $2 OR p.created_at LIKE $3)
          AND (
            SELECT COUNT(*)::int
            FROM predictions all_predictions
            WHERE all_predictions.market_id = p.market_id
          ) >= 3
        LIMIT 1
      `,
      [userId, `${todayKey}%`, `${ruPrefix}%`]
    );
    return Boolean(result.rows[0]);
  }

  if (missionId === "referral") {
    const result = await queryRunner.query(
      `
        SELECT id
        FROM referrals
        WHERE referrer_user_id = $1
          AND (
            created_at::date = CURRENT_DATE
            OR qualified_at::date = CURRENT_DATE
          )
        LIMIT 1
      `,
      [userId]
    );
    return Boolean(result.rows[0]);
  }

  return false;
}


type WeeklyTournamentStandingRow = {
  userId: string;
  userName: string;
  score: number;
  spent: number;
  payouts: number;
  predictionsCount: number;
  wins: number;
};

async function getWeeklyTournamentStandings(
  queryRunner: QueryRunner,
  weekStart: Date,
  weekEnd: Date
): Promise<WeeklyTournamentStandingRow[]> {
  const result = await queryRunner.query(
    `
      SELECT
        u.id AS user_id,
        u.name AS user_name,
        COALESCE(SUM(CASE WHEN t.type IN ('prediction_buy', 'payout') THEN t.amount ELSE 0 END), 0)::int AS score,
        ABS(COALESCE(SUM(CASE WHEN t.type = 'prediction_buy' THEN t.amount ELSE 0 END), 0))::int AS spent,
        COALESCE(SUM(CASE WHEN t.type = 'payout' AND t.amount > 0 THEN t.amount ELSE 0 END), 0)::int AS payouts,
        COUNT(CASE WHEN t.type = 'prediction_buy' THEN 1 END)::int AS predictions_count,
        COUNT(CASE WHEN t.type = 'payout' AND t.amount > 0 THEN 1 END)::int AS wins
      FROM users u
      LEFT JOIN transactions t
        ON t.user_id = u.id
       AND t.created_at >= $1
       AND t.created_at <= $2
       AND t.type IN ('prediction_buy', 'payout')
      GROUP BY u.id, u.name
      HAVING COUNT(t.id) > 0
      ORDER BY score DESC, wins DESC, predictions_count DESC, user_name ASC
    `,
    [weekStart.toISOString(), weekEnd.toISOString()]
  );

  return result.rows.map((row) => ({
    userId: String(row.user_id),
    userName: String(row.user_name),
    score: Number(row.score || 0),
    spent: Number(row.spent || 0),
    payouts: Number(row.payouts || 0),
    predictionsCount: Number(row.predictions_count || 0),
    wins: Number(row.wins || 0),
  }));
}


function normalizeReferralUserId(value: unknown) {
  const rawValue = decodeURIComponent(String(value || "").trim());
  if (!rawValue) return "";

  const withoutPrefix = rawValue.startsWith("ref_") ? rawValue.slice("ref_".length) : rawValue;
  if (/^telegram-\d+$/.test(withoutPrefix)) return withoutPrefix;
  if (/^\d+$/.test(withoutPrefix)) return `telegram-${withoutPrefix}`;
  return "";
}

async function createReferralFromStartParam(
  queryRunner: QueryRunner,
  referredUserId: string,
  referredName: string,
  startParam?: string
) {
  const referrerUserId = normalizeReferralUserId(startParam);

  if (!referrerUserId || referrerUserId === referredUserId) return null;

  const referrerResult = await queryRunner.query("SELECT * FROM users WHERE id = $1", [referrerUserId]);
  const referrerRow = referrerResult.rows[0];
  if (!referrerRow) return null;

  const referrer = toUser(referrerRow);
  const referralId = createId();

  await queryRunner.query(
    `
      INSERT INTO referrals (
        id, referrer_user_id, referrer_name, referred_user_id, referred_name,
        status, reward_amount, welcome_amount, created_at
      )
      VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, NOW())
      ON CONFLICT (referred_user_id) DO NOTHING
    `,
    [referralId, referrer.id, getUserDisplayName(referrer), referredUserId, referredName, REFERRAL_REWARD_AMOUNT, REFERRAL_WELCOME_AMOUNT]
  );

  return referralId;
}

async function maybeAwardReferralForFirstPrediction(queryRunner: QueryRunner, referredUserId: string, referredName: string) {
  const referralResult = await queryRunner.query(
    `
      SELECT *
      FROM referrals
      WHERE referred_user_id = $1 AND status = 'pending'
      FOR UPDATE
    `,
    [referredUserId]
  );

  const referral = referralResult.rows[0];
  if (!referral) return null;

  const referrerUserId = String(referral.referrer_user_id || "");
  if (!referrerUserId || referrerUserId === referredUserId) return null;

  const referrerResult = await queryRunner.query("SELECT * FROM users WHERE id = $1 FOR UPDATE", [referrerUserId]);
  const referredResult = await queryRunner.query("SELECT * FROM users WHERE id = $1 FOR UPDATE", [referredUserId]);
  const referrer = referrerResult.rows[0] ? toUser(referrerResult.rows[0]) : null;
  const referred = referredResult.rows[0] ? toUser(referredResult.rows[0]) : null;
  if (!referrer || !referred) return null;

  const rewardAmount = Number(referral.reward_amount || REFERRAL_REWARD_AMOUNT);
  const welcomeAmount = Number(referral.welcome_amount || REFERRAL_WELCOME_AMOUNT);

  await queryRunner.query("UPDATE users SET balance = balance + $2 WHERE id = $1", [referrer.id, rewardAmount]);
  await queryRunner.query("UPDATE users SET balance = balance + $2 WHERE id = $1", [referred.id, welcomeAmount]);

  await addBalanceTransaction(queryRunner, {
    userId: referrer.id,
    type: "referral_bonus",
    title: "Бонус за друга",
    description: `${getUserDisplayName(referred)} сделал первый прогноз`,
    amount: rewardAmount,
  });

  await addBalanceTransaction(queryRunner, {
    userId: referred.id,
    type: "welcome_bonus",
    title: "Приветственный бонус",
    description: `Бонус за вход по приглашению от ${getUserDisplayName(referrer)}`,
    amount: welcomeAmount,
  });

  await queryRunner.query(
    `
      UPDATE referrals
      SET status = 'qualified',
          referred_name = $2,
          reward_amount = $3,
          welcome_amount = $4,
          qualified_at = NOW(),
          reward_claimed_at = NOW()
      WHERE id = $1
    `,
    [referral.id, referredName || getUserDisplayName(referred), rewardAmount, welcomeAmount]
  );

  return { referrer, referred, rewardAmount, welcomeAmount };
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
  if (TELEGRAM_MINI_APP_URL) {
    try {
      const url = new URL(TELEGRAM_MINI_APP_URL);
      if (marketId) url.searchParams.set("startapp", `market_${marketId}`);
      return url.toString();
    } catch {
      const separator = TELEGRAM_MINI_APP_URL.includes("?") ? "&" : "?";
      return marketId
        ? `${TELEGRAM_MINI_APP_URL}${separator}startapp=market_${encodeURIComponent(marketId)}`
        : TELEGRAM_MINI_APP_URL;
    }
  }

  if (!APP_PUBLIC_URL) return "";

  try {
    const url = new URL(APP_PUBLIC_URL);
    if (marketId) url.searchParams.set("market", marketId);
    return url.toString();
  } catch {
    const separator = APP_PUBLIC_URL.includes("?") ? "&" : "?";
    return marketId ? `${APP_PUBLIC_URL}${separator}market=${encodeURIComponent(marketId)}` : APP_PUBLIC_URL;
  }
}

function getAppStartUrl(startParam?: string) {
  if (TELEGRAM_MINI_APP_URL) {
    try {
      const url = new URL(TELEGRAM_MINI_APP_URL);
      if (startParam) url.searchParams.set("startapp", startParam);
      return url.toString();
    } catch {
      if (!startParam) return TELEGRAM_MINI_APP_URL;
      const separator = TELEGRAM_MINI_APP_URL.includes("?") ? "&" : "?";
      return `${TELEGRAM_MINI_APP_URL}${separator}startapp=${encodeURIComponent(startParam)}`;
    }
  }

  if (!APP_PUBLIC_URL) return "";

  try {
    const url = new URL(APP_PUBLIC_URL);
    if (startParam) url.searchParams.set("startapp", startParam);
    return url.toString();
  } catch {
    if (!startParam) return APP_PUBLIC_URL;
    const separator = APP_PUBLIC_URL.includes("?") ? "&" : "?";
    return `${APP_PUBLIC_URL}${separator}startapp=${encodeURIComponent(startParam)}`;
  }
}

async function callTelegramApi(method: string, payload: Record<string, unknown>) {
  if (!BOT_TOKEN) return { ok: false, reason: "BOT_TOKEN не настроен" } as const;

  try {
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    const body = await response.text();
    const parsed = body ? JSON.parse(body) : {};

    if (!response.ok || !parsed.ok) {
      console.warn(`Telegram ${method} failed:`, response.status, body);
      return { ok: false, reason: `Telegram ${response.status}` } as const;
    }

    return { ok: true, result: parsed.result } as const;
  } catch (error) {
    console.warn(`Telegram ${method} error:`, error);
    return { ok: false, reason: "Ошибка сети Telegram" } as const;
  }
}

function getForecastMarketInlineKeyboard(startParam?: string) {
  const appUrl = getAppStartUrl(startParam);

  if (!appUrl) return undefined;

  return {
    inline_keyboard: [[{ text: "🚀 Открыть Forecast Market", url: appUrl }]],
  };
}

async function sendTelegramWelcomeMessage(chatId: string | number, firstName?: string) {
  const safeName = escapeTelegramHtml(firstName || "друг");
  const caption =
    `👋 <b>Привет, ${safeName}!</b>

` +
    `Это <b>Forecast Market</b> — социальная игра прогнозов.

` +
    `Как это работает:
` +
    `1) выбираешь событие;
` +
    `2) делаешь прогноз <b>Да</b> или <b>Нет</b>;
` +
    `3) получаешь игровые баллы, если прогноз сыграл;
` +
    `4) поднимаешься в рейтинге и турнире недели.

` +
    `Важно: баллы не являются деньгами, не покупаются, не продаются, не передаются и не выводятся. Это фановые прогнозы без реальных ставок.`;

  const replyMarkup = getForecastMarketInlineKeyboard("home");

  if (TELEGRAM_WELCOME_LOGO_URL) {
    const photoResult = await callTelegramApi("sendPhoto", {
      chat_id: chatId,
      photo: TELEGRAM_WELCOME_LOGO_URL,
      caption,
      parse_mode: "HTML",
      reply_markup: replyMarkup,
    });

    if (photoResult.ok) return photoResult;
  }

  return callTelegramApi("sendMessage", {
    chat_id: chatId,
    text: caption,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: replyMarkup,
  });
}

async function processTelegramUpdate(update: any) {
  const message = update?.message || update?.edited_message;
  const text = String(message?.text || "").trim();
  const chatId = message?.chat?.id;

  if (!chatId) return;

  const firstName = message?.from?.first_name || message?.chat?.first_name || "";

  if (text.startsWith("/start")) {
    await sendTelegramWelcomeMessage(chatId, firstName);
    return;
  }

  if (text.startsWith("/help") || text) {
    await callTelegramApi("sendMessage", {
      chat_id: chatId,
      text:
        `Forecast Market — игра прогнозов за внутренние баллы.

` +
        `Нажми кнопку ниже, чтобы открыть приложение и выбрать рынок.`,
      reply_markup: getForecastMarketInlineKeyboard("home"),
    });
  }
}

async function ensureTelegramWebhook() {
  if (!BOT_TOKEN || !BACKEND_PUBLIC_URL) {
    if (BOT_TOKEN && !BACKEND_PUBLIC_URL) {
      console.warn("Telegram webhook не настроен: добавь BACKEND_PUBLIC_URL=https://forecast-market.onrender.com");
    }
    return;
  }

  const webhookUrl = `${BACKEND_PUBLIC_URL.replace(/\/$/, "")}/api/telegram/webhook`;
  const payload: Record<string, unknown> = {
    url: webhookUrl,
    allowed_updates: ["message", "edited_message"],
    drop_pending_updates: false,
  };

  if (TELEGRAM_WEBHOOK_SECRET) {
    payload.secret_token = TELEGRAM_WEBHOOK_SECRET;
  }

  const result = await callTelegramApi("setWebhook", payload);

  if (result.ok) {
    console.log(`Telegram webhook установлен: ${webhookUrl}`);
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
    `SELECT * FROM users WHERE id = ANY($1::text[])`,
    [userIds]
  );

  const usersById = new Map(usersResult.rows.map((row) => [String(row.id), toUser(row)]));
  const resultText = outcome === "yes" ? "Да" : "Нет";

  await Promise.allSettled(
    userIds.map(async (userId) => {
      const payout = payoutsByUser[userId] || 0;
      const user = usersById.get(userId);
      if (user?.telegramNotifySettlement === false) return;

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

async function rememberNotificationEvent(
  queryRunner: QueryRunner,
  eventType: string,
  userId: string,
  marketId?: string | null,
  notificationKey?: string
) {
  const key = notificationKey || marketId || "";
  const result = await queryRunner.query(
    `
      INSERT INTO notification_events (id, event_type, user_id, market_id, notification_key, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (event_type, user_id, notification_key) DO NOTHING
      RETURNING id
    `,
    [createId(), eventType, userId, marketId || null, key]
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
        JOIN users u ON u.id = p.user_id
        WHERE m.status = 'open'
          AND m.closes_at = CURRENT_DATE::TEXT
          AND p.settled_at IS NULL
          AND u.telegram_notify_closing IS NOT FALSE
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


async function sendDailyBonusReadyReminders() {
  if (!BOT_TOKEN || !TELEGRAM_REMINDERS_ENABLED) return;

  try {
    const todayKey = new Date().toISOString().slice(0, 10);
    const result = await pool.query(
      `
        SELECT id, name, balance, last_daily_bonus_at
        FROM users
        WHERE id LIKE 'telegram-%'
          AND telegram_notify_bonus IS NOT FALSE
          AND (
            last_daily_bonus_at IS NULL
            OR last_daily_bonus_at <= NOW() - INTERVAL '24 hours'
          )
        ORDER BY last_daily_bonus_at NULLS FIRST
        LIMIT 100
      `
    );

    for (const row of result.rows) {
      const userId = String(row.id);
      const inserted = await rememberNotificationEvent(pool, "daily_bonus_ready", userId, null, todayKey);
      if (!inserted) continue;

      const html =
        `🎁 <b>Ежедневный бонус готов</b>

` +
        `${escapeTelegramHtml(row.name || "Игрок")}, можно забрать игровые баллы и продолжить серию.

` +
        `Открой Forecast Market и нажми «Забрать бонус».`;

      await sendTelegramMessageToUser(userId, html);
    }
  } catch (error) {
    console.warn("Ошибка отправки ежедневных бонусов:", error);
  }
}

async function sendAdminTaskReminders() {
  if (!BOT_TOKEN || !TELEGRAM_REMINDERS_ENABLED || ADMIN_TELEGRAM_IDS.length === 0) return;

  try {
    const [suggestionsResult, closedMarketsResult] = await Promise.all([
      pool.query("SELECT COUNT(*)::int AS count FROM market_suggestions WHERE status = 'pending'"),
      pool.query("SELECT COUNT(*)::int AS count FROM markets WHERE status = 'closed'"),
    ]);

    const pendingSuggestions = Number(suggestionsResult.rows[0]?.count || 0);
    const closedMarkets = Number(closedMarketsResult.rows[0]?.count || 0);

    if (pendingSuggestions === 0 && closedMarkets === 0) return;

    const todayKey = new Date().toISOString().slice(0, 10);
    const notificationKey = `${todayKey}-${pendingSuggestions}-${closedMarkets}`;

    for (const telegramId of ADMIN_TELEGRAM_IDS) {
      const userId = `telegram-${telegramId}`;
      const adminPreference = await pool.query("SELECT telegram_notify_admin FROM users WHERE id = $1", [userId]);
      if (adminPreference.rows[0]?.telegram_notify_admin === false) continue;

      const inserted = await rememberNotificationEvent(pool, "admin_tasks", userId, null, notificationKey);
      if (!inserted) continue;

      const html =
        `⚙️ <b>Есть задачи админа</b>

` +
        `Заявки на рынки: <b>${pendingSuggestions}</b>
` +
        `Рынки ждут расчёта: <b>${closedMarkets}</b>

` +
        `Открой админку Forecast Market.`;

      await sendTelegramMessageToUser(userId, html);
    }
  } catch (error) {
    console.warn("Ошибка отправки админских уведомлений:", error);
  }
}

async function sendScheduledTelegramNotifications() {
  await sendClosingTodayReminders();
  await sendDailyBonusReadyReminders();
  await sendAdminTaskReminders();
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
      last_daily_bonus_amount INTEGER,
      telegram_notify_settlement BOOLEAN NOT NULL DEFAULT TRUE,
      telegram_notify_bonus BOOLEAN NOT NULL DEFAULT TRUE,
      telegram_notify_closing BOOLEAN NOT NULL DEFAULT TRUE,
      telegram_notify_admin BOOLEAN NOT NULL DEFAULT TRUE,
      active_title_item_id TEXT,
      active_frame_item_id TEXT
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

    CREATE TABLE IF NOT EXISTS referrals (
      id TEXT PRIMARY KEY,
      referrer_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      referrer_name TEXT NOT NULL,
      referred_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      referred_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      reward_amount INTEGER NOT NULL DEFAULT 1000,
      welcome_amount INTEGER NOT NULL DEFAULT 500,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      qualified_at TIMESTAMPTZ,
      reward_claimed_at TIMESTAMPTZ,
      UNIQUE (referred_user_id)
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
      notification_key TEXT NOT NULL DEFAULT '',
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

    CREATE TABLE IF NOT EXISTS daily_mission_claims (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      mission_id TEXT NOT NULL,
      mission_date DATE NOT NULL DEFAULT CURRENT_DATE,
      reward_amount INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, mission_id, mission_date)
    );

    CREATE TABLE IF NOT EXISTS weekly_tournament_awards (
      id TEXT PRIMARY KEY,
      week_key TEXT NOT NULL,
      week_start DATE NOT NULL,
      week_end DATE NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      user_name TEXT NOT NULL,
      place INTEGER,
      score INTEGER NOT NULL DEFAULT 0,
      predictions_count INTEGER NOT NULL DEFAULT 0,
      wins INTEGER NOT NULL DEFAULT 0,
      reward_amount INTEGER NOT NULL,
      award_type TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (week_key, user_id, award_type)
    );

    CREATE TABLE IF NOT EXISTS shop_items (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      price INTEGER NOT NULL,
      emoji TEXT NOT NULL DEFAULT '✨',
      style_key TEXT NOT NULL DEFAULT 'default',
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS user_inventory (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      item_id TEXT NOT NULL REFERENCES shop_items(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, item_id)
    );

    CREATE INDEX IF NOT EXISTS predictions_market_id_idx ON predictions(market_id);
    CREATE INDEX IF NOT EXISTS predictions_user_id_idx ON predictions(user_id);
    CREATE INDEX IF NOT EXISTS comments_market_id_idx ON comments(market_id);
    CREATE INDEX IF NOT EXISTS transactions_user_id_idx ON transactions(user_id);
    CREATE INDEX IF NOT EXISTS transactions_created_at_idx ON transactions(created_at);
    CREATE INDEX IF NOT EXISTS market_suggestions_user_id_idx ON market_suggestions(user_id);
    CREATE INDEX IF NOT EXISTS market_suggestions_status_idx ON market_suggestions(status);
    CREATE INDEX IF NOT EXISTS referrals_referrer_user_id_idx ON referrals(referrer_user_id);
    CREATE INDEX IF NOT EXISTS referrals_referred_user_id_idx ON referrals(referred_user_id);
    CREATE INDEX IF NOT EXISTS referrals_status_idx ON referrals(status);
    CREATE INDEX IF NOT EXISTS favorites_user_id_idx ON favorites(user_id);
    CREATE INDEX IF NOT EXISTS daily_mission_claims_user_id_idx ON daily_mission_claims(user_id);
    CREATE INDEX IF NOT EXISTS daily_mission_claims_date_idx ON daily_mission_claims(mission_date);
    CREATE INDEX IF NOT EXISTS weekly_tournament_awards_week_key_idx ON weekly_tournament_awards(week_key);
    CREATE INDEX IF NOT EXISTS weekly_tournament_awards_user_id_idx ON weekly_tournament_awards(user_id);
    CREATE INDEX IF NOT EXISTS shop_items_type_idx ON shop_items(type);
    CREATE INDEX IF NOT EXISTS user_inventory_user_id_idx ON user_inventory(user_id);
    CREATE INDEX IF NOT EXISTS user_inventory_item_id_idx ON user_inventory(item_id);
    ALTER TABLE notification_events ADD COLUMN IF NOT EXISTS notification_key TEXT NOT NULL DEFAULT '';
    UPDATE notification_events SET notification_key = COALESCE(NULLIF(notification_key, ''), COALESCE(market_id, ''));
    CREATE INDEX IF NOT EXISTS notification_events_user_id_idx ON notification_events(user_id);
    CREATE INDEX IF NOT EXISTS notification_events_market_id_idx ON notification_events(market_id);
    CREATE UNIQUE INDEX IF NOT EXISTS notification_events_event_user_key_idx ON notification_events(event_type, user_id, notification_key);
    CREATE INDEX IF NOT EXISTS auth_sessions_user_id_idx ON auth_sessions(user_id);
    CREATE INDEX IF NOT EXISTS auth_sessions_expires_at_idx ON auth_sessions(expires_at);

    ALTER TABLE users ADD COLUMN IF NOT EXISTS last_daily_bonus_at TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_bonus_streak INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS best_daily_bonus_streak INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS last_daily_bonus_amount INTEGER;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_notify_settlement BOOLEAN NOT NULL DEFAULT TRUE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_notify_bonus BOOLEAN NOT NULL DEFAULT TRUE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_notify_closing BOOLEAN NOT NULL DEFAULT TRUE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_notify_admin BOOLEAN NOT NULL DEFAULT TRUE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS active_title_item_id TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS active_frame_item_id TEXT;
  `);

  const defaultShopItems = [
    ["title-oracle", "title", "Оракул", "Предсказывает рынки на холодную голову.", 1500, "🔮", "oracle", 10],
    ["title-insider", "title", "Инсайдер", "Всегда знает, где движуха.", 1200, "🕵️", "insider", 20],
    ["title-risk-manager", "title", "Риск-менеджер", "Ставит аккуратно и считает вероятности.", 1000, "🛡️", "risk", 30],
    ["title-market-shark", "title", "Акула рынка", "Для тех, кто не боится спорных исходов.", 1800, "🦈", "shark", 40],
    ["title-week-king", "title", "Король недели", "Титул для охотника за турнирами.", 2500, "👑", "king", 50],
    ["frame-gold", "frame", "Золотая рамка", "Тёплая рамка для профиля победителя.", 3000, "🏆", "gold", 110],
    ["frame-neon", "frame", "Неоновая рамка", "Яркая подсветка в стиле игровой арены.", 2500, "💠", "neon", 120],
    ["frame-cyber", "frame", "Кибер рамка", "Холодная технологичная рамка для профиля.", 2200, "🤖", "cyber", 130],
    ["frame-emerald", "frame", "Изумрудная рамка", "Спокойная зелёная рамка для уверенной игры.", 1800, "💚", "emerald", 140],
  ];

  for (const item of defaultShopItems) {
    await pool.query(
      `
        INSERT INTO shop_items (id, type, name, description, price, emoji, style_key, sort_order, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)
        ON CONFLICT (id) DO UPDATE
        SET type = EXCLUDED.type,
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            price = EXCLUDED.price,
            emoji = EXCLUDED.emoji,
            style_key = EXCLUDED.style_key,
            sort_order = EXCLUDED.sort_order,
            is_active = TRUE
      `,
      item
    );
  }
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

  const [usersResult, marketsResult, predictionsResult, commentsResult, transactionsResult, suggestionsResult, referralsResult, dailyMissionClaimsResult, weeklyTournamentAwardsResult, shopItemsResult, userInventoryResult, favoritesResult] =
    await Promise.all([
      pool.query("SELECT * FROM users ORDER BY name ASC"),
      pool.query("SELECT * FROM markets ORDER BY created_at DESC"),
      pool.query("SELECT * FROM predictions ORDER BY id DESC"),
      pool.query("SELECT * FROM comments ORDER BY id DESC"),
      pool.query("SELECT * FROM transactions ORDER BY created_at DESC LIMIT 500"),
      pool.query("SELECT * FROM market_suggestions ORDER BY created_at DESC LIMIT 500"),
      pool.query("SELECT * FROM referrals ORDER BY created_at DESC LIMIT 500"),
      pool.query("SELECT * FROM daily_mission_claims ORDER BY created_at DESC LIMIT 1000"),
      pool.query("SELECT * FROM weekly_tournament_awards ORDER BY created_at DESC LIMIT 500"),
      pool.query("SELECT * FROM shop_items WHERE is_active = TRUE ORDER BY type ASC, sort_order ASC, price ASC"),
      pool.query("SELECT * FROM user_inventory ORDER BY created_at DESC LIMIT 2000"),
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
    referrals: referralsResult.rows.map(toReferral),
    dailyMissionClaims: dailyMissionClaimsResult.rows.map(toDailyMissionClaim),
    weeklyTournamentAwards: weeklyTournamentAwardsResult.rows.map(toWeeklyTournamentAward),
    shopItems: shopItemsResult.rows.map(toShopItem),
    userInventory: userInventoryResult.rows.map(toUserInventoryItem),
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
await ensureDefaultShopItems();
await seedIfEmpty();
void maybeAutoImportPolymarket("startup");
setInterval(() => {
  void maybeAutoImportPolymarket("interval");
}, POLYMARKET_AUTO_IMPORT_INTERVAL_MS);

setTimeout(() => {
  void sendScheduledTelegramNotifications();
}, 15000);

setInterval(() => {
  void sendScheduledTelegramNotifications();
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
    telegramWebhookConfigured: Boolean(BOT_TOKEN && BACKEND_PUBLIC_URL),
    telegramMiniAppConfigured: Boolean(TELEGRAM_MINI_APP_URL),
    secureSessionAuthEnabled: true,
    telegramAuthMaxAgeSeconds: TELEGRAM_AUTH_MAX_AGE_SECONDS,
    appPublicUrlConfigured: Boolean(APP_PUBLIC_URL),
    telegramMiniAppUrlConfigured: Boolean(TELEGRAM_MINI_APP_URL),
    dailyBonusAmount: DAILY_BONUS_AMOUNT,
    dailyBonusStreakAmounts: DAILY_BONUS_STREAK_AMOUNTS,
    referralRewardAmount: REFERRAL_REWARD_AMOUNT,
    referralWelcomeAmount: REFERRAL_WELCOME_AMOUNT,
    referralSystemEnabled: true,
    weeklyTournamentEnabled: true,
    manualPointsEnabled: true,
    strictTelegramUserActions: true,
    publicUserCreationDisabled: true,
    polymarketAutoImportEnabled: POLYMARKET_AUTO_IMPORT_ENABLED,
    polymarketImportLimit: POLYMARKET_AUTO_IMPORT_LIMIT,
    polymarketImportIntervalMinutes: Math.round(POLYMARKET_AUTO_IMPORT_INTERVAL_MS / 60000),
    pendingResolutionMarkets: pendingResult.rows[0].count,
    time: new Date().toISOString(),
  });
});

app.post("/api/telegram/webhook", async (request, response) => {
  if (TELEGRAM_WEBHOOK_SECRET) {
    const receivedSecret = request.header("x-telegram-bot-api-secret-token") || "";
    if (receivedSecret !== TELEGRAM_WEBHOOK_SECRET) {
      response.status(401).json({ ok: false });
      return;
    }
  }

  response.json({ ok: true });

  processTelegramUpdate(request.body).catch((error) => {
    console.warn("Ошибка обработки Telegram webhook:", error);
  });
});

app.get("/api/telegram/webhook-info", async (_request, response) => {
  if (!BOT_TOKEN) {
    response.status(400).json({ ok: false, error: "BOT_TOKEN не настроен" });
    return;
  }

  const result = await callTelegramApi("getWebhookInfo", {});
  response.json(result);
});

app.post("/api/telegram/test-notification", async (request, response) => {
  const session = await getRequestSession(request);

  if (!session) {
    response.status(401).json({
      error: "Требуется безопасная Telegram-сессия. Открой приложение через Telegram Mini App.",
    });
    return;
  }

  const html =
    `🔔 <b>Тестовое уведомление Forecast Market</b>\n\n` +
    `Если ты видишь это сообщение, Telegram-уведомления работают корректно.\n\n` +
    `Теперь бот сможет возвращать тебя в игру: сообщать о результатах прогнозов, бонусах и важных рынках.`;

  const result = await sendTelegramMessageToUser(session.userId, html);

  if (!result.ok) {
    response.status(400).json({ ok: false, error: result.reason });
    return;
  }

  response.json({ ok: true });
});

app.patch("/api/users/:userId/telegram-notifications", async (request, response) => {
  const userId = String(request.params.userId || "").trim();

  if (!userId) {
    response.status(400).json({ error: "Не указан пользователь" });
    return;
  }

  if (!(await assertRequestMatchesUser(request, response, userId))) return;

  const body = request.body || {};
  const settlementEnabled = body.settlementEnabled !== false;
  const bonusEnabled = body.bonusEnabled !== false;
  const closingEnabled = body.closingEnabled !== false;
  const adminEnabled = body.adminEnabled !== false;

  const result = await pool.query(
    `
      UPDATE users
      SET telegram_notify_settlement = $2,
          telegram_notify_bonus = $3,
          telegram_notify_closing = $4,
          telegram_notify_admin = $5
      WHERE id = $1
      RETURNING *
    `,
    [userId, settlementEnabled, bonusEnabled, closingEnabled, adminEnabled]
  );

  const user = result.rows[0];

  if (!user) {
    response.status(404).json({ error: "Пользователь не найден" });
    return;
  }

  response.json({ user: toUser(user) });
});

app.post("/api/users/:userId/shop/:itemId/buy", async (request, response) => {
  const userId = String(request.params.userId || "").trim();
  const itemId = String(request.params.itemId || "").trim();

  if (!userId || !itemId) {
    response.status(400).json({ error: "Не указан пользователь или предмет" });
    return;
  }

  if (!(await assertRequestMatchesUser(request, response, userId))) return;

  try {
    const result = await withTransaction(async (client) => {
      const userResult = await client.query("SELECT * FROM users WHERE id = $1 FOR UPDATE", [userId]);
      const userRow = userResult.rows[0];

      if (!userRow) return { error: "Пользователь не найден" } as const;

      let itemResult = await client.query("SELECT * FROM shop_items WHERE id = $1 AND is_active = TRUE", [itemId]);
      let itemRow = itemResult.rows[0];

      if (!itemRow) {
        await ensureDefaultShopItems(client);
        itemResult = await client.query("SELECT * FROM shop_items WHERE id = $1 AND is_active = TRUE", [itemId]);
        itemRow = itemResult.rows[0];
      }

      if (!itemRow) return { error: "Предмет не найден. Обнови приложение и попробуй снова." } as const;

      const item = toShopItem(itemRow);
      const ownedResult = await client.query("SELECT * FROM user_inventory WHERE user_id = $1 AND item_id = $2", [userId, itemId]);
      let inventoryRow = ownedResult.rows[0];
      let transaction: BalanceTransaction | undefined;

      if (!inventoryRow) {
        const currentBalance = Number(userRow.balance || 0);

        if (currentBalance < item.price) {
          return { error: "Не хватает игровых баллов для покупки" } as const;
        }

        const inventoryResult = await client.query(
          `
            INSERT INTO user_inventory (id, user_id, item_id, created_at)
            VALUES ($1, $2, $3, NOW())
            RETURNING *
          `,
          [createId(), userId, item.id]
        );

        inventoryRow = inventoryResult.rows[0];

        transaction = await addBalanceTransaction(client, {
          userId,
          type: "system",
          title: "Покупка в магазине",
          description: `${item.emoji} ${item.name}`,
          amount: -item.price,
        });
      }

      const updatedUserResult = await client.query(
        `
          UPDATE users
          SET balance = CASE WHEN $4::boolean THEN balance - $3 ELSE balance END,
              active_title_item_id = CASE WHEN $5 = 'title' THEN $2 ELSE active_title_item_id END,
              active_frame_item_id = CASE WHEN $5 = 'frame' THEN $2 ELSE active_frame_item_id END
          WHERE id = $1
          RETURNING *
        `,
        [userId, item.id, item.price, !ownedResult.rows[0], item.type]
      );

      return {
        user: toUser(updatedUserResult.rows[0]),
        inventoryItem: toUserInventoryItem(inventoryRow),
        transaction,
      };
    });

    if (!result || "error" in result) {
      response.status(400).json({ error: result?.error || "Не удалось купить предмет" });
      return;
    }

    response.json(result);
  } catch (error) {
    console.error("shop buy failed", error);
    response.status(500).json({ error: "Не удалось купить предмет" });
  }
});

app.post("/api/users/:userId/profile-style", async (request, response) => {
  const userId = String(request.params.userId || "").trim();

  if (!userId) {
    response.status(400).json({ error: "Не указан пользователь" });
    return;
  }

  if (!(await assertRequestMatchesUser(request, response, userId))) return;

  const titleItemId = request.body?.titleItemId ? String(request.body.titleItemId) : null;
  const frameItemId = request.body?.frameItemId ? String(request.body.frameItemId) : null;

  try {
    const result = await withTransaction(async (client) => {
      const userResult = await client.query("SELECT * FROM users WHERE id = $1 FOR UPDATE", [userId]);
      if (!userResult.rows[0]) return { error: "Пользователь не найден" } as const;

      async function assertOwnedItem(itemId: string | null, expectedType: "title" | "frame") {
        if (!itemId) return true;

        const ownedResult = await client.query(
          `
            SELECT si.*
            FROM user_inventory ui
            JOIN shop_items si ON si.id = ui.item_id
            WHERE ui.user_id = $1 AND ui.item_id = $2 AND si.type = $3 AND si.is_active = TRUE
          `,
          [userId, itemId, expectedType]
        );

        return Boolean(ownedResult.rows[0]);
      }

      if (!(await assertOwnedItem(titleItemId, "title"))) {
        return { error: "Титул не найден в инвентаре" } as const;
      }

      if (!(await assertOwnedItem(frameItemId, "frame"))) {
        return { error: "Рамка не найдена в инвентаре" } as const;
      }

      const updatedUserResult = await client.query(
        `
          UPDATE users
          SET active_title_item_id = $2,
              active_frame_item_id = $3
          WHERE id = $1
          RETURNING *
        `,
        [userId, titleItemId, frameItemId]
      );

      return { user: toUser(updatedUserResult.rows[0]) };
    });

    if (!result || "error" in result) {
      response.status(400).json({ error: result?.error || "Не удалось обновить стиль профиля" });
      return;
    }

    response.json(result);
  } catch (error) {
    console.error("profile style failed", error);
    response.status(500).json({ error: "Не удалось обновить стиль профиля" });
  }
});

app.post("/api/admin/shop/seed", async (request, response) => {
  if (!(await requireAdmin(request, response))) return;

  try {
    await ensureDefaultShopItems();
    const result = await pool.query("SELECT * FROM shop_items WHERE is_active = TRUE ORDER BY type ASC, sort_order ASC, price ASC");
    response.json({ ok: true, shopItems: result.rows.map(toShopItem), count: result.rows.length });
  } catch (error) {
    console.error("shop seed failed", error);
    response.status(500).json({ error: "Не удалось заполнить магазин предметами" });
  }
});

app.get("/api/bootstrap", async (_request, response) => {
  await ensureDefaultShopItems();
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

  await createReferralFromStartParam(pool, user.id, user.name, telegramAuth.startParam);

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


app.post("/api/users/:userId/daily-missions/:missionId/claim", async (request, response) => {
  const userId = String(request.params.userId || "").trim();
  const missionId = String(request.params.missionId || "").trim();

  if (!userId || !missionId) {
    response.status(400).json({ error: "Не указан пользователь или задание" });
    return;
  }

  if (!(await assertRequestMatchesUser(request, response, userId))) return;

  const rewardAmount = DAILY_MISSION_REWARDS[missionId];

  if (!rewardAmount) {
    response.status(400).json({ error: "У этого задания нет отдельной награды или оно неизвестно" });
    return;
  }

  try {
    const result = await withTransaction(async (client) => {
      const userResult = await client.query("SELECT * FROM users WHERE id = $1 FOR UPDATE", [userId]);
      const userRow = userResult.rows[0];

      if (!userRow) {
        return { error: "Пользователь не найден" } as const;
      }

      const completed = await isDailyMissionCompleted(client, userId, missionId);

      if (!completed) {
        return { error: "Задание ещё не выполнено" } as const;
      }

      const claimResult = await client.query(
        `
          INSERT INTO daily_mission_claims (id, user_id, mission_id, mission_date, reward_amount, created_at)
          VALUES ($1, $2, $3, CURRENT_DATE, $4, NOW())
          ON CONFLICT (user_id, mission_id, mission_date) DO NOTHING
          RETURNING *
        `,
        [createId(), userId, missionId, rewardAmount]
      );

      const claimRow = claimResult.rows[0];

      if (!claimRow) {
        return { error: "Награда за это задание сегодня уже получена" } as const;
      }

      const updatedUserResult = await client.query(
        "UPDATE users SET balance = balance + $2 WHERE id = $1 RETURNING *",
        [userId, rewardAmount]
      );

      const missionTitleById: Record<string, string> = {
        "first-prediction": "Сделать 1 прогноз",
        comment: "Оставить комментарий",
        "hot-market": "Прогноз в горячем рынке",
        referral: "Пригласить друга",
      };

      const transaction = await addBalanceTransaction(client, {
        userId,
        type: "system",
        title: "Награда за задание дня",
        description: missionTitleById[missionId] || missionId,
        amount: rewardAmount,
      });

      return {
        user: toUser(updatedUserResult.rows[0]),
        claim: toDailyMissionClaim(claimRow),
        transaction,
        rewardAmount,
      };
    });

    if (!result || "error" in result) {
      response.status(400).json({ error: result?.error || "Не удалось получить награду" });
      return;
    }

    response.json(result);
  } catch (error) {
    console.error("daily mission claim failed", error);
    response.status(500).json({ error: "Не удалось получить награду за задание дня" });
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


app.post("/api/admin/users/:userId/points", async (request, response) => {
  if (!(await requireAdmin(request, response))) return;

  const userId = String(request.params.userId || "").trim();
  const rawAmount = Number(request.body?.amount);
  const amount = Math.floor(rawAmount);
  const description = String(request.body?.description || "Ручная корректировка баланса").trim().slice(0, 300);

  if (!userId) {
    response.status(400).json({ error: "Не указан пользователь" });
    return;
  }

  if (!Number.isFinite(amount) || amount === 0) {
    response.status(400).json({ error: "Введите корректную сумму. Можно положительную или отрицательную." });
    return;
  }

  const integerAmount = Math.trunc(amount);

  try {
    const result = await withTransaction(async (client) => {
      const userResult = await client.query("SELECT * FROM users WHERE id = $1 FOR UPDATE", [userId]);
      const userRow = userResult.rows[0];

      if (!userRow) {
        return { error: "Пользователь не найден" } as const;
      }

      const currentBalance = Number(userRow.balance || 0);
      if (currentBalance + integerAmount < 0) {
        return { error: "Нельзя списать больше баллов, чем есть у пользователя" } as const;
      }

      const updatedUserResult = await client.query(
        "UPDATE users SET balance = balance + $2 WHERE id = $1 RETURNING *",
        [userId, integerAmount]
      );

      const transaction = await addBalanceTransaction(client, {
        userId,
        type: "system",
        title: integerAmount > 0 ? "Ручное начисление баллов" : "Ручное списание баллов",
        description: description || "Ручная корректировка баланса администратором",
        amount: integerAmount,
      });

      return { user: toUser(updatedUserResult.rows[0]), transaction };
    });

    if (!result || "error" in result) {
      response.status(400).json({ error: result?.error || "Не удалось изменить баланс" });
      return;
    }

    response.json(result);
  } catch (error) {
    console.error("manual points failed", error);
    response.status(500).json({ error: "Не удалось изменить баланс пользователя" });
  }
});

app.post("/api/admin/users/points/bulk", async (request, response) => {
  if (!(await requireAdmin(request, response))) return;

  const rawAmount = Number(request.body?.amount);
  const amount = Math.trunc(rawAmount);
  const description = String(request.body?.description || "Массовая тестовая корректировка баланса").trim().slice(0, 300);

  if (!Number.isFinite(amount) || amount === 0) {
    response.status(400).json({ error: "Введите корректную сумму для всех игроков. Например: 1000 или -500." });
    return;
  }

  try {
    const result = await withTransaction(async (client) => {
      const usersResult = await client.query("SELECT * FROM users ORDER BY name ASC FOR UPDATE");
      let affectedUsers = 0;
      let totalAmount = 0;

      for (const row of usersResult.rows) {
        const userId = String(row.id);
        const currentBalance = Number(row.balance || 0);
        const actualAmount = amount < 0 ? -Math.min(currentBalance, Math.abs(amount)) : amount;

        if (actualAmount === 0) continue;

        await client.query("UPDATE users SET balance = balance + $2 WHERE id = $1", [userId, actualAmount]);

        await addBalanceTransaction(client, {
          userId,
          type: "system",
          title: actualAmount > 0 ? "Массовое начисление баллов" : "Массовое списание баллов",
          description: description || "Массовая тестовая корректировка баланса администратором",
          amount: actualAmount,
        });

        affectedUsers += 1;
        totalAmount += actualAmount;
      }

      const updatedUsers = await client.query("SELECT * FROM users ORDER BY name ASC");
      return {
        affectedUsers,
        totalUsers: usersResult.rows.length,
        totalAmount,
        users: updatedUsers.rows.map(toUser),
      };
    });

    response.json(result);
  } catch (error) {
    console.error("bulk points failed", error);
    response.status(500).json({ error: "Не удалось массово изменить балансы игроков" });
  }
});

app.post("/api/admin/tournament/weekly-awards", async (request, response) => {
  if (!(await requireAdmin(request, response))) return;

  const weekStart = getWeekStartDate();
  const weekEnd = getWeekEndDate();
  const weekKey = getDateKey(weekStart);

  try {
    const result = await withTransaction(async (client) => {
      const alreadyAwarded = await client.query(
        "SELECT COUNT(*)::int AS count FROM weekly_tournament_awards WHERE week_key = $1",
        [weekKey]
      );

      if (Number(alreadyAwarded.rows[0]?.count || 0) > 0) {
        return { error: "Награды за эту неделю уже выданы" } as const;
      }

      const standings = await getWeeklyTournamentStandings(client, weekStart, weekEnd);

      if (standings.length === 0) {
        return { error: "За эту неделю пока нет участников турнира" } as const;
      }

      const awardsToCreate: Array<{
        userId: string;
        userName: string;
        place?: number;
        score: number;
        predictionsCount: number;
        wins: number;
        rewardAmount: number;
        awardType: "top" | "participation";
      }> = [];

      standings.slice(0, 3).forEach((row, index) => {
        const rewardAmount = WEEKLY_TOURNAMENT_TOP_REWARDS[index] || 0;
        if (rewardAmount <= 0) return;

        awardsToCreate.push({
          userId: row.userId,
          userName: row.userName,
          place: index + 1,
          score: row.score,
          predictionsCount: row.predictionsCount,
          wins: row.wins,
          rewardAmount,
          awardType: "top",
        });
      });

      standings
        .filter((row) => row.predictionsCount >= WEEKLY_TOURNAMENT_MIN_PREDICTIONS)
        .forEach((row, index) => {
          awardsToCreate.push({
            userId: row.userId,
            userName: row.userName,
            place: index + 1,
            score: row.score,
            predictionsCount: row.predictionsCount,
            wins: row.wins,
            rewardAmount: WEEKLY_TOURNAMENT_PARTICIPATION_REWARD,
            awardType: "participation",
          });
        });

      if (awardsToCreate.length === 0) {
        return { error: "Нет наград для выдачи: нужны участники в топе или 3+ прогноза за неделю" } as const;
      }

      const createdAwards: WeeklyTournamentAward[] = [];
      let totalRewardAmount = 0;

      for (const award of awardsToCreate) {
        const awardResult = await client.query(
          `
            INSERT INTO weekly_tournament_awards (
              id, week_key, week_start, week_end, user_id, user_name,
              place, score, predictions_count, wins, reward_amount, award_type, created_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
            RETURNING *
          `,
          [
            createId(),
            weekKey,
            weekStart.toISOString().slice(0, 10),
            weekEnd.toISOString().slice(0, 10),
            award.userId,
            award.userName,
            award.place || null,
            award.score,
            award.predictionsCount,
            award.wins,
            award.rewardAmount,
            award.awardType,
          ]
        );

        await client.query("UPDATE users SET balance = balance + $2 WHERE id = $1", [award.userId, award.rewardAmount]);

        await addBalanceTransaction(client, {
          userId: award.userId,
          type: "system",
          title: award.awardType === "top" ? "Награда турнира недели" : "Бонус за участие в турнире",
          description: award.awardType === "top"
            ? `Место #${award.place} за неделю ${weekStart.toISOString().slice(0, 10)} — ${weekEnd.toISOString().slice(0, 10)}`
            : `Бонус за ${WEEKLY_TOURNAMENT_MIN_PREDICTIONS}+ прогнозов за неделю`,
          amount: award.rewardAmount,
        });

        createdAwards.push(toWeeklyTournamentAward(awardResult.rows[0]));
        totalRewardAmount += award.rewardAmount;
      }

      return {
        weekKey,
        weekStart: weekStart.toISOString().slice(0, 10),
        weekEnd: weekEnd.toISOString().slice(0, 10),
        awards: createdAwards,
        awardedUsers: new Set(createdAwards.map((award) => award.userId)).size,
        totalRewardAmount,
      };
    });

    if (!result || "error" in result) {
      response.status(400).json({ error: result?.error || "Не удалось выдать награды турнира" });
      return;
    }

    response.json(result);
  } catch (error) {
    console.error("weekly tournament awards failed", error);
    response.status(500).json({ error: "Не удалось выдать награды турнира недели" });
  }
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
  const rawAmount = Number(request.body?.amount);
  const amount = Math.floor(rawAmount);

  if (!userId) {
    response.status(400).json({ error: "Не передан userId" });
    return;
  }

  if (!(await assertRequestMatchesUser(request, response, userId))) return;

  if (!outcome) {
    response.status(400).json({ error: "Некорректный исход" });
    return;
  }

  if (!Number.isFinite(rawAmount) || amount <= 0) {
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

    const previousPredictionCountResult = await client.query("SELECT COUNT(*)::int AS count FROM predictions WHERE user_id = $1", [user.id]);
    const isFirstPrediction = Number(previousPredictionCountResult.rows[0]?.count || 0) === 0;

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

    if (isFirstPrediction) {
      await maybeAwardReferralForFirstPrediction(client, user.id, getUserDisplayName(user));
    }

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
    await client.query("TRUNCATE favorites, comments, predictions, transactions, market_suggestions, referrals, notification_events, auth_sessions, markets, users, app_settings RESTART IDENTITY CASCADE");

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
  void ensureTelegramWebhook();
});
