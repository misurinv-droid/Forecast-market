import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent, TouchEvent } from "react";
import "./App.css";

type Outcome = "yes" | "no";
type MarketStatus = "open" | "closed" | "resolved";
type SuggestionStatus = "pending" | "approved" | "rejected";
type SortMode = "newest" | "probability" | "trades" | "comments";
type DetailsTab = "overview" | "trades" | "participants" | "chat";
type MainView = "markets" | "imported" | "search" | "predictions" | "tournament" | "suggest" | "admin" | "moderation" | "settlement" | "profile" | "publicProfile";
type AppRouteSnapshot = { mainView: MainView; selectedMarketId: string | null; selectedPublicProfileUserId: string | null; scrollY: number };
type SwipeRailMode = "pending" | "horizontal" | "vertical";
type SwipeRailState = { rail: HTMLElement; startX: number; startY: number; scrollLeft: number; mode: SwipeRailMode; moved: boolean; nextLeft: number; rafId: number | null };
type MarketBadge = { label: string; emoji: string; tone: "hot" | "soon" | "new" | "interest" | "poly" | "mine" | "closed" };
type ActivityTone = "bonus" | "prediction" | "win" | "loss" | "market" | "social" | "admin" | "calm";
type ActivityItem = { id: string; emoji: string; title: string; text: string; tone: ActivityTone; actionLabel: string; action: () => void };
type UnlockableCosmeticReward = {
  itemId: string;
  emoji: string;
  title: string;
  description: string;
  requirement: string;
  progress: number;
  current: number;
  target: number;
  unlocked: boolean;
};
type DailyMission = {
  id: string;
  icon: string;
  title: string;
  text: string;
  reward: string;
  rewardAmount: number;
  completed: boolean;
  claimed: boolean;
  actionLabel: string;
  action: () => void;
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

type AdminShopItemForm = {
  id: string;
  type: "title" | "frame";
  name: string;
  description: string;
  price: string;
  emoji: string;
  styleKey: string;
  sortOrder: string;
  isActive: boolean;
};
type MyPredictionTab = "active" | "waiting" | "settled" | "won" | "lost" | "all";
type ProfileTab = "overview" | "style" | "achievements" | "predictions" | "social" | "history";
type AdminPanelTab = "overview" | "users" | "markets" | "create" | "suggestions" | "settlement" | "polymarket" | "points" | "tournament" | "shop" | "security";

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
  telegramNotifyFollowing?: boolean;
  activeTitleItemId?: string;
  activeFrameItemId?: string;
};

type TelegramAuthResponse = {
  user: DemoUser;
  sessionToken: string;
  expiresAt: string;
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
  createdAt?: string;
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

type PredictionConfirmationDraft = {
  marketId: string;
  outcome: Outcome;
  amount: number;
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

type UserFollow = {
  id: string;
  followerUserId: string;
  followerName: string;
  followingUserId: string;
  followingName: string;
  createdAt: string;
};

type FollowingActivity = {
  id: string;
  userId: string;
  userName: string;
  emoji: string;
  title: string;
  text: string;
  createdAt: string;
  marketId?: string;
  marketQuestion?: string;
  type: "prediction" | "comment" | "win" | "cosmetic";
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

type MarketSuggestionForm = {
  question: string;
  category: string;
  description: string;
  source: string;
  closesAt: string;
};

type SuggestionReviewDraft = MarketSuggestionForm & {
  yesProbability: number;
  adminNote: string;
};

type CommentDraft = {
  text: string;
  mediaDataUrl: string;
  mediaName: string;
};

type NewMarketForm = {
  question: string;
  category: string;
  description: string;
  source: string;
  closesAt: string;
  yesProbability: number;
};

type EditMarketForm = {
  question: string;
  category: string;
  description: string;
  source: string;
  closesAt: string;
};

type BootstrapData = {
  users: DemoUser[];
  markets: Market[];
  predictions: Prediction[];
  comments: MarketComment[];
  transactions?: BalanceTransaction[];
  marketSuggestions?: MarketSuggestion[];
  referrals?: Referral[];
  userFollows?: UserFollow[];
  dailyMissionClaims?: DailyMissionClaim[];
  weeklyTournamentAwards?: WeeklyTournamentAward[];
  shopItems?: ShopItem[];
  userInventory?: UserInventoryItem[];
  favoriteMarketIdsByUser: Record<string, string[]>;
  adminUserIds?: string[];
};

type TelegramUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
};

type TelegramWebApp = {
  ready?: () => void;
  expand?: () => void;
  close?: () => void;
  initData?: string;
  initDataUnsafe?: { user?: TelegramUser; start_param?: string };
  platform?: string;
  version?: string;
  colorScheme?: "light" | "dark";
  isExpanded?: boolean;
  isFullscreen?: boolean;
  viewportHeight?: number;
  viewportStableHeight?: number;
  safeAreaInset?: { top?: number; bottom?: number; left?: number; right?: number };
  contentSafeAreaInset?: { top?: number; bottom?: number; left?: number; right?: number };
  requestFullscreen?: () => void;
  exitFullscreen?: () => void;
  disableVerticalSwipes?: () => void;
  enableVerticalSwipes?: () => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  setBottomBarColor?: (color: string) => void;
  isVersionAtLeast?: (version: string) => boolean;
  onEvent?: (eventType: string, eventHandler: (...args: unknown[]) => void) => void;
  offEvent?: (eventType: string, eventHandler: (...args: unknown[]) => void) => void;
  BackButton?: {
    show: () => void;
    hide: () => void;
    onClick: (callback: () => void) => void;
    offClick: (callback: () => void) => void;
  };
  HapticFeedback?: {
    impactOccurred?: (style: "light" | "medium" | "heavy") => void;
    notificationOccurred?: (type: "error" | "success" | "warning") => void;
  };
  openTelegramLink?: (url: string) => void;
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || "https://forecast-market.onrender.com/api";
const START_BALANCE = 10000;
const DAILY_BONUS_AMOUNT = 500;
const DAILY_BONUS_INTERVAL_MS = 24 * 60 * 60 * 1000;
const DAILY_BONUS_STREAK_AMOUNTS = [500, 600, 700, 800, 1000, 1200, 1500];
const DAILY_BONUS_GRACE_MS = 48 * 60 * 60 * 1000;
const ONBOARDING_STORAGE_KEY = "forecast-market-onboarding-seen";
const INTERESTS_STORAGE_KEY = "forecast-market-user-interests";
const TELEGRAM_MINI_APP_URL = String(import.meta.env.VITE_TELEGRAM_MINI_APP_URL || "").trim();
const APP_PUBLIC_URL = String(import.meta.env.VITE_APP_PUBLIC_URL || window.location.origin).trim();
const AUTH_SESSION_STORAGE_KEY = "forecast-market-auth-session";
const ACTIVITY_DISMISSED_STORAGE_KEY = "forecast-market-dismissed-activity-items";

const emptyNewMarketForm: NewMarketForm = {
  question: "",
  category: "Друзья",
  description: "",
  source: "",
  closesAt: "",
  yesProbability: 50,
};

const emptyEditMarketForm: EditMarketForm = {
  question: "",
  category: "",
  description: "",
  source: "",
  closesAt: "",
};

const emptySuggestionForm: MarketSuggestionForm = {
  question: "",
  category: "Друзья",
  description: "",
  source: "",
  closesAt: "",
};

const emptyCommentDraft: CommentDraft = {
  text: "",
  mediaDataUrl: "",
  mediaName: "",
};

const emptyAdminShopItemForm: AdminShopItemForm = {
  id: "",
  type: "title",
  name: "",
  description: "",
  price: "1000",
  emoji: "✨",
  styleKey: "custom",
  sortOrder: "200",
  isActive: true,
};

function getYesProbability(market: Pick<Market, "yesPool" | "noPool">) {
  const total = market.yesPool + market.noPool;
  return total <= 0 ? 50 : Math.round((market.yesPool / total) * 100);
}

function formatDateForDisplay(value: string) {
  if (!value) return "—";
  if (value.includes("-")) {
    const [year, month, day] = value.split("-");
    return `${day}.${month}.${year}`;
  }
  return value;
}

function normalizeDateForInput(value: string) {
  if (!value) return "";
  if (value.includes("-")) return value;
  if (value.includes(".")) {
    const [day, month, year] = value.split(".");
    if (day && month && year) {
      return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }
  }
  return value;
}

function getOutcomeText(outcome?: Outcome) {
  if (outcome === "yes") return "Да";
  if (outcome === "no") return "Нет";
  return "—";
}

function isPolymarketSource(source?: string) {
  return /polymarket/i.test(source || "");
}

function getMarketSourceLabel(source?: string) {
  return isPolymarketSource(source) ? "Polymarket" : source || "—";
}

function getMarketDescription(market?: Pick<Market, "description" | "source"> | null) {
  if (!market) return "";

  if (isPolymarketSource(market.source)) {
    return "Событие импортировано из Polymarket как идея для развлекательного прогноза. В Forecast Market используются только игровые баллы — без денег, пополнений, вывода и реальных ставок.";
  }

  return market.description || "Описание пока не добавлено.";
}

function getMarketStatusText(market: Pick<Market, "status" | "resolvedOutcome">) {
  if (market.status === "resolved") return `Рассчитан: ${getOutcomeText(market.resolvedOutcome)}`;
  if (market.status === "closed") return "Ожидает расчёта";
  return "Открыт";
}

function getMarketStatusClass(market: Pick<Market, "status">) {
  if (market.status === "resolved") return "resolvedBadge";
  if (market.status === "closed") return "pendingBadge";
  return "openBadge";
}

function getMarketStatusWeight(status: MarketStatus) {
  if (status === "closed") return 0;
  if (status === "open") return 1;
  return 2;
}

function isMarketTradable(market: Pick<Market, "status">) {
  return market.status === "open";
}

function getMarketCloseLabel(market: Pick<Market, "status" | "closesAt">) {
  if (market.status === "closed") return `Закрыт ${formatDateForDisplay(market.closesAt)}`;
  if (market.status === "resolved") return `Закрыт ${formatDateForDisplay(market.closesAt)}`;
  return `До ${formatDateForDisplay(market.closesAt)}`;
}

function getNextWeekDateInput() {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return date.toISOString().slice(0, 10);
}

function getSuggestionStatusText(status: SuggestionStatus) {
  if (status === "pending") return "На рассмотрении";
  if (status === "approved") return "Одобрено";
  return "Отклонено";
}

function getInterestCategoryEmoji(category: string, index = 0) {
  const normalized = category.toLowerCase();

  if (normalized.includes("спорт") || normalized.includes("футбол") || normalized.includes("хоккей")) return "⚽";
  if (normalized.includes("крипт") || normalized.includes("bitcoin") || normalized.includes("битко")) return "₿";
  if (normalized.includes("полит")) return "🏛️";
  if (normalized.includes("эконом") || normalized.includes("рын") || normalized.includes("финанс")) return "📈";
  if (normalized.includes("игр") || normalized.includes("game")) return "🎮";
  if (normalized.includes("кино") || normalized.includes("сериал")) return "🎬";
  if (normalized.includes("технолог") || normalized.includes("ai") || normalized.includes("ии")) return "🤖";
  if (normalized.includes("друз")) return "🤝";
  if (normalized.includes("мир") || normalized.includes("polymarket")) return "🌍";

  return ["🔥", "🎯", "⚡", "✨", "🧠", "🚀"][index % 6];
}

function getUserLevel(stats: { predictionsCount: number; wins: number; winRate: number; settledCount: number }, rank: number, user: DemoUser | null) {
  const score =
    stats.predictionsCount * 45 +
    stats.wins * 90 +
    Math.max(0, (user?.balance || 0) - START_BALANCE) / 12 +
    (user?.bestDailyBonusStreak || 0) * 80 +
    (rank > 0 && rank <= 3 ? 450 : 0);

  const levels = [
    { level: 1, emoji: "🚀", title: "Новичок", threshold: 0, next: 250 },
    { level: 2, emoji: "👀", title: "Наблюдатель", threshold: 250, next: 750 },
    { level: 3, emoji: "🎯", title: "Прогнозист", threshold: 750, next: 1600 },
    { level: 4, emoji: "🧠", title: "Аналитик", threshold: 1600, next: 3200 },
    { level: 5, emoji: "🔮", title: "Оракул", threshold: 3200, next: 5600 },
    { level: 6, emoji: "👑", title: "Легенда рынка", threshold: 5600, next: 5600 },
  ];

  const current = [...levels].reverse().find((item) => score >= item.threshold) || levels[0];
  const next = levels.find((item) => item.level === current.level + 1) || null;
  const progress = next
    ? Math.max(6, Math.min(100, Math.round(((score - current.threshold) / (next.threshold - current.threshold)) * 100)))
    : 100;

  const description = next
    ? `До уровня «${next.title}» осталось ${Math.max(0, Math.ceil(next.threshold - score))} XP.`
    : "Максимальный уровень открыт. Теперь ты играешь за статус легенды.";

  return {
    ...current,
    score: Math.round(score),
    progress,
    nextTitle: next?.title || "Максимум",
    description,
  };
}

type Achievement = {
  id: string;
  emoji: string;
  title: string;
  description: string;
  unlocked: boolean;
  progress: number;
};

type WeeklyStanding = {
  user: DemoUser;
  score: number;
  spent: number;
  payouts: number;
  predictionsCount: number;
  wins: number;
};

function makeAchievement(id: string, emoji: string, title: string, description: string, progress: number): Achievement {
  return {
    id,
    emoji,
    title,
    description,
    unlocked: progress >= 100,
    progress: Math.max(0, Math.min(100, Math.round(progress))),
  };
}

function getUserAchievements(params: {
  user: DemoUser | null;
  stats: { predictionsCount: number; wins: number; winRate: number; settledCount: number };
  rank: number;
  suggestionsCount: number;
}) {
  const { user, stats, rank, suggestionsCount } = params;
  const balance = user?.balance || 0;
  const streak = user?.dailyBonusStreak || 0;
  const bestStreak = user?.bestDailyBonusStreak || 0;

  return [
    makeAchievement("first_prediction", "🎯", "Первый прогноз", "Сделай первый прогноз на рынке.", stats.predictionsCount >= 1 ? 100 : 0),
    makeAchievement("five_predictions", "🧠", "Разогрев аналитика", "Сделай 5 прогнозов.", (stats.predictionsCount / 5) * 100),
    makeAchievement("ten_predictions", "📈", "Серийный прогнозист", "Сделай 10 прогнозов.", (stats.predictionsCount / 10) * 100),
    makeAchievement("five_wins", "💎", "Пять попаданий", "Выиграй 5 рассчитанных прогнозов.", (stats.wins / 5) * 100),
    makeAchievement("three_day_streak", "🔥", "3 дня подряд", "Забери ежедневный бонус 3 дня подряд.", (streak / 3) * 100),
    makeAchievement("week_streak", "⚡", "Неделя в игре", "Держи серию бонусов 7 дней подряд.", (bestStreak / 7) * 100),
    makeAchievement("balance_15000", "🚀", "Баланс 15 000+", "Подними баланс выше 15 000 баллов.", (balance / 15000) * 100),
    makeAchievement("top_three", "🏆", "Верхушка рейтинга", "Попади в топ-3 рейтинга.", rank > 0 && rank <= 3 ? 100 : 0),
    makeAchievement("suggest_market", "🗣", "Идея для рынка", "Предложи хотя бы один рынок.", suggestionsCount >= 1 ? 100 : 0),
  ];
}

function getNextDailyBonusAmount(user: DemoUser | null) {
  if (!user) return DAILY_BONUS_AMOUNT;
  const lastClaimedAt = user.lastDailyBonusAt ? new Date(user.lastDailyBonusAt).getTime() : 0;
  const currentStreak = user.dailyBonusStreak || 0;
  const nextStreak = lastClaimedAt && Date.now() - lastClaimedAt <= DAILY_BONUS_GRACE_MS ? currentStreak + 1 : 1;
  const amountIndex = Math.min(DAILY_BONUS_STREAK_AMOUNTS.length - 1, Math.max(0, nextStreak - 1));
  return DAILY_BONUS_STREAK_AMOUNTS[amountIndex] || DAILY_BONUS_AMOUNT;
}

function getDailyStreakLabel(user: DemoUser | null) {
  const streak = user?.dailyBonusStreak || 0;
  if (streak <= 0) return "Серия ещё не началась";
  return `${streak} ${streak === 1 ? "день" : streak >= 2 && streak <= 4 ? "дня" : "дней"} подряд`;
}

function estimatePredictionPayout(market: Market | undefined, prediction: Prediction) {
  if (!market || market.status === "resolved") return prediction.payout || 0;
  const totalPool = market.yesPool + market.noPool;
  const outcomePool = prediction.outcome === "yes" ? market.yesPool : market.noPool;
  if (outcomePool <= 0) return prediction.amount;
  return Math.max(prediction.amount, Math.round((prediction.amount / outcomePool) * totalPool));
}

function estimateQuickPredictionPayout(market: Market | undefined, outcome: Outcome, amount: number) {
  if (!market || amount <= 0) return 0;
  const totalPoolAfter = market.yesPool + market.noPool + amount;
  const outcomePoolBefore = outcome === "yes" ? market.yesPool : market.noPool;
  const outcomePoolAfter = outcomePoolBefore + amount;
  if (outcomePoolAfter <= 0) return amount;
  return Math.max(amount, Math.round((amount / outcomePoolAfter) * totalPoolAfter));
}


function parseAppDate(value: string | undefined) {
  if (!value) return null;

  const direct = new Date(value);
  if (Number.isFinite(direct.getTime())) return direct;

  const match = value.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})(?:,?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!match) return null;

  const [, day, month, year, hour = "0", minute = "0", second = "0"] = match;
  const parsed = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getWeekStart(date = new Date()) {
  const start = new Date(date);
  const day = start.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + diff);
  start.setHours(0, 0, 0, 0);
  return start;
}

function getWeekEnd(date = new Date()) {
  const end = getWeekStart(date);
  end.setDate(end.getDate() + 7);
  end.setMilliseconds(-1);
  return end;
}

function getTournamentScoreTransactionAmount(transaction: BalanceTransaction) {
  // В турнир недели считаем только игровой результат прогнозов: списания за прогнозы и выплаты.
  // Бонусы, рефералка и ручные начисления не влияют на турнир, чтобы рейтинг был честнее.
  if (transaction.type !== "prediction_buy" && transaction.type !== "payout") return 0;
  return Number(transaction.amount || 0);
}

const WEEKLY_TOURNAMENT_TOP_REWARDS = [5000, 3000, 1500];
const WEEKLY_TOURNAMENT_PARTICIPATION_REWARD = 300;
const WEEKLY_TOURNAMENT_MIN_PREDICTIONS = 3;

const DEFAULT_CLIENT_SHOP_ITEMS: ShopItem[] = [
  { id: "title-oracle", type: "title", name: "Оракул", description: "Предсказывает рынки на холодную голову.", price: 1500, emoji: "🔮", styleKey: "oracle", sortOrder: 10, isActive: true },
  { id: "title-insider", type: "title", name: "Инсайдер", description: "Всегда знает, где движуха.", price: 1200, emoji: "🕵️", styleKey: "insider", sortOrder: 20, isActive: true },
  { id: "title-risk-manager", type: "title", name: "Риск-менеджер", description: "Ставит аккуратно и считает вероятности.", price: 1000, emoji: "🛡️", styleKey: "risk", sortOrder: 30, isActive: true },
  { id: "title-market-shark", type: "title", name: "Акула рынка", description: "Для тех, кто не боится спорных исходов.", price: 1800, emoji: "🦈", styleKey: "shark", sortOrder: 40, isActive: true },
  { id: "title-week-king", type: "title", name: "Король недели", description: "Титул для охотника за турнирами.", price: 2500, emoji: "👑", styleKey: "king", sortOrder: 50, isActive: true },
  { id: "frame-gold", type: "frame", name: "Золотая рамка", description: "Тёплая рамка для профиля победителя.", price: 3000, emoji: "🏆", styleKey: "gold", sortOrder: 110, isActive: true },
  { id: "frame-neon", type: "frame", name: "Неоновая рамка", description: "Яркая подсветка в стиле игровой арены.", price: 2500, emoji: "💠", styleKey: "neon", sortOrder: 120, isActive: true },
  { id: "frame-cyber", type: "frame", name: "Кибер рамка", description: "Холодная технологичная рамка для профиля.", price: 2200, emoji: "🤖", styleKey: "cyber", sortOrder: 130, isActive: true },
  { id: "frame-emerald", type: "frame", name: "Изумрудная рамка", description: "Спокойная зелёная рамка для уверенной игры.", price: 1800, emoji: "💚", styleKey: "emerald", sortOrder: 140, isActive: true },
];

function formatShortDate(date: Date) {
  return date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}

function getStakeInputValue(value: string | undefined) {
  return value ?? "500";
}

function sanitizeStakeInput(value: string) {
  const digitsOnly = value.replace(/[^0-9]/g, "");
  if (digitsOnly.length > 9) return digitsOnly.slice(0, 9);
  return digitsOnly;
}

function parseStakeAmount(value: string | undefined) {
  const amount = Number(sanitizeStakeInput(value || ""));
  return Number.isFinite(amount) && amount > 0 ? Math.floor(amount) : 0;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Неизвестная ошибка";
}

function getDailyBonusInfo(user: DemoUser | null) {
  if (!user?.lastDailyBonusAt) {
    return { canClaim: Boolean(user), nextDailyBonusAt: null as Date | null, remainingMs: 0, progress: 100 };
  }

  const lastClaimedAt = new Date(user.lastDailyBonusAt).getTime();

  if (!Number.isFinite(lastClaimedAt)) {
    return { canClaim: Boolean(user), nextDailyBonusAt: null as Date | null, remainingMs: 0, progress: 100 };
  }

  const nextDailyBonusAt = new Date(lastClaimedAt + DAILY_BONUS_INTERVAL_MS);
  const remainingMs = Math.max(0, nextDailyBonusAt.getTime() - Date.now());
  const elapsedMs = Math.max(0, DAILY_BONUS_INTERVAL_MS - remainingMs);

  return {
    canClaim: Boolean(user) && remainingMs <= 0,
    nextDailyBonusAt,
    remainingMs,
    progress: Math.min(100, Math.round((elapsedMs / DAILY_BONUS_INTERVAL_MS) * 100)),
  };
}

function formatBonusCountdown(remainingMs: number) {
  if (remainingMs <= 0) return "можно забрать сейчас";

  const totalMinutes = Math.ceil(remainingMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours <= 0) return `${minutes} мин`;
  if (minutes <= 0) return `${hours} ч`;
  return `${hours} ч ${minutes} мин`;
}

function markOnboardingSeen() {
  try {
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, "1");
  } catch {
    // localStorage может быть недоступен во встроенном WebView — это не критично.
  }
}

async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    },
  });

  const text = await response.text();
  let data: unknown = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      const isHtml = text.trim().startsWith("<");
      const message = isHtml
        ? "Сервер вернул HTML вместо JSON. Скорее всего backend ещё не задеплоен или упал с ошибкой. Проверь Render Logs."
        : `Сервер вернул некорректный ответ: ${text.slice(0, 180)}`;
      throw new Error(message);
    }
  }

  if (!response.ok) {
    const errorMessage = typeof data === "object" && data && "error" in data ? String((data as { error?: unknown }).error) : "Ошибка запроса к серверу";
    throw new Error(errorMessage);
  }

  return data as T;
}

function getRealTelegramWebApp() {
  const telegramWebApp = window.Telegram?.WebApp;
  if (!telegramWebApp) return undefined;

  // Telegram SDK может существовать и в обычном браузере, если скрипт подключен в index.html.
  // Настоящий запуск Mini App отличаем по initData / Telegram user.
  const hasSignedInitData = Boolean(telegramWebApp.initData && telegramWebApp.initData.length > 0);
  const hasTelegramUser = Boolean(telegramWebApp.initDataUnsafe?.user?.id);

  return hasSignedInitData || hasTelegramUser ? telegramWebApp : undefined;
}

function syncTelegramViewportVars(telegramWebApp?: TelegramWebApp) {
  const viewportHeight = telegramWebApp?.viewportStableHeight || telegramWebApp?.viewportHeight || window.innerHeight;
  const safeTop = telegramWebApp?.safeAreaInset?.top || 0;
  const contentSafeTop = telegramWebApp?.contentSafeAreaInset?.top || 0;
  const safeBottom = telegramWebApp?.safeAreaInset?.bottom || 0;
  const contentSafeBottom = telegramWebApp?.contentSafeAreaInset?.bottom || 0;

  document.documentElement.style.setProperty("--app-height", `${Math.round(viewportHeight)}px`);
  document.documentElement.style.setProperty("--tg-safe-top", `${safeTop}px`);
  document.documentElement.style.setProperty("--tg-content-safe-top", `${contentSafeTop}px`);
  document.documentElement.style.setProperty("--tg-safe-bottom", `${safeBottom}px`);
  document.documentElement.style.setProperty("--tg-content-safe-bottom", `${contentSafeBottom}px`);
  document.body.classList.add("is-telegram-webapp");
}

function setupTelegramChrome(telegramWebApp?: TelegramWebApp) {
  if (!telegramWebApp) return;

  syncTelegramViewportVars(telegramWebApp);

  const platform = String(telegramWebApp.platform || "unknown").toLowerCase();
  Array.from(document.body.classList)
    .filter((className) => className.startsWith("tg-platform-"))
    .forEach((className) => document.body.classList.remove(className));
  document.body.classList.add(`tg-platform-${platform.replace(/[^a-z0-9_-]/g, "") || "unknown"}`);

  telegramWebApp.ready?.();
  telegramWebApp.expand?.();

  // В мобильном Telegram вертикальный свайп может сворачивать Mini App вместо прокрутки страницы.
  // Поэтому на iOS/Android запрещаем нативный жест сворачивания, а обычную прокрутку оставляем внутри приложения.
  try {
    if (platform === "ios" || platform === "android") {
      telegramWebApp.disableVerticalSwipes?.();
    } else {
      telegramWebApp.enableVerticalSwipes?.();
    }
  } catch {
    // Игнорируем старые клиенты Telegram, где метода нет.
  }

  telegramWebApp.setHeaderColor?.("#0b1020");
  telegramWebApp.setBackgroundColor?.("#f2f6ff");
  telegramWebApp.setBottomBarColor?.("#f2f6ff");

  // Fullscreen нужен мобильному приложению. На Telegram Desktop / Web он может мешать прокрутке.
  if (platform === "ios" || platform === "android") {
    try {
      telegramWebApp.requestFullscreen?.();
    } catch {
      // На старых клиентах Telegram fullscreen может быть недоступен — тогда останется обычный expand().
    }
  }
}


function extractMarketIdFromStartParam(value?: string | null) {
  const rawValue = String(value || "").trim();
  if (!rawValue) return "";

  if (rawValue.startsWith("market_")) {
    return rawValue.slice("market_".length);
  }

  if (rawValue.startsWith("market-")) {
    return rawValue.slice("market-".length);
  }

  return rawValue;
}

function getLaunchMarketId(telegramWebApp?: TelegramWebApp) {
  const params = new URLSearchParams(window.location.search);
  const directMarketId = params.get("market") || params.get("marketId");

  if (directMarketId) {
    return extractMarketIdFromStartParam(directMarketId);
  }

  const telegramStartParam = telegramWebApp?.initDataUnsafe?.start_param || params.get("startapp") || params.get("tgWebAppStartParam");
  if (String(telegramStartParam || "").startsWith("ref_")) return "";
  return extractMarketIdFromStartParam(telegramStartParam);
}

function removeTelegramPrivateParams(url: URL) {
  // ВАЖНО: никогда не шарим tgWebAppData / initData. Это bearer-данные Telegram-сессии.
  // Если их отправить другу, он может временно открыть приложение как отправитель.
  [
    "tgWebAppData",
    "tgWebAppVersion",
    "tgWebAppPlatform",
    "tgWebAppThemeParams",
    "tgWebAppStartParam",
    "hash",
  ].forEach((key) => url.searchParams.delete(key));

  url.hash = "";
}

function getTelegramMiniAppHomeUrl() {
  if (!TELEGRAM_MINI_APP_URL) return "";

  try {
    const miniAppUrl = new URL(TELEGRAM_MINI_APP_URL);
    removeTelegramPrivateParams(miniAppUrl);
    return miniAppUrl.toString();
  } catch {
    return TELEGRAM_MINI_APP_URL.split("#")[0].split("?tgWebAppData=")[0];
  }
}

function getTelegramBotUrl() {
  if (!TELEGRAM_MINI_APP_URL) return "";

  try {
    const miniAppUrl = new URL(TELEGRAM_MINI_APP_URL);
    removeTelegramPrivateParams(miniAppUrl);
    const botUsername = miniAppUrl.pathname.split("/").filter(Boolean)[0];
    return botUsername ? `${miniAppUrl.origin}/${botUsername}` : "";
  } catch {
    const cleanBase = TELEGRAM_MINI_APP_URL.split("#")[0].split("?tgWebAppData=")[0];
    const match = cleanBase.match(/^(https?:\/\/t\.me\/[^/?#]+)/i);
    return match?.[1] || cleanBase;
  }
}

function openTelegramBot() {
  const url = getTelegramBotUrl() || getTelegramMiniAppHomeUrl();
  if (!url) return;

  const telegramWebApp = window.Telegram?.WebApp;
  if (telegramWebApp?.openTelegramLink) {
    telegramWebApp.openTelegramLink(url);
    return;
  }

  window.location.href = url;
}

function openTelegramMiniApp() {
  const url = getTelegramMiniAppHomeUrl();
  if (!url) return;

  const telegramWebApp = window.Telegram?.WebApp;
  if (telegramWebApp?.openTelegramLink) {
    telegramWebApp.openTelegramLink(url);
    return;
  }

  window.location.href = url;
}

function getMarketShareUrl(marketId: string) {
  if (TELEGRAM_MINI_APP_URL) {
    try {
      const miniAppUrl = new URL(TELEGRAM_MINI_APP_URL);
      removeTelegramPrivateParams(miniAppUrl);
      miniAppUrl.searchParams.set("startapp", `market_${marketId}`);
      return miniAppUrl.toString();
    } catch {
      const cleanBase = TELEGRAM_MINI_APP_URL.split("#")[0].split("?tgWebAppData=")[0];
      const separator = cleanBase.includes("?") ? "&" : "?";
      return `${cleanBase}${separator}startapp=market_${encodeURIComponent(marketId)}`;
    }
  }

  // Fallback для web-версии: строим ссылку с нуля от origin, а не из window.location.href,
  // чтобы не утащить приватный Telegram hash из текущей Mini App-сессии.
  const url = new URL(APP_PUBLIC_URL || window.location.origin);
  removeTelegramPrivateParams(url);
  url.searchParams.set("market", marketId);
  return url.toString();
}

function getReferralShareUrl(userId: string) {
  const startParam = `ref_${userId}`;

  if (TELEGRAM_MINI_APP_URL) {
    try {
      const miniAppUrl = new URL(TELEGRAM_MINI_APP_URL);
      removeTelegramPrivateParams(miniAppUrl);
      miniAppUrl.searchParams.set("startapp", startParam);
      return miniAppUrl.toString();
    } catch {
      const cleanBase = TELEGRAM_MINI_APP_URL.split("#")[0].split("?tgWebAppData=")[0];
      const separator = cleanBase.includes("?") ? "&" : "?";
      return `${cleanBase}${separator}startapp=${encodeURIComponent(startParam)}`;
    }
  }

  const url = new URL(APP_PUBLIC_URL || window.location.origin);
  removeTelegramPrivateParams(url);
  url.searchParams.set("ref", userId);
  return url.toString();
}


function App() {
  const [users, setUsers] = useState<DemoUser[]>([]);
  const [activeUserId, setActiveUserId] = useState("");
  const [newUserName, setNewUserName] = useState("");

  const [markets, setMarkets] = useState<Market[]>([]);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [comments, setComments] = useState<MarketComment[]>([]);
  const [transactions, setTransactions] = useState<BalanceTransaction[]>([]);
  const [marketSuggestions, setMarketSuggestions] = useState<MarketSuggestion[]>([]);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [userFollows, setUserFollows] = useState<UserFollow[]>([]);
  const [dailyMissionClaims, setDailyMissionClaims] = useState<DailyMissionClaim[]>([]);
  const [weeklyTournamentAwards, setWeeklyTournamentAwards] = useState<WeeklyTournamentAward[]>([]);
  const [shopItems, setShopItems] = useState<ShopItem[]>([]);
  const [userInventory, setUserInventory] = useState<UserInventoryItem[]>([]);
  const [favoriteMarketIdsByUser, setFavoriteMarketIdsByUser] = useState<Record<string, string[]>>({});
  const [adminUserIds, setAdminUserIds] = useState<string[]>([]);

  const [commentDrafts, setCommentDrafts] = useState<Record<string, CommentDraft>>({});
  const [amountByMarket, setAmountByMarket] = useState<Record<string, string>>({});
  const [buyingPredictionKey, setBuyingPredictionKey] = useState<string | null>(null);
  const [predictionConfirmation, setPredictionConfirmation] = useState<PredictionConfirmationDraft | null>(null);
  const [toastMessage, setToastMessage] = useState("");
  const [isActivityOpen, setIsActivityOpen] = useState(false);
  const [dismissedActivityIds, setDismissedActivityIds] = useState<string[]>(() => {
    try {
      const rawDismissedItems = window.localStorage.getItem(ACTIVITY_DISMISSED_STORAGE_KEY);
      const parsedDismissedItems = JSON.parse(rawDismissedItems || "[]");
      return Array.isArray(parsedDismissedItems) ? parsedDismissedItems.filter((item) => typeof item === "string") : [];
    } catch {
      return [];
    }
  });

  const [isAdminOpen, setIsAdminOpen] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState("Все");
  const [marketSearch, setMarketSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | MarketStatus>("all");
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [importedCategory, setImportedCategory] = useState("Все");
  const [importedSearch, setImportedSearch] = useState("");
  const [selectedInterestCategories, setSelectedInterestCategories] = useState<string[]>(() => {
    try {
      const rawInterests = window.localStorage.getItem(INTERESTS_STORAGE_KEY);
      const parsedInterests = JSON.parse(rawInterests || "[]");
      return Array.isArray(parsedInterests) ? parsedInterests.filter((item) => typeof item === "string") : [];
    } catch {
      return [];
    }
  });
  const [isPolymarketImporting, setIsPolymarketImporting] = useState(false);
  const [adminAwardForm, setAdminAwardForm] = useState({ userId: "", amount: "1000", description: "Тестовое начисление баллов" });
  const [adminBulkPointsForm, setAdminBulkPointsForm] = useState({ amount: "1000", description: "Массовая тестовая корректировка баланса" });
  const [isApplyingBulkPoints, setIsApplyingBulkPoints] = useState(false);
  const [adminShopForm, setAdminShopForm] = useState<AdminShopItemForm>(emptyAdminShopItemForm);
  const [editingShopItemId, setEditingShopItemId] = useState<string | null>(null);
  const [adminShopGrantForm, setAdminShopGrantForm] = useState({ userId: "", itemId: "" });
  const [savingAdminShopItemId, setSavingAdminShopItemId] = useState<string | null>(null);
  const [grantingShopItemId, setGrantingShopItemId] = useState<string | null>(null);
  const [adminTab, setAdminTab] = useState<AdminPanelTab>("overview");
  const [adminUserSearch, setAdminUserSearch] = useState("");
  const [adminMarketSearch, setAdminMarketSearch] = useState("");
  const [adminMarketStatus, setAdminMarketStatus] = useState<"all" | "open" | "closed" | "resolved" | "polymarket">("all");
  const [mainView, setMainView] = useState<MainView>("markets");
  const [myPredictionTab, setMyPredictionTab] = useState<MyPredictionTab>("active");
  const [profileTab, setProfileTab] = useState<ProfileTab>("overview");

  const [selectedMarketId, setSelectedMarketId] = useState<string | null>(null);
  const [selectedPublicProfileUserId, setSelectedPublicProfileUserId] = useState<string | null>(null);
  const [detailsTab, setDetailsTab] = useState<DetailsTab>("overview");
  const [routeHistory, setRouteHistory] = useState<AppRouteSnapshot[]>([]);
  const lastRouteRef = useRef<AppRouteSnapshot | null>(null);
  const isRestoringRouteRef = useRef(false);
  const swipeRailRef = useRef<SwipeRailState | null>(null);
  const suppressSwipeClickUntilRef = useRef(0);

  const [editingMarketId, setEditingMarketId] = useState<string | null>(null);
  const [editMarket, setEditMarket] = useState<EditMarketForm>(emptyEditMarketForm);
  const [newMarket, setNewMarket] = useState<NewMarketForm>(emptyNewMarketForm);
  const [suggestionForm, setSuggestionForm] = useState<MarketSuggestionForm>(emptySuggestionForm);
  const [suggestionReviewDrafts, setSuggestionReviewDrafts] = useState<Record<string, SuggestionReviewDraft>>({});

  const [isLoading, setIsLoading] = useState(true);
  const [serverError, setServerError] = useState("");
  const [isTelegram, setIsTelegram] = useState(false);
  const [authSessionToken, setAuthSessionToken] = useState(() => {
    try {
      return window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY) || "";
    } catch {
      return "";
    }
  });
  const [isDailyBonusClaiming, setIsDailyBonusClaiming] = useState(false);
  const [claimingDailyMissionId, setClaimingDailyMissionId] = useState<string | null>(null);
  const [isAwardingWeeklyTournament, setIsAwardingWeeklyTournament] = useState(false);
  const [followingUserId, setFollowingUserId] = useState<string | null>(null);
  const [buyingShopItemId, setBuyingShopItemId] = useState<string | null>(null);
  const [equippingShopItemId, setEquippingShopItemId] = useState<string | null>(null);
  const [isTestingTelegramNotification, setIsTestingTelegramNotification] = useState(false);
  const [isSavingTelegramNotificationPrefs, setIsSavingTelegramNotificationPrefs] = useState(false);
  const [isRulesOpen, setIsRulesOpen] = useState(false);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(() => {
    try {
      return window.localStorage.getItem(ONBOARDING_STORAGE_KEY) !== "1";
    } catch {
      return true;
    }
  });

  const showDebugTools = false;

  const activeUser = useMemo(() => {
    return users.find((user) => user.id === activeUserId) || null;
  }, [users, activeUserId]);

  const selectedPublicProfileUser = useMemo(() => {
    return users.find((user) => user.id === selectedPublicProfileUserId) || null;
  }, [users, selectedPublicProfileUserId]);

  const isAdmin = Boolean(isTelegram && authSessionToken && activeUser && adminUserIds.includes(activeUser.id));

  const activeUserInventory = useMemo(() => {
    if (!activeUser) return [];
    return userInventory.filter((item) => item.userId === activeUser.id);
  }, [userInventory, activeUser]);

  const activeUserOwnedItemIds = useMemo(() => {
    return new Set(activeUserInventory.map((item) => item.itemId));
  }, [activeUserInventory]);

  const effectiveShopItems = useMemo(() => {
    return shopItems.length > 0 ? shopItems : DEFAULT_CLIENT_SHOP_ITEMS;
  }, [shopItems]);

  const isUsingFallbackShopItems = shopItems.length === 0;

  const activeTitleItem = useMemo(() => {
    return effectiveShopItems.find((item) => item.id === activeUser?.activeTitleItemId && item.type === "title") || null;
  }, [effectiveShopItems, activeUser]);

  const activeFrameItem = useMemo(() => {
    return effectiveShopItems.find((item) => item.id === activeUser?.activeFrameItemId && item.type === "frame") || null;
  }, [effectiveShopItems, activeUser]);

  const titleShopItems = useMemo(() => {
    return effectiveShopItems.filter((item) => item.type === "title" && item.isActive).sort((a, b) => a.sortOrder - b.sortOrder || a.price - b.price);
  }, [effectiveShopItems]);

  const frameShopItems = useMemo(() => {
    return effectiveShopItems.filter((item) => item.type === "frame" && item.isActive).sort((a, b) => a.sortOrder - b.sortOrder || a.price - b.price);
  }, [effectiveShopItems]);

  const dailyBonusInfo = useMemo(() => getDailyBonusInfo(activeUser), [activeUser]);

  const favoriteMarketIds = useMemo(() => {
    if (!activeUser) return [];
    return favoriteMarketIdsByUser[activeUser.id] || [];
  }, [favoriteMarketIdsByUser, activeUser]);

  const activeUserPredictions = useMemo(() => {
    if (!activeUser) return [];
    return predictions.filter((prediction) => prediction.userId === activeUser.id);
  }, [predictions, activeUser]);

  const activeUserStats = useMemo(() => {
    const settled = activeUserPredictions.filter((item) => item.settledAt);
    const wins = settled.filter((item) => item.outcome === item.resolvedOutcome).length;
    const invested = activeUserPredictions.reduce((sum, item) => sum + item.amount, 0);
    const payouts = activeUserPredictions.reduce((sum, item) => sum + (item.payout || 0), 0);

    return {
      predictionsCount: activeUserPredictions.length,
      settledCount: settled.length,
      wins,
      invested,
      payouts,
      winRate: settled.length ? Math.round((wins / settled.length) * 100) : 0,
    };
  }, [activeUserPredictions]);

  const activeUserOpenPredictions = useMemo(() => {
    return activeUserPredictions.filter((prediction) => !prediction.settledAt);
  }, [activeUserPredictions]);


  const activeUserSettledPredictions = useMemo(() => {
    return activeUserPredictions.filter((prediction) => prediction.settledAt);
  }, [activeUserPredictions]);

  const activeUserTransactions = useMemo(() => {
    if (!activeUser) return [];
    return transactions.filter((transaction) => transaction.userId === activeUser.id);
  }, [transactions, activeUser]);

  const activeUserSuggestions = useMemo(() => {
    if (!activeUser) return [];
    return marketSuggestions.filter((suggestion) => suggestion.userId === activeUser.id);
  }, [marketSuggestions, activeUser]);



  const activeUserReferrals = useMemo(() => {
    if (!activeUser) return [];
    return referrals.filter((referral) => referral.referrerUserId === activeUser.id);
  }, [referrals, activeUser]);

  const activeUserFollowing = useMemo(() => {
    if (!activeUser) return [];
    return userFollows.filter((follow) => follow.followerUserId === activeUser.id);
  }, [userFollows, activeUser]);

  const activeUserFollowers = useMemo(() => {
    if (!activeUser) return [];
    return userFollows.filter((follow) => follow.followingUserId === activeUser.id);
  }, [userFollows, activeUser]);

  const followingActivityItems = useMemo<FollowingActivity[]>(() => {
    if (!activeUser || activeUserFollowing.length === 0) return [];

    const followingIds = new Set(activeUserFollowing.map((follow) => follow.followingUserId));
    const items: FollowingActivity[] = [];

    predictions
      .filter((prediction) => followingIds.has(prediction.userId))
      .forEach((prediction) => {
        items.push({
          id: `prediction-${prediction.id}`,
          userId: prediction.userId,
          userName: prediction.userName,
          emoji: "🎯",
          title: "Сделал прогноз",
          text: `${prediction.userName}: ${getOutcomeText(prediction.outcome)} · ${prediction.amount.toLocaleString("ru-RU")} б. в рынке «${prediction.marketQuestion}»`,
          createdAt: prediction.createdAt,
          marketId: prediction.marketId,
          marketQuestion: prediction.marketQuestion,
          type: "prediction",
        });

        if (prediction.settledAt && prediction.outcome === prediction.resolvedOutcome) {
          items.push({
            id: `win-${prediction.id}`,
            userId: prediction.userId,
            userName: prediction.userName,
            emoji: "🏆",
            title: "Выиграл прогноз",
            text: `${prediction.userName} выиграл ${(prediction.payout || 0).toLocaleString("ru-RU")} б. в рынке «${prediction.marketQuestion}»`,
            createdAt: prediction.settledAt,
            marketId: prediction.marketId,
            marketQuestion: prediction.marketQuestion,
            type: "win",
          });
        }
      });

    comments
      .filter((comment) => followingIds.has(comment.userId))
      .forEach((comment) => {
        const market = markets.find((item) => item.id === comment.marketId);
        items.push({
          id: `comment-${comment.id}`,
          userId: comment.userId,
          userName: comment.userName,
          emoji: "💬",
          title: "Оставил комментарий",
          text: `${comment.userName}: ${comment.text ? comment.text.slice(0, 120) : "добавил вложение"}${market ? ` · «${market.question}»` : ""}`,
          createdAt: comment.createdAt,
          marketId: comment.marketId,
          marketQuestion: market?.question,
          type: "comment",
        });
      });

    transactions
      .filter((transaction) => followingIds.has(transaction.userId) && transaction.title === "Открыт предмет")
      .forEach((transaction) => {
        const user = users.find((item) => item.id === transaction.userId);
        items.push({
          id: `cosmetic-${transaction.id}`,
          userId: transaction.userId,
          userName: user?.name || "Игрок",
          emoji: "🎁",
          title: "Открыл предмет",
          text: `${user?.name || "Игрок"} открыл: ${transaction.description}`,
          createdAt: transaction.createdAt,
          type: "cosmetic",
        });
      });

    return items
      .sort((a, b) => (parseAppDate(b.createdAt)?.getTime() || 0) - (parseAppDate(a.createdAt)?.getTime() || 0))
      .slice(0, 40);
  }, [activeUser, activeUserFollowing, predictions, comments, transactions, markets, users]);

  const activeUserComments = useMemo(() => {
    if (!activeUser) return [];
    return comments.filter((comment) => comment.userId === activeUser.id);
  }, [comments, activeUser]);

  const activeUserReferralStats = useMemo(() => {
    const qualified = activeUserReferrals.filter((referral) => referral.status === "qualified");
    const pending = activeUserReferrals.filter((referral) => referral.status === "pending");
    const earned = qualified.reduce((sum, referral) => sum + referral.rewardAmount, 0);
    return { qualified, pending, earned };
  }, [activeUserReferrals]);
  const pendingSuggestions = useMemo(() => {
    return marketSuggestions.filter((suggestion) => suggestion.status === "pending");
  }, [marketSuggestions]);

  const activeUserRank = useMemo(() => {
    if (!activeUser) return 0;
    const sortedUsers = [...users].sort((a, b) => b.balance - a.balance);
    return sortedUsers.findIndex((user) => user.id === activeUser.id) + 1;
  }, [users, activeUser]);

  const activeUserLevel = useMemo(() => {
    return getUserLevel(activeUserStats, activeUserRank, activeUser);
  }, [activeUserStats, activeUserRank, activeUser]);

  const activeUserAchievements = useMemo(() => {
    return getUserAchievements({
      user: activeUser,
      stats: activeUserStats,
      rank: activeUserRank,
      suggestionsCount: activeUserSuggestions.length,
    });
  }, [activeUser, activeUserStats, activeUserRank, activeUserSuggestions.length]);

  const unlockedAchievementsCount = activeUserAchievements.filter((achievement) => achievement.unlocked).length;
  const activeDailyBonusAmount = getNextDailyBonusAmount(activeUser);

  const myPredictionsByTab = useMemo(() => {
    const isWaitingForSettlement = (prediction: Prediction) => {
      const market = markets.find((item) => item.id === prediction.marketId);
      return !prediction.settledAt && market?.status === "closed";
    };

    if (myPredictionTab === "active") return activeUserOpenPredictions.filter((prediction) => !isWaitingForSettlement(prediction));
    if (myPredictionTab === "waiting") return activeUserOpenPredictions.filter(isWaitingForSettlement);
    if (myPredictionTab === "settled") return activeUserSettledPredictions;
    if (myPredictionTab === "won") return activeUserSettledPredictions.filter((prediction) => prediction.outcome === prediction.resolvedOutcome);
    if (myPredictionTab === "lost") return activeUserSettledPredictions.filter((prediction) => prediction.outcome !== prediction.resolvedOutcome);
    return activeUserPredictions;
  }, [myPredictionTab, activeUserOpenPredictions, activeUserSettledPredictions, activeUserPredictions, markets]);

  const activeFavoriteMarkets = useMemo(() => {
    return markets.filter((market) => favoriteMarketIds.includes(market.id));
  }, [markets, favoriteMarketIds]);

  const leaderboard = useMemo(() => {
    return [...users].sort((a, b) => b.balance - a.balance);
  }, [users]);



  const currentWeekStart = useMemo(() => getWeekStart(), []);
  const currentWeekEnd = useMemo(() => getWeekEnd(), []);

  const weeklyStandings = useMemo<WeeklyStanding[]>(() => {
    const rows = users.map((user) => {
      const userTransactions = transactions.filter((transaction) => {
        if (transaction.userId !== user.id) return false;
        const date = parseAppDate(transaction.createdAt);
        return Boolean(date && date >= currentWeekStart && date <= currentWeekEnd);
      });

      const score = userTransactions.reduce((sum, transaction) => sum + getTournamentScoreTransactionAmount(transaction), 0);
      const spent = Math.abs(userTransactions.filter((transaction) => transaction.type === "prediction_buy").reduce((sum, transaction) => sum + transaction.amount, 0));
      const payouts = userTransactions.filter((transaction) => transaction.type === "payout").reduce((sum, transaction) => sum + Math.max(0, transaction.amount), 0);
      const userPredictionsThisWeek = predictions.filter((prediction) => {
        if (prediction.userId !== user.id) return false;
        const date = parseAppDate(prediction.createdAt);
        return Boolean(date && date >= currentWeekStart && date <= currentWeekEnd);
      });
      const wins = userPredictionsThisWeek.filter((prediction) => prediction.settledAt && prediction.outcome === prediction.resolvedOutcome).length;

      return { user, score, spent, payouts, predictionsCount: userPredictionsThisWeek.length, wins };
    });

    return rows.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.wins !== a.wins) return b.wins - a.wins;
      return b.predictionsCount - a.predictionsCount;
    });
  }, [users, transactions, predictions, currentWeekStart, currentWeekEnd]);

  const activeUserWeeklyRank = useMemo(() => {
    if (!activeUser) return 0;
    const index = weeklyStandings.findIndex((row) => row.user.id === activeUser.id);
    return index >= 0 ? index + 1 : 0;
  }, [weeklyStandings, activeUser]);

  const activeUserWeeklyStanding = useMemo(() => {
    if (!activeUser) return null;
    return weeklyStandings.find((row) => row.user.id === activeUser.id) || null;
  }, [weeklyStandings, activeUser]);

  const unlockableCosmeticRewards = useMemo<UnlockableCosmeticReward[]>(() => {
    const makeProgress = (current: number, target: number) => Math.max(0, Math.min(100, Math.round((current / target) * 100)));
    const bestStreak = Math.max(activeUser?.bestDailyBonusStreak || 0, activeUser?.dailyBonusStreak || 0);
    const weeklyTopProgress = activeUserWeeklyRank === 1 ? 100 : activeUserWeeklyRank > 1 ? Math.max(10, Math.round((1 / activeUserWeeklyRank) * 100)) : 0;

    return [
      {
        itemId: "title-week-king",
        emoji: "👑",
        title: "Король недели",
        description: "Эксклюзивный титул за победу в недельном турнире.",
        requirement: "Займи 1 место недели",
        progress: activeUserOwnedItemIds.has("title-week-king") ? 100 : weeklyTopProgress,
        current: activeUserWeeklyRank === 1 ? 1 : 0,
        target: 1,
        unlocked: activeUserOwnedItemIds.has("title-week-king"),
      },
      {
        itemId: "title-market-rookie",
        emoji: "🎯",
        title: "Новичок рынка",
        description: "Первый рубеж регулярной игры.",
        requirement: "Сделай 10 прогнозов",
        progress: activeUserOwnedItemIds.has("title-market-rookie") ? 100 : makeProgress(activeUserPredictions.length, 10),
        current: activeUserPredictions.length,
        target: 10,
        unlocked: activeUserOwnedItemIds.has("title-market-rookie"),
      },
      {
        itemId: "title-market-shark",
        emoji: "🦈",
        title: "Акула рынка",
        description: "Для игроков, которые часто заходят в рынки.",
        requirement: "Сделай 50 прогнозов",
        progress: activeUserOwnedItemIds.has("title-market-shark") ? 100 : makeProgress(activeUserPredictions.length, 50),
        current: activeUserPredictions.length,
        target: 50,
        unlocked: activeUserOwnedItemIds.has("title-market-shark"),
      },
      {
        itemId: "title-oracle",
        emoji: "🔮",
        title: "Оракул",
        description: "Титул за точность прогнозов.",
        requirement: "Выиграй 10 прогнозов",
        progress: activeUserOwnedItemIds.has("title-oracle") ? 100 : makeProgress(activeUserStats.wins, 10),
        current: activeUserStats.wins,
        target: 10,
        unlocked: activeUserOwnedItemIds.has("title-oracle"),
      },
      {
        itemId: "title-voice-market",
        emoji: "💬",
        title: "Голос рынка",
        description: "Для тех, кто оживляет обсуждения.",
        requirement: "Оставь 10 комментариев",
        progress: activeUserOwnedItemIds.has("title-voice-market") ? 100 : makeProgress(activeUserComments.length, 10),
        current: activeUserComments.length,
        target: 10,
        unlocked: activeUserOwnedItemIds.has("title-voice-market"),
      },
      {
        itemId: "frame-streak-7",
        emoji: "🔥",
        title: "Серия 7 дней",
        description: "Рамка за стабильные ежедневные входы.",
        requirement: "Забери бонус 7 дней подряд",
        progress: activeUserOwnedItemIds.has("frame-streak-7") ? 100 : makeProgress(bestStreak, 7),
        current: bestStreak,
        target: 7,
        unlocked: activeUserOwnedItemIds.has("frame-streak-7"),
      },
    ];
  }, [
    activeUser,
    activeUserOwnedItemIds,
    activeUserWeeklyRank,
    activeUserPredictions.length,
    activeUserStats.wins,
    activeUserComments.length,
  ]);

  const currentWeekKey = useMemo(() => getLocalDateKey(currentWeekStart), [currentWeekStart]);

  const currentWeekAwards = useMemo(() => {
    return weeklyTournamentAwards.filter((award) => award.weekKey === currentWeekKey);
  }, [weeklyTournamentAwards, currentWeekKey]);

  const hasCurrentWeekAwards = currentWeekAwards.length > 0;

  const activeUserWeeklyAwards = useMemo(() => {
    if (!activeUser) return [];
    return currentWeekAwards.filter((award) => award.userId === activeUser.id);
  }, [currentWeekAwards, activeUser]);

  const latestWeeklyAwards = useMemo(() => {
    return [...weeklyTournamentAwards]
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
      .slice(0, 12);
  }, [weeklyTournamentAwards]);

  const categories = useMemo(() => {
    return ["Все", ...Array.from(new Set(markets.map((market) => market.category)))];
  }, [markets]);

  const importedMarkets = useMemo(() => {
    const normalizedSearch = importedSearch.trim().toLowerCase();

    return markets
      .filter((market) => isPolymarketSource(market.source))
      .filter((market) => importedCategory === "Все" || market.category === importedCategory)
      .filter((market) => {
        if (!normalizedSearch) return true;
        return [market.question, market.category, market.description]
          .join(" ")
          .toLowerCase()
          .includes(normalizedSearch);
      })
      .sort((a, b) => {
        if (a.status !== b.status) return getMarketStatusWeight(a.status) - getMarketStatusWeight(b.status);
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      });
  }, [markets, importedCategory, importedSearch]);

  const importedCategories = useMemo(() => {
    const names = markets
      .filter((market) => isPolymarketSource(market.source))
      .map((market) => market.category);
    return ["Все", ...Array.from(new Set(names))];
  }, [markets]);

  const importedOpenCount = useMemo(() => {
    return markets.filter((market) => isPolymarketSource(market.source) && market.status === "open").length;
  }, [markets]);

  const filteredMarkets = useMemo(() => {
    const normalizedSearch = marketSearch.trim().toLowerCase();

    return markets
      .filter((market) => {
        const matchesCategory = selectedCategory === "Все" || market.category === selectedCategory;
        const matchesStatus = statusFilter === "all" || market.status === statusFilter;
        const matchesFavorite = !showFavoritesOnly || favoriteMarketIds.includes(market.id);
        const searchableText = [market.question, market.description, market.category, market.source]
          .join(" ")
          .toLowerCase();
        const matchesSearch = !normalizedSearch || searchableText.includes(normalizedSearch);
        return matchesCategory && matchesStatus && matchesFavorite && matchesSearch;
      })
      .sort((a, b) => {
        if (sortMode === "probability") return getYesProbability(b) - getYesProbability(a);
        if (sortMode === "trades") {
          return (
            predictions.filter((prediction) => prediction.marketId === b.id).length -
            predictions.filter((prediction) => prediction.marketId === a.id).length
          );
        }
        if (sortMode === "comments") {
          return (
            comments.filter((comment) => comment.marketId === b.id).length -
            comments.filter((comment) => comment.marketId === a.id).length
          );
        }
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      });
  }, [markets, selectedCategory, statusFilter, marketSearch, sortMode, predictions, comments, showFavoritesOnly, favoriteMarketIds]);

  const feedMarkets = useMemo(() => {
    return markets
      .filter((market) => selectedCategory === "Все" || market.category === selectedCategory)
      .sort((a, b) => {
        if (a.status !== b.status) return getMarketStatusWeight(a.status) - getMarketStatusWeight(b.status);
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      });
  }, [markets, selectedCategory]);


  const popularMarkets = useMemo(() => {
    return [...markets]
      .filter((market) => market.status === "open")
      .sort((a, b) => {
        const aPredictions = predictions.filter((prediction) => prediction.marketId === a.id).length;
        const bPredictions = predictions.filter((prediction) => prediction.marketId === b.id).length;
        const aComments = comments.filter((comment) => comment.marketId === a.id).length;
        const bComments = comments.filter((comment) => comment.marketId === b.id).length;
        const aFavorite = favoriteMarketIds.includes(a.id) ? 4 : 0;
        const bFavorite = favoriteMarketIds.includes(b.id) ? 4 : 0;
        const aImported = isPolymarketSource(a.source) ? 1 : 2;
        const bImported = isPolymarketSource(b.source) ? 1 : 2;
        const aScore = aPredictions * 3 + aComments + aFavorite + aImported;
        const bScore = bPredictions * 3 + bComments + bFavorite + bImported;
        if (aScore !== bScore) return bScore - aScore;
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      })
      .slice(0, 6);
  }, [markets, predictions, comments, favoriteMarketIds]);

  const recommendedMarkets = useMemo(() => {
    const predictedMarketIds = new Set(activeUserOpenPredictions.map((prediction) => prediction.marketId));
    return [...markets]
      .filter((market) => market.status === "open" && !predictedMarketIds.has(market.id))
      .sort((a, b) => {
        const aPredictions = predictions.filter((prediction) => prediction.marketId === a.id).length;
        const bPredictions = predictions.filter((prediction) => prediction.marketId === b.id).length;
        if (aPredictions !== bPredictions) return bPredictions - aPredictions;
        return Math.abs(50 - getYesProbability(a)) - Math.abs(50 - getYesProbability(b));
      })
      .slice(0, 4);
  }, [markets, predictions, activeUserOpenPredictions]);

  const forYouMarkets = useMemo(() => {
    const predictedMarketIds = new Set(activeUserOpenPredictions.map((prediction) => prediction.marketId));
    const playedCategoryScores = activeUserPredictions.reduce<Record<string, number>>((acc, prediction) => {
      const market = markets.find((item) => item.id === prediction.marketId);
      if (!market) return acc;
      const category = market.category || "Без категории";
      acc[category] = (acc[category] || 0) + 1;
      return acc;
    }, {});

    const availableMarkets = [...markets].filter((market) => market.status === "open" && !predictedMarketIds.has(market.id));
    const interestedMarkets = selectedInterestCategories.length > 0
      ? availableMarkets.filter((market) => selectedInterestCategories.includes(market.category || "Без категории"))
      : [];

    return (interestedMarkets.length > 0 ? interestedMarkets : availableMarkets)
      .sort((a, b) => {
        const aInterestScore = selectedInterestCategories.includes(a.category || "Без категории") ? 100 : 0;
        const bInterestScore = selectedInterestCategories.includes(b.category || "Без категории") ? 100 : 0;
        if (aInterestScore !== bInterestScore) return bInterestScore - aInterestScore;

        const aCategoryScore = playedCategoryScores[a.category || "Без категории"] || 0;
        const bCategoryScore = playedCategoryScores[b.category || "Без категории"] || 0;
        if (aCategoryScore !== bCategoryScore) return bCategoryScore - aCategoryScore;

        const aPredictionCount = predictions.filter((prediction) => prediction.marketId === a.id).length;
        const bPredictionCount = predictions.filter((prediction) => prediction.marketId === b.id).length;
        if (aPredictionCount !== bPredictionCount) return bPredictionCount - aPredictionCount;

        return Math.abs(50 - getYesProbability(a)) - Math.abs(50 - getYesProbability(b));
      })
      .slice(0, 5);
  }, [markets, predictions, activeUserPredictions, activeUserOpenPredictions, selectedInterestCategories]);

  const soonClosingMarkets = useMemo(() => {
    const now = Date.now();
    return [...markets]
      .filter((market) => market.status === "open" && new Date(market.closesAt).getTime() > now)
      .sort((a, b) => new Date(a.closesAt).getTime() - new Date(b.closesAt).getTime())
      .slice(0, 5);
  }, [markets]);

  const newOpenMarkets = useMemo(() => {
    return [...markets]
      .filter((market) => market.status === "open")
      .sort((a, b) => new Date(b.createdAt || b.closesAt || 0).getTime() - new Date(a.createdAt || a.closesAt || 0).getTime())
      .slice(0, 5);
  }, [markets]);

  const polymarketPicks = useMemo(() => {
    return [...markets]
      .filter((market) => market.status === "open" && isPolymarketSource(market.source))
      .sort((a, b) => {
        const aPredictionCount = predictions.filter((prediction) => prediction.marketId === a.id).length;
        const bPredictionCount = predictions.filter((prediction) => prediction.marketId === b.id).length;
        if (aPredictionCount !== bPredictionCount) return bPredictionCount - aPredictionCount;
        return new Date(b.createdAt || b.closesAt || 0).getTime() - new Date(a.createdAt || a.closesAt || 0).getTime();
      })
      .slice(0, 5);
  }, [markets, predictions]);

  const categoryHubs = useMemo(() => {
    return Array.from(new Set(markets.map((market) => market.category || "Без категории")))
      .map((category) => {
        const categoryMarkets = markets
          .filter((market) => (market.category || "Без категории") === category)
          .sort((a, b) => {
            if (a.status !== b.status) return getMarketStatusWeight(a.status) - getMarketStatusWeight(b.status);
            const aPredictions = predictions.filter((prediction) => prediction.marketId === a.id).length;
            const bPredictions = predictions.filter((prediction) => prediction.marketId === b.id).length;
            if (aPredictions !== bPredictions) return bPredictions - aPredictions;
            return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
          });
        return {
          category,
          markets: categoryMarkets,
          openCount: categoryMarkets.filter((market) => market.status === "open").length,
          importedCount: categoryMarkets.filter((market) => isPolymarketSource(market.source)).length,
        };
      })
      .filter((group) => group.markets.length > 0)
      .sort((a, b) => b.openCount - a.openCount || b.markets.length - a.markets.length);
  }, [markets, predictions]);

  const dailyMissions = useMemo<DailyMission[]>(() => {
    const now = new Date();
    const todayKey = getLocalDateKey(now);
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const isToday = (value?: string) => {
      const date = parseAppDate(value);
      return Boolean(date && date >= dayStart && date < dayEnd);
    };

    const isClaimed = (missionId: string) => {
      return dailyMissionClaims.some((claim) => (
        claim.userId === activeUser?.id &&
        claim.missionId === missionId &&
        claim.missionDate === todayKey
      ));
    };

    const todaysUserPredictions = activeUserPredictions.filter((prediction) => isToday(prediction.createdAt));
    const todaysUserComments = activeUser
      ? comments.filter((comment) => comment.userId === activeUser.id && isToday(comment.createdAt))
      : [];
    const hotMarketIds = new Set(popularMarkets.map((market) => market.id));
    const hasHotPredictionToday = todaysUserPredictions.some((prediction) => hotMarketIds.has(prediction.marketId));
    const hasReferralToday = activeUserReferrals.some((referral) => isToday(referral.createdAt) || isToday(referral.qualifiedAt));
    const bonusClaimedToday = Boolean(activeUser?.lastDailyBonusAt && isToday(activeUser.lastDailyBonusAt));

    return [
      {
        id: "daily-bonus",
        icon: bonusClaimedToday ? "✅" : "🎁",
        title: "Забери ежедневный бонус",
        text: bonusClaimedToday ? "Бонус дня уже забран. Завтра серия продолжится." : `Сегодня можно получить до ${activeDailyBonusAmount.toLocaleString("ru-RU")} баллов.`,
        reward: `+${activeDailyBonusAmount.toLocaleString("ru-RU")} б.`,
        rewardAmount: 0,
        completed: bonusClaimedToday,
        claimed: bonusClaimedToday,
        actionLabel: bonusClaimedToday ? "Профиль" : "Забрать",
        action: () => {
          if (dailyBonusInfo.canClaim) void claimDailyBonus();
          else setMainView("profile");
        },
      },
      {
        id: "first-prediction",
        icon: todaysUserPredictions.length > 0 ? "✅" : "🎯",
        title: "Сделай 1 прогноз",
        text: todaysUserPredictions.length > 0 ? `Сегодня уже сделано: ${todaysUserPredictions.length}. Забери награду.` : "Открой рынок из ленты и выбери Да или Нет.",
        reward: "+100 б.",
        rewardAmount: 100,
        completed: todaysUserPredictions.length > 0,
        claimed: isClaimed("first-prediction"),
        actionLabel: todaysUserPredictions.length > 0 ? "Забрать" : "К рынкам",
        action: () => setMainView(todaysUserPredictions.length > 0 ? "predictions" : "markets"),
      },
      {
        id: "comment",
        icon: todaysUserComments.length > 0 ? "✅" : "💬",
        title: "Оставь комментарий",
        text: todaysUserComments.length > 0 ? "Ты уже участвовал в обсуждении сегодня. Награда готова." : "Напиши мнение в чате любого рынка.",
        reward: "+100 б.",
        rewardAmount: 100,
        completed: todaysUserComments.length > 0,
        claimed: isClaimed("comment"),
        actionLabel: todaysUserComments.length > 0 ? "Забрать" : "Найти рынок",
        action: () => setMainView(todaysUserComments.length > 0 ? "profile" : "search"),
      },
      {
        id: "hot-market",
        icon: hasHotPredictionToday ? "✅" : "🔥",
        title: "Прогноз в горячем рынке",
        text: hasHotPredictionToday ? "Горячий рынок сегодня уже сыгран. Забери награду." : "Выбери событие из блока «Горячие рынки».",
        reward: "+150 б.",
        rewardAmount: 150,
        completed: hasHotPredictionToday,
        claimed: isClaimed("hot-market"),
        actionLabel: hasHotPredictionToday ? "Забрать" : "Горячие",
        action: () => setMainView(hasHotPredictionToday ? "predictions" : "markets"),
      },
      {
        id: "referral",
        icon: hasReferralToday ? "✅" : "🤝",
        title: "Пригласи друга",
        text: hasReferralToday ? "Сегодня есть новый приглашённый друг. Награда готова." : "Поделись ссылкой: награда доступна, когда друг зайдёт в приложение.",
        reward: "+1 000 б.",
        rewardAmount: 1000,
        completed: hasReferralToday,
        claimed: isClaimed("referral"),
        actionLabel: hasReferralToday ? "Забрать" : "Поделиться",
        action: () => void shareReferral(),
      },
    ];
  }, [
    activeUser,
    activeUserPredictions,
    activeUserReferrals,
    activeDailyBonusAmount,
    dailyBonusInfo.canClaim,
    comments,
    popularMarkets,
    dailyMissionClaims,
  ]);

  const completedDailyMissionsCount = dailyMissions.filter((mission) => mission.completed).length;
  const claimedDailyMissionsCount = dailyMissions.filter((mission) => mission.claimed).length;

  const openMarketsCount = useMemo(() => markets.filter((market) => market.status === "open").length, [markets]);
  const closedMarketsCount = useMemo(() => markets.filter((market) => market.status === "closed").length, [markets]);

  const activityItems = useMemo<ActivityItem[]>(() => {
    const items: ActivityItem[] = [];

    if (!activeUser) {
      items.push({
        id: "open-telegram",
        emoji: "🔐",
        title: "Открой через Telegram",
        text: "Так прогнозы, бонусы, профиль и комментарии будут работать под твоим Telegram ID.",
        tone: "calm",
        actionLabel: "Открыть",
        action: openTelegramMiniApp,
      });
      return items;
    }

    if (dailyBonusInfo.canClaim) {
      items.push({
        id: `daily-bonus-ready-${activeUser.id}-${new Date().toISOString().slice(0, 10)}`,
        emoji: "🎁",
        title: "Ежедневный бонус готов",
        text: `Можно забрать +${activeDailyBonusAmount.toLocaleString("ru-RU")} игровых баллов прямо сейчас.`,
        tone: "bonus",
        actionLabel: "Забрать",
        action: () => void claimDailyBonus(),
      });
    }

    activeUserTransactions
      .filter((transaction) => transaction.title === "Открыт предмет")
      .slice(0, 2)
      .forEach((transaction) => {
        items.push({
          id: `cosmetic-${transaction.id}`,
          emoji: "🎁",
          title: "Открыт новый предмет",
          text: transaction.description,
          tone: "social",
          actionLabel: "В стиль",
          action: () => {
            setProfileTab("style");
            setMainView("profile");
          },
        });
      });

    activeUserFollowers.slice(0, 2).forEach((follow) => {
      items.push({
        id: `new-follower-${follow.id}`,
        emoji: "🤝",
        title: "Новый подписчик",
        text: `${follow.followerName} подписался на твой профиль.`,
        tone: "social",
        actionLabel: "Открыть",
        action: () => openPublicProfile(follow.followerUserId),
      });
    });

    if (followingActivityItems.length > 0) {
      const latestFollowActivity = followingActivityItems[0];
      items.push({
        id: `following-activity-${latestFollowActivity.id}`,
        emoji: "👥",
        title: "Новая активность подписок",
        text: latestFollowActivity.text,
        tone: "social",
        actionLabel: latestFollowActivity.marketId ? "К рынку" : "К профилю",
        action: () => {
          if (latestFollowActivity.marketId) openMarketDetails(latestFollowActivity.marketId);
          else openPublicProfile(latestFollowActivity.userId);
        },
      });
    }

    const waitingPredictions = activeUserOpenPredictions.filter((prediction) => {
      const market = markets.find((item) => item.id === prediction.marketId);
      return market?.status === "closed";
    });

    if (waitingPredictions.length > 0) {
      items.push({
        id: `waiting-predictions-${waitingPredictions.map((prediction) => prediction.id).join("-")}`,
        emoji: "🧮",
        title: `${waitingPredictions.length} прогнозов ждут расчёта`,
        text: "Рынки уже закрыты. Осталось дождаться расчёта результата.",
        tone: "prediction",
        actionLabel: "Открыть",
        action: () => {
          setMyPredictionTab("waiting");
          setMainView("predictions");
        },
      });
    }

    const recentSettled = [...activeUserSettledPredictions].slice(-3).reverse();
    recentSettled.forEach((prediction) => {
      const isWinner = prediction.outcome === prediction.resolvedOutcome;
      items.push({
        id: `settled-${prediction.id}`,
        emoji: isWinner ? "🏆" : "📉",
        title: isWinner ? "Прогноз сыграл" : "Прогноз не сыграл",
        text: `${prediction.marketQuestion} · ${isWinner ? "+" : ""}${((prediction.payout || 0) - prediction.amount).toLocaleString("ru-RU")} баллов`,
        tone: isWinner ? "win" : "loss",
        actionLabel: "Посмотреть",
        action: () => {
          setSelectedMarketId(prediction.marketId);
          setDetailsTab("overview");
        },
      });
    });

    const predictedMarketIds = new Set(activeUserPredictions.map((prediction) => prediction.marketId));
    soonClosingMarkets
      .filter((market) => !predictedMarketIds.has(market.id))
      .slice(0, 2)
      .forEach((market) => {
        items.push({
          id: `soon-${market.id}`,
          emoji: "⏳",
          title: "Рынок скоро закроется",
          text: `${market.question} · ${getMarketCloseLabel(market)}`,
          tone: "market",
          actionLabel: "Сделать прогноз",
          action: () => {
            setSelectedMarketId(market.id);
            setDetailsTab("overview");
          },
        });
      });

    const interestMarket = forYouMarkets.find((market) => !predictedMarketIds.has(market.id));
    if (interestMarket) {
      items.push({
        id: `interest-${interestMarket.id}`,
        emoji: "💚",
        title: "Есть рынок по твоим интересам",
        text: interestMarket.question,
        tone: "market",
        actionLabel: "Открыть",
        action: () => {
          setSelectedMarketId(interestMarket.id);
          setDetailsTab("overview");
        },
      });
    }

    const pendingSuggestion = activeUserSuggestions.find((suggestion) => suggestion.status === "pending");
    if (pendingSuggestion) {
      items.push({
        id: `suggestion-${pendingSuggestion.id}`,
        emoji: "📝",
        title: "Заявка на рынок в модерации",
        text: pendingSuggestion.question,
        tone: "social",
        actionLabel: "Профиль",
        action: () => {
          setProfileTab("social");
          setMainView("profile");
        },
      });
    }

    if (activeUserOpenPredictions.length === 0) {
      items.push({
        id: "first-active-prediction",
        emoji: "🎯",
        title: "Нет активных прогнозов",
        text: "Выбери рынок из главной ленты и вернись в игровой цикл.",
        tone: "prediction",
        actionLabel: "К рынкам",
        action: () => setMainView("markets"),
      });
    }

    if (isAdmin && (pendingSuggestions.length > 0 || closedMarketsCount > 0)) {
      items.unshift({
        id: `admin-tasks-${pendingSuggestions.length}-${closedMarketsCount}`,
        emoji: "⚙️",
        title: "Есть задачи админа",
        text: `${pendingSuggestions.length} заявок · ${closedMarketsCount} рынков ждут расчёта.`,
        tone: "admin",
        actionLabel: "Админка",
        action: () => setMainView(closedMarketsCount > 0 ? "settlement" : "moderation"),
      });
    }

    if (items.length === 0) {
      items.push({
        id: "all-calm",
        emoji: "✅",
        title: "Всё спокойно",
        text: "Новых действий нет. Можно открыть главную и выбрать новый рынок.",
        tone: "calm",
        actionLabel: "Главная",
        action: () => setMainView("markets"),
      });
    }

    return items.slice(0, 8);
  }, [
    activeUser,
    dailyBonusInfo.canClaim,
    activeDailyBonusAmount,
    activeUserOpenPredictions,
    activeUserSettledPredictions,
    activeUserPredictions,
    activeUserSuggestions,
    activeUserTransactions,
    activeUserFollowers,
    followingActivityItems,
    markets,
    soonClosingMarkets,
    forYouMarkets,
    isAdmin,
    pendingSuggestions.length,
    closedMarketsCount,
  ]);

  const visibleActivityItems = useMemo(() => {
    return activityItems.filter((item) => item.tone === "calm" || !dismissedActivityIds.includes(item.id));
  }, [activityItems, dismissedActivityIds]);

  const activityDisplayItems = useMemo<ActivityItem[]>(() => {
    if (visibleActivityItems.length > 0) return visibleActivityItems;

    return [{
      id: "activity-cleared",
      emoji: "✅",
      title: "Все события очищены",
      text: "Счётчик сброшен. Новые события снова появятся здесь, когда что-то изменится.",
      tone: "calm",
      actionLabel: "На главную",
      action: () => setMainView("markets"),
    }];
  }, [visibleActivityItems]);

  const activityBadgeCount = Math.min(visibleActivityItems.filter((item) => item.tone !== "calm").length, 9);

  const settlementQueueMarkets = useMemo(() => {
    return markets
      .filter((market) => market.status === "closed")
      .sort((a, b) => {
        const predictionsDiff = predictions.filter((prediction) => prediction.marketId === b.id).length - predictions.filter((prediction) => prediction.marketId === a.id).length;
        if (predictionsDiff !== 0) return predictionsDiff;
        return new Date(a.closesAt || 0).getTime() - new Date(b.closesAt || 0).getTime();
      });
  }, [markets, predictions]);

  const upcomingSettlementMarkets = useMemo(() => {
    return markets
      .filter((market) => market.status === "open")
      .sort((a, b) => new Date(a.closesAt || 0).getTime() - new Date(b.closesAt || 0).getTime())
      .slice(0, 8);
  }, [markets]);

  const selectedMarket = useMemo(() => {
    return markets.find((market) => market.id === selectedMarketId) || null;
  }, [markets, selectedMarketId]);

  const selectedMarketPredictions = useMemo(() => {
    if (!selectedMarket) return [];
    return predictions.filter((prediction) => prediction.marketId === selectedMarket.id);
  }, [predictions, selectedMarket]);

  const selectedMarketComments = useMemo(() => {
    if (!selectedMarket) return [];
    return comments.filter((comment) => comment.marketId === selectedMarket.id);
  }, [comments, selectedMarket]);

  const selectedMarketUserPrediction = useMemo(() => {
    if (!selectedMarket || !activeUser) return null;
    return activeUserPredictions.find((prediction) => prediction.marketId === selectedMarket.id) || null;
  }, [selectedMarket, activeUser, activeUserPredictions]);

  const selectedMarketParticipants = useMemo(() => {
    const grouped: Record<
      string,
      { userId: string; userName: string; predictionsCount: number; totalAmount: number; yesAmount: number; noAmount: number }
    > = {};

    selectedMarketPredictions.forEach((prediction) => {
      if (!grouped[prediction.userId]) {
        grouped[prediction.userId] = {
          userId: prediction.userId,
          userName: prediction.userName,
          predictionsCount: 0,
          totalAmount: 0,
          yesAmount: 0,
          noAmount: 0,
        };
      }

      grouped[prediction.userId].predictionsCount += 1;
      grouped[prediction.userId].totalAmount += prediction.amount;
      if (prediction.outcome === "yes") grouped[prediction.userId].yesAmount += prediction.amount;
      else grouped[prediction.userId].noAmount += prediction.amount;
    });

    return Object.values(grouped).sort((a, b) => b.totalAmount - a.totalAmount);
  }, [selectedMarketPredictions]);

  const selectedCommentDraft = selectedMarket ? commentDrafts[selectedMarket.id] || emptyCommentDraft : emptyCommentDraft;

  async function refreshData(preferredActiveUserId?: string | null) {
    const data = await apiRequest<BootstrapData>("/bootstrap");
    setUsers(data.users || []);
    setMarkets(data.markets || []);
    setPredictions(data.predictions || []);
    setComments(data.comments || []);
    setTransactions(data.transactions || []);
    setMarketSuggestions(data.marketSuggestions || []);
    setReferrals(data.referrals || []);
    setUserFollows(data.userFollows || []);
    setDailyMissionClaims(data.dailyMissionClaims || []);
    setWeeklyTournamentAwards(data.weeklyTournamentAwards || []);
    setShopItems(data.shopItems || []);
    setUserInventory(data.userInventory || []);
    setFavoriteMarketIdsByUser(data.favoriteMarketIdsByUser || {});
    setAdminUserIds(data.adminUserIds || []);

    const nextActiveUserId = preferredActiveUserId || activeUserId;
    const hasActiveUser = data.users.some((user) => user.id === nextActiveUserId);
    setActiveUserId(nextActiveUserId && hasActiveUser ? nextActiveUserId : "");
  }

  async function refreshShopItems() {
    try {
      const data = await apiRequest<{ shopItems: ShopItem[]; count: number }>("/shop");
      if (data.shopItems?.length) {
        setShopItems(data.shopItems);
        showToast(`Магазин обновлён: ${data.count} предметов`);
      } else {
        showToast("Магазин пока пуст на backend");
      }
    } catch (error) {
      alert(getErrorMessage(error));
    }
  }

  const hasSafeSession = Boolean(isTelegram && activeUser && authSessionToken);

  function authHeaders() {
    return authSessionToken ? { Authorization: `Bearer ${authSessionToken}` } : {};
  }

  function adminHeaders() {
    // Название оставлено для совместимости с существующими вызовами,
    // но теперь клиент больше не передаёт x-user-id и не просит backend верить фронтенду.
    // Все права backend определяет только по Bearer sessionToken.
    return authHeaders();
  }

  function requireSafeSession() {
    if (!hasSafeSession) {
      alert("Чтобы выполнить действие, открой приложение через Telegram Mini App. Так мы безопасно определим твой Telegram ID.");
      return false;
    }
    return true;
  }

  function requireClientAdmin() {
    if (!hasSafeSession) {
      alert("Требуется безопасная Telegram-сессия. Открой приложение через Telegram Mini App.");
      return false;
    }

    if (!isAdmin) {
      alert("Это действие доступно только администратору.");
      return false;
    }
    return true;
  }

  function getUserActiveTitle(user: DemoUser | null | undefined) {
    if (!user?.activeTitleItemId) return null;
    return effectiveShopItems.find((item) => item.id === user.activeTitleItemId && item.type === "title") || null;
  }

  function getUserFrameClass(user: DemoUser | null | undefined) {
    const frame = user?.activeFrameItemId
      ? effectiveShopItems.find((item) => item.id === user.activeFrameItemId && item.type === "frame")
      : null;
    return frame ? `profileFrame-${frame.styleKey}` : "";
  }

  function sendHaptic(type: "light" | "medium" | "heavy" = "light") {
    getRealTelegramWebApp()?.HapticFeedback?.impactOccurred?.(type);
  }

  function sendSuccess() {
    getRealTelegramWebApp()?.HapticFeedback?.notificationOccurred?.("success");
  }

  function sendError() {
    getRealTelegramWebApp()?.HapticFeedback?.notificationOccurred?.("error");
  }

  function showToast(message: string) {
    setToastMessage(message);
    window.setTimeout(() => {
      setToastMessage((currentMessage) => currentMessage === message ? "" : currentMessage);
    }, 2400);
  }

  function getAppScrollTop() {
    const mainScroll = document.querySelector("main.app")?.scrollTop || 0;
    return Math.max(
      window.scrollY || 0,
      document.documentElement.scrollTop || 0,
      document.body.scrollTop || 0,
      mainScroll,
    );
  }

  function restoreAppScrollPosition(scrollY: number, behavior: ScrollBehavior = "auto") {
    const top = Math.max(0, Math.round(scrollY || 0));

    window.requestAnimationFrame(() => {
      window.scrollTo({ top, behavior });
      document.documentElement.scrollTo?.({ top, behavior });
      document.body.scrollTo?.({ top, behavior });
      document.querySelector("main.app")?.scrollTo?.({ top, behavior });
    });
  }

  function scrollAppToTop(behavior: ScrollBehavior = "smooth") {
    restoreAppScrollPosition(0, behavior);
  }

  function navigateBottomTab(view: MainView) {
    const isSameView = mainView === view && !selectedMarket;

    setSelectedMarketId(null);
    setSelectedPublicProfileUserId(null);
    setMainView(view);
    sendHaptic(isSameView ? "medium" : "light");

    if (isSameView) {
      scrollAppToTop("smooth");
    } else {
      window.setTimeout(() => scrollAppToTop("auto"), 0);
    }
  }

  function closeActiveOverlay() {
    if (predictionConfirmation) {
      setPredictionConfirmation(null);
      sendHaptic("light");
      return true;
    }

    if (isActivityOpen) {
      setIsActivityOpen(false);
      sendHaptic("light");
      return true;
    }

    if (isRulesOpen) {
      setIsRulesOpen(false);
      sendHaptic("light");
      return true;
    }

    return false;
  }

  function goBackRoute() {
    if (closeActiveOverlay()) return;

    const previousRoute = routeHistory[routeHistory.length - 1];

    sendHaptic("light");

    if (previousRoute) {
      isRestoringRouteRef.current = true;
      setRouteHistory((currentHistory) => currentHistory.slice(0, -1));
      setSelectedMarketId(previousRoute.selectedMarketId);
      setSelectedPublicProfileUserId(previousRoute.selectedPublicProfileUserId || null);
      setMainView(previousRoute.mainView);
      window.setTimeout(() => restoreAppScrollPosition(previousRoute.scrollY, "auto"), 0);
      return;
    }

    if (selectedMarketId) {
      setSelectedMarketId(null);
      return;
    }

    if (selectedPublicProfileUserId) {
      setSelectedPublicProfileUserId(null);
      setMainView("markets");
      return;
    }

    if (mainView !== "markets") {
      setMainView("markets");
    }
  }

  function settleSwipeRail(rail: HTMLElement) {
    const items = Array.from(rail.children).filter((item): item is HTMLElement => item instanceof HTMLElement);
    if (items.length === 0) return;

    const railRect = rail.getBoundingClientRect();
    const currentLeft = rail.scrollLeft;
    let closestLeft = currentLeft;
    let closestDistance = Number.POSITIVE_INFINITY;

    items.forEach((item) => {
      const itemRect = item.getBoundingClientRect();
      const targetLeft = currentLeft + itemRect.left - railRect.left - 2;
      const distance = Math.abs(targetLeft - currentLeft);

      if (distance < closestDistance) {
        closestDistance = distance;
        closestLeft = targetLeft;
      }
    });

    rail.scrollTo({ left: Math.max(0, closestLeft), behavior: "smooth" });
  }

  function handleSwipeRailTouchStart(event: TouchEvent<HTMLElement>) {
    const touch = event.touches[0];
    if (!touch) return;

    if (swipeRailRef.current?.rafId) {
      window.cancelAnimationFrame(swipeRailRef.current.rafId);
    }

    event.currentTarget.classList.add("isSwipeDragging");

    swipeRailRef.current = {
      rail: event.currentTarget,
      startX: touch.clientX,
      startY: touch.clientY,
      scrollLeft: event.currentTarget.scrollLeft,
      mode: "pending",
      moved: false,
      nextLeft: event.currentTarget.scrollLeft,
      rafId: null,
    };
  }

  function handleSwipeRailTouchMove(event: TouchEvent<HTMLElement>) {
    const state = swipeRailRef.current;
    const touch = event.touches[0];

    if (!state || !touch) return;

    const deltaX = touch.clientX - state.startX;
    const deltaY = touch.clientY - state.startY;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    if (state.mode === "pending" && Math.max(absX, absY) > 7) {
      state.mode = absX > absY * 1.08 ? "horizontal" : "vertical";
    }

    if (state.mode !== "horizontal") return;

    state.moved = true;
    state.nextLeft = state.scrollLeft - deltaX;

    if (!state.rafId) {
      state.rafId = window.requestAnimationFrame(() => {
        const currentState = swipeRailRef.current;
        if (!currentState) return;

        currentState.rail.scrollLeft = currentState.nextLeft;
        currentState.rafId = null;
      });
    }

    event.preventDefault();
    event.stopPropagation();
  }

  function handleSwipeRailTouchEnd() {
    const state = swipeRailRef.current;

    if (!state) return;

    if (state.rafId) {
      window.cancelAnimationFrame(state.rafId);
      state.rail.scrollLeft = state.nextLeft;
    }

    state.rail.classList.remove("isSwipeDragging");

    if (state.moved && state.mode === "horizontal") {
      suppressSwipeClickUntilRef.current = Date.now() + 260;
      window.setTimeout(() => settleSwipeRail(state.rail), 24);
    }

    swipeRailRef.current = null;
  }

  function handleSwipeRailClickCapture(event: MouseEvent<HTMLElement>) {
    if (Date.now() <= suppressSwipeClickUntilRef.current) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  function closeOnboarding() {
    markOnboardingSeen();
    setIsOnboardingOpen(false);
  }

  async function claimDailyBonus() {
    if (!requireSafeSession() || !activeUser) return;

    const bonusInfo = getDailyBonusInfo(activeUser);

    if (!bonusInfo.canClaim) {
      alert(`Следующий бонус будет доступен через ${formatBonusCountdown(bonusInfo.remainingMs)}.`);
      return;
    }

    try {
      setIsDailyBonusClaiming(true);
      await apiRequest<{ user: DemoUser; transaction: BalanceTransaction; nextDailyBonusAt: string }>(`/users/${activeUser.id}/daily-bonus`, {
        method: "POST",
        headers: adminHeaders(),
      });
      await refreshData(activeUser.id);
      sendSuccess();
    } catch (error) {
      sendError();
      alert(getErrorMessage(error));
    } finally {
      setIsDailyBonusClaiming(false);
    }
  }

  async function claimDailyMissionReward(missionId: string) {
    if (!requireSafeSession() || !activeUser) return;

    try {
      setClaimingDailyMissionId(missionId);
      const result = await apiRequest<{ user: DemoUser; claim: DailyMissionClaim; transaction: BalanceTransaction; rewardAmount: number }>(
        `/users/${activeUser.id}/daily-missions/${missionId}/claim`,
        {
          method: "POST",
          headers: authHeaders(),
        },
      );

      setUsers((currentUsers) => currentUsers.map((user) => user.id === result.user.id ? result.user : user));
      setDailyMissionClaims((currentClaims) => (
        currentClaims.some((claim) => claim.id === result.claim.id) ? currentClaims : [result.claim, ...currentClaims]
      ));
      setTransactions((currentTransactions) => [result.transaction, ...currentTransactions].slice(0, 500));
      sendSuccess();
      showToast(`Награда получена: +${result.rewardAmount.toLocaleString("ru-RU")} баллов`);
    } catch (error) {
      sendError();
      alert(getErrorMessage(error));
    } finally {
      setClaimingDailyMissionId(null);
    }
  }

  async function buyShopItem(item: ShopItem) {
    if (!requireSafeSession() || !activeUser) return;

    if (activeUserOwnedItemIds.has(item.id)) {
      void equipShopItem(item);
      return;
    }

    if (activeUser.balance < item.price) {
      alert(`Не хватает баллов. Нужно ${item.price.toLocaleString("ru-RU")} б., у тебя ${activeUser.balance.toLocaleString("ru-RU")} б.`);
      return;
    }

    try {
      setBuyingShopItemId(item.id);
      const result = await apiRequest<{ user: DemoUser; inventoryItem: UserInventoryItem; transaction?: BalanceTransaction }>(
        `/users/${activeUser.id}/shop/${item.id}/buy`,
        {
          method: "POST",
          headers: authHeaders(),
        },
      );

      setUsers((currentUsers) => currentUsers.map((user) => user.id === result.user.id ? result.user : user));
      setUserInventory((currentInventory) => (
        currentInventory.some((entry) => entry.itemId === result.inventoryItem.itemId && entry.userId === result.inventoryItem.userId)
          ? currentInventory
          : [result.inventoryItem, ...currentInventory]
      ));
      setTransactions((currentTransactions) => result.transaction ? [result.transaction, ...currentTransactions].slice(0, 500) : currentTransactions);
      sendSuccess();
      showToast(`Куплено и выбрано: ${item.name}`);
    } catch (error) {
      sendError();
      alert(getErrorMessage(error));
    } finally {
      setBuyingShopItemId(null);
    }
  }

  async function equipShopItem(item: ShopItem | null, typeOverride?: "title" | "frame") {
    if (!requireSafeSession() || !activeUser) return;

    const itemType = item?.type || typeOverride;
    if (!itemType) return;

    if (item && !activeUserOwnedItemIds.has(item.id)) {
      alert("Сначала купи этот предмет.");
      return;
    }

    try {
      setEquippingShopItemId(item?.id || `empty-${itemType}`);
      const result = await apiRequest<{ user: DemoUser }>(`/users/${activeUser.id}/profile-style`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          titleItemId: itemType === "title" ? item?.id || null : activeUser.activeTitleItemId || null,
          frameItemId: itemType === "frame" ? item?.id || null : activeUser.activeFrameItemId || null,
        }),
      });

      setUsers((currentUsers) => currentUsers.map((user) => user.id === result.user.id ? result.user : user));
      sendSuccess();
      showToast(item ? `Активировано: ${item.name}` : "Стиль сброшен");
    } catch (error) {
      sendError();
      alert(getErrorMessage(error));
    } finally {
      setEquippingShopItemId(null);
    }
  }

  async function followUser(targetUserId: string) {
    if (!requireSafeSession() || !activeUser) return;

    if (targetUserId === activeUser.id) {
      alert("На себя подписаться нельзя.");
      return;
    }

    try {
      setFollowingUserId(targetUserId);
      const result = await apiRequest<{ follow: UserFollow; alreadyFollowing?: boolean }>(
        `/users/${activeUser.id}/follow/${targetUserId}`,
        {
          method: "POST",
          headers: authHeaders(),
        },
      );

      setUserFollows((currentFollows) => (
        currentFollows.some((follow) => follow.id === result.follow.id) ? currentFollows : [result.follow, ...currentFollows]
      ));
      sendSuccess();
      showToast(result.alreadyFollowing ? "Ты уже подписан" : "Подписка оформлена");
    } catch (error) {
      sendError();
      alert(getErrorMessage(error));
    } finally {
      setFollowingUserId(null);
    }
  }

  async function unfollowUser(targetUserId: string) {
    if (!requireSafeSession() || !activeUser) return;

    try {
      setFollowingUserId(targetUserId);
      await apiRequest<{ ok: boolean; removed: boolean }>(
        `/users/${activeUser.id}/follow/${targetUserId}`,
        {
          method: "DELETE",
          headers: authHeaders(),
        },
      );

      setUserFollows((currentFollows) => (
        currentFollows.filter((follow) => !(follow.followerUserId === activeUser.id && follow.followingUserId === targetUserId))
      ));
      sendSuccess();
      showToast("Подписка отменена");
    } catch (error) {
      sendError();
      alert(getErrorMessage(error));
    } finally {
      setFollowingUserId(null);
    }
  }

  async function sendTestTelegramNotification() {
    if (!requireSafeSession()) return;

    try {
      setIsTestingTelegramNotification(true);
      await apiRequest<{ ok: boolean }>("/telegram/test-notification", {
        method: "POST",
        headers: authHeaders(),
      });
      sendSuccess();
      showToast("Тестовое уведомление отправлено в Telegram");
    } catch (error) {
      sendError();
      alert(getErrorMessage(error));
    } finally {
      setIsTestingTelegramNotification(false);
    }
  }

  async function updateTelegramNotificationPreference(
    key: "settlement" | "bonus" | "closing" | "admin" | "following",
    value: boolean,
  ) {
    if (!requireSafeSession() || !activeUser) return;

    const currentPrefs = {
      settlementEnabled: activeUser.telegramNotifySettlement !== false,
      bonusEnabled: activeUser.telegramNotifyBonus !== false,
      closingEnabled: activeUser.telegramNotifyClosing !== false,
      adminEnabled: activeUser.telegramNotifyAdmin !== false,
      followingEnabled: activeUser.telegramNotifyFollowing !== false,
    };

    const nextPrefs = {
      ...currentPrefs,
      [`${key}Enabled`]: value,
    };

    try {
      setIsSavingTelegramNotificationPrefs(true);
      const result = await apiRequest<{ user: DemoUser }>(`/users/${activeUser.id}/telegram-notifications`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify(nextPrefs),
      });

      setUsers((currentUsers) => currentUsers.map((user) => user.id === result.user.id ? result.user : user));
      sendSuccess();
      showToast("Настройки уведомлений сохранены");
    } catch (error) {
      sendError();
      alert(getErrorMessage(error));
    } finally {
      setIsSavingTelegramNotificationPrefs(false);
    }
  }

  useEffect(() => {
    const telegramWebApp = getRealTelegramWebApp();
    if (!telegramWebApp) {
      setIsTelegram(false);
      document.body.classList.remove("is-telegram-webapp");
      Array.from(document.body.classList)
        .filter((className) => className.startsWith("tg-platform-"))
        .forEach((className) => document.body.classList.remove(className));
      return;
    }

    setIsTelegram(true);
    setupTelegramChrome(telegramWebApp);

    const handleViewportChange = () => syncTelegramViewportVars(telegramWebApp);
    telegramWebApp.onEvent?.("viewportChanged", handleViewportChange);
    telegramWebApp.onEvent?.("fullscreenChanged", handleViewportChange);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("orientationchange", handleViewportChange);

    return () => {
      telegramWebApp.offEvent?.("viewportChanged", handleViewportChange);
      telegramWebApp.offEvent?.("fullscreenChanged", handleViewportChange);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("orientationchange", handleViewportChange);
    };
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(INTERESTS_STORAGE_KEY, JSON.stringify(selectedInterestCategories));
    } catch {
      // localStorage может быть недоступен во встроенном WebView — это не критично.
    }
  }, [selectedInterestCategories]);

  useEffect(() => {
    try {
      window.localStorage.setItem(ACTIVITY_DISMISSED_STORAGE_KEY, JSON.stringify(dismissedActivityIds.slice(-120)));
    } catch {
      // localStorage может быть недоступен во встроенном WebView — это не критично.
    }
  }, [dismissedActivityIds]);

  useEffect(() => {
    const nextRoute: AppRouteSnapshot = { mainView, selectedMarketId, selectedPublicProfileUserId, scrollY: getAppScrollTop() };
    const previousRoute = lastRouteRef.current;

    if (!previousRoute) {
      lastRouteRef.current = nextRoute;
      return;
    }

    if (
      previousRoute.mainView === nextRoute.mainView &&
      previousRoute.selectedMarketId === nextRoute.selectedMarketId &&
      previousRoute.selectedPublicProfileUserId === nextRoute.selectedPublicProfileUserId
    ) {
      return;
    }

    if (isRestoringRouteRef.current) {
      isRestoringRouteRef.current = false;
      lastRouteRef.current = nextRoute;
      return;
    }

    const previousRouteWithScroll: AppRouteSnapshot = {
      ...previousRoute,
      scrollY: getAppScrollTop(),
    };

    setRouteHistory((currentHistory) => {
      const lastSavedRoute = currentHistory[currentHistory.length - 1];
      const alreadySaved =
        lastSavedRoute?.mainView === previousRouteWithScroll.mainView &&
        lastSavedRoute?.selectedMarketId === previousRouteWithScroll.selectedMarketId &&
        lastSavedRoute?.selectedPublicProfileUserId === previousRouteWithScroll.selectedPublicProfileUserId;

      return alreadySaved ? currentHistory : [...currentHistory, previousRouteWithScroll].slice(-24);
    });

    lastRouteRef.current = nextRoute;
  }, [mainView, selectedMarketId, selectedPublicProfileUserId]);

  useEffect(() => {
    const telegramWebApp = getRealTelegramWebApp();
    const canGoBack = isActivityOpen || isRulesOpen || mainView !== "markets" || Boolean(selectedMarketId);

    if (!telegramWebApp?.BackButton) return;

    const handleTelegramBack = () => goBackRoute();

    try {
      if (canGoBack) {
        telegramWebApp.BackButton.show();
        telegramWebApp.BackButton.onClick(handleTelegramBack);
      } else {
        telegramWebApp.BackButton.hide();
      }
    } catch {
      // На старых клиентах Telegram BackButton может быть недоступен.
    }

    return () => {
      try {
        telegramWebApp.BackButton?.offClick(handleTelegramBack);
      } catch {
        // Игнорируем старые клиенты Telegram.
      }
    };
  }, [mainView, selectedMarketId, selectedPublicProfileUserId, routeHistory, isActivityOpen, isRulesOpen]);

  async function initializeApp() {
    setIsLoading(true);
    setServerError("");

    try {
      const telegramWebApp = getRealTelegramWebApp();
      const telegramUser = telegramWebApp?.initDataUnsafe?.user;
      const telegramInitData = telegramWebApp?.initData || "";
      const launchMarketId = getLaunchMarketId(telegramWebApp);
      setupTelegramChrome(telegramWebApp);

      const data = await apiRequest<BootstrapData>("/bootstrap");
      let nextUsers = data.users || [];
      let nextActiveUserId = "";

      if (telegramUser?.id) {
        setIsTelegram(true);
        const fullName = [telegramUser.first_name, telegramUser.last_name].filter(Boolean).join(" ");
        const telegramAuthResponse = await apiRequest<TelegramAuthResponse>("/telegram-user", {
          method: "POST",
          body: JSON.stringify({
            initData: telegramInitData,
            fallbackTelegramId: telegramUser.id,
            fallbackFirstName: fullName,
            fallbackUsername: telegramUser.username,
          }),
        });

        const telegramBackendUser = telegramAuthResponse.user;
        setAuthSessionToken(telegramAuthResponse.sessionToken);
        try {
          window.localStorage.setItem(AUTH_SESSION_STORAGE_KEY, telegramAuthResponse.sessionToken);
        } catch {
          // Встроенный WebView может запретить localStorage — токен останется в памяти до закрытия приложения.
        }

        nextActiveUserId = telegramBackendUser.id;
        if (!nextUsers.some((user) => user.id === telegramBackendUser.id)) nextUsers = [...nextUsers, telegramBackendUser];
      } else {
        setAuthSessionToken("");
        try {
          window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
        } catch {
          // localStorage может быть недоступен.
        }
      }

      setUsers(nextUsers);
      setMarkets(data.markets || []);
      setPredictions(data.predictions || []);
      setComments(data.comments || []);
      setTransactions(data.transactions || []);
      setMarketSuggestions(data.marketSuggestions || []);
      setReferrals(data.referrals || []);
      setFavoriteMarketIdsByUser(data.favoriteMarketIdsByUser || {});
      setAdminUserIds(data.adminUserIds || []);
      setActiveUserId(nextActiveUserId);

      if (launchMarketId && (data.markets || []).some((market) => market.id === launchMarketId)) {
        setSelectedMarketId(launchMarketId);
        setDetailsTab("overview");
        setMainView("markets");
      }
    } catch (error) {
      setServerError(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void initializeApp();
  }, []);

  useEffect(() => {
    const backButton = getRealTelegramWebApp()?.BackButton;
    if (!backButton) return;

    const handleBack = () => {
      if (selectedMarketId) setSelectedMarketId(null);
    };

    if (selectedMarketId) {
      backButton.show();
      backButton.onClick(handleBack);
    } else {
      backButton.hide();
    }

    return () => backButton.offClick(handleBack);
  }, [selectedMarketId]);

  async function addUser() {
    const name = newUserName.trim();
    if (!name) {
      alert("Введите имя участника");
      return;
    }

    try {
      const user = await apiRequest<DemoUser>("/users", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      setNewUserName("");
      await refreshData(user.id);
      sendSuccess();
    } catch (error) {
      sendError();
      alert(getErrorMessage(error));
    }
  }

  async function toggleFavoriteMarket(marketId: string) {
    if (!requireSafeSession() || !activeUser) return;

    try {
      const result = await apiRequest<{ favoriteMarketIds: string[] }>(`/users/${activeUser.id}/favorites/${marketId}`, {
        method: "POST",
        headers: adminHeaders(),
      });
      setFavoriteMarketIdsByUser((current) => ({ ...current, [activeUser.id]: result.favoriteMarketIds }));
      sendHaptic();
    } catch (error) {
      sendError();
      alert(getErrorMessage(error));
    }
  }

  function setQuickAmount(marketId: string, amount: number) {
    setAmountByMarket((currentAmounts) => ({ ...currentAmounts, [marketId]: String(Math.max(0, Math.floor(amount))) }));
  }

  function updateStakeAmount(marketId: string, value: string) {
    setAmountByMarket((currentAmounts) => ({ ...currentAmounts, [marketId]: sanitizeStakeInput(value) }));
  }

  function toggleInterestCategory(category: string) {
    setSelectedInterestCategories((currentCategories) => (
      currentCategories.includes(category)
        ? currentCategories.filter((item) => item !== category)
        : [...currentCategories, category]
    ));
    sendHaptic();
  }

  function resetInterestCategories() {
    setSelectedInterestCategories([]);
    sendHaptic();
  }

  function openPredictionConfirmation(market: Market, outcome: Outcome) {
    if (!requireSafeSession() || !activeUser) return;

    if (!isMarketTradable(market)) {
      alert(market.status === "closed" ? "Прогнозы уже закрыты. Рынок ждёт расчёта." : "Этот рынок уже завершён.");
      return;
    }

    const alreadyHasPrediction = activeUserPredictions.some((prediction) => prediction.marketId === market.id && !prediction.settledAt);
    if (alreadyHasPrediction) {
      alert("Ты уже участвуешь в этом рынке. Открой карточку, чтобы посмотреть свою позицию.");
      return;
    }

    const stakeAmount = parseStakeAmount(amountByMarket[market.id] ?? "500");

    if (stakeAmount <= 0) {
      alert("Введите сумму прогноза больше нуля.");
      return;
    }

    if (stakeAmount > activeUser.balance) {
      alert("Не хватает баллов для этого прогноза. Можно выбрать сумму меньше.");
      return;
    }

    setPredictionConfirmation({ marketId: market.id, outcome, amount: stakeAmount });
    sendHaptic("light");
  }

  async function buyPrediction(market: Market, outcome: Outcome, amountOverride?: number) {
    if (!requireSafeSession() || !activeUser) return;

    const stakeAmount = amountOverride ?? parseStakeAmount(amountByMarket[market.id] ?? "500");
    const actionKey = `${market.id}:${outcome}`;

    if (buyingPredictionKey) return;

    if (stakeAmount <= 0) {
      alert("Введите сумму прогноза больше нуля.");
      return;
    }

    try {
      setBuyingPredictionKey(actionKey);
      await apiRequest<Prediction>(`/markets/${market.id}/predictions`, {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify({ userId: activeUser.id, outcome, amount: stakeAmount }),
      });
      setPredictionConfirmation(null);
      await refreshData(activeUser.id);
      sendSuccess();
      showToast(`Прогноз принят: ${getOutcomeText(outcome)} · ${stakeAmount.toLocaleString("ru-RU")} б.`);
    } catch (error) {
      sendError();
      alert(getErrorMessage(error));
    } finally {
      setBuyingPredictionKey(null);
    }
  }



  async function awardUserPoints() {
    if (!requireClientAdmin()) return;

    const userId = adminAwardForm.userId || users[0]?.id || "";
    const amount = Number(adminAwardForm.amount);

    if (!userId) {
      alert("Выбери пользователя.");
      return;
    }

    if (!Number.isFinite(amount) || amount === 0) {
      alert("Введите сумму начисления или списания. Например: 1000 или -500.");
      return;
    }

    try {
      await apiRequest(`/admin/users/${userId}/points`, {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify({ amount, description: adminAwardForm.description || "Ручная корректировка баланса" }),
      });
      await refreshData(activeUser?.id);
      setAdminAwardForm((current) => ({ ...current, amount: "1000" }));
      sendSuccess();
    } catch (error) {
      sendError();
      alert(getErrorMessage(error));
    }
  }

  async function awardAllUsersPoints() {
    if (!requireClientAdmin()) return;

    const amount = Number(adminBulkPointsForm.amount);

    if (!Number.isFinite(amount) || amount === 0) {
      alert("Введите сумму для всех игроков. Например: 1000 или -500.");
      return;
    }

    const actionText = amount > 0 ? "начислить" : "списать";
    const confirmed = window.confirm(`Подтвердить: ${actionText} ${Math.abs(amount).toLocaleString("ru-RU")} баллов всем игрокам?`);

    if (!confirmed) return;

    try {
      setIsApplyingBulkPoints(true);
      const result = await apiRequest<{ affectedUsers: number; totalAmount: number }>("/admin/users/points/bulk", {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify({
          amount,
          description: adminBulkPointsForm.description || "Массовая тестовая корректировка баланса",
        }),
      });
      await refreshData(activeUser?.id);
      sendSuccess();
      showToast(`Готово: ${result.affectedUsers} игроков · ${result.totalAmount >= 0 ? "+" : ""}${result.totalAmount.toLocaleString("ru-RU")} б.`);
    } catch (error) {
      sendError();
      alert(getErrorMessage(error));
    } finally {
      setIsApplyingBulkPoints(false);
    }
  }

  async function awardWeeklyTournamentRewards() {
    if (!requireClientAdmin()) return;

    if (hasCurrentWeekAwards) {
      alert("Награды за эту неделю уже выданы.");
      return;
    }

    const confirmed = window.confirm("Завершить текущую неделю и выдать награды турнира? Повторно выдать награды за эту неделю будет нельзя.");

    if (!confirmed) return;

    try {
      setIsAwardingWeeklyTournament(true);
      const result = await apiRequest<{
        weekKey: string;
        weekStart: string;
        weekEnd: string;
        awards: WeeklyTournamentAward[];
        totalRewardAmount: number;
        awardedUsers: number;
      }>("/admin/tournament/weekly-awards", {
        method: "POST",
        headers: adminHeaders(),
      });

      setWeeklyTournamentAwards((currentAwards) => {
        const newAwardIds = new Set(result.awards.map((award) => award.id));
        return [...result.awards, ...currentAwards.filter((award) => !newAwardIds.has(award.id))];
      });
      await refreshData(activeUser?.id);
      sendSuccess();
      showToast(`Турнир завершён: ${result.awardedUsers} игроков · +${result.totalRewardAmount.toLocaleString("ru-RU")} б.`);
    } catch (error) {
      sendError();
      alert(getErrorMessage(error));
    } finally {
      setIsAwardingWeeklyTournament(false);
    }
  }

  function startCreateShopItem(type: "title" | "frame" = "title") {
    setEditingShopItemId(null);
    setAdminShopForm({
      ...emptyAdminShopItemForm,
      type,
      emoji: type === "title" ? "✨" : "💠",
      styleKey: type === "title" ? "custom-title" : "custom-frame",
      sortOrder: type === "title" ? "200" : "300",
    });
    setAdminTab("shop");
  }

  function startEditShopItem(item: ShopItem) {
    setEditingShopItemId(item.id);
    setAdminShopForm({
      id: item.id,
      type: item.type,
      name: item.name,
      description: item.description,
      price: String(item.price),
      emoji: item.emoji,
      styleKey: item.styleKey,
      sortOrder: String(item.sortOrder),
      isActive: item.isActive,
    });
    setAdminTab("shop");
  }

  async function saveAdminShopItem() {
    if (!requireClientAdmin()) return;

    const price = Math.max(0, Math.trunc(Number(adminShopForm.price)));
    const sortOrder = Math.trunc(Number(adminShopForm.sortOrder));

    if (!adminShopForm.name.trim()) {
      alert("Укажи название предмета.");
      return;
    }

    if (!Number.isFinite(price)) {
      alert("Укажи корректную цену.");
      return;
    }

    if (!Number.isFinite(sortOrder)) {
      alert("Укажи корректный порядок показа.");
      return;
    }

    try {
      setSavingAdminShopItemId(editingShopItemId || "new");
      const payload = {
        id: adminShopForm.id.trim(),
        type: adminShopForm.type,
        name: adminShopForm.name.trim(),
        description: adminShopForm.description.trim(),
        price,
        emoji: adminShopForm.emoji.trim() || "✨",
        styleKey: adminShopForm.styleKey.trim() || "custom",
        sortOrder,
        isActive: adminShopForm.isActive,
      };

      await apiRequest<{ item: ShopItem }>(
        editingShopItemId ? `/admin/shop/items/${editingShopItemId}` : "/admin/shop/items",
        {
          method: editingShopItemId ? "PATCH" : "POST",
          headers: adminHeaders(),
          body: JSON.stringify(payload),
        },
      );

      await refreshData(activeUser?.id);
      setEditingShopItemId(null);
      setAdminShopForm(emptyAdminShopItemForm);
      sendSuccess();
      showToast(editingShopItemId ? "Предмет обновлён" : "Предмет создан");
    } catch (error) {
      sendError();
      alert(getErrorMessage(error));
    } finally {
      setSavingAdminShopItemId(null);
    }
  }

  async function toggleAdminShopItem(item: ShopItem) {
    if (!requireClientAdmin()) return;

    try {
      setSavingAdminShopItemId(item.id);
      await apiRequest<{ item: ShopItem }>(`/admin/shop/items/${item.id}`, {
        method: "PATCH",
        headers: adminHeaders(),
        body: JSON.stringify({ ...item, isActive: !item.isActive }),
      });
      await refreshData(activeUser?.id);
      sendSuccess();
      showToast(!item.isActive ? "Предмет включён" : "Предмет скрыт");
    } catch (error) {
      sendError();
      alert(getErrorMessage(error));
    } finally {
      setSavingAdminShopItemId(null);
    }
  }

  async function grantShopItemToUser(itemId?: string) {
    if (!requireClientAdmin()) return;

    const targetItemId = itemId || adminShopGrantForm.itemId;
    const targetUserId = adminShopGrantForm.userId || activeUser?.id || users[0]?.id || "";

    if (!targetUserId || !targetItemId) {
      alert("Выбери игрока и предмет.");
      return;
    }

    try {
      setGrantingShopItemId(targetItemId);
      const result = await apiRequest<{ inventoryItem: UserInventoryItem; alreadyOwned: boolean }>(
        `/admin/shop/items/${targetItemId}/grant`,
        {
          method: "POST",
          headers: adminHeaders(),
          body: JSON.stringify({ userId: targetUserId }),
        },
      );

      setUserInventory((currentInventory) => (
        currentInventory.some((entry) => entry.id === result.inventoryItem.id) ? currentInventory : [result.inventoryItem, ...currentInventory]
      ));
      await refreshData(activeUser?.id);
      sendSuccess();
      showToast(result.alreadyOwned ? "Предмет уже был у игрока" : "Предмет выдан игроку");
    } catch (error) {
      sendError();
      alert(getErrorMessage(error));
    } finally {
      setGrantingShopItemId(null);
    }
  }

  async function createMarket() {
    if (!requireClientAdmin()) return;

    try {
      const market = await apiRequest<Market>("/markets", {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify(newMarket),
      });
      setSelectedCategory("Все");
      setSelectedMarketId(market.id);
      setDetailsTab("overview");
      setNewMarket(emptyNewMarketForm);
      setIsAdminOpen(false);
      await refreshData(activeUser?.id);
      sendSuccess();
    } catch (error) {
      sendError();
      alert(getErrorMessage(error));
    }
  }


  async function submitMarketSuggestion() {
    if (!requireSafeSession() || !activeUser) return;

    if (suggestionForm.question.trim().length < 8) {
      alert("Сформулируй вопрос рынка чуть подробнее");
      return;
    }

    if (!suggestionForm.closesAt) {
      alert("Укажи дату закрытия рынка");
      return;
    }

    try {
      await apiRequest<MarketSuggestion>("/market-suggestions", {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify({ ...suggestionForm, userId: activeUser.id }),
      });
      setSuggestionForm(emptySuggestionForm);
      await refreshData(activeUser.id);
      setMainView("profile");
      sendSuccess();
      alert("Заявка отправлена админу. Статус можно смотреть в профиле.");
    } catch (error) {
      sendError();
      alert(getErrorMessage(error));
    }
  }

  function getSuggestionDraft(suggestion: MarketSuggestion): SuggestionReviewDraft {
    return (
      suggestionReviewDrafts[suggestion.id] || {
        question: suggestion.question,
        category: suggestion.category,
        description: suggestion.description,
        source: suggestion.source,
        closesAt: normalizeDateForInput(suggestion.closesAt),
        yesProbability: 50,
        adminNote: suggestion.adminNote || "",
      }
    );
  }

  function updateSuggestionDraft(suggestion: MarketSuggestion, patch: Partial<SuggestionReviewDraft>) {
    const currentDraft = getSuggestionDraft(suggestion);
    setSuggestionReviewDrafts((current) => ({
      ...current,
      [suggestion.id]: { ...currentDraft, ...patch },
    }));
  }

  async function approveSuggestion(suggestion: MarketSuggestion) {
    if (!requireClientAdmin()) return;
    const draft = getSuggestionDraft(suggestion);
    const confirmed = confirm(`Опубликовать рынок из заявки?\n\n${draft.question}`);
    if (!confirmed) return;

    try {
      const result = await apiRequest<{ market: Market; suggestion: MarketSuggestion }>(`/market-suggestions/${suggestion.id}/approve`, {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify(draft),
      });
      await refreshData(activeUser?.id);
      setSelectedMarketId(result.market.id);
      setDetailsTab("overview");
      setMainView("markets");
      sendSuccess();
    } catch (error) {
      sendError();
      alert(getErrorMessage(error));
    }
  }

  async function rejectSuggestion(suggestion: MarketSuggestion) {
    if (!requireClientAdmin()) return;
    const draft = getSuggestionDraft(suggestion);
    const confirmed = confirm(`Отклонить заявку?\n\n${suggestion.question}`);
    if (!confirmed) return;

    try {
      await apiRequest<MarketSuggestion>(`/market-suggestions/${suggestion.id}/reject`, {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify({ adminNote: draft.adminNote || "Отклонено администратором" }),
      });
      await refreshData(activeUser?.id);
      sendSuccess();
    } catch (error) {
      sendError();
      alert(getErrorMessage(error));
    }
  }

  async function duplicateMarket(market: Market) {
    if (!requireClientAdmin()) return;

    try {
      const duplicatedMarket = await apiRequest<Market>(`/markets/${market.id}/duplicate`, {
        method: "POST",
        headers: adminHeaders(),
      });
      setSelectedMarketId(duplicatedMarket.id);
      setDetailsTab("overview");
      await refreshData(activeUser?.id);
      sendSuccess();
    } catch (error) {
      sendError();
      alert(getErrorMessage(error));
    }
  }

  function startEditMarket(market: Market) {
    setEditingMarketId(market.id);
    setEditMarket({
      question: market.question,
      category: market.category,
      description: market.description,
      source: market.source,
      closesAt: normalizeDateForInput(market.closesAt),
    });
  }

  function cancelEditMarket() {
    setEditingMarketId(null);
    setEditMarket(emptyEditMarketForm);
  }

  async function saveEditedMarket(marketId: string) {
    if (!requireClientAdmin()) return;

    try {
      await apiRequest<Market>(`/markets/${marketId}`, {
        method: "PATCH",
        headers: adminHeaders(),
        body: JSON.stringify(editMarket),
      });
      setEditingMarketId(null);
      setEditMarket(emptyEditMarketForm);
      await refreshData(activeUser?.id);
      sendSuccess();
    } catch (error) {
      sendError();
      alert(getErrorMessage(error));
    }
  }

  async function deleteMarket(market: Market) {
    if (!requireClientAdmin()) return;

    const confirmed = confirm(
      `Удалить рынок?\n\n${market.question}\n\nЕсли рынок еще не рассчитан, активные прогнозы будут возвращены участникам баллами.`
    );
    if (!confirmed) return;

    try {
      await apiRequest(`/markets/${market.id}`, { method: "DELETE", headers: adminHeaders() });
      setSelectedMarketId(null);
      setEditingMarketId(null);
      setEditMarket(emptyEditMarketForm);
      await refreshData(activeUser?.id);
      sendSuccess();
    } catch (error) {
      sendError();
      alert(getErrorMessage(error));
    }
  }

  async function resolveMarket(market: Market, outcome: Outcome) {
    if (!requireClientAdmin()) return;

    const confirmed = confirm(`Рассчитать рынок как «${getOutcomeText(outcome)}»?\n\nПосле расчета новые прогнозы по этому рынку будут закрыты.`);
    if (!confirmed) return;

    try {
      await apiRequest(`/markets/${market.id}/resolve`, {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify({ outcome }),
      });
      await refreshData(activeUser?.id);
      sendSuccess();
    } catch (error) {
      sendError();
      alert(getErrorMessage(error));
    }
  }

  async function extendMarket(market: Market) {
    if (!requireClientAdmin()) return;

    const defaultDate = getNextWeekDateInput();
    const enteredDate = prompt(
      `Новая дата закрытия для рынка:\n${market.question}\n\nФормат: ГГГГ-ММ-ДД`,
      normalizeDateForInput(market.closesAt) || defaultDate
    );

    if (!enteredDate) return;

    const closesAt = normalizeDateForInput(enteredDate.trim());
    if (!closesAt) {
      alert("Укажи дату в формате ГГГГ-ММ-ДД");
      return;
    }

    try {
      await apiRequest(`/markets/${market.id}/extend`, {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify({ closesAt }),
      });
      await refreshData(activeUser?.id);
      sendSuccess();
    } catch (error) {
      sendError();
      alert(getErrorMessage(error));
    }
  }

  function updateCommentText(marketId: string, text: string) {
    setCommentDrafts((currentDrafts) => ({
      ...currentDrafts,
      [marketId]: { ...(currentDrafts[marketId] || emptyCommentDraft), text },
    }));
  }

  function handleCommentMedia(marketId: string, file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("Можно прикреплять только изображения и GIF");
      return;
    }
    if (file.size > 1500000) {
      alert("Для прототипа файл должен быть не больше 1.5 МБ");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setCommentDrafts((currentDrafts) => ({
        ...currentDrafts,
        [marketId]: {
          ...(currentDrafts[marketId] || emptyCommentDraft),
          mediaDataUrl: String(reader.result),
          mediaName: file.name,
        },
      }));
    };
    reader.readAsDataURL(file);
  }

  function removeCommentMedia(marketId: string) {
    setCommentDrafts((currentDrafts) => ({
      ...currentDrafts,
      [marketId]: { ...(currentDrafts[marketId] || emptyCommentDraft), mediaDataUrl: "", mediaName: "" },
    }));
  }

  async function addComment(marketId: string) {
    if (!requireSafeSession() || !activeUser) return;

    const draft = commentDrafts[marketId] || emptyCommentDraft;
    const text = draft.text.trim();
    if (!text && !draft.mediaDataUrl) {
      alert("Введите комментарий или прикрепите фото/GIF");
      return;
    }

    try {
      await apiRequest<MarketComment>(`/markets/${marketId}/comments`, {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify({ userId: activeUser.id, text, mediaDataUrl: draft.mediaDataUrl, mediaName: draft.mediaName }),
      });
      setCommentDrafts((currentDrafts) => ({ ...currentDrafts, [marketId]: emptyCommentDraft }));
      await refreshData(activeUser.id);
      sendSuccess();
    } catch (error) {
      sendError();
      alert(getErrorMessage(error));
    }
  }

  async function deleteComment(commentId: string) {
    if (!requireClientAdmin()) return;

    try {
      await apiRequest(`/comments/${commentId}`, { method: "DELETE", headers: adminHeaders() });
      await refreshData(activeUser?.id);
      sendHaptic();
    } catch (error) {
      sendError();
      alert(getErrorMessage(error));
    }
  }

  async function resetDemo() {
    if (!requireClientAdmin()) return;

    const confirmed = confirm("Сбросить общую базу backend?");
    if (!confirmed) return;

    try {
      await apiRequest("/reset", { method: "POST", headers: adminHeaders() });
      setSelectedCategory("Все");
      setMarketSearch("");
      setStatusFilter("all");
      setSortMode("newest");
      setShowFavoritesOnly(false);
      setSelectedMarketId(null);
      setEditingMarketId(null);
      setEditMarket(emptyEditMarketForm);
      setNewMarket(emptyNewMarketForm);
      setSuggestionForm(emptySuggestionForm);
      setSuggestionReviewDrafts({});
      setCommentDrafts({});
      setAmountByMarket({});
      await refreshData(activeUser?.id);
      sendSuccess();
    } catch (error) {
      sendError();
      alert(getErrorMessage(error));
    }
  }

  function exportDemoData() {
    const payload = { version: 5, source: "postgres", exportedAt: new Date().toISOString(), users, markets, predictions, comments, transactions, marketSuggestions, referrals, favoriteMarketIdsByUser, adminUserIds };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `forecast-market-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function shareMarket(market: Market) {
    const url = getMarketShareUrl(market.id);
    const text = `Я сделал прогноз в Forecast Market 👀\n\n${market.question}\n\nА ты как думаешь?`;
    const telegramShareUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
    const telegramWebApp = getRealTelegramWebApp();

    if (telegramWebApp?.openTelegramLink) {
      telegramWebApp.openTelegramLink(telegramShareUrl);
      sendSuccess();
      return;
    }

    if (navigator.share) {
      try {
        await navigator.share({ title: "Forecast Market", text, url });
        sendSuccess();
        return;
      } catch {
        // Пользователь мог закрыть системное окно шеринга.
      }
    }

    await navigator.clipboard?.writeText(`${text}\n${url}`);
    sendSuccess();
    alert("Ссылка на рынок скопирована.");
  }



  async function shareReferral() {
    if (!activeUser) return;

    const url = getReferralShareUrl(activeUser.id);
    const text = `Заходи в Forecast Market 👀\n\nДелай прогнозы за игровые баллы, забирай бонусы и соревнуйся в рейтинге. Когда сделаешь первый прогноз, мы оба получим бонус.`;
    const telegramShareUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
    const telegramWebApp = getRealTelegramWebApp();

    if (telegramWebApp?.openTelegramLink) {
      telegramWebApp.openTelegramLink(telegramShareUrl);
      sendSuccess();
      return;
    }

    if (navigator.share) {
      try {
        await navigator.share({ title: "Forecast Market", text, url });
        sendSuccess();
        return;
      } catch {
        // Пользователь мог закрыть системное окно шеринга.
      }
    }

    await navigator.clipboard?.writeText(`${text}\n${url}`);
    sendSuccess();
    alert("Реферальная ссылка скопирована.");
  }
  function renderTradeHistory(marketPredictions: Prediction[]) {
    if (marketPredictions.length === 0) {
      return <div className="emptyChat">Пока сделок нет. Первый прогноз появится здесь.</div>;
    }

    return (
      <div className="marketTradesList">
        {marketPredictions.map((prediction) => {
          const isSettled = Boolean(prediction.settledAt);
          const isWinner = isSettled && prediction.outcome === prediction.resolvedOutcome;

          return (
            <div className="marketTradeItem" key={prediction.id}>
              <div className={`tradeOutcome ${prediction.outcome === "yes" ? "tradeOutcomeYes" : "tradeOutcomeNo"}`}>
                {getOutcomeText(prediction.outcome)}
              </div>

              <div className="tradeInfo">
                <strong>{prediction.userName}</strong>
                <p>
                  {prediction.amount.toLocaleString("ru-RU")} баллов · {prediction.probabilityAtPurchase}% при покупке
                </p>
                {isSettled ? (
                  <small className={isWinner ? "winText" : "lossText"}>
                    {isWinner ? "Выиграл" : "Проиграл"} · Выплата: {(prediction.payout || 0).toLocaleString("ru-RU")} баллов
                  </small>
                ) : (
                  <small>Активный прогноз</small>
                )}
              </div>

              <div className="tradeDate">{prediction.createdAt}</div>
            </div>
          );
        })}
      </div>
    );
  }

  function renderParticipants() {
    if (selectedMarketParticipants.length === 0) {
      return <div className="emptyChat">Пока никто не сделал прогноз по этому рынку.</div>;
    }

    return (
      <div className="participantsGrid">
        {selectedMarketParticipants.map((participant) => {
          const participantUser = users.find((user) => user.id === participant.userId);
          return (
          <button className={`participantCard clickableUserCard ${getUserFrameClass(participantUser)}`} key={participant.userId} onClick={() => openPublicProfile(participant.userId)}>
            <div className={`commentAvatar ${getUserFrameClass(participantUser)}`}>{participant.userName.slice(0, 1).toUpperCase()}</div>
            <div>
              <strong>{participant.userName}</strong>
              <p>
                {participant.totalAmount.toLocaleString("ru-RU")} баллов · {participant.predictionsCount} прогнозов
              </p>
              <small>
                Да: {participant.yesAmount.toLocaleString("ru-RU")} · Нет: {participant.noAmount.toLocaleString("ru-RU")}
              </small>
            </div>
          </button>
          );
        })}
      </div>
    );
  }

  function renderMarketChat(market: Market, marketComments: MarketComment[], commentDraft: CommentDraft) {
    return (
      <section className="marketChat">
        <div className="marketChatHeader">
          <div>
            <h4>Обсуждение рынка</h4>
            <p>Комментарии, аргументы, фото и GIF по событию.</p>
          </div>
          <span>{marketComments.length}</span>
        </div>

        <div className="commentComposer">
          <textarea
            placeholder={`Написать комментарий от имени ${activeUser?.name || "участника"}...`}
            value={commentDraft.text}
            onChange={(event) => updateCommentText(market.id, event.target.value)}
          />

          {commentDraft.mediaDataUrl && (
            <div className="mediaPreview">
              <img src={commentDraft.mediaDataUrl} alt={commentDraft.mediaName || "Вложение"} />
              <div>
                <strong>{commentDraft.mediaName}</strong>
                <button onClick={() => removeCommentMedia(market.id)}>Удалить вложение</button>
              </div>
            </div>
          )}

          <div className="commentActions">
            <label className="attachButton">
              Прикрепить фото/GIF
              <input
                type="file"
                accept="image/*,.gif"
                onChange={(event) => {
                  handleCommentMedia(market.id, event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
            </label>
            <button className="sendCommentButton" onClick={() => addComment(market.id)}>
              Отправить
            </button>
          </div>
        </div>

        {marketComments.length === 0 ? (
          <div className="emptyChat detailEmptyState">
            <strong>Комментариев пока нет</strong>
            <p>Напиши первым, почему ты веришь в один из исходов.</p>
          </div>
        ) : (
          <div className="commentList">
            {marketComments.map((comment) => {
              const commentUser = users.find((user) => user.id === comment.userId);
              const commentTitle = getUserActiveTitle(commentUser);
              return (
              <div className={`commentItem ${getUserFrameClass(commentUser)}`} key={comment.id}>
                <button className={`commentAvatar clickableAvatar ${getUserFrameClass(commentUser)}`} onClick={() => openPublicProfile(comment.userId)}>{comment.userName.slice(0, 1).toUpperCase()}</button>
                <div className="commentBody">
                  <div className="commentMeta">
                    <button className="commentUserNameButton" onClick={() => openPublicProfile(comment.userId)}>{comment.userName}</button>
                    {commentTitle ? <em className="commentUserTitle">{commentTitle.emoji} {commentTitle.name}</em> : null}
                    <span>{comment.createdAt}</span>
                    {isAdmin && (
                      <button className="commentDeleteButton" onClick={() => deleteComment(comment.id)}>
                        Удалить
                      </button>
                    )}
                  </div>
                  {comment.text && <p>{comment.text}</p>}
                  {comment.mediaDataUrl && <img className="commentMedia" src={comment.mediaDataUrl} alt={comment.mediaName || "Вложение"} />}
                </div>
              </div>
              );
            })}
          </div>
        )}
      </section>
    );
  }


  function renderDetailTradeBox(market: Market) {
    const userPrediction = selectedMarketUserPrediction;
    const stakeValue = getStakeInputValue(amountByMarket[market.id]);
    const stakeAmount = parseStakeAmount(stakeValue);
    const isTradable = isMarketTradable(market);

    if (userPrediction) {
      const currentProbability = userPrediction.outcome === "yes" ? getYesProbability(market) : 100 - getYesProbability(market);
      const probabilityDiff = currentProbability - userPrediction.probabilityAtPurchase;
      const estimatedPayout = estimatePredictionPayout(market, userPrediction);
      const resultAmount = userPrediction.settledAt ? (userPrediction.payout || 0) - userPrediction.amount : estimatedPayout - userPrediction.amount;
      const isWinner = Boolean(userPrediction.settledAt && userPrediction.outcome === userPrediction.resolvedOutcome);

      return (
        <section className={`detailTradeCard detailMyPositionCard ${userPrediction.settledAt ? isWinner ? "detailMyPositionWin" : "detailMyPositionLoss" : "detailMyPositionLive"}`}>
          <div className="detailTradeHeader">
            <div>
              <p className="eyebrow">{userPrediction.settledAt ? "Результат" : "Моя позиция"}</p>
              <h3>{userPrediction.settledAt ? "Прогноз рассчитан" : "Ты участвуешь в рынке"}</h3>
            </div>
            <span>{getOutcomeText(userPrediction.outcome)}</span>
          </div>

          <div className="detailPositionHero">
            <div className={userPrediction.outcome === "yes" ? "positionOutcomeYes" : "positionOutcomeNo"}>
              <span>Твой прогноз</span>
              <strong>{getOutcomeText(userPrediction.outcome)}</strong>
            </div>
            <div>
              <span>Сумма</span>
              <strong>{userPrediction.amount.toLocaleString("ru-RU")} б.</strong>
            </div>
          </div>

          <div className="detailPositionStats">
            <div><span>При покупке</span><strong>{userPrediction.probabilityAtPurchase}%</strong></div>
            <div><span>Сейчас</span><strong>{currentProbability}%</strong></div>
            <div><span>{userPrediction.settledAt ? "Выплата" : "Потенциально"}</span><strong>{estimatedPayout.toLocaleString("ru-RU")} б.</strong></div>
            <div>
              <span>{userPrediction.settledAt ? "Итог" : "Потенц. итог"}</span>
              <strong className={resultAmount >= 0 ? "positiveAmount" : "negativeAmount"}>
                {resultAmount >= 0 ? "+" : ""}{resultAmount.toLocaleString("ru-RU")} б.
              </strong>
            </div>
          </div>

          <div className="detailProbabilityDelta">
            <span>Изменение вероятности</span>
            <strong className={probabilityDiff >= 0 ? "positiveAmount" : "negativeAmount"}>
              {probabilityDiff >= 0 ? "+" : ""}{probabilityDiff} п.п.
            </strong>
          </div>

          {userPrediction.settledAt ? (
            <p className={isWinner ? "detailPositionNote winText" : "detailPositionNote lossText"}>
              {isWinner ? "Прогноз сыграл, выплата начислена." : "Этот прогноз не сыграл."}
            </p>
          ) : market.status === "closed" ? (
            <p className="detailPositionNote waitingPredictionText">Прогнозы закрыты. Осталось дождаться расчёта администратора.</p>
          ) : (
            <p className="detailPositionNote activePrediction">Рынок ещё открыт. Следи за вероятностью и обсуждением.</p>
          )}

          <button className="secondaryButton fullWidthButton" onClick={() => setMainView("predictions")}>
            Открыть мои прогнозы
          </button>

          {isAdmin && market.status !== "resolved" && (
            <div className="resolveBox detailResolveBox">
              <span>Админ-расчёт</span>
              <div>
                <button className="resolveYesButton" onClick={() => resolveMarket(market, "yes")}>Да</button>
                <button className="resolveNoButton" onClick={() => resolveMarket(market, "no")}>Нет</button>
              </div>
            </div>
          )}

          {market.status === "resolved" && (
            <div className="resolvedBox">
              Рынок рассчитан как <b>{getOutcomeText(market.resolvedOutcome)}</b>
              {market.resolvedAt ? ` · ${market.resolvedAt}` : ""}
            </div>
          )}
        </section>
      );
    }

    return (
      <section className="detailTradeCard detailTradeCardPolished">
        <div className="detailTradeHeader">
          <div>
            <p className="eyebrow">Прогноз</p>
            <h3>{isTradable ? "Сделать прогноз" : "Прогнозы закрыты"}</h3>
          </div>
          <span>{getYesProbability(market)}% Да</span>
        </div>

        {market.status === "closed" && (
          <div className="marketClosedNotice">Рынок закрыт и ждёт расчёта. Новые прогнозы уже не принимаются.</div>
        )}

        {market.status === "resolved" && (
          <div className="resolvedBox">
            Рынок рассчитан как <b>{getOutcomeText(market.resolvedOutcome)}</b>
            {market.resolvedAt ? ` · ${market.resolvedAt}` : ""}
          </div>
        )}

        <label className="detailStakeLabel">
          <span>Сумма прогноза</span>
          <input
            className="stakeAmountInput"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="Любая сумма"
            value={stakeValue}
            disabled={!isTradable}
            onChange={(event) => updateStakeAmount(market.id, event.target.value)}
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>

        <div className="quickAmountRow detailQuickAmountRow">
          {[100, 500, 1000, 2500].map((amount) => (
            <button key={amount} disabled={!isTradable} onClick={() => setQuickAmount(market.id, amount)}>
              {amount}
            </button>
          ))}
          <button disabled={!isTradable} onClick={() => setQuickAmount(market.id, activeUser?.balance || 0)}>
            Всё
          </button>
        </div>

        <div className="detailPayoutPreview">
          <div>
            <span>Да</span>
            <strong>{estimateQuickPredictionPayout(market, "yes", stakeAmount).toLocaleString("ru-RU")} б.</strong>
          </div>
          <div>
            <span>Нет</span>
            <strong>{estimateQuickPredictionPayout(market, "no", stakeAmount).toLocaleString("ru-RU")} б.</strong>
          </div>
        </div>

        <div className="buttons detailBuyButtons">
          <button className="yesButton" disabled={!isTradable || stakeAmount <= 0} onClick={() => openPredictionConfirmation(market, "yes")}>
            Купить Да
          </button>
          <button className="noButton" disabled={!isTradable || stakeAmount <= 0} onClick={() => openPredictionConfirmation(market, "no")}>
            Купить Нет
          </button>
        </div>

        <div className="detailTradeDisclaimer">
          Баллы игровые: не являются деньгами и не выводятся.
        </div>

        {isAdmin && market.status !== "resolved" && (
          <div className="resolveBox detailResolveBox">
            <span>Админ-расчёт</span>
            <div>
              <button className="resolveYesButton" onClick={() => resolveMarket(market, "yes")}>Да</button>
              <button className="resolveNoButton" onClick={() => resolveMarket(market, "no")}>Нет</button>
            </div>
          </div>
        )}
      </section>
    );
  }

  function clearMarketFilters() {
    setMarketSearch("");
    setStatusFilter("all");
    setSortMode("newest");
    setSelectedCategory("Все");
    setShowFavoritesOnly(false);
  }

  async function refreshPolymarketImport() {
    if (!requireClientAdmin()) return;

    const confirmed = confirm("Подтянуть свежие популярные события Polymarket? Новые рынки появятся как игровые события за баллы.");
    if (!confirmed) return;

    setIsPolymarketImporting(true);

    try {
      const result = await apiRequest<{ imported: number; checked: number; skipped: number }>("/polymarket/import", {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify({ limit: 50 }),
      });
      await refreshData(activeUser?.id);
      sendSuccess();
      alert(`Импорт завершён. Добавлено: ${result.imported}, проверено: ${result.checked}, пропущено: ${result.skipped}.`);
    } catch (error) {
      sendError();
      alert(getErrorMessage(error));
    } finally {
      setIsPolymarketImporting(false);
    }
  }

  function openMarketDetails(marketId: string, tab: DetailsTab = "overview") {
    setSelectedMarketId(marketId);
    setSelectedPublicProfileUserId(null);
    setDetailsTab(tab);
    sendHaptic();
  }

  function openPublicProfile(userId: string) {
    setSelectedMarketId(null);
    setSelectedPublicProfileUserId(userId);
    setMainView("publicProfile");
    sendHaptic("light");
    window.setTimeout(() => scrollAppToTop("auto"), 0);
  }

  function renderMarketCard(market: Market, variant: "feed" | "search" = "feed") {
    const yesProbability = getYesProbability(market);
    const noProbability = 100 - yesProbability;
    const isResolved = market.status === "resolved";
    const isClosed = market.status === "closed";
    const marketPredictions = predictions.filter((prediction) => prediction.marketId === market.id);
    const marketComments = comments.filter((comment) => comment.marketId === market.id);
    const uniqueParticipants = new Set(marketPredictions.map((prediction) => prediction.userId)).size;
    const isFavorite = favoriteMarketIds.includes(market.id);
    const isImported = isPolymarketSource(market.source);
    const activePrediction = activeUserPredictions.find((prediction) => prediction.marketId === market.id && !prediction.settledAt);

    return (
      <article className={`marketCard scrollMarketCard ${variant === "search" ? "searchMarketCard" : ""} ${isResolved ? "resolvedMarket" : ""} ${isClosed ? "closedMarket" : ""}`} key={market.id}>
        <div className="marketCardMain">
          <div className="marketCardHeader">
            <div className="marketBadgesRow">
              <span className="category">{market.category}</span>
              {isImported && <span className="sourceBadge polymarketBadge">Polymarket</span>}
              <span className={`statusBadge ${getMarketStatusClass(market)}`}>{getMarketStatusText(market)}</span>
            </div>
            <button
              className={`favoriteIconButton ${isFavorite ? "activeFavorite" : ""}`}
              onClick={() => toggleFavoriteMarket(market.id)}
              aria-label={isFavorite ? "Убрать из избранного" : "Добавить в избранное"}
            >
              {isFavorite ? "★" : "☆"}
            </button>
          </div>

          <h3>{market.question}</h3>
          <p className="compactDescription">{getMarketDescription(market)}</p>

          <div className="marketChipsRow">
            <span>{getMarketCloseLabel(market)}</span>
            <span>{uniqueParticipants} участников</span>
            <span>{marketPredictions.length} прогнозов</span>
            <span>{marketComments.length} комм.</span>
            {activePrediction && (
              <span className="myPredictionChip">
                Мой: {getOutcomeText(activePrediction.outcome)} · {activePrediction.amount.toLocaleString("ru-RU")} б.
              </span>
            )}
          </div>

          {activePrediction && (
            <div className="marketMyPosition">
              <span>Твоя позиция</span>
              <strong>{getOutcomeText(activePrediction.outcome)} · потенциально {estimatePredictionPayout(market, activePrediction).toLocaleString("ru-RU")} баллов</strong>
            </div>
          )}
        </div>

        <div className="marketCardSide">
          <div className="marketProbabilityMini">
            <div className="yesMini"><span>Да</span><strong>{yesProbability}%</strong></div>
            <div className="noMini"><span>Нет</span><strong>{noProbability}%</strong></div>
          </div>
          <div className="bar marketMiniBar"><div style={{ width: `${yesProbability}%` }} /></div>
          <div className="marketActionRow">
            <button className="openDetailsButton" onClick={() => openMarketDetails(market.id, "overview")}>Открыть</button>
            <button className="secondaryOpenButton compactChatButton" onClick={() => openMarketDetails(market.id, "chat")}>Чат</button>
            <button className="shareMarketButton" onClick={() => void shareMarket(market)}>Поделиться</button>
            {isAdmin && isImported && <button className="hideImportedButton" onClick={() => deleteMarket(market)}>Скрыть</button>}
          </div>
        </div>
      </article>
    );
  }

  function renderPredictionCard(prediction: Prediction, variant: "compact" | "full" = "compact") {
    const market = markets.find((item) => item.id === prediction.marketId);
    const isSettled = Boolean(prediction.settledAt);
    const isWinner = isSettled && prediction.outcome === prediction.resolvedOutcome;
    const isWaiting = !isSettled && market?.status === "closed";
    const isLive = !isSettled && market?.status === "open";
    const estimatedPayout = estimatePredictionPayout(market, prediction);
    const currentProbability = market ? (prediction.outcome === "yes" ? getYesProbability(market) : 100 - getYesProbability(market)) : prediction.probabilityAtPurchase;
    const probabilityDiff = currentProbability - prediction.probabilityAtPurchase;
    const resultAmount = isSettled ? (prediction.payout || 0) - prediction.amount : estimatedPayout - prediction.amount;
    const statusLabel = isSettled ? (isWinner ? "Выиграл" : "Проиграл") : isWaiting ? "Ждёт расчёта" : isLive ? "В игре" : "Активный";

    return (
      <button
        className={`myPredictionCard gamePredictionCard ${variant === "full" ? "myPredictionCardFull" : ""} ${isSettled ? "settledPredictionCard" : ""} ${isWinner ? "winnerPredictionCard" : ""} ${isWaiting ? "waitingPredictionCard" : ""}`}
        key={prediction.id}
        onClick={() => {
          setSelectedMarketId(prediction.marketId);
          setDetailsTab("overview");
        }}
      >
        <div className={`myPredictionSide ${prediction.outcome === "yes" ? "yesSide" : "noSide"}`}>
          <span>{getOutcomeText(prediction.outcome)}</span>
        </div>
        <div className="myPredictionBody">
          <div className="myPredictionTopLine">
            <span className={`predictionStatusPill ${isWinner ? "predictionStatusWin" : isSettled ? "predictionStatusLoss" : isWaiting ? "predictionStatusWaiting" : "predictionStatusLive"}`}>
              {statusLabel}
            </span>
            <strong>{prediction.amount.toLocaleString("ru-RU")} б.</strong>
          </div>
          <h4>{market?.question || prediction.marketQuestion}</h4>

          <div className="predictionProgressLine">
            <span>При покупке {prediction.probabilityAtPurchase}%</span>
            <b className={probabilityDiff >= 0 ? "positiveAmount" : "negativeAmount"}>
              {probabilityDiff >= 0 ? "+" : ""}{probabilityDiff} п.п.
            </b>
            <span>Сейчас {currentProbability}%</span>
          </div>

          <div className="predictionProbabilityTrack" aria-label={`Текущая вероятность ${currentProbability}%`}>
            <span style={{ width: `${Math.max(2, Math.min(100, currentProbability))}%` }} />
          </div>

          <div className="myPredictionMetaGrid gamePredictionMetaGrid">
            <div><span>Сумма</span><strong>{prediction.amount.toLocaleString("ru-RU")}</strong></div>
            <div><span>{isSettled ? "Выплата" : "Потенциально"}</span><strong>{estimatedPayout.toLocaleString("ru-RU")}</strong></div>
            <div>
              <span>{isSettled ? "Итог" : "Потенц. итог"}</span>
              <strong className={resultAmount >= 0 ? "positiveAmount" : "negativeAmount"}>
                {resultAmount >= 0 ? "+" : ""}{resultAmount.toLocaleString("ru-RU")}
              </strong>
            </div>
          </div>

          {isSettled ? (
            <p className={isWinner ? "predictionSettlement winText" : "predictionSettlement lossText"}>
              {isWinner ? "Выигрыш начислен" : "Прогноз не сыграл"} · {prediction.settledAt}
            </p>
          ) : isWaiting ? (
            <p className="activePrediction waitingPredictionText">Рынок закрыт. Осталось дождаться расчёта администратором.</p>
          ) : (
            <p className="activePrediction">Рынок ещё открыт · нажми, чтобы открыть детали</p>
          )}
        </div>
      </button>
    );
  }

  function renderTransactions(limit?: number) {
    const items = typeof limit === "number" ? activeUserTransactions.slice(0, limit) : activeUserTransactions;

    if (items.length === 0) {
      return <div className="empty">История баллов появится после первого прогноза, выплаты или возврата.</div>;
    }

    return (
      <div className="transactionList">
        {items.map((transaction) => (
          <div className="transactionItem" key={transaction.id}>
            <div className={`transactionAmount ${transaction.amount >= 0 ? "positiveTransaction" : "negativeTransaction"}`}>
              {transaction.amount >= 0 ? "+" : "−"}{Math.abs(transaction.amount).toLocaleString("ru-RU")}
            </div>
            <div>
              <strong>{transaction.title}</strong>
              <p>{transaction.description}</p>
              <span>{transaction.createdAt}</span>
            </div>
          </div>
        ))}
      </div>
    );
  }


  function renderTournamentPage() {
    const topThree = weeklyStandings.slice(0, 3);
    const remainingRows = weeklyStandings.slice(3, 20);
    const gapToTopThree = activeUserWeeklyRank > 3 && activeUserWeeklyStanding ? Math.max(0, (topThree[2]?.score || 0) - activeUserWeeklyStanding.score + 1) : 0;

    return (
      <section className="tournamentPage pageStack">
        <section className="tournamentHero">
          <div>
            <p className="eyebrow">Недельный турнир</p>
            <h2>Каждую неделю — новый шанс ворваться в топ</h2>
            <p>В зачёт идут только игровые результаты прогнозов за текущую неделю: списания за прогнозы и выплаты по рассчитанным рынкам. Бонусы, рефералка и ручные начисления не влияют на турнир.</p>
          </div>
          <div className="tournamentPeriodCard">
            <span>Период</span>
            <strong>{formatShortDate(currentWeekStart)} — {formatShortDate(currentWeekEnd)}</strong>
            <p>{activeUserWeeklyRank ? `Ты сейчас #${activeUserWeeklyRank}` : "Сделай прогноз, чтобы попасть в рейтинг"}</p>
          </div>
        </section>

        <section className="tournamentUserCard">
          <div>
            <span>Твой результат недели</span>
            <strong>{activeUserWeeklyStanding?.score ? `${activeUserWeeklyStanding.score > 0 ? "+" : ""}${activeUserWeeklyStanding.score.toLocaleString("ru-RU")}` : "0"} баллов</strong>
            <p>{activeUserWeeklyStanding?.predictionsCount || 0} прогнозов · {activeUserWeeklyStanding?.wins || 0} выиграно · выплаты {(activeUserWeeklyStanding?.payouts || 0).toLocaleString("ru-RU")}</p>
          </div>
          {activeUserWeeklyAwards.length > 0 ? (
            <div className="tournamentGap success">Награда недели: <b>+{activeUserWeeklyAwards.reduce((sum, award) => sum + award.rewardAmount, 0).toLocaleString("ru-RU")}</b> баллов 🏆</div>
          ) : gapToTopThree > 0 ? (
            <div className="tournamentGap">До топ-3: <b>{gapToTopThree.toLocaleString("ru-RU")}</b> баллов</div>
          ) : activeUserWeeklyRank > 0 && activeUserWeeklyRank <= 3 ? (
            <div className="tournamentGap success">Ты в топ-3 недели 🔥</div>
          ) : (
            <button onClick={() => setMainView("markets")}>Сделать прогноз</button>
          )}
        </section>

        <section className="tournamentRewardsCard">
          <div className="sectionHeader">
            <div>
              <h2>Награды недели</h2>
              <p>{hasCurrentWeekAwards ? "Награды за эту неделю уже выданы." : "Админ завершает неделю вручную после проверки результатов."}</p>
            </div>
            <span>{hasCurrentWeekAwards ? "Выдано" : "Ожидает"}</span>
          </div>
          <div className="tournamentRewardsGrid">
            <div><b>🥇 1 место</b><strong>+5 000</strong><small>баллов</small></div>
            <div><b>🥈 2 место</b><strong>+3 000</strong><small>баллов</small></div>
            <div><b>🥉 3 место</b><strong>+1 500</strong><small>баллов</small></div>
            <div><b>🎁 Участие</b><strong>+300</strong><small>за 3+ прогноза</small></div>
          </div>
        </section>

        <section className="podiumGrid">
          {topThree.length === 0 ? (
            <div className="empty wideEmpty">Пока в турнире нет результатов. Первый рассчитанный прогноз запустит недельный топ.</div>
          ) : topThree.map((row, index) => (
            <button className={`podiumCard clickableUserCard podiumPlace${index + 1} ${row.user.id === activeUser?.id ? "activePodiumCard" : ""} ${getUserFrameClass(row.user)}`} key={row.user.id} onClick={() => openPublicProfile(row.user.id)}>
              <div className="podiumMedal">#{index + 1}</div>
              <h3>{row.user.name}</h3>
              {getUserActiveTitle(row.user) ? <span className="leaderboardTitle">{getUserActiveTitle(row.user)?.emoji} {getUserActiveTitle(row.user)?.name}</span> : null}
              <strong>{row.score >= 0 ? "+" : ""}{row.score.toLocaleString("ru-RU")}</strong>
              <p>{row.predictionsCount} прогнозов · {row.wins} побед</p>
            </button>
          ))}
        </section>

        <section className="tournamentTableCard">
          <div className="sectionHeader">
            <h2>Топ недели</h2>
            <span>{weeklyStandings.length} участников</span>
          </div>
          <div className="tournamentRows">
            {[...topThree, ...remainingRows].map((row, index) => (
              <button className={`tournamentRow clickableTournamentRow ${row.user.id === activeUser?.id ? "activeTournamentRow" : ""} ${getUserFrameClass(row.user)}`} key={row.user.id} onClick={() => openPublicProfile(row.user.id)}>
                <div className="tournamentRank">#{index + 1}</div>
                <div className="tournamentName"><strong>{row.user.name}</strong>{getUserActiveTitle(row.user) ? <em>{getUserActiveTitle(row.user)?.emoji} {getUserActiveTitle(row.user)?.name}</em> : null}<span>{row.predictionsCount} прогнозов · {row.wins} выиграно</span></div>
                <div className="tournamentScore"><strong>{row.score >= 0 ? "+" : ""}{row.score.toLocaleString("ru-RU")}</strong><span>баллов</span></div>
              </button>
            ))}
          </div>
        </section>

        <section className="tournamentTableCard weeklyAwardsHistoryCard">
          <div className="sectionHeader">
            <h2>История наград</h2>
            <span>{latestWeeklyAwards.length} операций</span>
          </div>
          {latestWeeklyAwards.length === 0 ? (
            <div className="empty">Недельные награды ещё не выдавались.</div>
          ) : (
            <div className="weeklyAwardsList">
              {latestWeeklyAwards.map((award) => (
                <div className={`weeklyAwardItem ${award.userId === activeUser?.id ? "activeWeeklyAwardItem" : ""}`} key={award.id}>
                  <div>
                    <strong>{award.awardType === "top" ? `#${award.place} недели` : "Участие в турнире"}</strong>
                    <span>{award.userName} · {formatDateForDisplay(award.weekStart)} — {formatDateForDisplay(award.weekEnd)}</span>
                  </div>
                  <b>+{award.rewardAmount.toLocaleString("ru-RU")}</b>
                </div>
              ))}
            </div>
          )}
        </section>
      </section>
    );
  }

  function renderMyPredictionsPage() {
    if (!activeUser) {
      return <section className="myPredictionsPage"><div className="empty">Прогнозы пока не загружены.</div></section>;
    }

    const waitingPredictions = activeUserOpenPredictions.filter((prediction) => {
      const market = markets.find((item) => item.id === prediction.marketId);
      return market?.status === "closed";
    });
    const livePredictions = activeUserOpenPredictions.filter((prediction) => {
      const market = markets.find((item) => item.id === prediction.marketId);
      return market?.status !== "closed";
    });
    const wonPredictions = activeUserSettledPredictions.filter((prediction) => prediction.outcome === prediction.resolvedOutcome);
    const lostPredictions = activeUserSettledPredictions.filter((prediction) => prediction.outcome !== prediction.resolvedOutcome);
    const potentialPayout = activeUserOpenPredictions.reduce((sum, prediction) => {
      const market = markets.find((item) => item.id === prediction.marketId);
      return sum + estimatePredictionPayout(market, prediction);
    }, 0);
    const openInvested = activeUserOpenPredictions.reduce((sum, prediction) => sum + prediction.amount, 0);
    const settledResult = activeUserStats.payouts - activeUserStats.invested;
    const potentialResult = potentialPayout - openInvested;

    const tabs: { id: MyPredictionTab; title: string; icon: string; count: number }[] = [
      { id: "active", title: "Активные", icon: "🟢", count: livePredictions.length },
      { id: "waiting", title: "Ждут", icon: "🧮", count: waitingPredictions.length },
      { id: "won", title: "Выиграл", icon: "🏆", count: wonPredictions.length },
      { id: "lost", title: "Проиграл", icon: "📉", count: lostPredictions.length },
      { id: "settled", title: "Заверш.", icon: "✅", count: activeUserSettledPredictions.length },
      { id: "all", title: "Все", icon: "📚", count: activeUserPredictions.length },
    ];

    return (
      <section className="myPredictionsPage gamePredictionsPage">
        <section className="myPredictionsHero gamePredictionsHero">
          <div>
            <p className="eyebrow">Личный портфель</p>
            <h2>Мои прогнозы</h2>
            <p>Следи за активными позициями, ожидаемыми выплатами и результатами. Это твой игровой портфель Forecast Market.</p>
            <div className="predictionHeroActions">
              <button onClick={() => setMainView("markets")}>Сделать ещё прогноз</button>
              <button className="secondaryButton" onClick={() => setMainView("tournament")}>Турнир недели</button>
            </div>
          </div>
          <div className="myPredictionsSummary gamePredictionsSummary">
            <div><span>Активные</span><strong>{livePredictions.length}</strong><small>в игре</small></div>
            <div><span>Ждут</span><strong>{waitingPredictions.length}</strong><small>расчёта</small></div>
            <div><span>Winrate</span><strong>{activeUserStats.winRate}%</strong><small>{activeUserStats.wins}/{activeUserStats.settledCount || 0}</small></div>
            <div><span>Итог</span><strong className={settledResult >= 0 ? "positiveAmount" : "negativeAmount"}>{settledResult >= 0 ? "+" : ""}{settledResult.toLocaleString("ru-RU")}</strong><small>по всем</small></div>
          </div>
        </section>

        <section className="predictionPortfolioGrid">
          <article>
            <span>Вложено активно</span>
            <strong>{openInvested.toLocaleString("ru-RU")}</strong>
            <small>баллов сейчас в игре</small>
          </article>
          <article>
            <span>Потенциальная выплата</span>
            <strong>{potentialPayout.toLocaleString("ru-RU")}</strong>
            <small>если активные прогнозы сыграют</small>
          </article>
          <article>
            <span>Потенциальный итог</span>
            <strong className={potentialResult >= 0 ? "positiveAmount" : "negativeAmount"}>{potentialResult >= 0 ? "+" : ""}{potentialResult.toLocaleString("ru-RU")}</strong>
            <small>по активным позициям</small>
          </article>
          <article>
            <span>Баланс</span>
            <strong>{activeUser.balance.toLocaleString("ru-RU")}</strong>
            <small>доступно для прогнозов</small>
          </article>
        </section>

        <section className="predictionTabs gamePredictionTabs">
          {tabs.map((tab) => (
            <button key={tab.id} className={myPredictionTab === tab.id ? "activePredictionTab" : ""} onClick={() => setMyPredictionTab(tab.id)}>
              <span>{tab.icon}</span>
              <strong>{tab.title}</strong>
              <small>{tab.count}</small>
            </button>
          ))}
        </section>

        <section className="myPredictionsLayout gamePredictionsLayout">
          <div className="myPredictionsListCard gamePredictionsListCard">
            <div className="sectionHeader">
              <div>
                <h2>Позиции</h2>
                <p>{myPredictionsByTab.length} прогнозов в выбранном разделе</p>
              </div>
              <span>{myPredictionsByTab.length}</span>
            </div>
            {myPredictionsByTab.length === 0 ? (
              <div className="empty emptyActionState">
                <strong>Здесь пока пусто</strong>
                <p>Выбери интересный рынок, сделай прогноз и он появится в этом разделе.</p>
                <button onClick={() => setMainView("markets")}>Перейти к рынкам</button>
              </div>
            ) : (
              <div className="myPredictionList gamePredictionList">
                {myPredictionsByTab.map((prediction) => renderPredictionCard(prediction, "full"))}
              </div>
            )}
          </div>

          <aside className="balanceHistoryCard gameBalanceHistoryCard">
            <div className="sectionHeader">
              <div>
                <h2>История баллов</h2>
                <p>Последние операции</p>
              </div>
              <span>{activeUserTransactions.length}</span>
            </div>
            {renderTransactions(12)}
          </aside>
        </section>
      </section>
    );
  }


  function getMarketBadges(market: Market, predictionCount: number, hasActivePrediction: boolean): MarketBadge[] {
    const badges: MarketBadge[] = [];
    const createdAt = market.createdAt ? new Date(market.createdAt).getTime() : 0;
    const closesAt = market.closesAt ? new Date(market.closesAt).getTime() : 0;
    const now = Date.now();
    const hoursToClose = closesAt > now ? (closesAt - now) / 36e5 : Number.POSITIVE_INFINITY;
    const daysSinceCreated = createdAt > 0 ? (now - createdAt) / 864e5 : Number.POSITIVE_INFINITY;
    const isInterest = selectedInterestCategories.includes(market.category || "Без категории");

    if (hasActivePrediction) {
      badges.push({ label: "Мой прогноз", emoji: "🎯", tone: "mine" });
    }

    if (market.status === "closed") {
      badges.push({ label: "Ждёт расчёта", emoji: "🧮", tone: "closed" });
    }

    if (market.status === "open" && predictionCount >= 3) {
      badges.push({ label: "Горячий", emoji: "🔥", tone: "hot" });
    }

    if (market.status === "open" && hoursToClose <= 48) {
      badges.push({ label: "Скоро", emoji: "⏳", tone: "soon" });
    }

    if (market.status === "open" && daysSinceCreated <= 3) {
      badges.push({ label: "Новый", emoji: "✨", tone: "new" });
    }

    if (isInterest) {
      badges.push({ label: "Твой интерес", emoji: "💚", tone: "interest" });
    }

    if (isPolymarketSource(market.source)) {
      badges.push({ label: "Polymarket", emoji: "🌍", tone: "poly" });
    }

    return badges.slice(0, 3);
  }

  function getMarketActionHint(market: Market, yesProbability: number, predictionCount: number, hasActivePrediction: boolean) {
    if (hasActivePrediction) return "Прогноз уже сделан — следи за результатом.";
    if (market.status === "closed") return "Рынок закрыт и ждёт расчёта.";
    if (market.status === "resolved") return "Рынок уже рассчитан.";
    if (predictionCount === 0) return "Стань первым, кто сделает прогноз.";
    if (yesProbability >= 65) return "Большинство выбирает «Да». Проверь, согласен ли ты.";
    if (yesProbability <= 35) return "Большинство сомневается в «Да». Можно сыграть против толпы.";
    return "Мнения разделились почти поровну — хороший момент для прогноза.";
  }

  function renderMarketSignal(market: Market) {
    const yesProbability = getYesProbability(market);
    return (
      <div className="signalBar" aria-label={`Вероятность Да ${yesProbability}%`}>
        <span style={{ width: `${yesProbability}%` }} />
      </div>
    );
  }

  function renderMarketMiniRow(market: Market, context: "category" | "compact" = "category") {
    const yesProbability = getYesProbability(market);
    const marketPredictions = predictions.filter((prediction) => prediction.marketId === market.id);
    const marketComments = comments.filter((comment) => comment.marketId === market.id);
    const activePrediction = activeUserPredictions.find((prediction) => prediction.marketId === market.id && !prediction.settledAt);
    const isFavorite = favoriteMarketIds.includes(market.id);
    const isImported = isPolymarketSource(market.source);
    const stakeValue = getStakeInputValue(amountByMarket[market.id]);
    const stakeAmount = parseStakeAmount(stakeValue);
    const isTradable = isMarketTradable(market);
    const yesActionKey = `${market.id}:yes`;
    const noActionKey = `${market.id}:no`;
    const isBuyingThisMarket = buyingPredictionKey?.startsWith(`${market.id}:`) || false;
    const marketBadges = getMarketBadges(market, marketPredictions.length, Boolean(activePrediction));
    const actionHint = getMarketActionHint(market, yesProbability, marketPredictions.length, Boolean(activePrediction));

    return (
      <article className={`marketMiniRow quickTradeMarketRow ${context === "compact" ? "marketMiniRowCompact" : ""}`} key={market.id}>
        <button className="marketMiniMain" onClick={() => openMarketDetails(market.id)}>
          <div className="marketMiniTop">
            <span className="miniCategory">{market.category}</span>
            {isImported && <span className="miniSource">Polymarket</span>}
            <span className={`miniStatus ${getMarketStatusClass(market)}`}>{getMarketStatusText(market)}</span>
          </div>
          <strong>{market.question}</strong>
          <div className="miniMetaLine">
            <span>{getMarketCloseLabel(market)}</span>
            <span>{marketPredictions.length} прогнозов</span>
            <span>{marketComments.length} комм.</span>
            {activePrediction && <span className="miniMine">Мой: {getOutcomeText(activePrediction.outcome)}</span>}
          </div>
          {renderMarketSignal(market)}
          {marketBadges.length > 0 && (
            <div className="marketBadgeRow">
              {marketBadges.map((badge) => (
                <span className={`marketMoodBadge marketMoodBadge-${badge.tone}`} key={`${market.id}-${badge.label}`}>
                  {badge.emoji} {badge.label}
                </span>
              ))}
            </div>
          )}
          <em className="marketActionHint">{actionHint}</em>
        </button>

        <div className="marketMiniOdds">
          <button onClick={() => openMarketDetails(market.id)}>
            <span>Да</span>
            <b>{yesProbability}%</b>
          </button>
          <button onClick={() => openMarketDetails(market.id)}>
            <span>Нет</span>
            <b>{100 - yesProbability}%</b>
          </button>
          <button
            className={`miniFavorite ${isFavorite ? "activeFavorite" : ""}`}
            onClick={() => toggleFavoriteMarket(market.id)}
            aria-label={isFavorite ? "Убрать из избранного" : "Добавить в избранное"}
          >
            {isFavorite ? "★" : "☆"}
          </button>
        </div>

        {activePrediction ? (
          <div className="quickBetAccepted">
            <span>Ты выбрал {getOutcomeText(activePrediction.outcome)}</span>
            <strong>{activePrediction.amount.toLocaleString("ru-RU")} б.</strong>
          </div>
        ) : isTradable ? (
          <div className="quickBetPanel">
            <div className="quickBetAmountRow">
              <label>
                <span>Сумма</span>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="любая"
                  value={stakeValue}
                  onChange={(event) => updateStakeAmount(market.id, event.target.value)}
                  onFocus={(event) => event.currentTarget.select()}
                />
              </label>
              <div className="quickBetChips">
                {[100, 500, 1000].map((amount) => (
                  <button key={amount} type="button" onClick={() => setQuickAmount(market.id, amount)}>
                    {amount}
                  </button>
                ))}
                <button type="button" onClick={() => setQuickAmount(market.id, activeUser?.balance || 0)}>
                  Всё
                </button>
              </div>
            </div>

            <div className="quickBetPreviewRow">
              <span>Потенциально</span>
              <strong>{estimateQuickPredictionPayout(market, "yes", stakeAmount).toLocaleString("ru-RU")} б. за Да</strong>
              <strong>{estimateQuickPredictionPayout(market, "no", stakeAmount).toLocaleString("ru-RU")} б. за Нет</strong>
            </div>

            <div className="quickBetButtons">
              <button
                className="quickYesButton"
                disabled={isBuyingThisMarket || stakeAmount <= 0}
                onClick={() => openPredictionConfirmation(market, "yes")}
              >
                {buyingPredictionKey === yesActionKey ? "Покупаем..." : "Да"}
              </button>
              <button
                className="quickNoButton"
                disabled={isBuyingThisMarket || stakeAmount <= 0}
                onClick={() => openPredictionConfirmation(market, "no")}
              >
                {buyingPredictionKey === noActionKey ? "Покупаем..." : "Нет"}
              </button>
            </div>
          </div>
        ) : (
          <div className="quickBetClosed">
            {market.status === "closed" ? "Рынок ждёт расчёта" : "Рынок завершён"}
          </div>
        )}
      </article>
    );
  }



  function renderCategoryHub(group: { category: string; markets: Market[]; openCount: number; importedCount: number }, index: number) {
    const visibleMarkets = group.markets.slice(0, 4);

    return (
      <details className="categoryHub" key={group.category} open={index < 2}>
        <summary className="categoryHubSummary">
          <div className="categoryHubTitleBlock">
            <span className="categoryEmoji">{index % 4 === 0 ? "⚡" : index % 4 === 1 ? "🎯" : index % 4 === 2 ? "🌍" : "📈"}</span>
            <div>
              <strong>{group.category}</strong>
              <p>{group.openCount} открыто · {group.markets.length} всего{group.importedCount ? ` · ${group.importedCount} Polymarket` : ""}</p>
            </div>
          </div>
          <span className="categoryHubChevron">⌄</span>
        </summary>
        <div className="categoryHubBody">
          {visibleMarkets.map((market) => renderMarketMiniRow(market))}
          {group.markets.length > visibleMarkets.length && (
            <button
              className="showCategoryButton"
              onClick={() => {
                setSelectedCategory(group.category);
                setMarketSearch("");
                setStatusFilter("all");
                setMainView("search");
              }}
            >
              Показать все {group.markets.length} событий
            </button>
          )}
        </div>
      </details>
    );
  }


  function renderInterestPicker(mode: "home" | "profile" = "home") {
    const interestCategories = categories.filter((category) => category !== "Все");
    const selectedCount = selectedInterestCategories.length;

    if (interestCategories.length === 0) return null;

    return (
      <section className={`interestPickerCard ${mode === "profile" ? "profileInterestPickerCard" : ""}`}>
        <div className="interestPickerHeader">
          <div>
            <span className="interestEyebrow">Персональная лента</span>
            <h2>Выбери интересы</h2>
            <p>
              {selectedCount > 0
                ? `Выбрано ${selectedCount}. Блок «Для тебя» теперь сначала показывает эти темы.`
                : "Отметь темы, которые тебе интересны — и подборка «Для тебя» станет точнее."}
            </p>
          </div>
          {selectedCount > 0 ? (
            <button onClick={resetInterestCategories}>Сбросить</button>
          ) : (
            <button onClick={() => setMainView("search")}>Смотреть все</button>
          )}
        </div>

        <div
          className="interestChipGrid"
          data-swipe-rail="true"
          onTouchStartCapture={handleSwipeRailTouchStart}
          onTouchMoveCapture={handleSwipeRailTouchMove}
          onTouchEndCapture={handleSwipeRailTouchEnd}
          onTouchCancelCapture={handleSwipeRailTouchEnd}
          onClickCapture={handleSwipeRailClickCapture}
        >
          {interestCategories.map((category, index) => {
            const isActive = selectedInterestCategories.includes(category);
            const openCount = markets.filter((market) => market.status === "open" && market.category === category).length;

            return (
              <button className={`interestChip ${isActive ? "activeInterestChip" : ""}`} key={category} onClick={() => toggleInterestCategory(category)}>
                <span>{getInterestCategoryEmoji(category, index)}</span>
                <strong>{category}</strong>
                <small>{openCount} открыто</small>
              </button>
            );
          })}
        </div>
      </section>
    );
  }

  function renderGameShelf(
    title: string,
    subtitle: string,
    icon: string,
    marketsToRender: Market[],
    actionLabel: string,
    onAction: () => void,
    accent: "hot" | "soon" | "forYou" | "poly" | "new" = "hot",
  ) {
    if (marketsToRender.length === 0) return null;

    return (
      <section className={`gameShelf gameShelf-${accent}`}>
        <div className="gameShelfHeader">
          <div>
            <span className="gameShelfIcon">{icon}</span>
            <div>
              <h2>{title}</h2>
              <p>{subtitle}</p>
            </div>
          </div>
          <button onClick={onAction}>{actionLabel}</button>
        </div>
        <div
          className="gameShelfList"
          data-swipe-rail="true"
          onTouchStartCapture={handleSwipeRailTouchStart}
          onTouchMoveCapture={handleSwipeRailTouchMove}
          onTouchEndCapture={handleSwipeRailTouchEnd}
          onTouchCancelCapture={handleSwipeRailTouchEnd}
          onClickCapture={handleSwipeRailClickCapture}
        >
          {marketsToRender.map((market) => renderMarketMiniRow(market, "compact"))}
        </div>
      </section>
    );
  }

  function renderDailyBonusCard(mode: "home" | "profile" = "home") {
    const canClaim = dailyBonusInfo.canClaim;
    const countdown = formatBonusCountdown(dailyBonusInfo.remainingMs);

    return (
      <article className={`dailyBonusCard ${mode === "profile" ? "profileDailyBonusCard" : ""}`}>
        <div className="dailyBonusGlow" aria-hidden="true" />
        <div className="dailyBonusTop">
          <span className="dailyBonusIcon">🎁</span>
          <div>
            <p className="eyebrow">Ежедневный бонус</p>
            <h2>+{activeDailyBonusAmount.toLocaleString("ru-RU")} баллов</h2>
          </div>
        </div>
        <p>Забирай бонус раз в 24 часа. Чем длиннее серия, тем больше ежедневная награда.</p>
        <div className="dailyStreakRow">
          <span>🔥 {getDailyStreakLabel(activeUser)}</span>
          <strong>Рекорд: {activeUser?.bestDailyBonusStreak || 0}</strong>
        </div>
        <div className="dailyBonusProgress" aria-label="Прогресс до следующего бонуса">
          <span style={{ width: `${dailyBonusInfo.progress}%` }} />
        </div>
        <div className="dailyBonusFooter">
          <small>{canClaim ? "Бонус готов" : `Следующий через ${countdown}`}</small>
          <button disabled={!canClaim || isDailyBonusClaiming} onClick={() => void claimDailyBonus()}>
            {isDailyBonusClaiming ? "Начисляем..." : canClaim ? "Забрать" : "Ждём"}
          </button>
        </div>
      </article>
    );
  }


  function renderReferralCard() {
    if (!activeUser) return null;

    const qualified = activeUserReferralStats.qualified;
    const pending = activeUserReferralStats.pending;
    const preview = activeUserReferrals.slice(0, 4);

    return (
      <article className="referralCard profileCard">
        <div className="referralGlow" aria-hidden="true" />
        <div className="sectionHeader referralHeader">
          <div>
            <p className="eyebrow">Пригласи друга</p>
            <h2>+1 000 баллов за друга</h2>
          </div>
          <span className="referralEmoji">🤝</span>
        </div>
        <p>Отправь ссылку другу. Когда он зайдёт через Telegram Mini App и сделает первый прогноз, ты получишь +1 000 баллов, а друг — приветственный бонус +500.</p>
        <div className="referralStatsGrid">
          <div><span>Приглашено</span><strong>{activeUserReferrals.length}</strong></div>
          <div><span>Сделали прогноз</span><strong>{qualified.length}</strong></div>
          <div><span>Ожидают</span><strong>{pending.length}</strong></div>
          <div><span>Получено</span><strong>{activeUserReferralStats.earned.toLocaleString("ru-RU")}</strong></div>
        </div>
        <button className="primaryButton referralShareButton" onClick={() => void shareReferral()}>Пригласить друга</button>
        {preview.length > 0 ? (
          <div className="referralList">
            {preview.map((referral) => (
              <div className="referralListItem" key={referral.id}>
                <div>
                  <strong>{referral.referredName}</strong>
                  <span>{referral.status === "qualified" ? "Сделал первый прогноз" : "Ещё не сделал прогноз"}</span>
                </div>
                <b className={referral.status === "qualified" ? "referralQualified" : "referralPending"}>
                  {referral.status === "qualified" ? "+1 000" : "⏳"}
                </b>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty compactEmpty">Пока нет приглашённых друзей. Поделись ссылкой — и начни собирать бонусы.</div>
        )}
      </article>
    );
  }

  function renderRulesContent() {
    return (
      <div className="rulesContent">
        <div className="rulesIntro">
          <span>⚖️</span>
          <div>
            <h2>Правила Forecast Market</h2>
            <p>Простая игра прогнозов: выбираешь исход, используешь игровые баллы и соревнуешься в рейтинге.</p>
          </div>
        </div>
        <div className="rulesGrid">
          <div><b>1</b><span>Все прогнозы делаются только за игровые баллы.</span></div>
          <div><b>2</b><span>Баллы не являются деньгами и не имеют имущественной ценности.</span></div>
          <div><b>3</b><span>Баллы нельзя купить, продать, передать другому человеку или вывести.</span></div>
          <div><b>4</b><span>После закрытия рынка администратор рассчитывает результат: Да или Нет.</span></div>
          <div><b>5</b><span>События Polymarket используются только как идеи для развлекательных прогнозов.</span></div>
          <div><b>6</b><span>Forecast Market не является букмекерской конторой, казино или сервисом ставок на деньги.</span></div>
        </div>
      </div>
    );
  }

  function renderOnboardingModal() {
    if (!isOnboardingOpen) return null;

    return (
      <div className="modalOverlay onboardingOverlay">
        <section className="onboardingModal">
          <div className="onboardingHero">
            <span>📊</span>
            <div>
              <p className="eyebrow">Добро пожаловать</p>
              <h2>Forecast Market — игра прогнозов</h2>
              <p>Выбирай события, делай прогнозы за игровые баллы и соревнуйся с друзьями.</p>
            </div>
          </div>
          <div className="onboardingSteps">
            <div><b>1</b><span>Открой рынок</span></div>
            <div><b>2</b><span>Выбери Да или Нет</span></div>
            <div><b>3</b><span>Дождись расчёта</span></div>
          </div>
          <div className="onboardingDisclaimer">
            Игровые баллы не являются деньгами, не покупаются, не продаются, не передаются и не выводятся.
          </div>
          <div className="onboardingActions">
            <button className="secondaryButton" onClick={() => setIsRulesOpen(true)}>Правила</button>
            <button onClick={closeOnboarding}>Понятно, начать</button>
          </div>
        </section>
      </div>
    );
  }

  function renderRulesModal() {
    if (!isRulesOpen) return null;

    return (
      <div className="modalOverlay rulesModalOverlay" role="dialog" aria-modal="true" aria-label="Правила Forecast Market">
        <button className="modalBackdropButton" aria-label="Закрыть правила" onClick={() => setIsRulesOpen(false)} />
        <section className="rulesModal modalScrollableSheet">
          <div className="modalSheetTopBar">
            <span>Правила Forecast Market</span>
            <button className="modalCloseButton" onClick={() => setIsRulesOpen(false)}>×</button>
          </div>
          {renderRulesContent()}
          <button className="modalBottomCloseButton" onClick={() => setIsRulesOpen(false)}>Закрыть правила</button>
        </section>
      </div>
    );
  }

  function dismissActivityItem(activityId: string) {
    setDismissedActivityIds((currentIds) => (
      currentIds.includes(activityId) ? currentIds : [...currentIds, activityId].slice(-120)
    ));
  }

  function clearActivityItems() {
    const idsToDismiss = visibleActivityItems.filter((item) => item.tone !== "calm").map((item) => item.id);

    if (idsToDismiss.length === 0) {
      setIsActivityOpen(false);
      return;
    }

    setDismissedActivityIds((currentIds) => Array.from(new Set([...currentIds, ...idsToDismiss])).slice(-120));
    sendHaptic("medium");
    showToast("События очищены");
  }

  function openActivityItem(item: ActivityItem) {
    if (item.tone !== "calm") {
      dismissActivityItem(item.id);
    }

    setIsActivityOpen(false);
    sendHaptic("light");
    item.action();
  }

  function renderPredictionConfirmationModal() {
    if (!predictionConfirmation || !activeUser) return null;

    const market = markets.find((item) => item.id === predictionConfirmation.marketId);
    if (!market) return null;

    const selectedProbability = predictionConfirmation.outcome === "yes"
      ? getYesProbability(market)
      : 100 - getYesProbability(market);
    const potentialPayout = estimateQuickPredictionPayout(market, predictionConfirmation.outcome, predictionConfirmation.amount);
    const potentialProfit = potentialPayout - predictionConfirmation.amount;
    const balanceAfter = Math.max(0, activeUser.balance - predictionConfirmation.amount);
    const actionKey = `${market.id}:${predictionConfirmation.outcome}`;
    const isConfirming = buyingPredictionKey === actionKey;

    return (
      <div className="predictionConfirmOverlay" role="dialog" aria-modal="true" aria-label="Подтверждение прогноза">
        <button className="predictionConfirmBackdrop" aria-label="Отменить прогноз" onClick={() => setPredictionConfirmation(null)} />
        <section className={`predictionConfirmPanel predictionConfirm-${predictionConfirmation.outcome}`}>
          <div className="predictionConfirmHeader">
            <div>
              <p className="eyebrow">Подтверждение прогноза</p>
              <h2>Проверь детали перед покупкой</h2>
            </div>
            <button className="predictionConfirmClose" onClick={() => setPredictionConfirmation(null)} aria-label="Закрыть">×</button>
          </div>

          <div className="predictionConfirmMarket">
            <span>{market.category} · {getMarketCloseLabel(market)}</span>
            <strong>{market.question}</strong>
          </div>

          <div className="predictionConfirmChoice">
            <div className={predictionConfirmation.outcome === "yes" ? "confirmChoiceYes" : "confirmChoiceNo"}>
              <span>Ты выбираешь</span>
              <strong>{getOutcomeText(predictionConfirmation.outcome)}</strong>
            </div>
            <div>
              <span>Текущая вероятность</span>
              <strong>{selectedProbability}%</strong>
            </div>
          </div>

          <div className="predictionConfirmStats">
            <div>
              <span>Сумма</span>
              <strong>{predictionConfirmation.amount.toLocaleString("ru-RU")} б.</strong>
            </div>
            <div>
              <span>Потенциальная выплата</span>
              <strong>{potentialPayout.toLocaleString("ru-RU")} б.</strong>
            </div>
            <div>
              <span>Потенциальная прибыль</span>
              <strong className={potentialProfit >= 0 ? "positiveAmount" : "negativeAmount"}>
                {potentialProfit >= 0 ? "+" : ""}{potentialProfit.toLocaleString("ru-RU")} б.
              </strong>
            </div>
            <div>
              <span>Баланс после покупки</span>
              <strong>{balanceAfter.toLocaleString("ru-RU")} б.</strong>
            </div>
          </div>

          <div className="predictionConfirmDisclaimer">
            <span>ℹ️</span>
            <p>Баллы игровые: они не являются деньгами, не покупаются, не продаются, не передаются и не выводятся.</p>
          </div>

          <div className="predictionConfirmActions">
            <button
              className={predictionConfirmation.outcome === "yes" ? "confirmPredictionYes" : "confirmPredictionNo"}
              disabled={isConfirming}
              onClick={() => void buyPrediction(market, predictionConfirmation.outcome, predictionConfirmation.amount)}
            >
              {isConfirming ? "Покупаем прогноз..." : "Подтвердить прогноз"}
            </button>
            <button className="secondaryButton" disabled={isConfirming} onClick={() => setPredictionConfirmation(null)}>
              Отмена
            </button>
          </div>
        </section>
      </div>
    );
  }

  function renderActivityCenter() {
    if (!isActivityOpen) return null;

    return (
      <div className="activityOverlay" role="dialog" aria-modal="true" aria-label="Центр событий">
        <button className="activityOverlayBackdrop" aria-label="Закрыть центр событий" onClick={() => setIsActivityOpen(false)} />
        <section className="activityPanel">
          <div className="activityPanelHeader">
            <div>
              <p className="eyebrow">Центр событий</p>
              <h2>Что требует внимания</h2>
              <span>{activityBadgeCount > 0 ? `${activityBadgeCount} важных событий` : "Новых задач нет"}</span>
            </div>
            <div className="activityPanelHeaderActions">
              {activityBadgeCount > 0 && (
                <button className="activityClearButton" onClick={clearActivityItems}>Очистить</button>
              )}
              <button className="activityCloseButton" onClick={() => setIsActivityOpen(false)}>×</button>
            </div>
          </div>

          <div className="activityList">
            {activityDisplayItems.map((item) => (
              <article className={`activityItem activityItem-${item.tone}`} key={item.id}>
                <div className="activityIcon">{item.emoji}</div>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.text}</p>
                </div>
                <div className="activityItemActions">
                  <button onClick={() => openActivityItem(item)}>
                    {item.actionLabel}
                  </button>
                  {item.tone !== "calm" && (
                    <button className="activityDismissButton" onClick={() => dismissActivityItem(item.id)}>
                      Скрыть
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>

          <div className="activityPanelFooter">
            <button onClick={() => {
              setIsActivityOpen(false);
              setMainView("predictions");
            }}>
              Мои прогнозы
            </button>
            <button className="secondaryButton" onClick={() => {
              setIsActivityOpen(false);
              setMainView("markets");
            }}>
              Главная
            </button>
            {activityBadgeCount > 0 && (
              <button className="secondaryButton" onClick={clearActivityItems}>
                Очистить всё
              </button>
            )}
            <button className="secondaryButton" onClick={() => setIsActivityOpen(false)}>
              Закрыть
            </button>
          </div>
        </section>
      </div>
    );
  }

  function renderDailyMissionsCard(context: "home" | "profile" = "home") {
    const progress = dailyMissions.length > 0 ? Math.round((completedDailyMissionsCount / dailyMissions.length) * 100) : 0;
    const compact = context === "home";

    return (
      <section className={`dailyMissionsCard dailyMissionsCard-${context}`}>
        <div className="dailyMissionsHeader">
          <div>
            <p className="eyebrow">Задания дня</p>
            <h2>Выполни миссии и забери награды</h2>
            <span>{completedDailyMissionsCount} из {dailyMissions.length} выполнено · {claimedDailyMissionsCount} наград получено</span>
          </div>
          <strong>{progress}%</strong>
        </div>

        <div className="dailyMissionProgress">
          <span style={{ width: `${progress}%` }} />
        </div>

        <div className="dailyMissionList">
          {(compact ? dailyMissions.slice(0, 5) : dailyMissions).map((mission) => {
            const canClaimReward = mission.completed && !mission.claimed && mission.rewardAmount > 0;
            const isClaimingMission = claimingDailyMissionId === mission.id;
            const buttonLabel = mission.claimed
              ? "Получено"
              : canClaimReward
                ? isClaimingMission ? "Начисляем..." : "Забрать"
                : mission.completed ? "Открыть" : mission.actionLabel;

            return (
              <article className={`dailyMissionItem ${mission.completed ? "completedDailyMission" : ""} ${mission.claimed ? "claimedDailyMission" : ""}`} key={mission.id}>
                <div className="dailyMissionIcon">{mission.claimed ? "🏅" : mission.icon}</div>
                <div>
                  <strong>{mission.title}</strong>
                  <p>{mission.text}</p>
                  <small>{mission.claimed ? "Награда получена" : mission.reward}</small>
                </div>
                <button
                  className={canClaimReward ? "claimMissionButton" : ""}
                  disabled={mission.claimed || isClaimingMission}
                  onClick={() => {
                    if (canClaimReward) void claimDailyMissionReward(mission.id);
                    else mission.action();
                  }}
                >
                  {buttonLabel}
                </button>
              </article>
            );
          })}
        </div>
      </section>
    );
  }

  function renderHomePage() {
    const topLeaderboard = leaderboard.slice(0, isTelegram ? 3 : 5);
    const quickPredictions = activeUserOpenPredictions.slice(0, 3);
    const hotMarkets = popularMarkets.length > 0 ? popularMarkets.slice(0, 4) : feedMarkets.filter((market) => market.status === "open").slice(0, 4);
    const playNowMarkets = forYouMarkets.length > 0 ? forYouMarkets : recommendedMarkets;
    const heroMarket = hotMarkets[0];
    const waitingMyPredictionsCount = activeUserPredictions.filter((prediction) => {
      const market = markets.find((item) => item.id === prediction.marketId);
      return !prediction.settledAt && market?.status === "closed";
    }).length;
    const todayGameSummary = [
      {
        icon: "🔥",
        label: "Горячие",
        value: hotMarkets.length,
        text: "рынков в игре",
        action: () => setMainView("search"),
        tone: "hot",
      },
      {
        icon: "⏳",
        label: "Скоро закроются",
        value: soonClosingMarkets.length,
        text: "успей выбрать исход",
        action: () => {
          setStatusFilter("open");
          setSortMode("newest");
          setMainView("search");
        },
        tone: "soon",
      },
      {
        icon: "🎯",
        label: "Ждут результата",
        value: waitingMyPredictionsCount,
        text: "твоих прогнозов",
        action: () => setMainView("predictions"),
        tone: "target",
      },
      {
        icon: dailyBonusInfo.canClaim ? "🎁" : "⏱️",
        label: "Бонус",
        value: dailyBonusInfo.canClaim ? `+${activeDailyBonusAmount.toLocaleString("ru-RU")}` : "24ч",
        text: dailyBonusInfo.canClaim ? "можно забрать" : `через ${formatBonusCountdown(dailyBonusInfo.remainingMs)}`,
        action: () => {
          if (dailyBonusInfo.canClaim) void claimDailyBonus();
          else setMainView("profile");
        },
        tone: dailyBonusInfo.canClaim ? "bonus" : "calm",
      },
    ];

    return (
      <section className="discoveryPage gameHomePage">
        {isAdmin && (
          <section className="adminHomeShortcut">
            <div>
              <strong>Админ-центр</strong>
              <span>{pendingSuggestions.length} заявок · {closedMarketsCount} рынков ждут расчёта · {importedOpenCount} импортированных открыто</span>
            </div>
            <button onClick={() => setMainView("admin")}>Открыть админку</button>
          </section>
        )}

        <section className="gameHomeHero">
          <div className="gameHomeHeroText">
            <span className="playBadge">🎮 Главный сценарий</span>
            <h2>Выбери событие и сделай прогноз</h2>
            <p>На первом экране только самое важное: горячий рынок, быстрые действия и понятный путь к прогнозу.</p>
            <div className="gameHomeActions">
              <button onClick={() => setMainView("search")}>Выбрать рынок</button>
              <button className="secondaryButton" onClick={() => setMainView("predictions")}>Мои прогнозы</button>
            </div>
          </div>

          {heroMarket ? (
            <article className="heroPlayCard">
              <div className="heroPlayTop">
                <span>🔥 Горячий рынок</span>
                <b>{getYesProbability(heroMarket)}% Да</b>
              </div>
              <button onClick={() => openMarketDetails(heroMarket.id)}>{heroMarket.question}</button>
              {renderMarketSignal(heroMarket)}
              <div className="heroPlayFooter">
                <span>{heroMarket.category}</span>
                <span>{getMarketCloseLabel(heroMarket)}</span>
              </div>
            </article>
          ) : (
            renderDailyBonusCard("home")
          )}
        </section>

        <section className="todayInGameCard">
          <div className="todayInGameHeader">
            <div>
              <span className="todayEyebrow">Сегодня в игре</span>
              <h2>Что важно прямо сейчас</h2>
              <p>Короткий обзор без лишнего шума: рынки, прогнозы, бонус и дедлайны.</p>
            </div>
            <button onClick={() => setMainView("search")}>Открыть все рынки</button>
          </div>

          <div className="todayInGameGrid">
            {todayGameSummary.map((item) => (
              <button className={`todayInGameItem todayInGameItem-${item.tone}`} key={item.label} onClick={item.action}>
                <span className="todayIcon">{item.icon}</span>
                <span className="todayLabel">{item.label}</span>
                <strong>{item.value}</strong>
                <small>{item.text}</small>
              </button>
            ))}
          </div>
        </section>

        <section className="homePrimaryActionStrip" aria-label="Быстрые действия">
          <button className="homePrimaryActionCard homePrimaryActionCard-main" onClick={() => setMainView("search")}>
            <span>🎯</span>
            <strong>Сделать прогноз</strong>
            <small>Открыть рынки</small>
          </button>
          <button className="homePrimaryActionCard" onClick={() => setMainView("predictions")}>
            <span>📌</span>
            <strong>{activeUserOpenPredictions.length}</strong>
            <small>активных прогнозов</small>
          </button>
          <button className="homePrimaryActionCard" onClick={() => {
            if (dailyBonusInfo.canClaim) void claimDailyBonus();
            else setMainView("profile");
          }}>
            <span>{dailyBonusInfo.canClaim ? "🎁" : "⏱️"}</span>
            <strong>{dailyBonusInfo.canClaim ? `+${activeDailyBonusAmount.toLocaleString("ru-RU")}` : formatBonusCountdown(dailyBonusInfo.remainingMs)}</strong>
            <small>{dailyBonusInfo.canClaim ? "забрать бонус" : "до бонуса"}</small>
          </button>
          <button className="homePrimaryActionCard" onClick={() => {
            setProfileTab("social");
            setMainView("profile");
          }}>
            <span>👥</span>
            <strong>{followingActivityItems.length}</strong>
            <small>событий подписок</small>
          </button>
        </section>

        {renderDailyMissionsCard("home")}
        {renderFollowingActivityFeed("home")}

        {renderInterestPicker("home")}

        <section className="gameQuickGrid">
          {renderDailyBonusCard("home")}

          <div className="quickPanel quickPanelPredictions">
            <div className="sectionHeader">
              <h2>Мои прогнозы</h2>
              <button onClick={() => setMainView("predictions")}>Все</button>
            </div>
            {quickPredictions.length === 0 ? (
              <div className="miniEmptyState">
                <strong>Активных прогнозов нет</strong>
                <p>Выбери рынок и сделай первый прогноз за игровые баллы.</p>
              </div>
            ) : (
              <div className="quickPredictionStack">
                {quickPredictions.map((prediction) => renderPredictionCard(prediction))}
              </div>
            )}
          </div>

          <div className="quickPanel quickPanelLeaderboard">
            <div className="sectionHeader">
              <h2>Лидеры</h2>
              <button onClick={() => setMainView("profile")}>Профиль</button>
            </div>
            <div className="leaderboardList compactLeaderboardList">
              {topLeaderboard.map((user, index) => (
                <button className={`leaderboardItem clickableUserCard ${user.id === activeUser?.id ? "activeLeaderboardItem" : ""} ${getUserFrameClass(user)}`} key={user.id} onClick={() => openPublicProfile(user.id)}>
                  <div className="place">#{index + 1}</div>
                  <div><strong>{user.name}</strong>{getUserActiveTitle(user) ? <span className="leaderboardTitle">{getUserActiveTitle(user)?.emoji} {getUserActiveTitle(user)?.name}</span> : null}<p>{user.balance.toLocaleString("ru-RU")} баллов</p></div>
                </button>
              ))}
            </div>
          </div>

          <div className="quickPanel quickPanelTournament">
            <div className="sectionHeader">
              <h2>Турнир недели</h2>
              <button onClick={() => setMainView("tournament")}>Открыть</button>
            </div>
            {activeUserWeeklyStanding ? (
              <div className="weeklyMiniCard">
                <strong>Ты #{activeUserWeeklyRank || "—"}</strong>
                <p>{activeUserWeeklyStanding.score >= 0 ? "+" : ""}{activeUserWeeklyStanding.score.toLocaleString("ru-RU")} баллов за неделю</p>
                <span>{formatShortDate(currentWeekStart)} — {formatShortDate(currentWeekEnd)}</span>
              </div>
            ) : (
              <div className="miniEmptyState"><strong>Турнир ждёт тебя</strong><p>Сделай прогноз и появись в недельном топе.</p></div>
            )}
          </div>
        </section>

        <section className="marketDashboardStrip redesignedDashboardStrip gameStatsStrip">
          <div><span>Открыто</span><strong>{openMarketsCount}</strong></div>
          <div><span>Ждут расчёта</span><strong>{closedMarketsCount}</strong></div>
          <div><span>Событий</span><strong>{markets.length}</strong></div>
          <div><span>Мои прогнозы</span><strong>{activeUserPredictions.length}</strong></div>
          <button onClick={() => setMainView("suggest")}>Предложить рынок</button>
        </section>

        <section className="gameFeedStack">
          {renderGameShelf(
            "Горячие рынки",
            "Свайпай карточки, выбирай событие и делай прогноз прямо из ленты",
            "🔥",
            hotMarkets,
            "Все рынки",
            () => setMainView("search"),
            "hot",
          )}

          {renderGameShelf(
            "Для тебя",
            selectedInterestCategories.length > 0 ? "События по твоим интересам, где ещё нет прогноза" : "События, где у тебя ещё нет прогноза",
            "🎯",
            playNowMarkets,
            "Подобрать ещё",
            () => setMainView("search"),
            "forYou",
          )}

          {renderGameShelf(
            "Закрываются скоро",
            "Успей сделать прогноз до остановки рынка",
            "⏳",
            soonClosingMarkets,
            "Смотреть",
            () => {
              setStatusFilter("open");
              setSortMode("newest");
              setMainView("search");
            },
            "soon",
          )}

          {renderGameShelf(
            "Polymarket для фана",
            "Импортированные события без реальных денег",
            "🌍",
            polymarketPicks,
            "Открыть Polymarket",
            () => setMainView("imported"),
            "poly",
          )}

          {renderGameShelf(
            "Новые рынки",
            "Свежие события, которые только появились",
            "✨",
            newOpenMarkets,
            "Все новые",
            () => setMainView("search"),
            "new",
          )}
        </section>

        <section className="categoryHubSection gameCategoryHubSection">
          <div className="sectionHeader discoverySectionHeader">
            <div>
              <h2>Все категории</h2>
              <p>Когда хочешь выбрать тему сам: политика, спорт, технологии, крипта и другое.</p>
            </div>
            <button onClick={() => setMainView("search")}>Поиск по всем</button>
          </div>
          {categoryHubs.length === 0 ? (
            <div className="empty">Категорий пока нет.</div>
          ) : (
            <div className="categoryHubGrid">
              {categoryHubs.map((group, index) => renderCategoryHub(group, index))}
            </div>
          )}
        </section>
      </section>
    );
  }

  function renderImportedPage() {
    const totalImported = markets.filter((market) => isPolymarketSource(market.source)).length;

    return (
      <div className="pageStack importedPage">
        <section className="card importedHeroCard">
          <div>
            <p className="eyebrow">Автоимпорт событий</p>
            <h2>Polymarket для фана</h2>
            <p>Мы берём только идеи событий и превращаем их во внутренние прогнозы за игровые баллы. Никаких реальных денег, кошельков и ставок.</p>
          </div>
          <div className="importStatsGrid">
            <div><span>Всего</span><strong>{totalImported}</strong></div>
            <div><span>Открыто</span><strong>{importedOpenCount}</strong></div>
            <div><span>Категорий</span><strong>{Math.max(0, importedCategories.length - 1)}</strong></div>
          </div>
        </section>

        <section className="card importedControlsCard">
          <label className="toolbarSearch importedSearch">
            Поиск среди импортированных
            <input
              placeholder="Например: Bitcoin, выборы, спорт..."
              value={importedSearch}
              onChange={(event) => setImportedSearch(event.target.value)}
            />
          </label>
          <div className="categoryScroller compactCategoryScroller">
            {importedCategories.map((category) => (
              <button
                key={category}
                className={importedCategory === category ? "activeCategory" : ""}
                onClick={() => setImportedCategory(category)}
              >
                {category}
              </button>
            ))}
          </div>
          {isAdmin && (
            <button className="secondaryButton importRefreshButton" onClick={refreshPolymarketImport} disabled={isPolymarketImporting}>
              {isPolymarketImporting ? "Обновляем импорт..." : "Подтянуть свежие события"}
            </button>
          )}
        </section>

        <section className="marketFeedSection">
          <div className="sectionHeader">
            <h2>Импортированные рынки</h2>
            <span>{importedMarkets.length} событий</span>
          </div>
          {importedMarkets.length === 0 ? (
            <div className="empty">Импортированных рынков пока нет или они не подходят под фильтр.</div>
          ) : (
            renderMarketGroups(importedMarkets, "imported")
          )}
        </section>
      </div>
    );
  }


  function renderMarketGroups(marketsToRender: Market[], mode: "feed" | "imported" | "search" = "feed") {
    const activeCategory = mode === "imported" ? importedCategory : selectedCategory;
    const cardVariant: "feed" | "search" = mode === "feed" ? "feed" : "search";

    const groups = activeCategory === "Все"
      ? Array.from(new Set(marketsToRender.map((market) => market.category || "Без категории")))
          .map((category) => ({
            title: category,
            subtitle: "Категория",
            markets: marketsToRender.filter((market) => (market.category || "Без категории") === category),
          }))
          .sort((a, b) => b.markets.length - a.markets.length)
      : ([
          { title: "Открытые", subtitle: "Можно сделать прогноз", markets: marketsToRender.filter((market) => market.status === "open") },
          { title: "Ожидают расчёта", subtitle: "Прогнозы уже закрыты", markets: marketsToRender.filter((market) => market.status === "closed") },
          { title: "Рассчитанные", subtitle: "Результат уже известен", markets: marketsToRender.filter((market) => market.status === "resolved") },
        ].filter((group) => group.markets.length > 0));

    if (groups.length === 0) {
      return <div className="empty">Рынков пока нет.</div>;
    }

    return (
      <div className={`marketAccordionStack ${mode === "imported" ? "importedAccordionStack" : ""}`}>
        {groups.map((group, index) => {
          const openCount = group.markets.filter((market) => market.status === "open").length;
          const closedCount = group.markets.filter((market) => market.status === "closed").length;
          const resolvedCount = group.markets.filter((market) => market.status === "resolved").length;

          return (
            <details className="marketAccordionGroup" key={`${mode}-${group.title}`} open={index === 0}>
              <summary className="marketAccordionSummary">
                <div>
                  <span className="accordionKicker">{group.subtitle}</span>
                  <strong>{group.title}</strong>
                </div>
                <div className="accordionMetrics">
                  <span>{group.markets.length} событий</span>
                  {openCount > 0 && <span className="openMetric">{openCount} открыто</span>}
                  {closedCount > 0 && <span className="pendingMetric">{closedCount} расчёт</span>}
                  {resolvedCount > 0 && <span>{resolvedCount} завершено</span>}
                  <b className="accordionChevron">⌄</b>
                </div>
              </summary>
              <div className="marketAccordionList">
                {group.markets.map((market) => renderMarketCard(market, cardVariant))}
              </div>
            </details>
          );
        })}
      </div>
    );
  }

  function renderSearchPage() {
    return (
      <section className="searchPage">
        <section className="searchHeroPanel">
          <div>
            <p className="eyebrow">Навигация по рынкам</p>
            <h2>Поиск и фильтры</h2>
            <p>Быстро найди нужное событие: по теме, категории, статусу, популярности или избранному.</p>
          </div>
          <button className="clearFiltersButton" onClick={clearMarketFilters}>Сбросить фильтры</button>
        </section>

        <section className="marketToolbar searchToolbar">
          <label className="toolbarSearch">Поиск рынка<input placeholder="Например: ЦБ, GTA, Bitcoin, друзья..." value={marketSearch} onChange={(event) => setMarketSearch(event.target.value)} /></label>
          <label>Статус<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | MarketStatus)}><option value="all">Все рынки</option><option value="open">Открытые</option><option value="closed">Ожидают расчёта</option><option value="resolved">Рассчитанные</option></select></label>
          <label>Сортировка<select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}><option value="newest">Сначала новые</option><option value="probability">По вероятности “Да”</option><option value="trades">По количеству сделок</option><option value="comments">По комментариям</option></select></label>
          <label className="toolbarCheckbox"><input type="checkbox" checked={showFavoritesOnly} onChange={(event) => setShowFavoritesOnly(event.target.checked)} />Только избранные</label>
        </section>

        <section className="categoryTabs searchCategoryTabs">
          {categories.map((category) => (
            <button key={category} className={selectedCategory === category ? "activeTab" : ""} onClick={() => setSelectedCategory(category)}>{category}</button>
          ))}
        </section>

        <section className="searchResultsPanel">
          <div className="sectionHeader"><h2>Результаты</h2><span>{filteredMarkets.length} событий</span></div>
          {filteredMarkets.length === 0 ? <div className="empty">По этим фильтрам рынков не найдено.</div> : (
            renderMarketGroups(filteredMarkets, "search")
          )}
        </section>
      </section>
    );
  }



  function renderSettlementPage() {
    if (!isAdmin) {
      return (
        <section className="settlementPage">
          <div className="adminOnlyNotice">Очередь расчёта доступна только администраторам.</div>
        </section>
      );
    }

    const waitingPredictionsCount = settlementQueueMarkets.reduce(
      (sum, market) => sum + predictions.filter((prediction) => prediction.marketId === market.id && !prediction.settledAt).length,
      0
    );

    const waitingPool = settlementQueueMarkets.reduce((sum, market) => sum + market.yesPool + market.noPool, 0);

    function renderSettlementMarketCard(market: Market, mode: "queue" | "upcoming") {
      const marketPredictions = predictions.filter((prediction) => prediction.marketId === market.id);
      const activePredictions = marketPredictions.filter((prediction) => !prediction.settledAt);
      const yesAmount = activePredictions
        .filter((prediction) => prediction.outcome === "yes")
        .reduce((sum, prediction) => sum + prediction.amount, 0);
      const noAmount = activePredictions
        .filter((prediction) => prediction.outcome === "no")
        .reduce((sum, prediction) => sum + prediction.amount, 0);
      const participants = new Set(activePredictions.map((prediction) => prediction.userId)).size;
      const yesProbability = getYesProbability(market);
      const isImported = isPolymarketSource(market.source);

      return (
        <article className={`settlementCard ${mode === "queue" ? "settlementCardHot" : ""}`} key={market.id}>
          <div className="settlementCardTop">
            <div className="settlementCardBadges">
              <span className="category">{market.category}</span>
              {isImported && <span className="sourceBadge polymarketBadge">Polymarket</span>}
              <span className={`statusBadge ${getMarketStatusClass(market)}`}>{getMarketStatusText(market)}</span>
            </div>
            <button className="secondaryOpenButton" onClick={() => openMarketDetails(market.id)}>
              Детали
            </button>
          </div>

          <h3>{market.question}</h3>

          <div className="settlementMiniGrid">
            <div>
              <span>Дата закрытия</span>
              <strong>{formatDateForDisplay(market.closesAt)}</strong>
            </div>
            <div>
              <span>Участники</span>
              <strong>{participants}</strong>
            </div>
            <div>
              <span>Прогнозы</span>
              <strong>{activePredictions.length}</strong>
            </div>
            <div>
              <span>Пул</span>
              <strong>{(market.yesPool + market.noPool).toLocaleString("ru-RU")}</strong>
            </div>
          </div>

          <div className="settlementPools">
            <div className="settlementPoolYes">
              <span>Да</span>
              <strong>{yesProbability}%</strong>
              <small>{yesAmount.toLocaleString("ru-RU")} б.</small>
            </div>
            <div className="settlementPoolNo">
              <span>Нет</span>
              <strong>{100 - yesProbability}%</strong>
              <small>{noAmount.toLocaleString("ru-RU")} б.</small>
            </div>
          </div>

          {mode === "queue" ? (
            <div className="settlementActions">
              <button className="resolveYesButton" onClick={() => resolveMarket(market, "yes")}>
                Победило Да
              </button>
              <button className="resolveNoButton" onClick={() => resolveMarket(market, "no")}>
                Победило Нет
              </button>
              <button className="secondaryButton" onClick={() => extendMarket(market)}>
                Продлить
              </button>
              {isImported && (
                <button className="dangerButton" onClick={() => deleteMarket(market)}>
                  Скрыть
                </button>
              )}
            </div>
          ) : (
            <div className="settlementActions settlementUpcomingActions">
              <button className="secondaryButton" onClick={() => openMarketDetails(market.id)}>
                Открыть
              </button>
              <button className="secondaryButton" onClick={() => extendMarket(market)}>
                Изменить дату
              </button>
            </div>
          )}
        </article>
      );
    }

    return (
      <section className="settlementPage pageStack">
        <section className="settlementHeroPanel">
          <div>
            <p className="eyebrow">Админский цикл рынков</p>
            <h2>Очередь расчёта</h2>
            <p>
              Здесь собраны рынки, дата закрытия которых уже прошла. Они больше не принимают прогнозы и ждут решения администратора.
            </p>
          </div>
          <div className="settlementHeroStats">
            <div>
              <span>Ждут расчёта</span>
              <strong>{settlementQueueMarkets.length}</strong>
            </div>
            <div>
              <span>Активных прогнозов</span>
              <strong>{waitingPredictionsCount}</strong>
            </div>
            <div>
              <span>Баллов в очереди</span>
              <strong>{waitingPool.toLocaleString("ru-RU")}</strong>
            </div>
          </div>
        </section>

        <section className="settlementQueueSection">
          <div className="sectionHeader">
            <div>
              <h2>Нужно рассчитать</h2>
              <p>Нажми победивший исход — backend начислит выплаты и запишет историю баллов.</p>
            </div>
            <span>{settlementQueueMarkets.length}</span>
          </div>

          {settlementQueueMarkets.length === 0 ? (
            <div className="empty emptyActionState">
              <strong>Очередь пустая</strong>
              <p>Когда дата закрытия рынка пройдёт, он автоматически появится здесь и перестанет принимать новые прогнозы.</p>
            </div>
          ) : (
            <div className="settlementGrid">
              {settlementQueueMarkets.map((market) => renderSettlementMarketCard(market, "queue"))}
            </div>
          )}
        </section>

        <section className="settlementUpcomingSection">
          <div className="sectionHeader">
            <div>
              <h2>Скоро закрываются</h2>
              <p>Открытые рынки с ближайшей датой закрытия. Можно заранее проверить формулировку и источник.</p>
            </div>
            <span>{upcomingSettlementMarkets.length}</span>
          </div>

          <div className="settlementGrid settlementUpcomingGrid">
            {upcomingSettlementMarkets.map((market) => renderSettlementMarketCard(market, "upcoming"))}
          </div>
        </section>
      </section>
    );
  }

  function renderSuggestionStatusBadge(status: SuggestionStatus) {
    return <span className={`suggestionStatus ${status}`}>{getSuggestionStatusText(status)}</span>;
  }

  function renderSuggestionPage() {
    if (!activeUser) {
      return <section className="suggestPage"><div className="empty">Профиль пока не загружен.</div></section>;
    }

    return (
      <section className="suggestPage">
        <section className="suggestHeroPanel">
          <div>
            <p className="eyebrow">Идея для рынка</p>
            <h2>Предложить рынок</h2>
            <p>Напиши событие, по которому будет интересно прогнозировать. Админ проверит формулировку, источник и дату закрытия.</p>
          </div>
          <div className="suggestHeroStats">
            <span>Мои заявки</span>
            <strong>{activeUserSuggestions.length}</strong>
            <small>{activeUserSuggestions.filter((item) => item.status === "pending").length} на рассмотрении</small>
          </div>
        </section>

        <section className="suggestLayout">
          <div className="suggestFormCard">
            <div className="sectionHeader">
              <h2>Новая заявка</h2>
              <span>1–2 минуты</span>
            </div>
            <label className="wideField">
              Вопрос рынка
              <input
                placeholder="Например: Будет ли снег в Челябинске в эти выходные?"
                value={suggestionForm.question}
                onChange={(event) => setSuggestionForm((current) => ({ ...current, question: event.target.value }))}
              />
            </label>
            <div className="suggestFormGrid">
              <label>
                Категория
                <input
                  placeholder="Друзья, спорт, экономика..."
                  value={suggestionForm.category}
                  onChange={(event) => setSuggestionForm((current) => ({ ...current, category: event.target.value }))}
                />
              </label>
              <label>
                Дата закрытия
                <input
                  type="date"
                  value={suggestionForm.closesAt}
                  onChange={(event) => setSuggestionForm((current) => ({ ...current, closesAt: event.target.value }))}
                />
              </label>
            </div>
            <label className="wideField">
              Описание / правила расчета
              <textarea
                placeholder="Что должно произойти, чтобы рынок был рассчитан как “Да”?"
                value={suggestionForm.description}
                onChange={(event) => setSuggestionForm((current) => ({ ...current, description: event.target.value }))}
              />
            </label>
            <label className="wideField">
              Источник результата
              <input
                placeholder="Официальный сайт, общий чат, публичная новость, счет матча..."
                value={suggestionForm.source}
                onChange={(event) => setSuggestionForm((current) => ({ ...current, source: event.target.value }))}
              />
            </label>
            <button className="createMarketButton" onClick={submitMarketSuggestion}>Отправить админу</button>
          </div>

          <aside className="suggestTipsCard">
            <h3>Как сделать хорошую заявку</h3>
            <ul>
              <li>Вопрос должен отвечаться только “Да” или “Нет”.</li>
              <li>Добавь понятный источник результата.</li>
              <li>Не делай слишком субъективные формулировки.</li>
              <li>Дата закрытия должна быть раньше момента расчета.</li>
            </ul>
          </aside>
        </section>
      </section>
    );
  }

  function renderSuggestionList(items: MarketSuggestion[], mode: "profile" | "admin") {
    if (items.length === 0) {
      return (
        <div className="empty emptyActionState">
          <strong>Заявок пока нет</strong>
          <p>{mode === "admin" ? "Когда пользователи предложат рынки, они появятся здесь." : "Предложи первый рынок — админ сможет одобрить его и опубликовать."}</p>
          {mode === "profile" && <button onClick={() => setMainView("suggest")}>Предложить рынок</button>}
        </div>
      );
    }

    return (
      <div className={mode === "admin" ? "moderationList" : "suggestionList"}>
        {items.map((suggestion) => {
          const draft = getSuggestionDraft(suggestion);
          const isPending = suggestion.status === "pending";

          if (mode === "admin") {
            return (
              <article className="moderationCard" key={suggestion.id}>
                <div className="moderationTopLine">
                  <div>
                    <span>{suggestion.userName} · {suggestion.createdAt}</span>
                    <h3>{suggestion.question}</h3>
                  </div>
                  {renderSuggestionStatusBadge(suggestion.status)}
                </div>

                <div className="moderationFormGrid">
                  <label className="wideField">Вопрос<input value={draft.question} onChange={(event) => updateSuggestionDraft(suggestion, { question: event.target.value })} /></label>
                  <label>Категория<input value={draft.category} onChange={(event) => updateSuggestionDraft(suggestion, { category: event.target.value })} /></label>
                  <label>Дата закрытия<input type="date" value={normalizeDateForInput(draft.closesAt)} onChange={(event) => updateSuggestionDraft(suggestion, { closesAt: event.target.value })} /></label>
                  <label>Вероятность “Да”, %<input type="number" min="1" max="99" value={draft.yesProbability} onChange={(event) => updateSuggestionDraft(suggestion, { yesProbability: Number(event.target.value) })} /></label>
                  <label className="wideField">Описание<textarea value={draft.description} onChange={(event) => updateSuggestionDraft(suggestion, { description: event.target.value })} /></label>
                  <label className="wideField">Источник<input value={draft.source} onChange={(event) => updateSuggestionDraft(suggestion, { source: event.target.value })} /></label>
                  <label className="wideField">Комментарий админу / причина решения<input placeholder="Например: одобрено, уточнил источник" value={draft.adminNote} onChange={(event) => updateSuggestionDraft(suggestion, { adminNote: event.target.value })} /></label>
                </div>

                <div className="moderationActions">
                  <button disabled={!isPending} onClick={() => approveSuggestion(suggestion)}>Опубликовать рынок</button>
                  <button className="dangerButton" disabled={!isPending} onClick={() => rejectSuggestion(suggestion)}>Отклонить</button>
                </div>
              </article>
            );
          }

          return (
            <article className="suggestionItem" key={suggestion.id}>
              <div>
                <div className="suggestionItemTop">
                  <span>{suggestion.category}</span>
                  {renderSuggestionStatusBadge(suggestion.status)}
                </div>
                <h3>{suggestion.question}</h3>
                <p>{suggestion.description || "Описание не указано"}</p>
                <small>До {formatDateForDisplay(suggestion.closesAt)} · {suggestion.createdAt}</small>
                {suggestion.adminNote && <em>{suggestion.adminNote}</em>}
              </div>
            </article>
          );
        })}
      </div>
    );
  }


  function renderAdminPage() {
    if (!isAdmin) {
      return (
        <section className="adminCenterPage pageStack">
          <div className="empty adminOnlyNotice">
            <strong>Админка доступна только администраторам.</strong>
            <p>Открой приложение через Telegram Mini App под админским аккаунтом.</p>
          </div>
        </section>
      );
    }

    const totalImported = markets.filter((market) => isPolymarketSource(market.source)).length;
    const resolvedMarketsCount = markets.filter((market) => market.status === "resolved").length;
    const totalPredictionsCount = predictions.length;
    const totalUsersCount = users.length;
    const totalBalance = users.reduce((sum, user) => sum + user.balance, 0);
    const todaysPredictions = predictions.filter((prediction) => {
      const date = new Date(prediction.createdAt);
      const today = new Date();
      return date.toDateString() === today.toDateString();
    }).length;
    const adminUserIdsSet = new Set(adminUserIds);
    const selectedAwardUser = users.find((user) => user.id === adminAwardForm.userId) || users[0] || null;
    const adminLogItems = transactions
      .filter((transaction) => ["system", "refund", "payout", "daily_bonus", "referral_bonus", "welcome_bonus"].includes(transaction.type))
      .slice(0, 12);

    const filteredAdminUsers = users
      .filter((user) => {
        const query = adminUserSearch.trim().toLowerCase();
        if (!query) return true;
        return `${user.name} ${user.id}`.toLowerCase().includes(query);
      })
      .sort((a, b) => b.balance - a.balance);

    const filteredAdminMarkets = markets
      .filter((market) => {
        const query = adminMarketSearch.trim().toLowerCase();
        const matchesQuery = !query || `${market.question} ${market.category} ${market.source}`.toLowerCase().includes(query);
        const matchesStatus = adminMarketStatus === "all"
          || (adminMarketStatus === "polymarket" ? isPolymarketSource(market.source) : market.status === adminMarketStatus);
        return matchesQuery && matchesStatus;
      })
      .sort((a, b) => getMarketStatusWeight(a.status) - getMarketStatusWeight(b.status));

    function getUserAdminStats(userId: string) {
      const userPredictions = predictions.filter((prediction) => prediction.userId === userId);
      const wins = userPredictions.filter((prediction) => prediction.resolvedOutcome && prediction.resolvedOutcome === prediction.outcome).length;
      const active = userPredictions.filter((prediction) => !prediction.resolvedOutcome).length;
      const invested = userPredictions.reduce((sum, prediction) => sum + prediction.amount, 0);
      const payout = userPredictions.reduce((sum, prediction) => sum + (prediction.payout || 0), 0);
      const weekly = weeklyStandings.find((row) => row.user.id === userId);
      return { total: userPredictions.length, wins, active, invested, payout, weeklyScore: weekly?.score || 0 };
    }

    function renderAdminInnerNav() {
      const tabs: Array<{ id: AdminPanelTab; title: string; shortTitle: string; icon: string; badge?: number | string }> = [
        { id: "overview", title: "Обзор админки", shortTitle: "Обзор", icon: "◎" },
        { id: "users", title: "Пользователи", shortTitle: "Люди", icon: "👥", badge: totalUsersCount },
        { id: "markets", title: "Рынки", shortTitle: "Рынки", icon: "📊", badge: markets.length },
        { id: "create", title: "Создать рынок", shortTitle: "Создать", icon: "＋" },
        { id: "suggestions", title: "Заявки пользователей", shortTitle: "Заявки", icon: "✉️", badge: pendingSuggestions.length || undefined },
        { id: "settlement", title: "Расчёт рынков", shortTitle: "Расчёт", icon: "⚖️", badge: closedMarketsCount || undefined },
        { id: "polymarket", title: "Импорт Polymarket", shortTitle: "Импорт", icon: "◆", badge: totalImported },
        { id: "points", title: "Начисления баллов", shortTitle: "Баллы", icon: "₽" },
        { id: "tournament", title: "Награды турнира", shortTitle: "Турнир", icon: "🏆", badge: hasCurrentWeekAwards ? undefined : weeklyStandings.length || undefined },
        { id: "shop", title: "Магазин профиля", shortTitle: "Магазин", icon: "🛍️", badge: effectiveShopItems.length || undefined },
        { id: "security", title: "Доступы и безопасность", shortTitle: "Доступ", icon: "🔐" },
      ];

      const currentTab = tabs.find((tab) => tab.id === adminTab);

      return (
        <div className="adminNavShell">
          <label className="adminMobileNavSelect">
            <span>Раздел админки</span>
            <select value={adminTab} onChange={(event) => setAdminTab(event.target.value as AdminPanelTab)}>
              {tabs.map((tab) => (
                <option key={tab.id} value={tab.id}>
                  {tab.title}{tab.badge ? ` · ${tab.badge}` : ""}
                </option>
              ))}
            </select>
            {currentTab ? <small>{currentTab.icon} {currentTab.title}</small> : null}
          </label>

          <div className="adminInnerNav" aria-label="Разделы админки">
            {tabs.map((tab) => (
              <button key={tab.id} className={adminTab === tab.id ? "activeAdminTab" : ""} onClick={() => setAdminTab(tab.id)} title={tab.title}>
                <span className="adminNavIcon" aria-hidden="true">{tab.icon}</span>
                <span className="adminNavText">{tab.shortTitle}</span>
                {tab.badge ? <span className="adminNavBadge">{tab.badge}</span> : null}
              </button>
            ))}
          </div>
        </div>
      );
    }

    function renderAdminOverview() {
      return (
        <div className="adminTabPanel">
          <section className="adminStatsGrid adminOverviewStats">
            <div><span>Пользователей</span><strong>{totalUsersCount}</strong><small>зарегистрировано</small></div>
            <div><span>Прогнозов сегодня</span><strong>{todaysPredictions}</strong><small>{totalPredictionsCount} всего</small></div>
            <div><span>Ждут расчёта</span><strong>{closedMarketsCount}</strong><small>рынков</small></div>
            <div><span>Заявок</span><strong>{pendingSuggestions.length}</strong><small>{marketSuggestions.length} всего</small></div>
            <div><span>Баллов в обороте</span><strong>{totalBalance.toLocaleString("ru-RU")}</strong><small>у пользователей</small></div>
            <div><span>Турнир недели</span><strong>{weeklyStandings[0]?.user.name || "—"}</strong><small>{weeklyStandings[0]?.score ? `${weeklyStandings[0].score.toLocaleString("ru-RU")} б.` : "нет лидера"}</small></div>
            <div><span>Рассчитано</span><strong>{resolvedMarketsCount}</strong><small>рынков</small></div>
          </section>

          <section className="adminOverviewGrid">
            <article className="adminOverviewCard">
              <div className="sectionHeader"><h2>Что требует внимания</h2></div>
              <div className="adminTodoList">
                <button onClick={() => setAdminTab("settlement")}><strong>{closedMarketsCount}</strong><span>рынков ждут расчёта</span></button>
                <button onClick={() => setAdminTab("suggestions")}><strong>{pendingSuggestions.length}</strong><span>новых заявок</span></button>
                <button onClick={() => setAdminTab("polymarket")}><strong>{totalImported}</strong><span>импортированных рынков</span></button>
                <button onClick={() => setAdminTab("points")}><strong>±</strong><span>ручные начисления</span></button>
                <button onClick={() => setAdminTab("tournament")}><strong>🏆</strong><span>{hasCurrentWeekAwards ? "награды недели выданы" : "выдать награды недели"}</span></button>
                <button onClick={() => setAdminTab("shop")}><strong>{effectiveShopItems.length}</strong><span>предметов магазина</span></button>
              </div>
            </article>

            <article className="adminOverviewCard">
              <div className="sectionHeader"><h2>Последние операции</h2><button onClick={() => setAdminTab("points")}>Открыть</button></div>
              <div className="adminLogList compactAdminLogList">
                {adminLogItems.length === 0 ? <div className="empty">Журнал пока пуст.</div> : adminLogItems.slice(0, 6).map((transaction) => (
                  <div className="adminLogItem" key={transaction.id}>
                    <div><strong>{transaction.title}</strong><span>{transaction.description}</span></div>
                    <b className={transaction.amount >= 0 ? "positiveAmount" : "negativeAmount"}>{transaction.amount >= 0 ? "+" : ""}{transaction.amount.toLocaleString("ru-RU")}</b>
                  </div>
                ))}
              </div>
            </article>
          </section>
        </div>
      );
    }

    function renderAdminUsers() {
      return (
        <div className="adminTabPanel">
          <section className="adminToolbar">
            <div>
              <h2>Пользователи</h2>
              <p>Баланс, активность и быстрые начисления. Роли админов пока задаются через ADMIN_TELEGRAM_IDS в Render.</p>
            </div>
            <input placeholder="Поиск по имени или ID" value={adminUserSearch} onChange={(event) => setAdminUserSearch(event.target.value)} />
          </section>

          <div className="adminTable adminUsersTable">
            <div className="adminTableHead"><span>Пользователь</span><span>Баланс</span><span>Прогнозы</span><span>Турнир</span><span>Действия</span></div>
            {filteredAdminUsers.map((user) => {
              const stats = getUserAdminStats(user.id);
              const userIsAdmin = adminUserIdsSet.has(user.id) || adminUserIdsSet.has(user.id.replace("telegram-", ""));
              return (
                <article className="adminTableRow" key={user.id}>
                  <div className="adminUserCell"><div className="miniAvatar">{user.name.slice(0, 1).toUpperCase()}</div><div><strong>{user.name}</strong><small>{user.id}</small>{userIsAdmin ? <em>Админ</em> : null}</div></div>
                  <div><strong>{user.balance.toLocaleString("ru-RU")}</strong><small>баллов</small></div>
                  <div><strong>{stats.total}</strong><small>{stats.wins} побед · {stats.active} активн.</small></div>
                  <div><strong>{stats.weeklyScore.toLocaleString("ru-RU")}</strong><small>за неделю</small></div>
                  <div className="adminRowActions">
                    <button onClick={() => openPublicProfile(user.id)}>Профиль</button>
                    <button onClick={() => { setAdminAwardForm((current) => ({ ...current, userId: user.id, amount: "1000", description: "Тестовое начисление баллов" })); setAdminTab("points"); }}>Начислить</button>
                    <button className="secondaryButton" onClick={() => { setAdminAwardForm((current) => ({ ...current, userId: user.id, amount: "-500", description: "Тестовое списание баллов" })); setAdminTab("points"); }}>Списать</button>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      );
    }

    function renderAdminCreate() {
      return (
        <div className="adminTabPanel">
          <section className="adminToolbar">
            <div>
              <h2>Создать рынок</h2>
              <p>Быстрая форма для своего события. После создания рынок сразу появится в ленте.</p>
            </div>
            <button className="secondaryButton" onClick={() => setIsAdminOpen((current) => !current)}>{isAdminOpen ? "Свернуть форму" : "Открыть форму"}</button>
          </section>

          {isAdminOpen ? (
            <article className="adminFormCard adminCreateMarketCard">
              <div className="adminForm compactAdminForm adminCenterForm">
                <label className="wideField">Вопрос рынка<input placeholder="Например: Поедем ли мы компанией в отпуск в августе?" value={newMarket.question} onChange={(event) => setNewMarket((current) => ({ ...current, question: event.target.value }))} /></label>
                <label>Категория<input placeholder="Друзья" value={newMarket.category} onChange={(event) => setNewMarket((current) => ({ ...current, category: event.target.value }))} /></label>
                <label>Дата закрытия<input type="date" value={newMarket.closesAt} onChange={(event) => setNewMarket((current) => ({ ...current, closesAt: event.target.value }))} /></label>
                <label className="wideField">Описание и правила расчета<textarea placeholder="Опиши, что должно произойти, чтобы рынок был рассчитан как «Да»." value={newMarket.description} onChange={(event) => setNewMarket((current) => ({ ...current, description: event.target.value }))} /></label>
                <label className="wideField">Источник расчета<input placeholder="Например: официальный сайт / публичная новость / решение в чате" value={newMarket.source} onChange={(event) => setNewMarket((current) => ({ ...current, source: event.target.value }))} /></label>
                <label>Начальная вероятность “Да”, %<input type="number" min="1" max="99" value={newMarket.yesProbability} onChange={(event) => setNewMarket((current) => ({ ...current, yesProbability: Number(event.target.value) }))} /></label>
                <button className="createMarketButton" onClick={createMarket}>Создать рынок</button>
              </div>
            </article>
          ) : (
            <div className="empty">Форма создания свернута.</div>
          )}
        </div>
      );
    }

    function renderAdminMarkets() {
      return (
        <div className="adminTabPanel">
          <section className="adminToolbar adminMarketsToolbar">
            <div>
              <h2>Рынки</h2>
              <p>Быстрый поиск и фильтры. Редактирование, расчёт и удаление остаются внутри карточки рынка.</p>
            </div>
            <div className="adminToolbarControls">
              <input placeholder="Поиск по рынкам" value={adminMarketSearch} onChange={(event) => setAdminMarketSearch(event.target.value)} />
              <select value={adminMarketStatus} onChange={(event) => setAdminMarketStatus(event.target.value as typeof adminMarketStatus)}>
                <option value="all">Все</option>
                <option value="open">Открытые</option>
                <option value="closed">Ждут расчёта</option>
                <option value="resolved">Рассчитанные</option>
                <option value="polymarket">Polymarket</option>
              </select>
            </div>
          </section>

          <div className="adminTable adminMarketsTable">
            <div className="adminTableHead"><span>Рынок</span><span>Статус</span><span>Активность</span><span>Дата</span><span>Действия</span></div>
            {filteredAdminMarkets.slice(0, 80).map((market) => {
              const marketPredictions = predictions.filter((prediction) => prediction.marketId === market.id);
              const participants = new Set(marketPredictions.map((prediction) => prediction.userId)).size;
              return (
                <article className="adminTableRow" key={market.id}>
                  <div><strong>{market.question}</strong><small>{market.category} · {isPolymarketSource(market.source) ? "Polymarket" : "Свой рынок"}</small></div>
                  <div><span className={`statusBadge ${getMarketStatusClass(market)}`}>{getMarketStatusText(market)}</span></div>
                  <div><strong>{marketPredictions.length}</strong><small>{participants} участников</small></div>
                  <div><strong>{formatDateForDisplay(market.closesAt)}</strong><small>{market.status}</small></div>
                  <div className="adminRowActions"><button onClick={() => openMarketDetails(market.id)}>Открыть</button>{isPolymarketSource(market.source) && market.status !== "resolved" ? <button className="secondaryButton" onClick={() => deleteMarket(market)}>Скрыть</button> : null}</div>
                </article>
              );
            })}
          </div>
        </div>
      );
    }

    function renderAdminPoints() {
      return (
        <div className="adminTabPanel">
          <section className="adminTwoColumn">
            <article className="adminFormCard">
              <div className="sectionHeader"><h2>Ручное начисление баллов</h2></div>
              <div className="adminForm compactAdminForm manualPointsForm">
                <label>
                  Пользователь
                  <select value={adminAwardForm.userId || activeUser?.id || users[0]?.id || ""} onChange={(event) => setAdminAwardForm((current) => ({ ...current, userId: event.target.value }))}>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>{user.name} — {user.balance.toLocaleString("ru-RU")} б.</option>
                    ))}
                  </select>
                </label>
                <label>
                  Сумма
                  <input inputMode="numeric" placeholder="Например 1000 или -500" value={adminAwardForm.amount} onChange={(event) => setAdminAwardForm((current) => ({ ...current, amount: event.target.value.replace(/(?!^-)[^0-9]/g, "") }))} />
                </label>
                <label className="wideField">
                  Комментарий
                  <input placeholder="Например: тестовое начисление" value={adminAwardForm.description} onChange={(event) => setAdminAwardForm((current) => ({ ...current, description: event.target.value }))} />
                </label>
                <div className="quickAmountRow wideField">
                  {[500, 1000, 2500, 5000, 10000].map((amount) => <button key={amount} onClick={() => setAdminAwardForm((current) => ({ ...current, amount: String(amount) }))}>+{amount}</button>)}
                  <button className="secondaryButton" onClick={() => setAdminAwardForm((current) => ({ ...current, amount: "-500" }))}>−500</button>
                  <button className="secondaryButton" onClick={() => setAdminAwardForm((current) => ({ ...current, amount: "-1000" }))}>−1000</button>
                </div>
                <button className="createMarketButton" onClick={awardUserPoints}>Применить корректировку</button>
              </div>
              {selectedAwardUser ? <p className="adminHint">Выбран: {selectedAwardUser.name} · баланс {selectedAwardUser.balance.toLocaleString("ru-RU")} б.</p> : null}
            </article>

            <article className="adminFormCard adminBulkPointsCard">
              <div className="sectionHeader">
                <div>
                  <h2>Массовая корректировка</h2>
                  <p>Для тестирования: начислить или списать баллы всем игрокам сразу.</p>
                </div>
              </div>
              <div className="adminForm compactAdminForm manualPointsForm">
                <label>
                  Сумма для всех
                  <input inputMode="numeric" placeholder="Например 1000 или -500" value={adminBulkPointsForm.amount} onChange={(event) => setAdminBulkPointsForm((current) => ({ ...current, amount: event.target.value.replace(/(?!^-)[^0-9]/g, "") }))} />
                </label>
                <label className="wideField">
                  Комментарий
                  <input placeholder="Например: тестовое начисление всем" value={adminBulkPointsForm.description} onChange={(event) => setAdminBulkPointsForm((current) => ({ ...current, description: event.target.value }))} />
                </label>
                <div className="quickAmountRow wideField">
                  {[100, 500, 1000, 5000].map((amount) => <button key={amount} onClick={() => setAdminBulkPointsForm((current) => ({ ...current, amount: String(amount), description: "Массовое тестовое начисление баллов" }))}>+{amount}</button>)}
                  <button className="secondaryButton" onClick={() => setAdminBulkPointsForm((current) => ({ ...current, amount: "-100", description: "Массовое тестовое списание баллов" }))}>−100</button>
                  <button className="secondaryButton" onClick={() => setAdminBulkPointsForm((current) => ({ ...current, amount: "-500", description: "Массовое тестовое списание баллов" }))}>−500</button>
                </div>
                <div className="bulkPointsActions wideField">
                  <button className="createMarketButton" onClick={awardAllUsersPoints} disabled={isApplyingBulkPoints}>
                    {isApplyingBulkPoints ? "Применяем..." : Number(adminBulkPointsForm.amount) >= 0 ? "Начислить всем" : "Списать у всех"}
                  </button>
                  <small>При списании баланс игроков не уйдёт ниже нуля: если у кого-то меньше баллов, спишется только доступный остаток.</small>
                </div>
              </div>
            </article>

            <article className="adminFormCard">
              <div className="sectionHeader"><h2>Журнал баланса</h2></div>
              <div className="adminLogList">
                {adminLogItems.length === 0 ? <div className="empty">Пока нет операций.</div> : adminLogItems.map((transaction) => {
                  const user = users.find((item) => item.id === transaction.userId);
                  return (
                    <div className="adminLogItem" key={transaction.id}>
                      <div><strong>{transaction.title}</strong><span>{user?.name || transaction.userId} · {transaction.description}</span></div>
                      <b className={transaction.amount >= 0 ? "positiveAmount" : "negativeAmount"}>{transaction.amount >= 0 ? "+" : ""}{transaction.amount.toLocaleString("ru-RU")}</b>
                    </div>
                  );
                })}
              </div>
            </article>
          </section>
        </div>
      );
    }

    function renderAdminPolymarket() {
      return (
        <div className="adminTabPanel">
          <section className="adminImportBox upgradedAdminImportBox">
            <div>
              <h2>Импорт Polymarket</h2>
              <p>Polymarket используется только как источник идей. Внутри Forecast Market остаются игровые баллы без реальных ставок, кошельков и вывода.</p>
            </div>
            <div className="adminImportStats">
              <div><span>Всего</span><strong>{totalImported}</strong></div>
              <div><span>Открыто</span><strong>{importedOpenCount}</strong></div>
              <div><span>Категорий</span><strong>{Math.max(0, importedCategories.length - 1)}</strong></div>
            </div>
            <div className="adminImportActions">
              <button onClick={refreshPolymarketImport} disabled={isPolymarketImporting}>{isPolymarketImporting ? "Подтягиваем..." : "Подтянуть свежие события"}</button>
              <button className="secondaryButton" onClick={() => setMainView("imported")}>Открыть импортированные</button>
            </div>
          </section>
        </div>
      );
    }

    function renderAdminTournament() {
      const topRewardRows = weeklyStandings.slice(0, 3);
      const participationRows = weeklyStandings.filter((row) => row.predictionsCount >= WEEKLY_TOURNAMENT_MIN_PREDICTIONS);
      const previewTotal =
        topRewardRows.reduce((sum, _row, index) => sum + (WEEKLY_TOURNAMENT_TOP_REWARDS[index] || 0), 0) +
        participationRows.length * WEEKLY_TOURNAMENT_PARTICIPATION_REWARD;

      return (
        <div className="adminTabPanel">
          <section className="adminTournamentRewardsCard">
            <div className="sectionHeader">
              <div>
                <h2>Награды турнира недели</h2>
                <p>Ручное завершение текущей недели. Повторная выдача за тот же период заблокирована backend-ом.</p>
              </div>
              <span className={hasCurrentWeekAwards ? "notificationStatusReady" : "notificationStatusPending"}>
                {hasCurrentWeekAwards ? "Уже выдано" : "Готово к выдаче"}
              </span>
            </div>

            <div className="adminTournamentPeriod">
              <div><span>Период</span><strong>{formatShortDate(currentWeekStart)} — {formatShortDate(currentWeekEnd)}</strong><small>{currentWeekKey}</small></div>
              <div><span>Участников</span><strong>{weeklyStandings.length}</strong><small>в текущем топе</small></div>
              <div><span>3+ прогноза</span><strong>{participationRows.length}</strong><small>получат участие</small></div>
              <div><span>План наград</span><strong>+{previewTotal.toLocaleString("ru-RU")}</strong><small>если выдать сейчас</small></div>
            </div>

            <div className="tournamentRewardsGrid adminTournamentPrizeGrid">
              <div><b>🥇 1 место</b><strong>+5 000</strong><small>{topRewardRows[0]?.user.name || "нет участника"}</small></div>
              <div><b>🥈 2 место</b><strong>+3 000</strong><small>{topRewardRows[1]?.user.name || "нет участника"}</small></div>
              <div><b>🥉 3 место</b><strong>+1 500</strong><small>{topRewardRows[2]?.user.name || "нет участника"}</small></div>
              <div><b>🎁 Участие</b><strong>+300</strong><small>{participationRows.length} игроков</small></div>
            </div>

            <button className="createMarketButton" onClick={awardWeeklyTournamentRewards} disabled={isAwardingWeeklyTournament || hasCurrentWeekAwards || weeklyStandings.length === 0}>
              {isAwardingWeeklyTournament ? "Выдаём награды..." : hasCurrentWeekAwards ? "Награды уже выданы" : "Завершить неделю и выдать награды"}
            </button>
          </section>

          <section className="adminTwoColumn">
            <article className="adminFormCard">
              <div className="sectionHeader"><h2>Текущий топ</h2></div>
              <div className="tournamentRows compactTournamentRows">
                {weeklyStandings.slice(0, 10).length === 0 ? (
                  <div className="empty">Пока нет результатов за неделю.</div>
                ) : weeklyStandings.slice(0, 10).map((row, index) => (
                  <div className="tournamentRow" key={row.user.id}>
                    <div className="tournamentRank">#{index + 1}</div>
                    <div className="tournamentName"><strong>{row.user.name}</strong><span>{row.predictionsCount} прогнозов · {row.wins} побед</span></div>
                    <div className="tournamentScore"><strong>{row.score >= 0 ? "+" : ""}{row.score.toLocaleString("ru-RU")}</strong><span>баллов</span></div>
                  </div>
                ))}
              </div>
            </article>

            <article className="adminFormCard">
              <div className="sectionHeader"><h2>Выданные награды</h2></div>
              <div className="weeklyAwardsList">
                {latestWeeklyAwards.length === 0 ? <div className="empty">Наград пока нет.</div> : latestWeeklyAwards.slice(0, 10).map((award) => (
                  <div className="weeklyAwardItem" key={award.id}>
                    <div>
                      <strong>{award.awardType === "top" ? `#${award.place} недели` : "Участие"}</strong>
                      <span>{award.userName} · {formatDateForDisplay(award.weekStart)}</span>
                    </div>
                    <b>+{award.rewardAmount.toLocaleString("ru-RU")}</b>
                  </div>
                ))}
              </div>
            </article>
          </section>
        </div>
      );
    }

    function renderAdminShop() {
      const adminShopItems = [...effectiveShopItems].sort((a, b) => {
        if (a.type !== b.type) return a.type === "title" ? -1 : 1;
        return a.sortOrder - b.sortOrder || a.price - b.price;
      });
      const selectedGrantUser = users.find((user) => user.id === (adminShopGrantForm.userId || activeUser?.id || users[0]?.id || ""));
      const selectedGrantItem = adminShopItems.find((item) => item.id === (adminShopGrantForm.itemId || adminShopItems[0]?.id || ""));
      const totalPurchases = userInventory.length;

      return (
        <div className="adminTabPanel">
          <section className="adminShopHero adminTournamentRewardsCard">
            <div className="sectionHeader">
              <div>
                <h2>Магазин профиля</h2>
                <p>Создавай титулы и рамки, меняй цены, скрывай предметы и выдавай косметику игрокам вручную.</p>
              </div>
              <span className={isUsingFallbackShopItems ? "notificationStatusPending" : "notificationStatusReady"}>
                {isUsingFallbackShopItems ? "Fallback" : "Backend"}
              </span>
            </div>

            <div className="adminTournamentPeriod">
              <div><span>Предметов</span><strong>{adminShopItems.length}</strong><small>в магазине</small></div>
              <div><span>Активных</span><strong>{adminShopItems.filter((item) => item.isActive).length}</strong><small>видны игрокам</small></div>
              <div><span>Покупок</span><strong>{totalPurchases}</strong><small>в инвентарях</small></div>
              <div><span>Баланс</span><strong>{totalBalance.toLocaleString("ru-RU")}</strong><small>у игроков</small></div>
            </div>
          </section>

          <section className="adminTwoColumn adminShopGrid">
            <article className="adminFormCard adminShopEditorCard">
              <div className="sectionHeader">
                <div>
                  <h2>{editingShopItemId ? "Редактировать предмет" : "Создать предмет"}</h2>
                  <p>{editingShopItemId || "Новый титул или рамка появится в профиле игроков."}</p>
                </div>
                {editingShopItemId ? <button className="secondaryButton" onClick={() => { setEditingShopItemId(null); setAdminShopForm(emptyAdminShopItemForm); }}>Сбросить</button> : null}
              </div>

              <div className="adminForm compactAdminForm manualPointsForm">
                <label>
                  Тип
                  <select value={adminShopForm.type} onChange={(event) => setAdminShopForm((current) => ({ ...current, type: event.target.value as "title" | "frame" }))}>
                    <option value="title">Титул</option>
                    <option value="frame">Рамка</option>
                  </select>
                </label>

                <label>
                  ID
                  <input placeholder="Можно оставить пустым" value={adminShopForm.id} disabled={Boolean(editingShopItemId)} onChange={(event) => setAdminShopForm((current) => ({ ...current, id: event.target.value }))} />
                </label>

                <label>
                  Название
                  <input placeholder="Например: Чемпион недели" value={adminShopForm.name} onChange={(event) => setAdminShopForm((current) => ({ ...current, name: event.target.value }))} />
                </label>

                <label>
                  Emoji
                  <input placeholder="👑" value={adminShopForm.emoji} onChange={(event) => setAdminShopForm((current) => ({ ...current, emoji: event.target.value }))} />
                </label>

                <label>
                  Цена
                  <input inputMode="numeric" value={adminShopForm.price} onChange={(event) => setAdminShopForm((current) => ({ ...current, price: event.target.value.replace(/[^0-9]/g, "") }))} />
                </label>

                <label>
                  Порядок
                  <input inputMode="numeric" value={adminShopForm.sortOrder} onChange={(event) => setAdminShopForm((current) => ({ ...current, sortOrder: event.target.value.replace(/[^0-9-]/g, "") }))} />
                </label>

                <label>
                  Style key
                  <input placeholder="gold / neon / custom" value={adminShopForm.styleKey} onChange={(event) => setAdminShopForm((current) => ({ ...current, styleKey: event.target.value }))} />
                </label>

                <label className="toggleCheckboxLabel">
                  <input type="checkbox" checked={adminShopForm.isActive} onChange={(event) => setAdminShopForm((current) => ({ ...current, isActive: event.target.checked }))} />
                  <span>Активен</span>
                </label>

                <label className="wideField">
                  Описание
                  <textarea placeholder="Короткое описание предмета" value={adminShopForm.description} onChange={(event) => setAdminShopForm((current) => ({ ...current, description: event.target.value }))} />
                </label>

                <button className="createMarketButton wideField" onClick={saveAdminShopItem} disabled={Boolean(savingAdminShopItemId)}>
                  {savingAdminShopItemId ? "Сохраняем..." : editingShopItemId ? "Сохранить изменения" : "Создать предмет"}
                </button>

                <div className="quickAmountRow wideField">
                  <button className="secondaryButton" onClick={() => startCreateShopItem("title")}>Новый титул</button>
                  <button className="secondaryButton" onClick={() => startCreateShopItem("frame")}>Новая рамка</button>
                </div>
              </div>
            </article>

            <article className="adminFormCard adminShopGrantCard">
              <div className="sectionHeader">
                <div>
                  <h2>Выдать предмет</h2>
                  <p>Для тестов, призов турнира или ручных наград.</p>
                </div>
              </div>

              <div className="adminForm compactAdminForm manualPointsForm">
                <label>
                  Игрок
                  <select value={adminShopGrantForm.userId || activeUser?.id || users[0]?.id || ""} onChange={(event) => setAdminShopGrantForm((current) => ({ ...current, userId: event.target.value }))}>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>{user.name} — {user.balance.toLocaleString("ru-RU")} б.</option>
                    ))}
                  </select>
                </label>

                <label>
                  Предмет
                  <select value={adminShopGrantForm.itemId || adminShopItems[0]?.id || ""} onChange={(event) => setAdminShopGrantForm((current) => ({ ...current, itemId: event.target.value }))}>
                    {adminShopItems.map((item) => (
                      <option key={item.id} value={item.id}>{item.emoji} {item.name}</option>
                    ))}
                  </select>
                </label>

                <button className="createMarketButton wideField" onClick={() => void grantShopItemToUser()} disabled={!selectedGrantItem || !selectedGrantUser || Boolean(grantingShopItemId)}>
                  {grantingShopItemId ? "Выдаём..." : "Выдать выбранный предмет"}
                </button>

                {selectedGrantUser && selectedGrantItem ? (
                  <p className="adminHint wideField">
                    Выдать «{selectedGrantItem.name}» игроку {selectedGrantUser.name}. Баллы не списываются.
                  </p>
                ) : null}
              </div>
            </article>
          </section>

          <section className="adminFormCard adminShopListCard">
            <div className="sectionHeader">
              <div>
                <h2>Предметы магазина</h2>
                <p>Покупки считаются по инвентарю игроков.</p>
              </div>
              <button className="secondaryButton" onClick={() => void refreshShopItems()}>Обновить магазин</button>
            </div>

            <div className="adminShopList">
              {adminShopItems.map((item) => {
                const buyerCount = userInventory.filter((entry) => entry.itemId === item.id).length;
                const isBusy = savingAdminShopItemId === item.id || grantingShopItemId === item.id;
                return (
                  <article className={`adminShopItemRow ${item.isActive ? "" : "inactiveAdminShopItem"}`} key={item.id}>
                    <div className={`shopItemIcon shopItemIcon-${item.styleKey}`}>{item.emoji}</div>
                    <div>
                      <strong>{item.name}</strong>
                      <span>{item.type === "title" ? "Титул" : "Рамка"} · {item.price.toLocaleString("ru-RU")} б. · {buyerCount} владельцев</span>
                      <p>{item.description || "Описание не задано"}</p>
                      <small>{item.id} · {item.styleKey} · порядок {item.sortOrder}</small>
                    </div>
                    <div className="adminShopRowActions">
                      <button onClick={() => startEditShopItem(item)}>Править</button>
                      <button className="secondaryButton" onClick={() => toggleAdminShopItem(item)} disabled={isBusy}>
                        {item.isActive ? "Скрыть" : "Включить"}
                      </button>
                      <button className="secondaryButton" onClick={() => { setAdminShopGrantForm((current) => ({ ...current, itemId: item.id })); void grantShopItemToUser(item.id); }} disabled={isBusy}>
                        Выдать
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      );
    }

    function renderAdminSecurity() {
      return (
        <div className="adminTabPanel">
          <section className="adminSecurityCard">
            <div className="sectionHeader"><h2>Безопасность и доступы</h2></div>
            <div className="adminSecurityGrid upgradedSecurityGrid">
              <div><span>Telegram</span><strong>{isTelegram ? "Да" : "Нет"}</strong><small>Mini App режим</small></div>
              <div><span>Session token</span><strong>{authSessionToken ? "Есть" : "Нет"}</strong><small>Bearer-сессия</small></div>
              <div><span>Роль</span><strong>{isAdmin ? "Админ" : "Участник"}</strong><small>{activeUser?.id}</small></div>
              <div><span>Mini App URL</span><strong>{TELEGRAM_MINI_APP_URL ? "Настроен" : "Не настроен"}</strong><small>deep links</small></div>
              <div><span>Админов</span><strong>{adminUserIds.length}</strong><small>из Render ENV</small></div>
              <div><span>Публичный режим</span><strong>Только просмотр</strong><small>без действий</small></div>
            </div>
          </section>
        </div>
      );
    }

    return (
      <section className="adminCenterPage pageStack upgradedAdminCenterPage">
        <section className="adminCenterHero upgradedAdminHero">
          <div>
            <p className="eyebrow">Админка</p>
            <h2>Панель управления</h2>
            <p>Все рабочие инструменты собраны в одном месте: пользователи, рынки, заявки, расчёт, Polymarket и ручные начисления. Редактирование и закрытие конкретного рынка остаются внутри рынка.</p>
          </div>
          <div className="adminCenterStatus">
            <span>Текущая сессия</span>
            <strong>{activeUser?.name}</strong>
            <small>{authSessionToken ? "Защищённый вход через Telegram" : "Нет безопасной сессии"}</small>
          </div>
        </section>

        {renderAdminInnerNav()}

        {adminTab === "overview" && renderAdminOverview()}
        {adminTab === "users" && renderAdminUsers()}
        {adminTab === "markets" && renderAdminMarkets()}
        {adminTab === "create" && renderAdminCreate()}
        {adminTab === "suggestions" && <div className="adminTabPanel">{renderSuggestionList(marketSuggestions, "admin")}</div>}
        {adminTab === "settlement" && <div className="adminTabPanel adminEmbeddedPanel">{renderSettlementPage()}</div>}
        {adminTab === "polymarket" && renderAdminPolymarket()}
        {adminTab === "points" && renderAdminPoints()}
        {adminTab === "tournament" && renderAdminTournament()}
        {adminTab === "shop" && renderAdminShop()}
        {adminTab === "security" && renderAdminSecurity()}
      </section>
    );
  }

  function renderModerationPage() {
    if (!isAdmin) {
      return <section className="moderationPage"><div className="empty">Этот раздел доступен только администраторам.</div></section>;
    }

    return (
      <section className="moderationPage">
        <section className="suggestHeroPanel moderationHeroPanel">
          <div>
            <p className="eyebrow">Админка контента</p>
            <h2>Заявки на рынки</h2>
            <p>Проверяй идеи пользователей, правь формулировки и публикуй хорошие рынки в один клик.</p>
          </div>
          <div className="suggestHeroStats">
            <span>Новые заявки</span>
            <strong>{pendingSuggestions.length}</strong>
            <small>Всего: {marketSuggestions.length}</small>
          </div>
        </section>
        {renderSuggestionList(marketSuggestions, "admin")}
      </section>
    );
  }

  function renderTelegramNotificationCard() {
    const botUrl = getTelegramBotUrl();
    const notificationStatus = hasSafeSession
      ? "Telegram подключён"
      : isTelegram
        ? "Нужно перезапустить Mini App"
        : "Открой через Telegram";

    const notificationPrefs = {
      settlement: activeUser?.telegramNotifySettlement !== false,
      bonus: activeUser?.telegramNotifyBonus !== false,
      closing: activeUser?.telegramNotifyClosing !== false,
      admin: activeUser?.telegramNotifyAdmin !== false,
      following: activeUser?.telegramNotifyFollowing !== false,
    };

    const notificationToggles: Array<{
      key: "settlement" | "bonus" | "closing" | "admin" | "following";
      icon: string;
      title: string;
      text: string;
      enabled: boolean;
      adminOnly?: boolean;
    }> = [
      {
        key: "settlement",
        icon: "🎯",
        title: "Результаты прогнозов",
        text: "Бот напишет, когда рынок рассчитан и прогноз сыграл или не сыграл.",
        enabled: notificationPrefs.settlement,
      },
      {
        key: "bonus",
        icon: "🎁",
        title: "Ежедневный бонус",
        text: "Напоминание, когда можно забрать новый бонус и продолжить серию.",
        enabled: notificationPrefs.bonus,
      },
      {
        key: "closing",
        icon: "⏳",
        title: "Рынок закрывается",
        text: "Напоминание по рынкам, где у тебя есть активный прогноз.",
        enabled: notificationPrefs.closing,
      },
      {
        key: "following",
        icon: "👥",
        title: "Активность подписок",
        text: "Бот напишет, когда игрок из твоих подписок сделает прогноз, комментарий, выиграет или откроет предмет.",
        enabled: notificationPrefs.following,
      },
      {
        key: "admin",
        icon: "⚙️",
        title: "Админские задачи",
        text: "Заявки на рынки и рынки, которые ждут расчёта.",
        enabled: notificationPrefs.admin,
        adminOnly: true,
      },
    ];

    return (
      <article className="profileCard telegramNotificationCard">
        <div className="notificationCardGlow" aria-hidden="true" />
        <div className="sectionHeader notificationCardHeader">
          <div>
            <p className="eyebrow">Telegram-уведомления</p>
            <h2>Бот вернёт пользователя в игру</h2>
          </div>
          <span className={hasSafeSession ? "notificationStatusReady" : "notificationStatusPending"}>
            {notificationStatus}
          </span>
        </div>

        <p>
          Выбери, какие уведомления присылать в Telegram. Настройки сохраняются на backend и
          учитываются при автоматической рассылке.
        </p>

        <div className="notificationToggleList">
          {notificationToggles
            .filter((item) => !item.adminOnly || isAdmin)
            .map((item) => (
              <label className="notificationToggleItem" key={item.key}>
                <span className="notificationToggleIcon">{item.icon}</span>
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.text}</small>
                </span>
                <input
                  type="checkbox"
                  checked={item.enabled}
                  disabled={!hasSafeSession || isSavingTelegramNotificationPrefs}
                  onChange={(event) => void updateTelegramNotificationPreference(item.key, event.target.checked)}
                />
                <i aria-hidden="true" />
              </label>
            ))}
        </div>

        <div className="notificationActionRow">
          <button onClick={sendTestTelegramNotification} disabled={!hasSafeSession || isTestingTelegramNotification}>
            {isTestingTelegramNotification ? "Отправляю..." : "Отправить тест"}
          </button>
          <button className="secondaryButton" onClick={openTelegramBot} disabled={!botUrl && !TELEGRAM_MINI_APP_URL}>
            Открыть бота
          </button>
        </div>

        {!hasSafeSession && (
          <small className="notificationHint">
            Для теста уведомления и изменения настроек открой приложение именно через Telegram Mini App.
          </small>
        )}
      </article>
    );
  }

  function renderProfileShopPage() {
    if (!activeUser) return null;

    const renderShopItem = (item: ShopItem) => {
      const owned = activeUserOwnedItemIds.has(item.id);
      const equipped = activeUser.activeTitleItemId === item.id || activeUser.activeFrameItemId === item.id;
      const busy = buyingShopItemId === item.id || equippingShopItemId === item.id;

      return (
        <article className={`shopItemCard shopItem-${item.type} ${owned ? "ownedShopItem" : ""} ${equipped ? "equippedShopItem" : ""}`} key={item.id}>
          <div className={`shopItemIcon shopItemIcon-${item.styleKey}`}>{item.emoji}</div>
          <div>
            <strong>{item.name}</strong>
            <p>{item.description}</p>
            <small>{owned ? equipped ? "Активно" : "В инвентаре" : `${item.price.toLocaleString("ru-RU")} баллов`}</small>
          </div>
          <button
            disabled={busy || equipped}
            onClick={() => {
              if (owned) void equipShopItem(item);
              else void buyShopItem(item);
            }}
          >
            {busy ? "..." : equipped ? "Выбрано" : owned ? "Выбрать" : "Купить"}
          </button>
        </article>
      );
    };

    return (
      <section className="profileStylePage profileContentGrid">
        <article className={`profileCard stylePreviewCard ${getUserFrameClass(activeUser)}`}>
          <div className="sectionHeader">
            <div>
              <p className="eyebrow">Мой стиль</p>
              <h2>Косметика за игровые баллы</h2>
            </div>
            <span>{activeUserInventory.length} предметов</span>
          </div>

          {!hasSafeSession && (
            <div className="styleSessionHint">
              Покупки доступны только при запуске через Telegram Mini App.
            </div>
          )}

          <div className="stylePreviewHero">
            <div className={`profileAvatar gameProfileAvatar styledProfileAvatar ${getUserFrameClass(activeUser)}`}>{activeUser.name.slice(0, 1).toUpperCase()}</div>
            <div>
              <strong>{activeUser.name}</strong>
              {activeTitleItem ? <span className={`activeProfileTitle titleStyle-${activeTitleItem.styleKey}`}>{activeTitleItem.emoji} {activeTitleItem.name}</span> : <span className="emptyProfileTitle">Без титула</span>}
              <small>{activeFrameItem ? `Рамка: ${activeFrameItem.name}` : "Рамка не выбрана"}</small>
            </div>
          </div>

          <div className="styleResetRow">
            <button className="secondaryButton" onClick={() => void equipShopItem(null, "title")} disabled={!activeUser.activeTitleItemId || Boolean(equippingShopItemId)}>Снять титул</button>
            <button className="secondaryButton" onClick={() => void equipShopItem(null, "frame")} disabled={!activeUser.activeFrameItemId || Boolean(equippingShopItemId)}>Снять рамку</button>
          </div>

          {isUsingFallbackShopItems ? (
            <div className="shopBackendWarning">
              <strong>Предметы показаны из встроенного списка.</strong>
              <span>Нажми “Обновить магазин”; если после этого покупка не проходит, значит Render всё ещё отдаёт старый backend.</span>
              <button className="secondaryButton" onClick={() => void refreshShopItems()}>Обновить магазин</button>
            </div>
          ) : null}

          <p className="styleLegalHint">Предметы — только внутриигровая косметика. Они не имеют денежной или имущественной ценности.</p>
        </article>

        <article className="profileCard shopSectionCard profileWideCard">
          <div className="sectionHeader">
            <div>
              <h2>Титулы</h2>
              <p>Показываются в профиле и рядом с именем.</p>
            </div>
            <span>{titleShopItems.length}</span>
          </div>
          <div className="shopGrid">
            {titleShopItems.length === 0 ? (
              <div className="empty shopEmptyState">
                Титулы не загрузились с backend. После деплоя server/index.ts обнови приложение.
              </div>
            ) : titleShopItems.map(renderShopItem)}
          </div>
        </article>

        <article className="profileCard shopSectionCard profileWideCard">
          <div className="sectionHeader">
            <div>
              <h2>Рамки профиля</h2>
              <p>Выделяют аватар и профиль.</p>
            </div>
            <span>{frameShopItems.length}</span>
          </div>
          <div className="shopGrid">
            {frameShopItems.length === 0 ? (
              <div className="empty shopEmptyState">
                Рамки не загрузились с backend. После деплоя server/index.ts обнови приложение.
              </div>
            ) : frameShopItems.map(renderShopItem)}
          </div>
        </article>
      </section>
    );
  }

  function renderUnlockableRewardsCard() {
    if (!activeUser) return null;

    return (
      <article className="profileCard unlockableRewardsCard profileWideCard">
        <div className="sectionHeader">
          <div>
            <p className="eyebrow">Открываемые награды</p>
            <h2>Косметика за достижения</h2>
            <p>Игра сама выдаёт предметы, когда ты выполняешь условия.</p>
          </div>
          <span>{unlockableCosmeticRewards.filter((reward) => reward.unlocked).length}/{unlockableCosmeticRewards.length}</span>
        </div>

        <div className="unlockableRewardList">
          {unlockableCosmeticRewards.map((reward) => (
            <article className={`unlockableRewardItem ${reward.unlocked ? "unlockedRewardItem" : ""}`} key={reward.itemId}>
              <div className="unlockableRewardIcon">{reward.unlocked ? "✅" : reward.emoji}</div>
              <div>
                <strong>{reward.title}</strong>
                <p>{reward.description}</p>
                <small>{reward.unlocked ? "Уже открыт" : reward.requirement}</small>
                <div className="unlockableProgressBar">
                  <span style={{ width: `${reward.progress}%` }} />
                </div>
              </div>
              <b>{reward.unlocked ? "Открыто" : `${Math.min(reward.current, reward.target)}/${reward.target}`}</b>
            </article>
          ))}
        </div>
      </article>
    );
  }

  function renderFollowingActivityFeed(mode: "home" | "profile" = "profile") {
    if (!activeUser) return null;

    const compact = mode === "home";
    const items = compact ? followingActivityItems.slice(0, 4) : followingActivityItems.slice(0, 20);

    return (
      <article className={`followingFeedCard profileCard ${compact ? "followingFeedCardHome" : "profileWideCard followingFeedCardProfile"}`}>
        <div className="sectionHeader">
          <div>
            <p className="eyebrow">Лента подписок</p>
            <h2>Активность игроков, на которых ты подписан</h2>
            <p>{activeUserFollowing.length > 0 ? "Следи за прогнозами, комментариями и победами сильных игроков." : "Подпишись на игроков из рейтинга или турнира, чтобы увидеть их активность."}</p>
          </div>
          <span>{followingActivityItems.length}</span>
        </div>

        {activeUserFollowing.length === 0 ? (
          <div className="followingFeedEmpty">
            <strong>Пока нет подписок</strong>
            <p>Открой публичный профиль игрока и нажми “Подписаться”.</p>
            <button onClick={() => setMainView("tournament")}>Найти игроков</button>
          </div>
        ) : items.length === 0 ? (
          <div className="followingFeedEmpty">
            <strong>Активности пока нет</strong>
            <p>Когда игроки, на которых ты подписан, сделают прогноз или комментарий — это появится здесь.</p>
            <button onClick={() => setMainView("search")}>Открыть рынки</button>
          </div>
        ) : (
          <div className="followingFeedList">
            {items.map((item) => {
              const user = users.find((candidate) => candidate.id === item.userId);
              const title = getUserActiveTitle(user);

              return (
                <article className={`followingActivityItem followingActivity-${item.type} ${getUserFrameClass(user)}`} key={item.id}>
                  <button className={`commentAvatar clickableAvatar ${getUserFrameClass(user)}`} onClick={() => openPublicProfile(item.userId)}>
                    {user?.name.slice(0, 1).toUpperCase() || item.userName.slice(0, 1).toUpperCase()}
                  </button>

                  <div className="followingActivityBody">
                    <div className="followingActivityTop">
                      <span>{item.emoji}</span>
                      <button onClick={() => openPublicProfile(item.userId)}>{item.userName}</button>
                      {title ? <em>{title.emoji} {title.name}</em> : null}
                    </div>
                    <strong>{item.title}</strong>
                    <p>{item.text}</p>
                    <small>{item.createdAt}</small>
                  </div>

                  <div className="followingActivityActions">
                    {item.marketId ? (
                      <button onClick={() => openMarketDetails(item.marketId || "")}>Рынок</button>
                    ) : null}
                    <button className="secondaryButton" onClick={() => openPublicProfile(item.userId)}>Профиль</button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </article>
    );
  }

  function renderFollowsCard() {
    if (!activeUser) return null;

    const followingUsers = activeUserFollowing
      .map((follow) => users.find((user) => user.id === follow.followingUserId))
      .filter((user): user is DemoUser => Boolean(user));
    const followerUsers = activeUserFollowers
      .map((follow) => users.find((user) => user.id === follow.followerUserId))
      .filter((user): user is DemoUser => Boolean(user));

    const renderFollowUser = (user: DemoUser, meta: string) => {
      const title = getUserActiveTitle(user);
      return (
        <button className={`followUserItem clickableUserCard ${getUserFrameClass(user)}`} key={user.id} onClick={() => openPublicProfile(user.id)}>
          <div className={`commentAvatar ${getUserFrameClass(user)}`}>{user.name.slice(0, 1).toUpperCase()}</div>
          <div>
            <strong>{user.name}</strong>
            {title ? <span>{title.emoji} {title.name}</span> : null}
            <small>{meta}</small>
          </div>
        </button>
      );
    };

    return (
      <article className="profileCard profileWideCard followCard">
        <div className="sectionHeader">
          <div>
            <h2>Подписки</h2>
            <p>Игроки, за которыми ты следишь, и те, кто следит за тобой.</p>
          </div>
          <span>{activeUserFollowing.length}/{activeUserFollowers.length}</span>
        </div>

        <div className="followStatsGrid">
          <div><strong>{activeUserFollowing.length}</strong><span>подписок</span></div>
          <div><strong>{activeUserFollowers.length}</strong><span>подписчиков</span></div>
        </div>

        <div className="followColumns">
          <section>
            <h3>Ты подписан</h3>
            {followingUsers.length === 0 ? (
              <div className="empty miniEmptyState">Открой публичный профиль игрока и подпишись на него.</div>
            ) : (
              <div className="followList">
                {followingUsers.slice(0, 10).map((user) => renderFollowUser(user, "Открыть профиль"))}
              </div>
            )}
          </section>

          <section>
            <h3>Подписчики</h3>
            {followerUsers.length === 0 ? (
              <div className="empty miniEmptyState">Подписчиков пока нет.</div>
            ) : (
              <div className="followList">
                {followerUsers.slice(0, 10).map((user) => renderFollowUser(user, "Подписчик"))}
              </div>
            )}
          </section>
        </div>
      </article>
    );
  }

  function renderPublicProfilePage() {
    const user = selectedPublicProfileUser || activeUser;

    if (!user) {
      return (
        <section className="publicProfilePage pageStack">
          <button className="backButton" onClick={goBackRoute}>← Назад</button>
          <div className="empty">Профиль игрока не найден.</div>
        </section>
      );
    }

    const userPredictions = predictions.filter((prediction) => prediction.userId === user.id);
    const userSettledPredictions = userPredictions.filter((prediction) => prediction.settledAt);
    const userOpenPredictions = userPredictions.filter((prediction) => !prediction.settledAt);
    const wins = userSettledPredictions.filter((prediction) => prediction.outcome === prediction.resolvedOutcome).length;
    const invested = userPredictions.reduce((sum, prediction) => sum + prediction.amount, 0);
    const payouts = userPredictions.reduce((sum, prediction) => sum + (prediction.payout || 0), 0);
    const winRate = userSettledPredictions.length ? Math.round((wins / userSettledPredictions.length) * 100) : 0;
    const userRank = leaderboard.findIndex((item) => item.id === user.id) + 1;
    const weeklyStanding = weeklyStandings.find((row) => row.user.id === user.id) || null;
    const weeklyRank = weeklyStanding ? weeklyStandings.findIndex((row) => row.user.id === user.id) + 1 : 0;
    const userSuggestions = marketSuggestions.filter((suggestion) => suggestion.userId === user.id);
    const userComments = comments.filter((comment) => comment.userId === user.id);
    const userFollowers = userFollows.filter((follow) => follow.followingUserId === user.id);
    const userFollowing = userFollows.filter((follow) => follow.followerUserId === user.id);
    const isFollowingUser = Boolean(activeUser && userFollows.some((follow) => follow.followerUserId === activeUser.id && follow.followingUserId === user.id));
    const isFollowBusy = followingUserId === user.id;
    const userStats = { predictionsCount: userPredictions.length, settledCount: userSettledPredictions.length, wins, winRate };
    const level = getUserLevel(userStats, userRank, user);
    const achievements = getUserAchievements({
      user,
      stats: userStats,
      rank: userRank,
      suggestionsCount: userSuggestions.length,
    });
    const unlockedCount = achievements.filter((achievement) => achievement.unlocked).length;
    const userInventoryItems = userInventory
      .filter((entry) => entry.userId === user.id)
      .map((entry) => effectiveShopItems.find((item) => item.id === entry.itemId))
      .filter((item): item is ShopItem => Boolean(item));
    const activeTitle = getUserActiveTitle(user);
    const activeFrame = effectiveShopItems.find((item) => item.id === user.activeFrameItemId && item.type === "frame") || null;
    const bestPayout = userSettledPredictions.reduce((max, prediction) => Math.max(max, prediction.payout || 0), 0);
    const recentPredictions = [...userPredictions]
      .sort((a, b) => (parseAppDate(b.createdAt)?.getTime() || 0) - (parseAppDate(a.createdAt)?.getTime() || 0))
      .slice(0, 6);

    return (
      <section className="publicProfilePage gameProfilePage">
        <button className="backButton publicProfileBackButton" onClick={goBackRoute}>← Назад</button>

        <article className={`profileHeroCard gameProfileHeroCard publicProfileHero styledProfileHero ${getUserFrameClass(user)}`}>
          <div className="profileHeroGlow" aria-hidden="true" />
          <div className={`profileAvatar gameProfileAvatar styledProfileAvatar ${getUserFrameClass(user)}`}>{user.name.slice(0, 1).toUpperCase()}</div>

          <div className="profileMainInfo gameProfileMainInfo">
            <div className="profileRoleRow">
              <span className="profileRole">{adminUserIds.includes(user.id) ? "Администратор" : "Игрок"}</span>
              <span className="profileLevelBadge">{level.emoji} Уровень {level.level} · {level.title}</span>
            </div>
            <h2>{user.name}</h2>
            {activeTitle ? <span className={`activeProfileTitle titleStyle-${activeTitle.styleKey}`}>{activeTitle.emoji} {activeTitle.name}</span> : <span className="emptyProfileTitle">Без титула</span>}
            <p>{level.description}</p>

            <div className="levelProgressBlock gameLevelProgressBlock">
              <div className="levelProgressTop">
                <span>{level.score.toLocaleString("ru-RU")} XP</span>
                <span>{level.nextTitle === "Максимум" ? "Максимальный уровень" : `До «${level.nextTitle}»`}</span>
              </div>
              <div className="levelProgressBar"><span style={{ width: `${level.progress}%` }} /></div>
            </div>

            <div className="profileHeroActions">
              {user.id === activeUser?.id ? (
                <button onClick={() => { setSelectedPublicProfileUserId(null); setMainView("profile"); }}>Открыть мой профиль</button>
              ) : isFollowingUser ? (
                <button className="secondaryButton" disabled={isFollowBusy} onClick={() => void unfollowUser(user.id)}>{isFollowBusy ? "..." : "Отписаться"}</button>
              ) : (
                <button disabled={isFollowBusy || !activeUser} onClick={() => void followUser(user.id)}>{isFollowBusy ? "..." : "Подписаться"}</button>
              )}
              <button className="secondaryButton" onClick={() => setMainView("tournament")}>Турнир</button>
              <button className="secondaryButton" onClick={() => setMainView("markets")}>К рынкам</button>
            </div>
          </div>

          <div className="profileBalanceBox gameProfileBalanceBox">
            <span>Публичная карточка</span>
            <strong>{user.balance.toLocaleString("ru-RU")} баллов</strong>
            <small>{activeFrame ? `Рамка: ${activeFrame.name}` : "Рамка не выбрана"}</small>
            <button onClick={() => refreshData(activeUser?.id)}>Обновить</button>
          </div>
        </article>

        <section className="profileStatsGrid gameProfileStatsGrid publicProfileStatsGrid">
          <div><span>Место</span><strong>{userRank ? `#${userRank}` : "—"}</strong><small>общий рейтинг</small></div>
          <div><span>Турнир</span><strong>{weeklyRank ? `#${weeklyRank}` : "—"}</strong><small>{weeklyStanding ? `${weeklyStanding.score >= 0 ? "+" : ""}${weeklyStanding.score.toLocaleString("ru-RU")} б.` : "нет результата"}</small></div>
          <div><span>Прогнозы</span><strong>{userPredictions.length}</strong><small>{userOpenPredictions.length} активных</small></div>
          <div><span>Winrate</span><strong>{winRate}%</strong><small>{wins}/{userSettledPredictions.length || 0} побед</small></div>
          <div><span>Лучший выигрыш</span><strong>{bestPayout.toLocaleString("ru-RU")}</strong><small>баллов</small></div>
          <div><span>Предметы</span><strong>{userInventoryItems.length}</strong><small>{unlockedCount}/{achievements.length} достиж.</small></div>
          <div><span>Подписчики</span><strong>{userFollowers.length}</strong><small>{userFollowing.length} подписок</small></div>
        </section>

        <section className="publicProfileGrid">
          <article className="profileCard publicProfileCard">
            <div className="sectionHeader">
              <h2>Косметика</h2>
              <span>{userInventoryItems.length}</span>
            </div>
            {userInventoryItems.length === 0 ? (
              <div className="empty">Игрок ещё не открыл предметы.</div>
            ) : (
              <div className="publicInventoryGrid">
                {userInventoryItems.slice(0, 10).map((item) => (
                  <div className={`publicInventoryItem shopItemIcon-${item.styleKey}`} key={item.id}>
                    <span>{item.emoji}</span>
                    <strong>{item.name}</strong>
                    <small>{item.type === "title" ? "Титул" : "Рамка"}</small>
                  </div>
                ))}
              </div>
            )}
          </article>

          <article className="profileCard publicProfileCard">
            <div className="sectionHeader">
              <h2>Достижения</h2>
              <span>{unlockedCount}/{achievements.length}</span>
            </div>
            <div className="publicAchievementsGrid">
              {achievements.slice(0, 6).map((achievement) => (
                <div className={`publicAchievementItem ${achievement.unlocked ? "unlockedPublicAchievement" : ""}`} key={achievement.id}>
                  <span>{achievement.unlocked ? achievement.emoji : "🔒"}</span>
                  <div>
                    <strong>{achievement.title}</strong>
                    <small>{achievement.unlocked ? "Открыто" : `${achievement.progress}%`}</small>
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="profileCard publicProfileCard profileWideCard publicPredictionsCard">
            <div className="sectionHeader">
              <h2>Последние прогнозы</h2>
              <span>{recentPredictions.length}</span>
            </div>
            {recentPredictions.length === 0 ? (
              <div className="empty">Пока нет прогнозов.</div>
            ) : (
              <div className="publicPredictionList">
                {recentPredictions.map((prediction) => {
                  const market = markets.find((item) => item.id === prediction.marketId);
                  const isWinner = prediction.settledAt && prediction.outcome === prediction.resolvedOutcome;
                  return (
                    <button className="publicPredictionItem" key={prediction.id} onClick={() => openMarketDetails(prediction.marketId)}>
                      <div>
                        <strong>{prediction.marketQuestion}</strong>
                        <span>{getOutcomeText(prediction.outcome)} · {prediction.amount.toLocaleString("ru-RU")} б. · {prediction.createdAt}</span>
                      </div>
                      <b className={prediction.settledAt ? isWinner ? "positiveAmount" : "negativeAmount" : ""}>
                        {prediction.settledAt ? isWinner ? "Выиграл" : "Проиграл" : market?.status === "closed" ? "Ждёт" : "Активен"}
                      </b>
                    </button>
                  );
                })}
              </div>
            )}
          </article>

          <article className="profileCard publicProfileCard">
            <div className="sectionHeader">
              <h2>Социальная активность</h2>
              <span>💬</span>
            </div>
            <div className="publicSocialStats">
              <div><strong>{userComments.length}</strong><span>комментариев</span></div>
              <div><strong>{userSuggestions.length}</strong><span>предложений рынков</span></div>
              <div><strong>{invested.toLocaleString("ru-RU")}</strong><span>баллов в прогнозах</span></div>
              <div><strong>{payouts.toLocaleString("ru-RU")}</strong><span>выплат получено</span></div>
            </div>
          </article>
        </section>
      </section>
    );
  }

  function renderProfilePage() {
    if (!activeUser) {
      return <section className="profilePage"><div className="empty">Профиль пока не загружен.</div></section>;
    }

    const displayInitial = activeUser.name.slice(0, 1).toUpperCase();
    const roleTitle = isAdmin ? "Администратор" : "Участник";
    const level = activeUserLevel;
    const netResult = activeUserStats.payouts - activeUserStats.invested;
    const bestPayout = activeUserSettledPredictions.reduce((max, prediction) => Math.max(max, prediction.payout || 0), 0);
    const waitingResultCount = activeUserPredictions.filter((prediction) => {
      const market = markets.find((item) => item.id === prediction.marketId);
      return !prediction.settledAt && market?.status === "closed";
    }).length;
    const nextLevelHint = level.nextTitle === "Максимум" ? "Максимальный уровень" : `До «${level.nextTitle}»`;
    const profileTabs: { id: ProfileTab; icon: string; label: string; badge?: number | string }[] = [
      { id: "overview", icon: "🏠", label: "Обзор" },
      { id: "style", icon: "🛍️", label: "Стиль", badge: activeUserInventory.length },
      { id: "achievements", icon: "🏅", label: "Достижения", badge: `${unlockedAchievementsCount}/${activeUserAchievements.length}` },
      { id: "predictions", icon: "🎯", label: "Прогнозы", badge: activeUserPredictions.length },
      { id: "social", icon: "🤝", label: "Соц.", badge: activeUserReferrals.length + activeUserFollowing.length + activeUserFollowers.length },
      { id: "history", icon: "💳", label: "Баллы", badge: activeUserTransactions.length },
    ];

    return (
      <section className="profilePage gameProfilePage">
        <article className={`profileHeroCard gameProfileHeroCard styledProfileHero ${getUserFrameClass(activeUser)}`}>
          <div className="profileHeroGlow" aria-hidden="true" />
          <div className={`profileAvatar gameProfileAvatar styledProfileAvatar ${getUserFrameClass(activeUser)}`}>{displayInitial}</div>

          <div className="profileMainInfo gameProfileMainInfo">
            <div className="profileRoleRow">
              <span className="profileRole">{roleTitle}</span>
              <span className="profileLevelBadge">{level.emoji} Уровень {level.level} · {level.title}</span>
            </div>
            <h2>{activeUser.name}</h2>
            {activeTitleItem ? <span className={`activeProfileTitle titleStyle-${activeTitleItem.styleKey}`}>{activeTitleItem.emoji} {activeTitleItem.name}</span> : null}
            <p>{level.description}</p>

            <div className="levelProgressBlock gameLevelProgressBlock">
              <div className="levelProgressTop">
                <span>{level.score.toLocaleString("ru-RU")} XP</span>
                <span>{nextLevelHint}</span>
              </div>
              <div className="levelProgressBar"><span style={{ width: `${level.progress}%` }} /></div>
            </div>

            <div className="profileHeroActions">
              <button onClick={() => setMainView("predictions")}>Мои прогнозы</button>
              <button className="secondaryButton" onClick={() => void shareReferral()}>Пригласить друга</button>
            </div>
          </div>

          <div className="profileBalanceBox gameProfileBalanceBox">
            <span>Баланс</span>
            <strong>{activeUser.balance.toLocaleString("ru-RU")} баллов</strong>
            <small className={netResult >= 0 ? "positiveAmount" : "negativeAmount"}>
              {netResult >= 0 ? "+" : ""}{netResult.toLocaleString("ru-RU")} итог игры
            </small>
            <button onClick={() => refreshData(activeUser.id)}>Обновить данные</button>
          </div>
        </article>

        <section className="profileStatsGrid gameProfileStatsGrid">
          <div>
            <span>Место</span>
            <strong>{activeUserRank ? `#${activeUserRank}` : "—"}</strong>
            <small>общий рейтинг</small>
          </div>
          <div>
            <span>Прогнозы</span>
            <strong>{activeUserStats.predictionsCount}</strong>
            <small>{activeUserOpenPredictions.length} активных</small>
          </div>
          <div>
            <span>Winrate</span>
            <strong>{activeUserStats.winRate}%</strong>
            <small>{activeUserStats.wins}/{activeUserStats.settledCount || 0} побед</small>
          </div>
          <div>
            <span>Ждут результата</span>
            <strong>{waitingResultCount}</strong>
            <small>закрытые рынки</small>
          </div>
          <div>
            <span>Лучшая выплата</span>
            <strong>{bestPayout.toLocaleString("ru-RU")}</strong>
            <small>баллов</small>
          </div>
          <div>
            <span>Серия бонуса</span>
            <strong>{activeUser.dailyBonusStreak || 0}</strong>
            <small>рекорд {activeUser.bestDailyBonusStreak || 0}</small>
          </div>
        </section>

        <nav className="profileTabBar" aria-label="Разделы профиля">
          {profileTabs.map((tab) => (
            <button className={profileTab === tab.id ? "activeProfileTab" : ""} key={tab.id} onClick={() => setProfileTab(tab.id)}>
              <span>{tab.icon}</span>
              <strong>{tab.label}</strong>
              {tab.badge !== undefined && <small>{tab.badge}</small>}
            </button>
          ))}
        </nav>

        {profileTab === "overview" && (
          <section className="profileContentGrid profileOverviewGrid">
            {renderDailyBonusCard("profile")}
            {renderDailyMissionsCard("profile")}
            {renderUnlockableRewardsCard()}
            {renderTelegramNotificationCard()}
            {renderInterestPicker("profile")}
            {renderReferralCard()}

            <div className="profileCard gameProfileTipCard">
              <div className="sectionHeader">
                <h2>Следующий шаг</h2>
                <span>🎮</span>
              </div>
              <p>
                {activeUserOpenPredictions.length === 0
                  ? "Сделай первый активный прогноз из главной ленты — так ты попадёшь в турнир недели."
                  : waitingResultCount > 0
                    ? "У тебя есть прогнозы, которые ждут расчёта. Проверь их в разделе «Мои»."
                    : "Продолжай играть: выбирай рынки в блоках «Для тебя» и «Закрываются скоро»."}
              </p>
              <button onClick={() => setMainView(activeUserOpenPredictions.length === 0 ? "markets" : "predictions")}>
                {activeUserOpenPredictions.length === 0 ? "Открыть главную" : "Открыть прогнозы"}
              </button>
            </div>

            <div className="profileCard profileRulesCard">
              <div className="sectionHeader">
                <h2>Правила и безопасность</h2>
                <button onClick={() => setIsRulesOpen(true)}>Открыть</button>
              </div>
              <p>Коротко: это фановые прогнозы за игровые баллы. Никаких реальных денег, вывода, пополнений или ставок.</p>
            </div>
          </section>
        )}

        {profileTab === "style" && renderProfileShopPage()}

        {profileTab === "achievements" && (
          <section className="profileCard achievementsCard profileWideCard">
            <div className="sectionHeader">
              <div>
                <h2>Достижения</h2>
                <p>Открывай бейджи за прогнозы, победы, серии бонусов и активность.</p>
              </div>
              <span>{unlockedAchievementsCount}/{activeUserAchievements.length}</span>
            </div>
            <div className="achievementGrid">
              {activeUserAchievements.map((achievement) => (
                <article className={`achievementItem ${achievement.unlocked ? "achievementUnlocked" : ""}`} key={achievement.id}>
                  <div className="achievementIcon">{achievement.emoji}</div>
                  <div className="achievementText">
                    <strong>{achievement.title}</strong>
                    <p>{achievement.description}</p>
                    <div className="achievementProgress"><span style={{ width: `${achievement.progress}%` }} /></div>
                  </div>
                  <span className="achievementState">{achievement.unlocked ? "Открыто" : `${achievement.progress}%`}</span>
                </article>
              ))}
            </div>
          </section>
        )}

        {profileTab === "predictions" && (
          <section className="profileContentGrid profilePredictionsGrid">
            <div className="profileCard">
              <div className="sectionHeader">
                <h2>Активные прогнозы</h2>
                <span>{activeUserOpenPredictions.length}</span>
              </div>
              {activeUserOpenPredictions.length === 0 ? (
                <div className="empty">Активных прогнозов пока нет.</div>
              ) : (
                <div className="myPredictionList compactMyPredictionList">
                  {activeUserOpenPredictions.slice(0, 8).map((prediction) => renderPredictionCard(prediction))}
                </div>
              )}
            </div>

            <div className="profileCard">
              <div className="sectionHeader">
                <h2>Завершённые прогнозы</h2>
                <span>{activeUserSettledPredictions.length}</span>
              </div>
              {activeUserSettledPredictions.length === 0 ? (
                <div className="empty">Завершённых прогнозов пока нет.</div>
              ) : (
                <div className="myPredictionList compactMyPredictionList">
                  {activeUserSettledPredictions.slice(0, 8).map((prediction) => renderPredictionCard(prediction))}
                </div>
              )}
            </div>

            <div className="profileCard profileWideCard">
              <div className="sectionHeader">
                <h2>Избранные рынки</h2>
                <span>{activeFavoriteMarkets.length}</span>
              </div>
              {activeFavoriteMarkets.length === 0 ? (
                <div className="empty">Добавляй интересные рынки в избранное — они появятся здесь.</div>
              ) : (
                <div className="favoriteMarketList">
                  {activeFavoriteMarkets.map((market) => (
                    <button
                      className="favoriteMarketItem"
                      key={market.id}
                      onClick={() => {
                        setSelectedMarketId(market.id);
                        setDetailsTab("overview");
                      }}
                    >
                      <span>{market.category}</span>
                      <strong>{market.question}</strong>
                      <small>{market.status === "resolved" ? `Рассчитан: ${getOutcomeText(market.resolvedOutcome)}` : `До ${formatDateForDisplay(market.closesAt)}`}</small>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {profileTab === "social" && (
          <section className="profileContentGrid profileSocialGrid">
            {renderReferralCard()}
            {renderFollowsCard()}
            {renderFollowingActivityFeed("profile")}

            <div className="profileCard profileWideCard">
              <div className="sectionHeader">
                <h2>Мои предложенные рынки</h2>
                <span>{activeUserSuggestions.length}</span>
              </div>
              {renderSuggestionList(activeUserSuggestions.slice(0, 8), "profile")}
            </div>
          </section>
        )}

        {profileTab === "history" && (
          <section className="profileContentGrid profileHistoryGrid">
            <div className="profileCard profileWideCard">
              <div className="sectionHeader">
                <div>
                  <h2>История баллов</h2>
                  <p>Все начисления, списания, прогнозы, выплаты, бонусы и рефералы.</p>
                </div>
                <span>{activeUserTransactions.length}</span>
              </div>
              {renderTransactions(16)}
            </div>
          </section>
        )}
      </section>
    );
  }

  const appClassName = `app ${isTelegram ? "telegramApp" : ""}`;
  const canShowBackButton = Boolean(predictionConfirmation) || isActivityOpen || isRulesOpen || mainView !== "markets" || Boolean(selectedMarketId);

  if (isLoading) {
    return (
      <main className={appClassName}>
        <div className="loadingScreen">
          <div className="loadingOrb" aria-hidden="true">
            <span>📈</span>
          </div>
          <p className="loadingEyebrow">Прогреваем рынок</p>
          <h1>Forecast Market</h1>
          <p className="loadingText">Сверяем вероятности, будим backend и начисляем удачу...</p>
          <div className="predictionLoader" aria-label="Загрузка приложения">
            <div className="predictionLoaderTrack">
              <span className="predictionLoaderFill" />
              <span className="predictionLoaderDot predictionLoaderDotYes">ДА</span>
              <span className="predictionLoaderDot predictionLoaderDotNo">НЕТ</span>
            </div>
            <div className="loadingTicks">
              <span>0%</span>
              <span>50%</span>
              <span>100%</span>
            </div>
          </div>
          <p className="loadingJoke">Если вероятность загрузки выше 50% — мы уже почти победили.</p>
        </div>
      </main>
    );
  }

  if (serverError) {
    return (
      <main className={appClassName}>
        <div className="errorBox">
          <h1>Backend недоступен</h1>
          <p>{serverError}</p>
          <p>Проверь Render backend и переменные окружения.</p>
          <button onClick={initializeApp}>Повторить подключение</button>
        </div>
      </main>
    );
  }

  return (
    <main className={appClassName}>
      {toastMessage && <div className="appToast" role="status">{toastMessage}</div>}
      {renderPredictionConfirmationModal()}
      {renderActivityCenter()}

      <button className="activityFloatingButton" onClick={() => setIsActivityOpen(true)} aria-label="Открыть центр событий">
        🔔
        {activityBadgeCount > 0 && <span>{activityBadgeCount}</span>}
      </button>

      {canShowBackButton && (
        <button className="floatingBackButton" onClick={goBackRoute} aria-label="Вернуться назад">
          ← Назад
        </button>
      )}

      {!activeUser && !isLoading && (
        <section className="authWarningCard securityModeCard">
          <div>
            <strong>Режим просмотра</strong>
            <p>Рынки можно смотреть без входа. Прогнозы, бонусы, комментарии и админ-действия доступны только при запуске через Telegram Mini App — так приложение входит именно под твоим Telegram ID.</p>
          </div>
          {TELEGRAM_MINI_APP_URL ? (
            <button onClick={openTelegramMiniApp}>Открыть через Telegram</button>
          ) : (
            <p className="authWarningNote">Ссылка Telegram Mini App пока не настроена в переменных Vercel.</p>
          )}
        </section>
      )}

      <section className="brandHeader" aria-label="Forecast Market">
        <div className="brandHeroShell">
          <img
            src="/forecast-market-logo-cropped.png"
            alt="Forecast Market"
            className="brandHeroLogo"
          />
          <div className="brandHeroText">
            <span>Социальная биржа прогнозов</span>
            <strong>Прогнозируй события, набирай баллы и поднимайся в рейтинге</strong>
          </div>
        </div>
        <div className="brandHeaderProfileCard">
          <div>
            <span>{activeUser?.name || "Режим просмотра"}</span>
            <strong>{(activeUser?.balance || 0).toLocaleString("ru-RU")} баллов</strong>
            <p>{activeUser ? `${isAdmin ? "Администратор" : "Участник"} · ${activeUserStats.predictionsCount} прогнозов · Winrate ${activeUserStats.winRate}%` : "Открой через Telegram, чтобы делать прогнозы"}</p>
          </div>
          <div className="brandHeaderActions">
            <button className="activityHeaderButton" onClick={() => setIsActivityOpen(true)}>
              События {activityBadgeCount > 0 && <span>{activityBadgeCount}</span>}
            </button>
            <button onClick={() => setMainView("profile")}>Профиль</button>
            <button className="secondaryButton" onClick={() => setIsRulesOpen(true)}>Правила</button>
          </div>
        </div>
      </section>

      <section className="productTopBar">
        <div className="productNav">
          <button
            className={mainView === "markets" && !selectedMarket ? "activeProductNav" : ""}
            onClick={() => {
              setSelectedMarketId(null);
              setSelectedPublicProfileUserId(null);
              setMainView("markets");
            }}
          >
            Рынки
          </button>
          <button
            className={mainView === "imported" && !selectedMarket ? "activeProductNav" : ""}
            onClick={() => {
              setSelectedMarketId(null);
              setSelectedPublicProfileUserId(null);
              setMainView("imported");
            }}
          >
            Polymarket
          </button>
          <button
            className={mainView === "search" && !selectedMarket ? "activeProductNav" : ""}
            onClick={() => {
              setSelectedMarketId(null);
              setSelectedPublicProfileUserId(null);
              setMainView("search");
            }}
          >
            Поиск
          </button>
          <button
            className={mainView === "predictions" && !selectedMarket ? "activeProductNav" : ""}
            onClick={() => {
              setSelectedMarketId(null);
              setSelectedPublicProfileUserId(null);
              setMainView("predictions");
            }}
          >
            Мои прогнозы
          </button>
          <button
            className={mainView === "tournament" && !selectedMarket ? "activeProductNav" : ""}
            onClick={() => {
              setSelectedMarketId(null);
              setSelectedPublicProfileUserId(null);
              setMainView("tournament");
            }}
          >
            Турнир
          </button>
          <button
            className={mainView === "suggest" && !selectedMarket ? "activeProductNav" : ""}
            onClick={() => {
              setSelectedMarketId(null);
              setSelectedPublicProfileUserId(null);
              setMainView("suggest");
            }}
          >
            Предложить
          </button>
          {isAdmin && (
            <button
              className={(mainView === "admin" || mainView === "moderation" || mainView === "settlement") && !selectedMarket ? "activeProductNav" : ""}
              onClick={() => {
                setSelectedMarketId(null);
                setSelectedPublicProfileUserId(null);
                setMainView("admin");
              }}
            >
              Админка {pendingSuggestions.length + closedMarketsCount > 0 ? `· ${pendingSuggestions.length + closedMarketsCount}` : ""}
            </button>
          )}
          <button
            className={mainView === "profile" ? "activeProductNav" : ""}
            onClick={() => {
              setSelectedMarketId(null);
              setSelectedPublicProfileUserId(null);
              setMainView("profile");
            }}
          >
            Профиль
          </button>
        </div>
        <div className="connectionPill">{isTelegram ? "Telegram Mini App" : "Браузерная версия"}</div>
      </section>

      <nav className="bottomTabBar" aria-label="Нижняя навигация">
        <button
          className={mainView === "markets" && !selectedMarket ? "activeBottomTab" : ""}
          onClick={() => navigateBottomTab("markets")}
        >
          <span>🏠</span>
          <strong>Главная</strong>
        </button>
        <button
          className={mainView === "search" && !selectedMarket ? "activeBottomTab" : ""}
          onClick={() => navigateBottomTab("search")}
        >
          <span>🔍</span>
          <strong>Поиск</strong>
        </button>
        <button
          className={mainView === "predictions" && !selectedMarket ? "activeBottomTab" : ""}
          onClick={() => navigateBottomTab("predictions")}
        >
          <span>🎯</span>
          <strong>Мои</strong>
        </button>
        <button
          className={mainView === "tournament" && !selectedMarket ? "activeBottomTab" : ""}
          onClick={() => navigateBottomTab("tournament")}
        >
          <span>🏆</span>
          <strong>Турнир</strong>
        </button>
        <button
          className={mainView === "profile" && !selectedMarket ? "activeBottomTab" : ""}
          onClick={() => navigateBottomTab("profile")}
        >
          <span>👤</span>
          <strong>Профиль</strong>
        </button>
      </nav>

      {isAdmin && (
        <button
          className={`mobileAdminFab ${(mainView === "admin" || mainView === "moderation" || mainView === "settlement") && !selectedMarket ? "activeMobileAdminFab" : ""}`}
          onClick={() => navigateBottomTab("admin")}
        >
          ⚙️ Админка {pendingSuggestions.length + closedMarketsCount > 0 ? `· ${pendingSuggestions.length + closedMarketsCount}` : ""}
        </button>
      )}

      {showDebugTools && (
        <section className="userPanel">
          <div>
            <h2>Тестовые инструменты</h2>
            <p>Скрытый блок для локальной проверки пользователей и данных.</p>
          </div>
          <div className="userControls">
            <label>
              Активный участник
              <select value={activeUserId} onChange={(event) => setActiveUserId(event.target.value)}>
                {users.map((user) => (
                  <option value={user.id} key={user.id}>
                    {user.name} — {user.balance.toLocaleString("ru-RU")} баллов {adminUserIds.includes(user.id) ? "— админ" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Новый участник
              <div className="addUserRow">
                <input placeholder="Имя друга" value={newUserName} onChange={(event) => setNewUserName(event.target.value)} />
                <button onClick={addUser}>Добавить</button>
              </div>
            </label>
          </div>
          <div className="dataActions">
            <button onClick={exportDemoData}>Экспорт JSON</button>
            <button onClick={resetDemo}>Сбросить backend</button>
            <button onClick={() => refreshData(activeUser?.id)}>Обновить</button>
          </div>
        </section>
      )}

      {mainView === "publicProfile" && !selectedMarket ? (
        renderPublicProfilePage()
      ) : mainView === "profile" && !selectedMarket ? (
        renderProfilePage()
      ) : mainView === "predictions" && !selectedMarket ? (
        renderMyPredictionsPage()
      ) : mainView === "tournament" && !selectedMarket ? (
        renderTournamentPage()
      ) : mainView === "suggest" && !selectedMarket ? (
        renderSuggestionPage()
      ) : mainView === "admin" && !selectedMarket ? (
        renderAdminPage()
      ) : mainView === "moderation" && !selectedMarket ? (
        renderModerationPage()
      ) : mainView === "settlement" && !selectedMarket ? (
        renderSettlementPage()
      ) : selectedMarket ? (
        <section className="detailsPage">
          <button className="backButton" onClick={goBackRoute}>
            ← Назад
          </button>

          <div className="detailsLayout">
            <div className="detailsMain">
              <article className="detailsHeroCard">
                <div className="detailsBadgeRow">
                  {getMarketBadges(
                    selectedMarket,
                    selectedMarketPredictions.length,
                    Boolean(activeUserPredictions.find((prediction) => prediction.marketId === selectedMarket.id && !prediction.settledAt)),
                  ).map((badge) => (
                    <span className={`marketMoodBadge marketMoodBadge-${badge.tone}`} key={`details-${badge.label}`}>
                      {badge.emoji} {badge.label}
                    </span>
                  ))}
                </div>
                <div className="marketTop">
                  <span className="category">{selectedMarket.category}</span>
                  <div className="marketMeta">
                    <button
                      className={`favoriteIconButton ${favoriteMarketIds.includes(selectedMarket.id) ? "activeFavorite" : ""}`}
                      onClick={() => toggleFavoriteMarket(selectedMarket.id)}
                    >
                      {favoriteMarketIds.includes(selectedMarket.id) ? "★" : "☆"}
                    </button>
                    <span className={`statusBadge ${getMarketStatusClass(selectedMarket)}`}>
                      {getMarketStatusText(selectedMarket)}
                    </span>
                    <span className="date">{getMarketCloseLabel(selectedMarket)}</span>
                  </div>
                </div>

                <h2>{selectedMarket.question}</h2>
                <p>{getMarketDescription(selectedMarket)}</p>
                <div className="probability">
                  <div>
                    <span>Да</span>
                    <strong>{getYesProbability(selectedMarket)}%</strong>
                  </div>
                  <div>
                    <span>Нет</span>
                    <strong>{100 - getYesProbability(selectedMarket)}%</strong>
                  </div>
                </div>
                <div className="bar detailHeroBar">
                  <div style={{ width: `${getYesProbability(selectedMarket)}%` }} />
                </div>

                <div className="detailHeroStats">
                  <div><span>Закрытие</span><strong>{formatDateForDisplay(selectedMarket.closesAt)}</strong></div>
                  <div><span>Участники</span><strong>{selectedMarketParticipants.length}</strong></div>
                  <div><span>Прогнозы</span><strong>{selectedMarketPredictions.length}</strong></div>
                  <div><span>Комментарии</span><strong>{selectedMarketComments.length}</strong></div>
                </div>

                {selectedMarketUserPrediction && (
                  <div className="detailHeroMyPrediction">
                    <span>Ты участвуешь</span>
                    <strong>{getOutcomeText(selectedMarketUserPrediction.outcome)} · {selectedMarketUserPrediction.amount.toLocaleString("ru-RU")} б.</strong>
                    <button onClick={() => setDetailsTab("trades")}>К истории</button>
                  </div>
                )}
              </article>

              <div className="detailsTabs">
                {([
                  ["overview", "Обзор"],
                  ["trades", "История"],
                  ["participants", "Игроки"],
                  ["chat", "Обсуждение"],
                ] as [DetailsTab, string][]).map(([tabId, title]) => (
                  <button key={tabId} className={detailsTab === tabId ? "activeDetailTab" : "detailTab"} onClick={() => setDetailsTab(tabId)}>
                    {title}
                  </button>
                ))}
              </div>

              {detailsTab === "overview" && (
                <>
                  <section className="detailSection compactRulesSection">
                    <div className="detailSectionHeader">
                      <h3>{isPolymarketSource(selectedMarket.source) ? "О событии" : "Правила расчёта"}</h3>
                      <span>{getMarketSourceLabel(selectedMarket.source)}</span>
                    </div>
                    <div className="rulesBox">
                      <p>{getMarketDescription(selectedMarket)}</p>
                      <ul>
                        <li>
                          Дата закрытия: <b>{formatDateForDisplay(selectedMarket.closesAt)}</b>
                        </li>
                        <li>
                          Формат: <b>игровой прогноз за баллы</b>
                        </li>
                        <li>
                          Статус: <b>{getMarketStatusText(selectedMarket)}</b>
                        </li>
                      </ul>
                    </div>
                  </section>
                  <section className="detailSection">
                    <div className="detailSectionHeader">
                      <h3>Участники рынка</h3>
                      <span>{selectedMarketParticipants.length} участников</span>
                    </div>
                    {renderParticipants()}
                  </section>
                </>
              )}

              {detailsTab === "trades" && (
                <section className="detailSection">
                  <div className="detailSectionHeader">
                    <h3>История сделок</h3>
                    <span>{selectedMarketPredictions.length} сделок</span>
                  </div>
                  {renderTradeHistory(selectedMarketPredictions)}
                </section>
              )}

              {detailsTab === "participants" && (
                <section className="detailSection">
                  <div className="detailSectionHeader">
                    <h3>Участники рынка</h3>
                    <span>{selectedMarketParticipants.length} участников</span>
                  </div>
                  {renderParticipants()}
                </section>
              )}

              {detailsTab === "chat" && renderMarketChat(selectedMarket, selectedMarketComments, selectedCommentDraft)}
            </div>

            <aside className="detailsSide">
              {renderDetailTradeBox(selectedMarket)}

              <section className="detailsShareCard">
                <div>
                  <strong>Позови друзей в этот рынок</strong>
                  <span>Ссылка откроет событие сразу в Forecast Market.</span>
                </div>
                <button onClick={() => void shareMarket(selectedMarket)}>Поделиться рынком</button>
              </section>

              {isAdmin && (
                <section className="adminMarketCard">
                  <h3>Управление рынком</h3>
                  {editingMarketId !== selectedMarket.id ? (
                    <div className="adminMarketActions">
                      <button onClick={() => startEditMarket(selectedMarket)}>Редактировать рынок</button>
                      <button onClick={() => duplicateMarket(selectedMarket)}>Дублировать рынок</button>
                      {selectedMarket.status !== "resolved" && <button onClick={() => extendMarket(selectedMarket)}>Продлить</button>}
                      <button onClick={() => void shareMarket(selectedMarket)}>Поделиться</button>
                      <button className={favoriteMarketIds.includes(selectedMarket.id) ? "secondaryButton" : ""} onClick={() => toggleFavoriteMarket(selectedMarket.id)}>
                        {favoriteMarketIds.includes(selectedMarket.id) ? "Убрать из избранного" : "В избранное"}
                      </button>
                      <button className="dangerButton" onClick={() => deleteMarket(selectedMarket)}>Удалить рынок</button>
                    </div>
                  ) : (
                    <div className="editMarketForm">
                      <label>Вопрос рынка<input value={editMarket.question} onChange={(event) => setEditMarket((current) => ({ ...current, question: event.target.value }))} /></label>
                      <label>Категория<input value={editMarket.category} onChange={(event) => setEditMarket((current) => ({ ...current, category: event.target.value }))} /></label>
                      <label>Дата закрытия<input type="date" value={normalizeDateForInput(editMarket.closesAt)} onChange={(event) => setEditMarket((current) => ({ ...current, closesAt: event.target.value }))} /></label>
                      <label>Описание и правила расчета<textarea value={editMarket.description} onChange={(event) => setEditMarket((current) => ({ ...current, description: event.target.value }))} /></label>
                      <label>Источник расчета<input value={editMarket.source} onChange={(event) => setEditMarket((current) => ({ ...current, source: event.target.value }))} /></label>
                      <div className="editMarketButtons">
                        <button onClick={() => saveEditedMarket(selectedMarket.id)}>Сохранить</button>
                        <button className="secondaryButton" onClick={cancelEditMarket}>Отмена</button>
                      </div>
                    </div>
                  )}
                </section>
              )}

              <section className="leaderboardBox">
                <div className="sectionHeader">
                  <h2>Моя статистика</h2>
                  <span>{activeUserStats.predictionsCount}</span>
                </div>
                <div className="compactStats sidebarStats">
                  <div><span>Прогнозы</span><strong>{activeUserStats.predictionsCount}</strong></div>
                  <div><span>Winrate</span><strong>{activeUserStats.winRate}%</strong></div>
                  <div><span>Вложено</span><strong>{activeUserStats.invested.toLocaleString("ru-RU")}</strong></div>
                  <div><span>Выплаты</span><strong>{activeUserStats.payouts.toLocaleString("ru-RU")}</strong></div>
                </div>
              </section>
            </aside>
          </div>
        </section>
      ) : mainView === "imported" ? (
        renderImportedPage()
      ) : mainView === "search" ? (
        renderSearchPage()
      ) : (
        renderHomePage()
      )}

      {renderOnboardingModal()}
      {renderRulesModal()}
    </main>
  );
}

export default App;
