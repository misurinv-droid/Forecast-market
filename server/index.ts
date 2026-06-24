import cors from "cors";
import express from "express";
import crypto from "node:crypto";
import { JSONFilePreset } from "lowdb/node";

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

type Database = {
  users: DemoUser[];
  markets: Market[];
  predictions: Prediction[];
  comments: MarketComment[];
  favoriteMarketIdsByUser: Record<string, string[]>;
};

const PORT = Number(process.env.PORT || 4000);
const START_BALANCE = 10000;

function createId() {
  return crypto.randomUUID();
}

function nowRu() {
  return new Date().toLocaleString("ru-RU");
}

function getYesProbability(market: Market) {
  const total = market.yesPool + market.noPool;

  if (total <= 0) {
    return 50;
  }

  return Math.round((market.yesPool / total) * 100);
}

function getUserDisplayName(user: DemoUser) {
  return user.name.trim() || "Участник";
}

const defaultData: Database = {
  users: [
    { id: "user-vladislav", name: "Владислав", balance: START_BALANCE },
    { id: "user-sasha", name: "Саша", balance: START_BALANCE },
    { id: "user-dima", name: "Дима", balance: START_BALANCE },
  ],
  markets: [
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
      createdAt: new Date().toISOString(),
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
      createdAt: new Date().toISOString(),
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
      createdAt: new Date().toISOString(),
    },
  ],
  predictions: [],
  comments: [],
  favoriteMarketIdsByUser: {},
};

const db = await JSONFilePreset<Database>("server/db.json", defaultData);

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

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    message: "Forecast Market API работает",
    time: new Date().toISOString(),
  });
});

app.get("/api/bootstrap", (_request, response) => {
  response.json(db.data);
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

  db.data.users.push(user);
  await db.write();

  response.status(201).json(user);
});

app.post("/api/telegram-user", async (request, response) => {
  const telegramId = String(request.body?.telegramId || "").trim();
  const firstName = String(request.body?.firstName || "").trim();
  const username = String(request.body?.username || "").trim();

  if (!telegramId) {
    response.status(400).json({ error: "Нет telegramId" });
    return;
  }

  const userId = `telegram-${telegramId}`;
  const existingUser = db.data.users.find((user) => user.id === userId);

  if (existingUser) {
    response.json(existingUser);
    return;
  }

  const name = firstName || username || `Telegram ${telegramId}`;

  const user: DemoUser = {
    id: userId,
    name,
    balance: START_BALANCE,
  };

  db.data.users.push(user);
  await db.write();

  response.status(201).json(user);
});

app.post("/api/markets", async (request, response) => {
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
    createdAt: new Date().toISOString(),
  };

  db.data.markets.unshift(market);
  await db.write();

  response.status(201).json(market);
});

app.patch("/api/markets/:marketId", async (request, response) => {
  const market = db.data.markets.find(
    (item) => item.id === request.params.marketId
  );

  if (!market) {
    response.status(404).json({ error: "Рынок не найден" });
    return;
  }

  const question = String(request.body?.question || "").trim();
  const category = String(request.body?.category || "").trim();
  const description = String(request.body?.description || "").trim();
  const source = String(request.body?.source || "").trim();
  const closesAt = String(request.body?.closesAt || "").trim();

  if (!question || !category || !description || !source || !closesAt) {
    response.status(400).json({ error: "Заполните все поля рынка" });
    return;
  }

  market.question = question;
  market.category = category;
  market.description = description;
  market.source = source;
  market.closesAt = closesAt;

  db.data.predictions = db.data.predictions.map((prediction) => {
    if (prediction.marketId !== market.id) {
      return prediction;
    }

    return {
      ...prediction,
      marketQuestion: question,
    };
  });

  await db.write();

  response.json(market);
});

app.delete("/api/markets/:marketId", async (request, response) => {
  const market = db.data.markets.find(
    (item) => item.id === request.params.marketId
  );

  if (!market) {
    response.status(404).json({ error: "Рынок не найден" });
    return;
  }

  const refundsByUser: Record<string, number> = {};

  if (market.status !== "resolved") {
    db.data.predictions.forEach((prediction) => {
      if (prediction.marketId !== market.id || prediction.settledAt) {
        return;
      }

      refundsByUser[prediction.userId] =
        (refundsByUser[prediction.userId] || 0) + prediction.amount;
    });
  }

  db.data.users = db.data.users.map((user) => ({
    ...user,
    balance: user.balance + (refundsByUser[user.id] || 0),
  }));

  db.data.markets = db.data.markets.filter((item) => item.id !== market.id);
  db.data.predictions = db.data.predictions.filter(
    (prediction) => prediction.marketId !== market.id
  );
  db.data.comments = db.data.comments.filter(
    (comment) => comment.marketId !== market.id
  );

  Object.keys(db.data.favoriteMarketIdsByUser).forEach((userId) => {
    db.data.favoriteMarketIdsByUser[userId] =
      db.data.favoriteMarketIdsByUser[userId].filter((id) => id !== market.id);
  });

  await db.write();

  response.json({
    ok: true,
    refunded: refundsByUser,
  });
});

app.post("/api/markets/:marketId/duplicate", async (request, response) => {
  const market = db.data.markets.find(
    (item) => item.id === request.params.marketId
  );

  if (!market) {
    response.status(404).json({ error: "Рынок не найден" });
    return;
  }

  const yesProbability = getYesProbability(market);

  const duplicate: Market = {
    id: createId(),
    question: `Копия — ${market.question}`,
    category: market.category,
    description: market.description,
    source: market.source,
    closesAt: market.closesAt,
    yesPool: yesProbability * 100,
    noPool: (100 - yesProbability) * 100,
    status: "open",
    createdAt: new Date().toISOString(),
  };

  db.data.markets.unshift(duplicate);
  await db.write();

  response.status(201).json(duplicate);
});

app.post("/api/markets/:marketId/predictions", async (request, response) => {
  const market = db.data.markets.find(
    (item) => item.id === request.params.marketId
  );

  if (!market) {
    response.status(404).json({ error: "Рынок не найден" });
    return;
  }

  if (market.status === "resolved") {
    response.status(400).json({ error: "Рынок уже рассчитан" });
    return;
  }

  const userId = String(request.body?.userId || "");
  const outcome = String(request.body?.outcome || "") as Outcome;
  const amount = Number(request.body?.amount);

  const user = db.data.users.find((item) => item.id === userId);

  if (!user) {
    response.status(404).json({ error: "Участник не найден" });
    return;
  }

  if (outcome !== "yes" && outcome !== "no") {
    response.status(400).json({ error: "Некорректный исход" });
    return;
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    response.status(400).json({ error: "Введите корректную сумму" });
    return;
  }

  if (amount > user.balance) {
    response.status(400).json({ error: "Недостаточно баллов" });
    return;
  }

  const probability = getYesProbability(market);

  user.balance -= amount;

  if (outcome === "yes") {
    market.yesPool += amount;
  } else {
    market.noPool += amount;
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

  db.data.predictions.unshift(prediction);
  await db.write();

  response.status(201).json(prediction);
});

app.post("/api/markets/:marketId/resolve", async (request, response) => {
  const market = db.data.markets.find(
    (item) => item.id === request.params.marketId
  );

  if (!market) {
    response.status(404).json({ error: "Рынок не найден" });
    return;
  }

  if (market.status === "resolved") {
    response.status(400).json({ error: "Рынок уже рассчитан" });
    return;
  }

  const outcome = String(request.body?.outcome || "") as Outcome;

  if (outcome !== "yes" && outcome !== "no") {
    response.status(400).json({ error: "Некорректный исход" });
    return;
  }

  const totalPool = market.yesPool + market.noPool;
  const winningPool = outcome === "yes" ? market.yesPool : market.noPool;
  const settledAt = nowRu();

  let totalPayout = 0;
  const payoutsByUser: Record<string, number> = {};

  db.data.predictions = db.data.predictions.map((prediction) => {
    if (prediction.marketId !== market.id || prediction.settledAt) {
      return prediction;
    }

    const isWinner = prediction.outcome === outcome;

    const payout =
      isWinner && winningPool > 0
        ? Math.round((prediction.amount / winningPool) * totalPool)
        : 0;

    totalPayout += payout;
    payoutsByUser[prediction.userId] =
      (payoutsByUser[prediction.userId] || 0) + payout;

    return {
      ...prediction,
      resolvedOutcome: outcome,
      payout,
      settledAt,
    };
  });

  db.data.users = db.data.users.map((user) => ({
    ...user,
    balance: user.balance + (payoutsByUser[user.id] || 0),
  }));

  market.status = "resolved";
  market.resolvedOutcome = outcome;
  market.resolvedAt = settledAt;

  await db.write();

  response.json({
    market,
    totalPayout,
    payoutsByUser,
  });
});

app.post("/api/markets/:marketId/comments", async (request, response) => {
  const market = db.data.markets.find(
    (item) => item.id === request.params.marketId
  );

  if (!market) {
    response.status(404).json({ error: "Рынок не найден" });
    return;
  }

  const userId = String(request.body?.userId || "");
  const text = String(request.body?.text || "").trim();
  const mediaDataUrl = String(request.body?.mediaDataUrl || "").trim();
  const mediaName = String(request.body?.mediaName || "").trim();

  const user = db.data.users.find((item) => item.id === userId);

  if (!user) {
    response.status(404).json({ error: "Участник не найден" });
    return;
  }

  if (!text && !mediaDataUrl) {
    response.status(400).json({ error: "Введите комментарий или прикрепите файл" });
    return;
  }

  const comment: MarketComment = {
    id: createId(),
    marketId: market.id,
    userId: user.id,
    userName: getUserDisplayName(user),
    text,
    createdAt: nowRu(),
    mediaDataUrl: mediaDataUrl || undefined,
    mediaName: mediaName || undefined,
  };

  db.data.comments.unshift(comment);
  await db.write();

  response.status(201).json(comment);
});

app.delete("/api/comments/:commentId", async (request, response) => {
  const commentExists = db.data.comments.some(
    (comment) => comment.id === request.params.commentId
  );

  if (!commentExists) {
    response.status(404).json({ error: "Комментарий не найден" });
    return;
  }

  db.data.comments = db.data.comments.filter(
    (comment) => comment.id !== request.params.commentId
  );

  await db.write();

  response.json({ ok: true });
});

app.post("/api/users/:userId/favorites/:marketId", async (request, response) => {
  const { userId, marketId } = request.params;

  const user = db.data.users.find((item) => item.id === userId);
  const market = db.data.markets.find((item) => item.id === marketId);

  if (!user) {
    response.status(404).json({ error: "Участник не найден" });
    return;
  }

  if (!market) {
    response.status(404).json({ error: "Рынок не найден" });
    return;
  }

  const currentFavorites = db.data.favoriteMarketIdsByUser[userId] || [];

  if (currentFavorites.includes(marketId)) {
    db.data.favoriteMarketIdsByUser[userId] = currentFavorites.filter(
      (id) => id !== marketId
    );
  } else {
    db.data.favoriteMarketIdsByUser[userId] = [...currentFavorites, marketId];
  }

  await db.write();

  response.json({
    favoriteMarketIds: db.data.favoriteMarketIdsByUser[userId],
  });
});

app.post("/api/reset", async (_request, response) => {
  db.data = structuredClone(defaultData);
  await db.write();

  response.json({
    ok: true,
    message: "Демо-база сброшена",
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Forecast Market API запущен: http://localhost:${PORT}`);
});