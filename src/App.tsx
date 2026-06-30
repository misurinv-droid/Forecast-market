import { useEffect, useMemo, useState } from "react";
import "./App.css";

type Outcome = "yes" | "no";
type MarketStatus = "open" | "closed" | "resolved";
type SuggestionStatus = "pending" | "approved" | "rejected";
type SortMode = "newest" | "probability" | "trades" | "comments";
type DetailsTab = "overview" | "trades" | "participants" | "chat";
type MainView = "markets" | "imported" | "search" | "predictions" | "suggest" | "moderation" | "settlement" | "profile";
type MyPredictionTab = "active" | "settled" | "won" | "lost" | "all";

type DemoUser = {
  id: string;
  name: string;
  balance: number;
  lastDailyBonusAt?: string;
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
const DAILY_BONUS_AMOUNT = 500;
const DAILY_BONUS_INTERVAL_MS = 24 * 60 * 60 * 1000;
const ONBOARDING_STORAGE_KEY = "forecast-market-onboarding-seen";
const TELEGRAM_MINI_APP_URL = String(import.meta.env.VITE_TELEGRAM_MINI_APP_URL || "").trim();
const APP_PUBLIC_URL = String(import.meta.env.VITE_APP_PUBLIC_URL || window.location.origin).trim();
const AUTH_SESSION_STORAGE_KEY = "forecast-market-auth-session";

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

function getUserLevel(stats: { predictionsCount: number; winRate: number }, rank: number) {
  if (stats.predictionsCount >= 35 && stats.winRate >= 65) {
    return { emoji: "👑", title: "Легенда рынка", description: "Твои прогнозы уже похожи на инсайды." };
  }
  if (stats.predictionsCount >= 20 && stats.winRate >= 55) {
    return { emoji: "🔮", title: "Оракул", description: "Ты стабильно видишь вероятности раньше остальных." };
  }
  if (rank > 0 && rank <= 3 && stats.predictionsCount >= 5) {
    return { emoji: "🏆", title: "Топ-игрок", description: "Ты держишься в верхушке рейтинга." };
  }
  if (stats.predictionsCount >= 10) {
    return { emoji: "🧠", title: "Аналитик", description: "Ты уже набираешь историю решений и стиль игры." };
  }
  if (stats.predictionsCount >= 3) {
    return { emoji: "📈", title: "Трейдер прогнозов", description: "Первые рынки пройдены — начинается настоящая игра." };
  }
  return { emoji: "🚀", title: "Новичок", description: "Сделай несколько прогнозов и открой следующий статус." };
}

function estimatePredictionPayout(market: Market | undefined, prediction: Prediction) {
  if (!market || market.status === "resolved") return prediction.payout || 0;
  const totalPool = market.yesPool + market.noPool;
  const outcomePool = prediction.outcome === "yes" ? market.yesPool : market.noPool;
  if (outcomePool <= 0) return prediction.amount;
  return Math.max(prediction.amount, Math.round((prediction.amount / outcomePool) * totalPool));
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
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(data?.error || "Ошибка запроса к серверу");
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

  // В Android и Telegram Desktop вызов disableVerticalSwipes иногда ломает обычный скролл.
  // Для нашего приложения важнее нормальная прокрутка ленты, поэтому явно оставляем свайпы включёнными.
  try {
    telegramWebApp.enableVerticalSwipes?.();
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

function App() {
  const [users, setUsers] = useState<DemoUser[]>([]);
  const [activeUserId, setActiveUserId] = useState("");
  const [newUserName, setNewUserName] = useState("");

  const [markets, setMarkets] = useState<Market[]>([]);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [comments, setComments] = useState<MarketComment[]>([]);
  const [transactions, setTransactions] = useState<BalanceTransaction[]>([]);
  const [marketSuggestions, setMarketSuggestions] = useState<MarketSuggestion[]>([]);
  const [favoriteMarketIdsByUser, setFavoriteMarketIdsByUser] = useState<Record<string, string[]>>({});
  const [adminUserIds, setAdminUserIds] = useState<string[]>([]);

  const [commentDrafts, setCommentDrafts] = useState<Record<string, CommentDraft>>({});
  const [amountByMarket, setAmountByMarket] = useState<Record<string, number>>({});

  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("Все");
  const [marketSearch, setMarketSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | MarketStatus>("all");
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [importedCategory, setImportedCategory] = useState("Все");
  const [importedSearch, setImportedSearch] = useState("");
  const [isPolymarketImporting, setIsPolymarketImporting] = useState(false);
  const [mainView, setMainView] = useState<MainView>("markets");
  const [myPredictionTab, setMyPredictionTab] = useState<MyPredictionTab>("active");

  const [selectedMarketId, setSelectedMarketId] = useState<string | null>(null);
  const [detailsTab, setDetailsTab] = useState<DetailsTab>("overview");

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

  const isAdmin = Boolean(isTelegram && authSessionToken && activeUser && adminUserIds.includes(activeUser.id));

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

  const pendingSuggestions = useMemo(() => {
    return marketSuggestions.filter((suggestion) => suggestion.status === "pending");
  }, [marketSuggestions]);

  const activeUserRank = useMemo(() => {
    if (!activeUser) return 0;
    const sortedUsers = [...users].sort((a, b) => b.balance - a.balance);
    return sortedUsers.findIndex((user) => user.id === activeUser.id) + 1;
  }, [users, activeUser]);

  const activeUserLevel = useMemo(() => {
    return getUserLevel(activeUserStats, activeUserRank);
  }, [activeUserStats, activeUserRank]);

  const myPredictionsByTab = useMemo(() => {
    if (myPredictionTab === "active") return activeUserOpenPredictions;
    if (myPredictionTab === "settled") return activeUserSettledPredictions;
    if (myPredictionTab === "won") return activeUserSettledPredictions.filter((prediction) => prediction.outcome === prediction.resolvedOutcome);
    if (myPredictionTab === "lost") return activeUserSettledPredictions.filter((prediction) => prediction.outcome !== prediction.resolvedOutcome);
    return activeUserPredictions;
  }, [myPredictionTab, activeUserOpenPredictions, activeUserSettledPredictions, activeUserPredictions]);

  const activeFavoriteMarkets = useMemo(() => {
    return markets.filter((market) => favoriteMarketIds.includes(market.id));
  }, [markets, favoriteMarketIds]);

  const leaderboard = useMemo(() => {
    return [...users].sort((a, b) => b.balance - a.balance);
  }, [users]);

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

  const openMarketsCount = useMemo(() => markets.filter((market) => market.status === "open").length, [markets]);
  const closedMarketsCount = useMemo(() => markets.filter((market) => market.status === "closed").length, [markets]);

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
    setFavoriteMarketIdsByUser(data.favoriteMarketIdsByUser || {});
    setAdminUserIds(data.adminUserIds || []);

    const nextActiveUserId = preferredActiveUserId || activeUserId;
    const hasActiveUser = data.users.some((user) => user.id === nextActiveUserId);
    setActiveUserId(nextActiveUserId && hasActiveUser ? nextActiveUserId : "");
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

  function sendHaptic(type: "light" | "medium" | "heavy" = "light") {
    getRealTelegramWebApp()?.HapticFeedback?.impactOccurred?.(type);
  }

  function sendSuccess() {
    getRealTelegramWebApp()?.HapticFeedback?.notificationOccurred?.("success");
  }

  function sendError() {
    getRealTelegramWebApp()?.HapticFeedback?.notificationOccurred?.("error");
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
    setAmountByMarket((currentAmounts) => ({ ...currentAmounts, [marketId]: amount }));
  }

  async function buyPrediction(market: Market, outcome: Outcome) {
    if (!requireSafeSession() || !activeUser) return;

    try {
      await apiRequest<Prediction>(`/markets/${market.id}/predictions`, {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify({ userId: activeUser.id, outcome, amount: amountByMarket[market.id] || 500 }),
      });
      await refreshData(activeUser.id);
      sendSuccess();
    } catch (error) {
      sendError();
      alert(getErrorMessage(error));
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
    const payload = { version: 4, source: "postgres", exportedAt: new Date().toISOString(), users, markets, predictions, comments, transactions, marketSuggestions, favoriteMarketIdsByUser, adminUserIds };
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
        {selectedMarketParticipants.map((participant) => (
          <div className="participantCard" key={participant.userId}>
            <div className="commentAvatar">{participant.userName.slice(0, 1).toUpperCase()}</div>
            <div>
              <strong>{participant.userName}</strong>
              <p>
                {participant.totalAmount.toLocaleString("ru-RU")} баллов · {participant.predictionsCount} прогнозов
              </p>
              <small>
                Да: {participant.yesAmount.toLocaleString("ru-RU")} · Нет: {participant.noAmount.toLocaleString("ru-RU")}
              </small>
            </div>
          </div>
        ))}
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
          <div className="emptyChat">Пока комментариев нет. Начни обсуждение первым.</div>
        ) : (
          <div className="commentList">
            {marketComments.map((comment) => (
              <div className="commentItem" key={comment.id}>
                <div className="commentAvatar">{comment.userName.slice(0, 1).toUpperCase()}</div>
                <div className="commentBody">
                  <div className="commentMeta">
                    <strong>{comment.userName}</strong>
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
            ))}
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
    setDetailsTab(tab);
    sendHaptic();
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
    const estimatedPayout = estimatePredictionPayout(market, prediction);
    const currentProbability = market ? (prediction.outcome === "yes" ? getYesProbability(market) : 100 - getYesProbability(market)) : prediction.probabilityAtPurchase;

    return (
      <button
        className={`myPredictionCard ${variant === "full" ? "myPredictionCardFull" : ""} ${isSettled ? "settledPredictionCard" : ""}`}
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
            <span>{isSettled ? "Завершён" : "Активный"}</span>
            <strong>{prediction.amount.toLocaleString("ru-RU")} б.</strong>
          </div>
          <h4>{market?.question || prediction.marketQuestion}</h4>
          <div className="myPredictionMetaGrid">
            <div><span>При покупке</span><strong>{prediction.probabilityAtPurchase}%</strong></div>
            <div><span>{isSettled ? "Выплата" : "Потенциально"}</span><strong>{estimatedPayout.toLocaleString("ru-RU")}</strong></div>
            <div><span>{isSettled ? "Результат" : "Сейчас"}</span><strong>{isSettled ? getOutcomeText(prediction.resolvedOutcome) : `${currentProbability}%`}</strong></div>
          </div>
          {isSettled ? (
            <p className={isWinner ? "predictionSettlement winText" : "predictionSettlement lossText"}>
              {isWinner ? "Выигрыш" : "Проигрыш"} · {prediction.settledAt}
            </p>
          ) : (
            <p className="activePrediction">Ожидает расчёта · нажми, чтобы открыть рынок</p>
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

  function renderMyPredictionsPage() {
    if (!activeUser) {
      return <section className="myPredictionsPage"><div className="empty">Прогнозы пока не загружены.</div></section>;
    }

    const tabs: { id: MyPredictionTab; title: string; count: number }[] = [
      { id: "active", title: "Активные", count: activeUserOpenPredictions.length },
      { id: "settled", title: "Завершённые", count: activeUserSettledPredictions.length },
      { id: "won", title: "Выигранные", count: activeUserSettledPredictions.filter((prediction) => prediction.outcome === prediction.resolvedOutcome).length },
      { id: "lost", title: "Проигранные", count: activeUserSettledPredictions.filter((prediction) => prediction.outcome !== prediction.resolvedOutcome).length },
      { id: "all", title: "Все", count: activeUserPredictions.length },
    ];

    return (
      <section className="myPredictionsPage">
        <section className="myPredictionsHero">
          <div>
            <p className="eyebrow">Личный портфель</p>
            <h2>Мои прогнозы</h2>
            <p>Все твои активные и завершённые позиции: сколько вложено, что может прийти и как менялся баланс.</p>
          </div>
          <div className="myPredictionsSummary">
            <div><span>Активные</span><strong>{activeUserOpenPredictions.length}</strong></div>
            <div><span>Winrate</span><strong>{activeUserStats.winRate}%</strong></div>
            <div><span>Баланс</span><strong>{activeUser.balance.toLocaleString("ru-RU")}</strong></div>
          </div>
        </section>

        <section className="predictionTabs">
          {tabs.map((tab) => (
            <button key={tab.id} className={myPredictionTab === tab.id ? "activePredictionTab" : ""} onClick={() => setMyPredictionTab(tab.id)}>
              {tab.title}<span>{tab.count}</span>
            </button>
          ))}
        </section>

        <section className="myPredictionsLayout">
          <div className="myPredictionsListCard">
            <div className="sectionHeader">
              <h2>Позиции</h2>
              <span>{myPredictionsByTab.length}</span>
            </div>
            {myPredictionsByTab.length === 0 ? (
              <div className="empty emptyActionState">
                <strong>Здесь пока пусто</strong>
                <p>Выбери интересный рынок, сделай прогноз и он появится в этом разделе.</p>
                <button onClick={() => setMainView("markets")}>Перейти к рынкам</button>
              </div>
            ) : (
              <div className="myPredictionList">
                {myPredictionsByTab.map((prediction) => renderPredictionCard(prediction, "full"))}
              </div>
            )}
          </div>

          <aside className="balanceHistoryCard">
            <div className="sectionHeader">
              <h2>История баллов</h2>
              <span>{activeUserTransactions.length}</span>
            </div>
            {renderTransactions(12)}
          </aside>
        </section>
      </section>
    );
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

    return (
      <article className={`marketMiniRow ${context === "compact" ? "marketMiniRowCompact" : ""}`} key={market.id}>
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
      </article>
    );
  }

  function renderFeaturedMarketTile(market: Market, index: number) {
    const yesProbability = getYesProbability(market);
    const marketPredictions = predictions.filter((prediction) => prediction.marketId === market.id);
    const activePrediction = activeUserPredictions.find((prediction) => prediction.marketId === market.id && !prediction.settledAt);
    const isImported = isPolymarketSource(market.source);

    return (
      <article className="featuredMarketTile" key={market.id}>
        <div className="featuredTileHead">
          <span className="tileNumber">#{index + 1}</span>
          <span className="category">{market.category}</span>
          {isImported && <span className="sourceBadge polymarketBadge">Polymarket</span>}
        </div>
        <button className="featuredQuestion" onClick={() => openMarketDetails(market.id)}>
          {market.question}
        </button>
        <div className="featuredOddsRow">
          <div>
            <span>Да</span>
            <strong>{yesProbability}%</strong>
          </div>
          <div>
            <span>Нет</span>
            <strong>{100 - yesProbability}%</strong>
          </div>
        </div>
        {renderMarketSignal(market)}
        <div className="featuredTileFoot">
          <span>{marketPredictions.length} прогнозов</span>
          <span>{getMarketCloseLabel(market)}</span>
        </div>
        {activePrediction ? (
          <div className="featuredMyPosition">Ты выбрал {getOutcomeText(activePrediction.outcome)} · {activePrediction.amount.toLocaleString("ru-RU")} б.</div>
        ) : (
          <div className="featuredActions">
            <button onClick={() => openMarketDetails(market.id)}>Сделать прогноз</button>
            <button className="secondaryButton" onClick={() => void shareMarket(market)}>Поделиться</button>
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
            <h2>+{DAILY_BONUS_AMOUNT.toLocaleString("ru-RU")} баллов</h2>
          </div>
        </div>
        <p>Забирай бонус раз в 24 часа и возвращайся проверить новые рынки.</p>
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
      <div className="modalOverlay">
        <section className="rulesModal">
          <button className="modalCloseButton" onClick={() => setIsRulesOpen(false)}>×</button>
          {renderRulesContent()}
        </section>
      </div>
    );
  }

  function renderHomePage() {
    const topLeaderboard = leaderboard.slice(0, isTelegram ? 3 : 5);
    const visiblePopularMarkets = popularMarkets.length > 0 ? popularMarkets : feedMarkets.slice(0, 6);
    const quickPredictions = activeUserOpenPredictions.slice(0, 3);

    return (
      <section className="discoveryPage">
        {isAdmin && (
          <details className="adminDrawer">
            <summary>
              <div>
                <strong>Админ-панель</strong>
                <span>Создание рынков и управление событиями</span>
              </div>
              <b>{isAdminOpen ? "Свернуть" : "Открыть"}</b>
            </summary>
            <div className="adminDrawerBody">
              <div className="adminHeader compactAdminHeader">
                <div>
                  <h2>Новый рынок</h2>
                  <p>Создавай собственные события. Импорт Polymarket живёт в отдельной вкладке.</p>
                </div>
                <button onClick={() => setIsAdminOpen((current) => !current)}>{isAdminOpen ? "Скрыть форму" : "Показать форму"}</button>
              </div>

              {isAdminOpen && (
                <div className="adminForm compactAdminForm">
                  <label className="wideField">Вопрос рынка<input placeholder="Например: Поедем ли мы компанией в отпуск в августе?" value={newMarket.question} onChange={(event) => setNewMarket((current) => ({ ...current, question: event.target.value }))} /></label>
                  <label>Категория<input placeholder="Друзья" value={newMarket.category} onChange={(event) => setNewMarket((current) => ({ ...current, category: event.target.value }))} /></label>
                  <label>Дата закрытия<input type="date" value={newMarket.closesAt} onChange={(event) => setNewMarket((current) => ({ ...current, closesAt: event.target.value }))} /></label>
                  <label className="wideField">Описание и правила расчета<textarea placeholder="Опиши, что должно произойти, чтобы рынок был рассчитан как «Да»." value={newMarket.description} onChange={(event) => setNewMarket((current) => ({ ...current, description: event.target.value }))} /></label>
                  <label className="wideField">Источник расчета<input placeholder="Например: решение в общем чате / официальный сайт / публичная новость" value={newMarket.source} onChange={(event) => setNewMarket((current) => ({ ...current, source: event.target.value }))} /></label>
                  <label>Начальная вероятность “Да”, %<input type="number" min="1" max="99" value={newMarket.yesProbability} onChange={(event) => setNewMarket((current) => ({ ...current, yesProbability: Number(event.target.value) }))} /></label>
                  <button className="createMarketButton" onClick={createMarket}>Создать рынок</button>
                </div>
              )}
            </div>
          </details>
        )}

        <section className="discoveryHeroGrid">
          <div className="discoveryHeroCard">
            <p className="eyebrow">Главная лента</p>
            <h2>Выбирай не из простыни, а из понятных подборок</h2>
            <p>Сначала показываем популярные рынки и твои активные прогнозы. Остальные события спрятаны по категориям.</p>
            <div className="discoveryHeroActions">
              <button onClick={() => setMainView("search")}>Найти рынок</button>
              <button className="secondaryButton" onClick={() => setMainView("imported")}>Polymarket</button>
            </div>
          </div>

          {renderDailyBonusCard("home")}

          <div className="quickPanel quickPanelPredictions">
            <div className="sectionHeader">
              <h2>Мои прогнозы</h2>
              <button onClick={() => setMainView("predictions")}>Все</button>
            </div>
            {quickPredictions.length === 0 ? (
              <div className="miniEmptyState">
                <strong>Активных прогнозов нет</strong>
                <p>Открой популярный рынок и проверь интуицию.</p>
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
                <div className={`leaderboardItem ${user.id === activeUser?.id ? "activeLeaderboardItem" : ""}`} key={user.id}>
                  <div className="place">#{index + 1}</div>
                  <div><strong>{user.name}</strong><p>{user.balance.toLocaleString("ru-RU")} баллов</p></div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="marketDashboardStrip redesignedDashboardStrip">
          <div><span>Открыто</span><strong>{openMarketsCount}</strong></div>
          <div><span>Ждут расчёта</span><strong>{closedMarketsCount}</strong></div>
          <div><span>Событий</span><strong>{markets.length}</strong></div>
          <div><span>Мои прогнозы</span><strong>{activeUserPredictions.length}</strong></div>
          <button onClick={() => setMainView("suggest")}>Предложить рынок</button>
        </section>

        <section className="popularSection">
          <div className="sectionHeader discoverySectionHeader">
            <div>
              <h2>Популярные сейчас</h2>
              <p>Самые активные и свежие рынки — чтобы быстро войти в игру.</p>
            </div>
            <button onClick={() => setMainView("search")}>Расширенный поиск</button>
          </div>
          {visiblePopularMarkets.length === 0 ? (
            <div className="empty">Открытых рынков пока нет.</div>
          ) : (
            <div className="featuredMarketRail">
              {visiblePopularMarkets.map((market, index) => renderFeaturedMarketTile(market, index))}
            </div>
          )}
        </section>

        {recommendedMarkets.length > 0 && (
          <section className="recommendedSection">
            <div className="sectionHeader discoverySectionHeader">
              <div>
                <h2>Можно попробовать</h2>
                <p>Открытые рынки, где у тебя ещё нет активного прогноза.</p>
              </div>
            </div>
            <div className="miniMarketGrid">
              {recommendedMarkets.map((market) => renderMarketMiniRow(market, "compact"))}
            </div>
          </section>
        )}

        <section className="categoryHubSection">
          <div className="sectionHeader discoverySectionHeader">
            <div>
              <h2>Категории</h2>
              <p>Открой нужную тему, не пролистывая весь список рынков.</p>
            </div>
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

  function renderProfilePage() {
    if (!activeUser) {
      return <section className="profilePage"><div className="empty">Профиль пока не загружен.</div></section>;
    }

    const displayInitial = activeUser.name.slice(0, 1).toUpperCase();
    const roleTitle = isAdmin ? "Администратор" : "Участник";
    const level = activeUserLevel;

    return (
      <section className="profilePage">
        <article className="profileHeroCard">
          <div className="profileAvatar">{displayInitial}</div>
          <div className="profileMainInfo">
            <div className="profileRoleRow">
              <span className="profileRole">{roleTitle}</span>
              <span className="profileLevelBadge">{level.emoji} {level.title}</span>
            </div>
            <h2>{activeUser.name}</h2>
            <p>{level.description}</p>
          </div>
          <div className="profileBalanceBox">
            <span>Баланс</span>
            <strong>{activeUser.balance.toLocaleString("ru-RU")} баллов</strong>
            <button onClick={() => refreshData(activeUser.id)}>Обновить данные</button>
          </div>
        </article>

        <section className="profileStatsGrid">
          <div>
            <span>Место в рейтинге</span>
            <strong>{activeUserRank ? `#${activeUserRank}` : "—"}</strong>
          </div>
          <div>
            <span>Всего прогнозов</span>
            <strong>{activeUserStats.predictionsCount}</strong>
          </div>
          <div>
            <span>Активные прогнозы</span>
            <strong>{activeUserOpenPredictions.length}</strong>
          </div>
          <div>
            <span>Winrate</span>
            <strong>{activeUserStats.winRate}%</strong>
          </div>
          <div>
            <span>Вложено</span>
            <strong>{activeUserStats.invested.toLocaleString("ru-RU")}</strong>
          </div>
          <div>
            <span>Получено выплат</span>
            <strong>{activeUserStats.payouts.toLocaleString("ru-RU")}</strong>
          </div>
        </section>

        <section className="profileContentGrid">
          {renderDailyBonusCard("profile")}

          <div className="profileCard profileRulesCard">
            <div className="sectionHeader">
              <h2>Правила и безопасность</h2>
              <button onClick={() => setIsRulesOpen(true)}>Открыть</button>
            </div>
            <p>Коротко: это фановые прогнозы за игровые баллы. Никаких реальных денег, вывода, пополнений или ставок.</p>
          </div>

          <div className="profileCard">
            <div className="sectionHeader">
              <h2>Активные прогнозы</h2>
              <span>{activeUserOpenPredictions.length}</span>
            </div>
            {activeUserOpenPredictions.length === 0 ? (
              <div className="empty">Активных прогнозов пока нет.</div>
            ) : (
              <div className="myPredictionList compactMyPredictionList">
                {activeUserOpenPredictions.slice(0, 5).map((prediction) => renderPredictionCard(prediction))}
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
                {activeUserSettledPredictions.slice(0, 5).map((prediction) => renderPredictionCard(prediction))}
              </div>
            )}
          </div>

          <div className="profileCard">
            <div className="sectionHeader">
              <h2>История баллов</h2>
              <span>{activeUserTransactions.length}</span>
            </div>
            {renderTransactions(8)}
          </div>

          <div className="profileCard profileWideCard">
            <div className="sectionHeader">
              <h2>Мои предложенные рынки</h2>
              <span>{activeUserSuggestions.length}</span>
            </div>
            {renderSuggestionList(activeUserSuggestions.slice(0, 6), "profile")}
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
      </section>
    );
  }

  const appClassName = `app ${isTelegram ? "telegramApp" : ""}`;

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

      <section className="hero">
        <div>
          <p className="eyebrow">Социальная биржа прогнозов</p>
          <h1>Forecast Market</h1>
          <p className="subtitle">
            Прогнозируй события, следи за вероятностями, обсуждай рынки и поднимайся в рейтинге. Без реальных денег — только игровые баллы.
          </p>
        </div>
        <div className="balanceCard">
          <div>
            <span>{activeUser?.name || "Профиль"}</span>
            <strong>{(activeUser?.balance || 0).toLocaleString("ru-RU")} баллов</strong>
            <p>{isAdmin ? "Администратор" : "Участник"} · {activeUserStats.predictionsCount} прогнозов · Winrate {activeUserStats.winRate}%</p>
          </div>
          <button onClick={() => setMainView("profile")}>Открыть профиль</button>
          <button className="secondaryButton" onClick={() => setIsRulesOpen(true)}>Правила</button>
        </div>
      </section>

      <section className="warning">
        Игровые баллы не являются деньгами, не имеют имущественной ценности, не покупаются, не продаются, не передаются и не выводятся.
      </section>

      <section className="productTopBar">
        <div className="productNav">
          <button
            className={mainView === "markets" && !selectedMarket ? "activeProductNav" : ""}
            onClick={() => {
              setSelectedMarketId(null);
              setMainView("markets");
            }}
          >
            Рынки
          </button>
          <button
            className={mainView === "imported" && !selectedMarket ? "activeProductNav" : ""}
            onClick={() => {
              setSelectedMarketId(null);
              setMainView("imported");
            }}
          >
            Polymarket
          </button>
          <button
            className={mainView === "search" && !selectedMarket ? "activeProductNav" : ""}
            onClick={() => {
              setSelectedMarketId(null);
              setMainView("search");
            }}
          >
            Поиск
          </button>
          <button
            className={mainView === "predictions" && !selectedMarket ? "activeProductNav" : ""}
            onClick={() => {
              setSelectedMarketId(null);
              setMainView("predictions");
            }}
          >
            Мои прогнозы
          </button>
          <button
            className={mainView === "suggest" && !selectedMarket ? "activeProductNav" : ""}
            onClick={() => {
              setSelectedMarketId(null);
              setMainView("suggest");
            }}
          >
            Предложить
          </button>
          {isAdmin && (
            <button
              className={mainView === "moderation" && !selectedMarket ? "activeProductNav" : ""}
              onClick={() => {
                setSelectedMarketId(null);
                setMainView("moderation");
              }}
            >
              Заявки {pendingSuggestions.length > 0 ? `· ${pendingSuggestions.length}` : ""}
            </button>
          )}
          {isAdmin && (
            <button
              className={mainView === "settlement" && !selectedMarket ? "activeProductNav" : ""}
              onClick={() => {
                setSelectedMarketId(null);
                setMainView("settlement");
              }}
            >
              Расчёт {closedMarketsCount > 0 ? `· ${closedMarketsCount}` : ""}
            </button>
          )}
          <button
            className={mainView === "profile" ? "activeProductNav" : ""}
            onClick={() => {
              setSelectedMarketId(null);
              setMainView("profile");
            }}
          >
            Профиль
          </button>
        </div>
        <div className="connectionPill">{isTelegram ? "Telegram Mini App" : "Браузерная версия"}</div>
      </section>

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

      {mainView === "profile" && !selectedMarket ? (
        renderProfilePage()
      ) : mainView === "predictions" && !selectedMarket ? (
        renderMyPredictionsPage()
      ) : mainView === "suggest" && !selectedMarket ? (
        renderSuggestionPage()
      ) : mainView === "moderation" && !selectedMarket ? (
        renderModerationPage()
      ) : mainView === "settlement" && !selectedMarket ? (
        renderSettlementPage()
      ) : selectedMarket ? (
        <section className="detailsPage">
          <button className="backButton" onClick={() => setSelectedMarketId(null)}>
            ← Назад
          </button>

          <div className="detailsLayout">
            <div className="detailsMain">
              <article className="detailsHeroCard">
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
                <div className="bar">
                  <div style={{ width: `${getYesProbability(selectedMarket)}%` }} />
                </div>
              </article>

              <div className="detailsTabs">
                {([
                  ["overview", "Обзор"],
                  ["trades", "Сделки"],
                  ["participants", "Участники"],
                  ["chat", "Чат"],
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
                      <h3>{isPolymarketSource(selectedMarket.source) ? "О событии" : "Условия расчёта"}</h3>
                      <span>Источник: {getMarketSourceLabel(selectedMarket.source)}</span>
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
              <section className="detailTradeCard">
                <h3>Сделать прогноз</h3>
                {selectedMarket.status === "closed" && (
                  <div className="marketClosedNotice">Рынок закрыт и ждёт расчёта. Новые прогнозы уже не принимаются.</div>
                )}
                <label>
                  Сумма прогноза
                  <input
                    type="number"
                    min="1"
                    step="100"
                    value={amountByMarket[selectedMarket.id] || 500}
                    disabled={!isMarketTradable(selectedMarket)}
                    onChange={(event) => setAmountByMarket((current) => ({ ...current, [selectedMarket.id]: Number(event.target.value) }))}
                  />
                </label>

                <div className="quickAmountRow">
                  {[100, 500, 1000, 2500].map((amount) => (
                    <button key={amount} disabled={!isMarketTradable(selectedMarket)} onClick={() => setQuickAmount(selectedMarket.id, amount)}>
                      {amount}
                    </button>
                  ))}
                  <button disabled={!isMarketTradable(selectedMarket)} onClick={() => setQuickAmount(selectedMarket.id, activeUser?.balance || 0)}>
                    Всё
                  </button>
                </div>

                <div className="buttons">
                  <button className="yesButton" disabled={!isMarketTradable(selectedMarket)} onClick={() => buyPrediction(selectedMarket, "yes")}>
                    Купить Да
                  </button>
                  <button className="noButton" disabled={!isMarketTradable(selectedMarket)} onClick={() => buyPrediction(selectedMarket, "no")}>
                    Купить Нет
                  </button>
                </div>

                {isAdmin && selectedMarket.status !== "resolved" && (
                  <div className="resolveBox detailResolveBox">
                    <span>Админ-расчет</span>
                    <div>
                      <button className="resolveYesButton" onClick={() => resolveMarket(selectedMarket, "yes")}>Да</button>
                      <button className="resolveNoButton" onClick={() => resolveMarket(selectedMarket, "no")}>Нет</button>
                    </div>
                  </div>
                )}

                {selectedMarket.status === "resolved" && (
                  <div className="resolvedBox">
                    Рынок рассчитан как <b>{getOutcomeText(selectedMarket.resolvedOutcome)}</b>
                    {selectedMarket.resolvedAt ? ` · ${selectedMarket.resolvedAt}` : ""}
                  </div>
                )}
              </section>

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
