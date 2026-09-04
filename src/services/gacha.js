const { prisma } = require("../db");
const { getOrCreateUser, spendStone, addItem, addCoin } = require("./economy");
const { unlockMany } = require("./achievements");
const {
  ITEMS_R,
  ITEMS_SR,
  ITEMS_SSR,
  PICKUP_ITEMS,
  RATES,
  PITY_LIMIT,
  SINGLE_PULL_STONE_COST,
  TEN_PULL_STONE_COST,
  COLLECTION_TICKETS_PER_10_PULL,
  pickRandom,
} = require("../data/gacha-items");

// pullCountBefore: このガチャを引く前の天井カウント（0〜299）。
// forcedPickup: 300連目到達による天井PU確定を強制するか。
function rollOne({ pullCountBefore, forcedPickup, guaranteeSrOrAbove }) {
  if (forcedPickup) {
    return { rarity: "SSR", isPickup: true, item: pickRandom(PICKUP_ITEMS) };
  }

  const roll = Math.random();

  if (guaranteeSrOrAbove) {
    // R/SR/SSRの相対比率を保ったままSR以上のみで再抽選する。
    const ssrShare = RATES.SSR / (RATES.SSR + RATES.SR);

    if (roll < ssrShare) {
      const isPickup = Math.random() < RATES.SSR_PICKUP / RATES.SSR;
      return isPickup
        ? { rarity: "SSR", isPickup: true, item: pickRandom(PICKUP_ITEMS) }
        : { rarity: "SSR", isPickup: false, item: pickRandom(ITEMS_SSR) };
    }

    return { rarity: "SR", isPickup: false, item: pickRandom(ITEMS_SR) };
  }

  if (roll < RATES.SSR_PICKUP) {
    return { rarity: "SSR", isPickup: true, item: pickRandom(PICKUP_ITEMS) };
  }

  if (roll < RATES.SSR) {
    return { rarity: "SSR", isPickup: false, item: pickRandom(ITEMS_SSR) };
  }

  if (roll < RATES.SSR + RATES.SR) {
    return { rarity: "SR", isPickup: false, item: pickRandom(ITEMS_SR) };
  }

  return { rarity: "R", isPickup: false, item: pickRandom(ITEMS_R) };
}

const INSTANT_COIN_REWARDS = {
  r_coin20: 20,
  sr_coin40: 40,
};

async function grantResult(guildId, userId, result) {
  const instantCoin = INSTANT_COIN_REWARDS[result.item.key];

  if (instantCoin) {
    await addCoin(guildId, userId, instantCoin);
  } else {
    await addItem(guildId, userId, result.item.key, 1);
  }

  await prisma.gachaLog.create({
    data: {
      guildId,
      userId,
      rarity: result.rarity,
      itemKey: result.item.key,
      isPickup: result.isPickup,
    },
  });
}

async function pullGacha(guildId, userId, times) {
  if (times !== 1 && times !== 10) {
    throw new Error("times must be 1 or 10");
  }

  const cost = times === 10 ? TEN_PULL_STONE_COST : SINGLE_PULL_STONE_COST;
  const spendResult = await spendStone(guildId, userId, cost);

  if (!spendResult.success) {
    return { success: false, reason: "INSUFFICIENT_STONE", user: spendResult.user };
  }

  let user = spendResult.user;
  const results = [];

  for (let i = 0; i < times; i += 1) {
    const isLastOfTen = times === 10 && i === 9;
    const guaranteeSrOrAbove = isLastOfTen && !results.some((r) => r.rarity === "SR" || r.rarity === "SSR");
    const forcedPickup = user.gachaPullCount + 1 >= PITY_LIMIT;

    const result = rollOne({ pullCountBefore: user.gachaPullCount, forcedPickup, guaranteeSrOrAbove });
    results.push(result);

    const nextPullCount = result.isPickup ? 0 : user.gachaPullCount + 1;
    user = await prisma.economyUser.update({
      where: { guildId_userId: { guildId, userId } },
      data: { gachaPullCount: nextPullCount },
    });

    await grantResult(guildId, userId, result);
  }

  if (times === 10) {
    user = await prisma.economyUser.update({
      where: { guildId_userId: { guildId, userId } },
      data: { collectionTickets: { increment: COLLECTION_TICKETS_PER_10_PULL } },
    });
  }

  const achievementIds = ["FIRST_GACHA_PULL"];
  if (times === 10) achievementIds.push("FIRST_TEN_PULL");
  if (results.some((r) => r.rarity === "SSR")) achievementIds.push("FIRST_SSR");
  if (results.some((r) => r.isPickup)) achievementIds.push("FIRST_PICKUP");

  const totalPulls = await prisma.gachaLog.count({ where: { guildId, userId } });
  if (totalPulls >= 100) achievementIds.push("GACHA_100_PULLS");

  const unlockedAchievements = await unlockMany(guildId, userId, achievementIds);

  return { success: true, results, user, cost, unlockedAchievements };
}

module.exports = {
  PITY_LIMIT,
  SINGLE_PULL_STONE_COST,
  TEN_PULL_STONE_COST,
  pullGacha,
};
