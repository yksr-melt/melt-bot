const { prisma } = require("../db");
const { addStone } = require("./economy");
const { ACHIEVEMENTS } = require("../data/achievements");

// 冪等に実績を解除する。既に解除済みならnullを返す（重複付与しない）。
async function unlockAchievement(guildId, userId, achievementId) {
  const definition = ACHIEVEMENTS[achievementId];

  if (!definition) {
    return null;
  }

  try {
    await prisma.userAchievement.create({
      data: { guildId, userId, achievementId },
    });
  } catch (error) {
    if (error.code === "P2002") {
      return null;
    }
    throw error;
  }

  await addStone(guildId, userId, definition.stoneReward);

  return { id: achievementId, ...definition };
}

async function unlockMany(guildId, userId, achievementIds) {
  const unlocked = [];

  for (const id of achievementIds) {
    const result = await unlockAchievement(guildId, userId, id);
    if (result) {
      unlocked.push(result);
    }
  }

  return unlocked;
}

async function getUserAchievements(guildId, userId) {
  const records = await prisma.userAchievement.findMany({ where: { guildId, userId } });
  return new Set(records.map((r) => r.achievementId));
}

function formatUnlockLines(achievements) {
  return achievements.map((a) => `🏆 実績解除: ${a.name}（石+${a.stoneReward}）`);
}

module.exports = {
  ACHIEVEMENTS,
  unlockAchievement,
  unlockMany,
  getUserAchievements,
  formatUnlockLines,
};
