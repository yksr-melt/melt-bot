const { prisma } = require("../db");
const { getOrCreateUser, addCoinWithMultiplier } = require("./economy");
const { unlockMany } = require("./achievements");

const WORK_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const WORK_MIN_COIN = 200;
const WORK_MAX_COIN = 500;

async function doWork(guildId, userId) {
  const user = await getOrCreateUser(guildId, userId);
  const now = new Date();

  if (user.lastWorkAt) {
    const elapsed = now.getTime() - user.lastWorkAt.getTime();
    if (elapsed < WORK_COOLDOWN_MS) {
      return { success: false, reason: "COOLDOWN", nextAvailableAt: new Date(user.lastWorkAt.getTime() + WORK_COOLDOWN_MS) };
    }
  }

  const baseAmount = WORK_MIN_COIN + Math.floor(Math.random() * (WORK_MAX_COIN - WORK_MIN_COIN + 1));

  const updated = await prisma.economyUser.update({
    where: { guildId_userId: { guildId, userId } },
    data: { lastWorkAt: now, workCount: { increment: 1 } },
  });

  const coinGain = await addCoinWithMultiplier(guildId, userId, baseAmount);

  const unlockedAchievements = updated.workCount >= 10 ? await unlockMany(guildId, userId, ["WORK_10_TIMES"]) : [];

  return {
    success: true,
    amount: coinGain.amount,
    multiplier: coinGain.multiplier,
    user: coinGain.user,
    unlockedAchievements,
  };
}

module.exports = {
  WORK_COOLDOWN_MS,
  WORK_MIN_COIN,
  WORK_MAX_COIN,
  doWork,
};
