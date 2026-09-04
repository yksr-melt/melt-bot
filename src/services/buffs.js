const { prisma } = require("../db");

const COIN_MULTIPLIER = "COIN_MULTIPLIER";
const AP_FREE = "AP_FREE";
const SLOT_BONUS_CONFIRM = "SLOT_BONUS_CONFIRM";
const BJ_WIN_CONFIRM = "BJ_WIN_CONFIRM";

async function grantTimedBuff(guildId, userId, type, value, durationMs) {
  return prisma.userBuff.create({
    data: {
      guildId,
      userId,
      type,
      value,
      expiresAt: new Date(Date.now() + durationMs),
    },
  });
}

async function grantOneShotBuff(guildId, userId, type, value = 1, uses = 1) {
  return prisma.userBuff.create({
    data: { guildId, userId, type, value, remainingUses: uses },
  });
}

// 有効な倍率のうち最も強いものを採用する（重ね掛けしない）。
async function getCoinMultiplier(guildId, userId) {
  const buffs = await prisma.userBuff.findMany({
    where: {
      guildId,
      userId,
      type: COIN_MULTIPLIER,
      expiresAt: { gt: new Date() },
    },
  });

  if (buffs.length === 0) {
    return 1;
  }

  return Math.max(1, ...buffs.map((b) => b.value));
}

async function isApFree(guildId, userId) {
  const buff = await prisma.userBuff.findFirst({
    where: {
      guildId,
      userId,
      type: AP_FREE,
      expiresAt: { gt: new Date() },
    },
  });

  return Boolean(buff);
}

// 一回限りの確定系バフを1件消費する。消費できたらtrueを返す。
async function consumeOneShot(guildId, userId, type) {
  const buff = await prisma.userBuff.findFirst({
    where: { guildId, userId, type, remainingUses: { gt: 0 } },
    orderBy: { createdAt: "asc" },
  });

  if (!buff) {
    return false;
  }

  if (buff.remainingUses <= 1) {
    await prisma.userBuff.delete({ where: { id: buff.id } });
  } else {
    await prisma.userBuff.update({
      where: { id: buff.id },
      data: { remainingUses: { decrement: 1 } },
    });
  }

  return true;
}

module.exports = {
  COIN_MULTIPLIER,
  AP_FREE,
  SLOT_BONUS_CONFIRM,
  BJ_WIN_CONFIRM,
  grantTimedBuff,
  grantOneShotBuff,
  getCoinMultiplier,
  isApFree,
  consumeOneShot,
};
