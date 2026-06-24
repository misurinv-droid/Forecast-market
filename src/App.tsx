import { useEffect, useMemo, useState } from "react";
import "./App.css";

type Outcome = "yes" | "no";
type MarketStatus = "open" | "resolved";
type SortMode = "newest" | "probability" | "trades" | "comments";
type DetailsTab = "overview" | "trades" | "participants" | "chat";

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
  initDataUnsafe?: { user?: TelegramUser };
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

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Неизвестная ошибка";
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

function App() {
  const [users, setUsers] = useState<DemoUser[]>([]);
  const [activeUserId, setActiveUserId] = useState("");
  const [newUserName, setNewUserName] = useState("");

  const [markets, setMarkets] = useState<Market[]>([]);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [comments, setComments] = useState<MarketComment[]>([]);
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

  const [selectedMarketId, setSelectedMarketId] = useState<string | null>(null);
  const [detailsTab, setDetailsTab] = useState<DetailsTab>("overview");

  const [editingMarketId, setEditingMarketId] = useState<string | null>(null);
  const [editMarket, setEditMarket] = useState<EditMarketForm>(emptyEditMarketForm);
  const [newMarket, setNewMarket] = useState<NewMarketForm>(emptyNewMarketForm);

  const [isLoading, setIsLoading] = useState(true);
  const [serverError, setServerError] = useState("");
  const [isTelegram, setIsTelegram] = useState(false);

  const activeUser = useMemo(() => {
    return users.find((user) => user.id === activeUserId) || users[0] || null;
  }, [users, activeUserId]);

  const isAdmin = Boolean(activeUser && adminUserIds.includes(activeUser.id));

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

  const leaderboard = useMemo(() => {
    return [...users].sort((a, b) => b.balance - a.balance);
  }, [users]);

  const categories = useMemo(() => {
    return ["Все", ...Array.from(new Set(markets.map((market) => market.category)))];
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

  const activityItems = useMemo(() => {
    const predictionItems = predictions.slice(0, 8).map((prediction) => ({
      id: `prediction-${prediction.id}`,
      title: `${prediction.userName} купил ${getOutcomeText(prediction.outcome)}`,
      description: `${prediction.marketQuestion} · ${prediction.amount.toLocaleString("ru-RU")} баллов`,
      date: prediction.createdAt,
    }));

    const commentItems = comments.slice(0, 8).map((comment) => ({
      id: `comment-${comment.id}`,
      title: `${comment.userName} оставил комментарий`,
      description: comment.text || "Фото/GIF",
      date: comment.createdAt,
    }));

    return [...predictionItems, ...commentItems].slice(0, 10);
  }, [predictions, comments]);

  async function refreshData(preferredActiveUserId?: string | null) {
    const data = await apiRequest<BootstrapData>("/bootstrap");
    setUsers(data.users || []);
    setMarkets(data.markets || []);
    setPredictions(data.predictions || []);
    setComments(data.comments || []);
    setFavoriteMarketIdsByUser(data.favoriteMarketIdsByUser || {});
    setAdminUserIds(data.adminUserIds || []);

    const nextActiveUserId = preferredActiveUserId || activeUserId;
    const hasActiveUser = data.users.some((user) => user.id === nextActiveUserId);
    setActiveUserId(nextActiveUserId && hasActiveUser ? nextActiveUserId : data.users[0]?.id || "");
  }

  function adminHeaders() {
    return activeUser ? { "x-user-id": activeUser.id } : {};
  }

  function requireClientAdmin() {
    if (!isAdmin) {
      alert("Это действие доступно только администратору.");
      return false;
    }
    return true;
  }

  function sendHaptic(type: "light" | "medium" | "heavy" = "light") {
    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.(type);
  }

  function sendSuccess() {
    window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.("success");
  }

  function sendError() {
    window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.("error");
  }

  async function initializeApp() {
    setIsLoading(true);
    setServerError("");

    try {
      const telegramWebApp = window.Telegram?.WebApp;
      const telegramUser = telegramWebApp?.initDataUnsafe?.user;
      telegramWebApp?.ready?.();
      telegramWebApp?.expand?.();

      const data = await apiRequest<BootstrapData>("/bootstrap");
      let nextUsers = data.users || [];
      let nextActiveUserId = nextUsers[0]?.id || "";

      if (telegramUser?.id) {
        setIsTelegram(true);
        const fullName = [telegramUser.first_name, telegramUser.last_name].filter(Boolean).join(" ");
        const telegramBackendUser = await apiRequest<DemoUser>("/telegram-user", {
          method: "POST",
          body: JSON.stringify({
            telegramId: telegramUser.id,
            firstName: fullName,
            username: telegramUser.username,
          }),
        });

        nextActiveUserId = telegramBackendUser.id;
        if (!nextUsers.some((user) => user.id === telegramBackendUser.id)) nextUsers = [...nextUsers, telegramBackendUser];
      }

      setUsers(nextUsers);
      setMarkets(data.markets || []);
      setPredictions(data.predictions || []);
      setComments(data.comments || []);
      setFavoriteMarketIdsByUser(data.favoriteMarketIdsByUser || {});
      setAdminUserIds(data.adminUserIds || []);
      setActiveUserId(nextActiveUserId);
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
    const backButton = window.Telegram?.WebApp?.BackButton;
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
    if (!activeUser) {
      alert("Сначала выберите участника");
      return;
    }

    try {
      const result = await apiRequest<{ favoriteMarketIds: string[] }>(`/users/${activeUser.id}/favorites/${marketId}`, {
        method: "POST",
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
    if (!activeUser) {
      alert("Сначала выберите участника");
      return;
    }

    try {
      await apiRequest<Prediction>(`/markets/${market.id}/predictions`, {
        method: "POST",
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
    if (!activeUser) {
      alert("Сначала выберите участника");
      return;
    }

    const draft = commentDrafts[marketId] || emptyCommentDraft;
    const text = draft.text.trim();
    if (!text && !draft.mediaDataUrl) {
      alert("Введите комментарий или прикрепите фото/GIF");
      return;
    }

    try {
      await apiRequest<MarketComment>(`/markets/${marketId}/comments`, {
        method: "POST",
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
    const payload = { version: 3, source: "postgres", exportedAt: new Date().toISOString(), users, markets, predictions, comments, favoriteMarketIdsByUser, adminUserIds };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `forecast-market-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function shareMarket(market: Market) {
    const text = `Forecast Market: ${market.question}`;
    if (window.Telegram?.WebApp?.openTelegramLink) {
      window.Telegram.WebApp.openTelegramLink(`https://t.me/share/url?text=${encodeURIComponent(text)}`);
      return;
    }
    void navigator.clipboard?.writeText(text);
    alert("Текст скопирован.");
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

  if (isLoading) {
    return (
      <main className="app">
        <div className="loadingScreen">
          <h1>Forecast Market</h1>
          <p>Подключаемся к backend...</p>
        </div>
      </main>
    );
  }

  if (serverError) {
    return (
      <main className="app">
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
    <main className="app">
      <section className="hero">
        <div>
          <p className="eyebrow">Социальная биржа прогнозов</p>
          <h1>Forecast Market</h1>
          <p className="subtitle">
            Telegram Mini App с PostgreSQL и ролями. Админские действия доступны только выбранным Telegram ID.
          </p>
        </div>
        <div className="balanceCard">
          <span>{isAdmin ? "Администратор" : "Участник"}</span>
          <strong>{(activeUser?.balance || 0).toLocaleString("ru-RU")} баллов</strong>
          {isAdmin ? <button onClick={resetDemo}>Сбросить backend</button> : <button onClick={() => refreshData(activeUser?.id)}>Обновить</button>}
        </div>
      </section>

      <section className="warning">
        Игровые баллы не являются деньгами, не имеют имущественной ценности, не покупаются, не продаются, не передаются и не выводятся.
      </section>

      <section className="telegramPanel">
        <div>
          <strong>{isTelegram ? "Открыто внутри Telegram" : "Открыто в браузере"}</strong>
          <p>
            Роль: <b>{isAdmin ? "Админ" : "Участник"}</b> · API: <b>{API_BASE}</b>
          </p>
        </div>
        <div>
          <button onClick={() => window.Telegram?.WebApp?.expand?.()}>Развернуть</button>
          <button onClick={() => window.Telegram?.WebApp?.close?.()}>Закрыть</button>
        </div>
      </section>

      <section className="userPanel">
        <div>
          <h2>Участники</h2>
          <p>Обычные участники могут делать прогнозы, писать комментарии и добавлять рынки в избранное.</p>
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
          <button onClick={() => refreshData(activeUser?.id)}>Обновить</button>
        </div>
      </section>

      {selectedMarket ? (
        <section className="detailsPage">
          <button className="backButton" onClick={() => setSelectedMarketId(null)}>
            ← Назад к рынкам
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
                    <span className={`statusBadge ${selectedMarket.status === "resolved" ? "resolvedBadge" : "openBadge"}`}>
                      {selectedMarket.status === "resolved" ? `Рассчитан: ${getOutcomeText(selectedMarket.resolvedOutcome)}` : "Открыт"}
                    </span>
                    <span className="date">До {formatDateForDisplay(selectedMarket.closesAt)}</span>
                  </div>
                </div>

                <h2>{selectedMarket.question}</h2>
                <p>{selectedMarket.description}</p>
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
                  <section className="detailSection">
                    <div className="detailSectionHeader">
                      <h3>Правила расчета</h3>
                      <span>Источник: {selectedMarket.source}</span>
                    </div>
                    <div className="rulesBox">
                      <p>{selectedMarket.description}</p>
                      <ul>
                        <li>
                          Дата закрытия: <b>{formatDateForDisplay(selectedMarket.closesAt)}</b>
                        </li>
                        <li>
                          Источник расчета: <b>{selectedMarket.source}</b>
                        </li>
                        <li>
                          Статус: <b>{selectedMarket.status === "resolved" ? `Рассчитан как ${getOutcomeText(selectedMarket.resolvedOutcome)}` : "Открыт для прогнозов"}</b>
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
                <label>
                  Сумма прогноза
                  <input
                    type="number"
                    min="1"
                    step="100"
                    value={amountByMarket[selectedMarket.id] || 500}
                    disabled={selectedMarket.status === "resolved"}
                    onChange={(event) => setAmountByMarket((current) => ({ ...current, [selectedMarket.id]: Number(event.target.value) }))}
                  />
                </label>

                <div className="quickAmountRow">
                  {[100, 500, 1000, 2500].map((amount) => (
                    <button key={amount} disabled={selectedMarket.status === "resolved"} onClick={() => setQuickAmount(selectedMarket.id, amount)}>
                      {amount}
                    </button>
                  ))}
                  <button disabled={selectedMarket.status === "resolved"} onClick={() => setQuickAmount(selectedMarket.id, activeUser?.balance || 0)}>
                    Всё
                  </button>
                </div>

                <div className="buttons">
                  <button className="yesButton" disabled={selectedMarket.status === "resolved"} onClick={() => buyPrediction(selectedMarket, "yes")}>
                    Купить Да
                  </button>
                  <button className="noButton" disabled={selectedMarket.status === "resolved"} onClick={() => buyPrediction(selectedMarket, "no")}>
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

              {isAdmin && (
                <section className="adminMarketCard">
                  <h3>Управление рынком</h3>
                  {editingMarketId !== selectedMarket.id ? (
                    <div className="adminMarketActions">
                      <button onClick={() => startEditMarket(selectedMarket)}>Редактировать рынок</button>
                      <button onClick={() => duplicateMarket(selectedMarket)}>Дублировать рынок</button>
                      <button onClick={() => shareMarket(selectedMarket)}>Поделиться</button>
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
      ) : (
        <>
          {isAdmin ? (
            <section className="adminPanel">
              <div className="adminHeader">
                <div>
                  <h2>Админка рынков</h2>
                  <p>Создавай тестовые события для друзей и знакомых.</p>
                </div>
                <button onClick={() => setIsAdminOpen((current) => !current)}>{isAdminOpen ? "Закрыть админку" : "Открыть админку"}</button>
              </div>

              {isAdminOpen && (
                <div className="adminForm">
                  <label className="wideField">Вопрос рынка<input placeholder="Например: Поедем ли мы компанией в отпуск в августе?" value={newMarket.question} onChange={(event) => setNewMarket((current) => ({ ...current, question: event.target.value }))} /></label>
                  <label>Категория<input placeholder="Друзья" value={newMarket.category} onChange={(event) => setNewMarket((current) => ({ ...current, category: event.target.value }))} /></label>
                  <label>Дата закрытия<input type="date" value={newMarket.closesAt} onChange={(event) => setNewMarket((current) => ({ ...current, closesAt: event.target.value }))} /></label>
                  <label className="wideField">Описание и правила расчета<textarea placeholder="Опиши, что должно произойти, чтобы рынок был рассчитан как «Да»." value={newMarket.description} onChange={(event) => setNewMarket((current) => ({ ...current, description: event.target.value }))} /></label>
                  <label className="wideField">Источник расчета<input placeholder="Например: решение в общем чате / официальный сайт / публичная новость" value={newMarket.source} onChange={(event) => setNewMarket((current) => ({ ...current, source: event.target.value }))} /></label>
                  <label>Начальная вероятность “Да”, %<input type="number" min="1" max="99" value={newMarket.yesProbability} onChange={(event) => setNewMarket((current) => ({ ...current, yesProbability: Number(event.target.value) }))} /></label>
                  <button className="createMarketButton" onClick={createMarket}>Создать рынок</button>
                </div>
              )}
            </section>
          ) : (
            <section className="adminOnlyNotice">
              Вы вошли как обычный участник. Создание, редактирование, расчет и удаление рынков доступны только администраторам.
            </section>
          )}

          <section className="marketToolbar">
            <label className="toolbarSearch">Поиск рынка<input placeholder="Например: ЦБ, GTA, Bitcoin, друзья..." value={marketSearch} onChange={(event) => setMarketSearch(event.target.value)} /></label>
            <label>Статус<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | MarketStatus)}><option value="all">Все рынки</option><option value="open">Открытые</option><option value="resolved">Рассчитанные</option></select></label>
            <label>Сортировка<select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}><option value="newest">Сначала новые</option><option value="probability">По вероятности “Да”</option><option value="trades">По количеству сделок</option><option value="comments">По комментариям</option></select></label>
            <label className="toolbarCheckbox"><input type="checkbox" checked={showFavoritesOnly} onChange={(event) => setShowFavoritesOnly(event.target.checked)} />Только избранные</label>
            <button className="clearFiltersButton" onClick={() => { setMarketSearch(""); setStatusFilter("all"); setSortMode("newest"); setSelectedCategory("Все"); setShowFavoritesOnly(false); }}>Сбросить</button>
          </section>

          <section className="categoryTabs">
            {categories.map((category) => (
              <button key={category} className={selectedCategory === category ? "activeTab" : ""} onClick={() => setSelectedCategory(category)}>{category}</button>
            ))}
          </section>

          <section className="layout">
            <div className="markets">
              <div className="sectionHeader"><h2>Рынки прогнозов</h2><span>{filteredMarkets.length} событий</span></div>
              {filteredMarkets.length === 0 && <div className="empty">По этим фильтрам рынков не найдено.</div>}

              {filteredMarkets.map((market) => {
                const yesProbability = getYesProbability(market);
                const noProbability = 100 - yesProbability;
                const isResolved = market.status === "resolved";
                const marketPredictions = predictions.filter((prediction) => prediction.marketId === market.id);
                const marketComments = comments.filter((comment) => comment.marketId === market.id);
                const isFavorite = favoriteMarketIds.includes(market.id);

                return (
                  <article className={`marketCard compactMarketCard ${isResolved ? "resolvedMarket" : ""}`} key={market.id}>
                    <div className="marketTop">
                      <span className="category">{market.category}</span>
                      <div className="marketMeta">
                        <button className={`favoriteIconButton ${isFavorite ? "activeFavorite" : ""}`} onClick={() => toggleFavoriteMarket(market.id)}>{isFavorite ? "★" : "☆"}</button>
                        <span className={`statusBadge ${isResolved ? "resolvedBadge" : "openBadge"}`}>{isResolved ? `Рассчитан: ${getOutcomeText(market.resolvedOutcome)}` : "Открыт"}</span>
                        <span className="date">До {formatDateForDisplay(market.closesAt)}</span>
                      </div>
                    </div>
                    <h3>{market.question}</h3>
                    <p className="compactDescription">{market.description}</p>
                    <div className="compactStats">
                      <div><span>Да</span><strong>{yesProbability}%</strong></div>
                      <div><span>Нет</span><strong>{noProbability}%</strong></div>
                      <div><span>Сделки</span><strong>{marketPredictions.length}</strong></div>
                      <div><span>Комментарии</span><strong>{marketComments.length}</strong></div>
                    </div>
                    <div className="bar"><div style={{ width: `${yesProbability}%` }} /></div>
                    <div className="cardActionGrid">
                      <button className="openDetailsButton" onClick={() => { setSelectedMarketId(market.id); setDetailsTab("overview"); }}>Открыть детали</button>
                      <button className="secondaryOpenButton" onClick={() => { setSelectedMarketId(market.id); setDetailsTab("chat"); }}>Чат</button>
                    </div>
                  </article>
                );
              })}
            </div>

            <aside className="sideColumn">
              <section className="leaderboardBox">
                <div className="sectionHeader"><h2>Рейтинг</h2><span>{leaderboard.length}</span></div>
                <div className="leaderboardList">
                  {leaderboard.map((user, index) => (
                    <div className={`leaderboardItem ${user.id === activeUser?.id ? "activeLeaderboardItem" : ""}`} key={user.id}>
                      <div className="place">#{index + 1}</div>
                      <div><strong>{user.name}</strong><p>{user.balance.toLocaleString("ru-RU")} баллов</p></div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="portfolio">
                <div className="sectionHeader"><h2>Мои прогнозы</h2><span>{activeUserPredictions.length}</span></div>
                {activeUserPredictions.length === 0 ? <div className="empty">У этого участника пока нет прогнозов.</div> : (
                  <div className="predictionList">
                    {activeUserPredictions.map((prediction) => {
                      const isSettled = Boolean(prediction.settledAt);
                      const isWinner = isSettled && prediction.outcome === prediction.resolvedOutcome;
                      const payout = prediction.payout || 0;
                      return (
                        <div className="prediction" key={prediction.id}>
                          <div className="predictionOutcome">{getOutcomeText(prediction.outcome)}</div>
                          <div>
                            <h4>{prediction.marketQuestion}</h4>
                            <p>{prediction.amount.toLocaleString("ru-RU")} баллов · {prediction.probabilityAtPurchase}% при покупке</p>
                            {isSettled ? <p className={isWinner ? "predictionSettlement winText" : "predictionSettlement lossText"}>{isWinner ? "Выигрыш" : "Проигрыш"} · Выплата: {payout.toLocaleString("ru-RU")} баллов</p> : <p className="activePrediction">Активный прогноз</p>}
                            <span className="predictionDate">{prediction.createdAt}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              <section className="activityFeedBox">
                <div className="sectionHeader"><h2>Лента</h2><span>{activityItems.length}</span></div>
                {activityItems.length === 0 ? <div className="empty">Пока действий нет.</div> : (
                  <div className="activityList">
                    {activityItems.map((item) => <div className="activityItem" key={item.id}><strong>{item.title}</strong><p>{item.description}</p><small>{item.date}</small></div>)}
                  </div>
                )}
              </section>
            </aside>
          </section>
        </>
      )}
    </main>
  );
}

export default App;
