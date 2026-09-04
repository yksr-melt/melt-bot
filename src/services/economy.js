const { prisma } = require("../db");

const MAX_AP = 48;
const AP_REGEN_MINUTES = 30;
const AP_REGEN_MS = AP_REGEN_MINUTES * 60 * 1000;

const COIN_TO_STONE_COIN_COST = 10000;
const COIN_TO_STONE_STONE_REWARD = 1200;
const COIN_TO_STONE_MONTHLY_LIMIT = 30;

const STONE_TO_COIN_UNIT_STONE = 10;
const STONE_TO_COIN_UNIT_COIN = 80;

function monthKey(date) {
  return `${date.getUTCFullYear()}-${date.getUTCMonth()}`;
}

async function getOrCreateUser(guildId, userId) {
  return prisma.economyUser.upsert({
    where: { guildId_userId: { guildId, userId } },
    create: { guildId, userId },
    update: {},
  });
}

// AP消費時のみ再計算する。溢れた経過時間は切り捨てず端数を保持し、次回加算に持ち越す。
function computeApRegen(user, now = new Date()) {
  if (user.ap >= MAX_AP) {
    return { ap: user.ap, apUpdatedAt: now };
  }

  const elapsedMs = now.getTime() - user.apUpdatedAt.getTime();
  const gained = Math.floor(elapsedMs / AP_REGEN_MS);

  if (gained <= 0) {
    return { ap: user.ap, apUpdatedAt: user.apUpdatedAt };
  }

  const newAp = Math.min(MAX_AP, user.ap + gained);
  const consumedMs = gained * AP_REGEN_MS;

  return { ap: newAp, apUpdatedAt: new Date(user.apUpdatedAt.getTime() + consumedMs) };
}

async function syncAp(guildId, userId) {
  const user = await getOrCreateUser(guildId, userId);
  const { ap, apUpdatedAt } = computeApRegen(user);

  if (ap === user.ap) {
    return user;
  }

  return prisma.economyUser.update({
    where: { guildId_userId: { guildId, userId } },
    data: { ap, apUpdatedAt },
  });
}

async function consumeAp(guildId, userId, amount) {
  const user = await syncAp(guildId, userId);

  if (user.ap < amount) {
    return { success: false, user };
  }

  const wasFull = user.ap >= MAX_AP;
  const updated = await prisma.economyUser.update({
    where: { guildId_userId: { guildId, userId } },
    data: {
      ap: user.ap - amount,
      apUpdatedAt: wasFull ? new Date() : user.apUpdatedAt,
    },
  });

  return { success: true, user: updated };
}

// AP使い放題バフが有効なら消費せず、無効なら通常通りAPを消費する。
async function consumeApUnlessFree(guildId, userId, amount) {
  const { isApFree } = require("./buffs");

  if (await isApFree(guildId, userId)) {
    const user = await syncAp(guildId, userId);
    return { success: true, user, free: true };
  }

  const result = await consumeAp(guildId, userId, amount);
  return { ...result, free: false };
}

async function addAp(guildId, userId, amount) {
  const user = await syncAp(guildId, userId);

  return prisma.economyUser.update({
    where: { guildId_userId: { guildId, userId } },
    data: { ap: Math.min(MAX_AP, user.ap + amount) },
  });
}

async function addStone(guildId, userId, amount) {
  return prisma.economyUser.upsert({
    where: { guildId_userId: { guildId, userId } },
    create: { guildId, userId, stone: BigInt(Math.max(0, amount)) },
    update: { stone: { increment: BigInt(amount) } },
  });
}

async function addCoin(guildId, userId, amount) {
  return prisma.economyUser.upsert({
    where: { guildId_userId: { guildId, userId } },
    create: { guildId, userId, coin: BigInt(Math.max(0, amount)) },
    update: { coin: { increment: BigInt(amount) } },
  });
}

async function spendStone(guildId, userId, amount) {
  const user = await getOrCreateUser(guildId, userId);

  if (user.stone < amount) {
    return { success: false, user };
  }

  const updated = await prisma.economyUser.update({
    where: { guildId_userId: { guildId, userId } },
    data: { stone: { decrement: BigInt(amount) } },
  });

  return { success: true, user: updated };
}

async function spendCoin(guildId, userId, amount) {
  const user = await getOrCreateUser(guildId, userId);

  if (user.coin < amount) {
    return { success: false, user };
  }

  const updated = await prisma.economyUser.update({
    where: { guildId_userId: { guildId, userId } },
    data: { coin: { decrement: BigInt(amount) } },
  });

  return { success: true, user: updated };
}

async function resetMonthlyExchangeIfNeeded(user) {
  const now = new Date();

  if (monthKey(now) === monthKey(user.coinExchangeResetAt)) {
    return user;
  }

  return prisma.economyUser.update({
    where: { guildId_userId: { guildId: user.guildId, userId: user.userId } },
    data: { coinExchangeCount: 0, coinExchangeResetAt: now },
  });
}

// コイン→石: 10000コインにつき1200石、月30回まで。
async function exchangeCoinToStone(guildId, userId) {
  let user = await getOrCreateUser(guildId, userId);
  user = await resetMonthlyExchangeIfNeeded(user);

  if (user.coinExchangeCount >= COIN_TO_STONE_MONTHLY_LIMIT) {
    return { success: false, reason: "MONTHLY_LIMIT", user };
  }

  if (user.coin < COIN_TO_STONE_COIN_COST) {
    return { success: false, reason: "INSUFFICIENT_COIN", user };
  }

  const updated = await prisma.economyUser.update({
    where: { guildId_userId: { guildId, userId } },
    data: {
      coin: { decrement: BigInt(COIN_TO_STONE_COIN_COST) },
      stone: { increment: BigInt(COIN_TO_STONE_STONE_REWARD) },
      coinExchangeCount: { increment: 1 },
    },
  });

  return { success: true, user: updated };
}

// 石→コイン: 石10枚につきコイン80枚、回数制限なし。
async function exchangeStoneToCoin(guildId, userId, stoneAmount) {
  if (!Number.isInteger(stoneAmount) || stoneAmount <= 0 || stoneAmount % STONE_TO_COIN_UNIT_STONE !== 0) {
    return { success: false, reason: "INVALID_AMOUNT" };
  }

  const user = await getOrCreateUser(guildId, userId);

  if (user.stone < stoneAmount) {
    return { success: false, reason: "INSUFFICIENT_STONE", user };
  }

  const coinGain = (stoneAmount / STONE_TO_COIN_UNIT_STONE) * STONE_TO_COIN_UNIT_COIN;
  const updated = await prisma.economyUser.update({
    where: { guildId_userId: { guildId, userId } },
    data: {
      stone: { decrement: BigInt(stoneAmount) },
      coin: { increment: BigInt(coinGain) },
    },
  });

  return { success: true, user: updated, coinGain };
}

// コイン獲得量バフ（PU以外）を適用したうえでコインを付与する。
async function addCoinWithMultiplier(guildId, userId, baseAmount) {
  const { getCoinMultiplier } = require("./buffs");
  const multiplier = await getCoinMultiplier(guildId, userId);
  const amount = Math.round(baseAmount * multiplier);
  const user = await addCoin(guildId, userId, amount);

  return { user, amount, multiplier };
}

async function addItem(guildId, userId, itemKey, amount = 1) {
  await getOrCreateUser(guildId, userId);

  return prisma.userItem.upsert({
    where: { guildId_userId_itemKey: { guildId, userId, itemKey } },
    create: { guildId, userId, itemKey, count: amount },
    update: { count: { increment: amount } },
  });
}

module.exports = {
  MAX_AP,
  AP_REGEN_MINUTES,
  COIN_TO_STONE_COIN_COST,
  COIN_TO_STONE_STONE_REWARD,
  COIN_TO_STONE_MONTHLY_LIMIT,
  STONE_TO_COIN_UNIT_STONE,
  STONE_TO_COIN_UNIT_COIN,
  getOrCreateUser,
  syncAp,
  consumeAp,
  consumeApUnlessFree,
  addAp,
  addStone,
  addCoin,
  addCoinWithMultiplier,
  spendStone,
  spendCoin,
  exchangeCoinToStone,
  exchangeStoneToCoin,
  addItem,
};
