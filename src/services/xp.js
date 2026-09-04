const { prisma } = require("../db");
const { getOrCreateUser, addStone, addCoin } = require("./economy");
const { unlockMany } = require("./achievements");

const XP_BASE = 100;
const XP_GROWTH = 1.15;

const MESSAGE_XP_COOLDOWN_MS = 60 * 1000;
const MESSAGE_XP_MIN = 5;
const MESSAGE_XP_MAX = 10;
const VOICE_XP_PER_MINUTE = 2;

function xpRequiredForLevel(level) {
  return Math.floor(XP_BASE * Math.pow(XP_GROWTH, level - 1));
}

function levelUpReward(level) {
  return { coin: level * 20, stone: level * 5 };
}

async function addXp(guildId, userId, amount) {
  const user = await getOrCreateUser(guildId, userId);
  let level = user.level;
  let xp = user.xp + amount;
  const rewards = [];

  while (xp >= xpRequiredForLevel(level)) {
    xp -= xpRequiredForLevel(level);
    level += 1;
    const reward = levelUpReward(level);
    rewards.push({ level, ...reward });
    await addCoin(guildId, userId, reward.coin);
    await addStone(guildId, userId, reward.stone);
  }

  const updated = await prisma.economyUser.update({
    where: { guildId_userId: { guildId, userId } },
    data: { level, xp },
  });

  const achievementIds = [];
  if (level >= 10) achievementIds.push("LEVEL_10");
  if (level >= 30) achievementIds.push("LEVEL_30");
  const unlockedAchievements = achievementIds.length > 0 ? await unlockMany(guildId, userId, achievementIds) : [];

  return { user: updated, leveledUp: rewards.length > 0, rewards, unlockedAchievements };
}

async function grantMessageXp(guildId, userId) {
  const user = await getOrCreateUser(guildId, userId);
  const now = new Date();

  if (user.lastMessageXpAt) {
    const elapsed = now.getTime() - user.lastMessageXpAt.getTime();
    if (elapsed < MESSAGE_XP_COOLDOWN_MS) {
      return null;
    }
  }

  await prisma.economyUser.update({
    where: { guildId_userId: { guildId, userId } },
    data: { lastMessageXpAt: now },
  });

  const amount = MESSAGE_XP_MIN + Math.floor(Math.random() * (MESSAGE_XP_MAX - MESSAGE_XP_MIN + 1));
  return addXp(guildId, userId, amount);
}

async function grantVoiceXp(guildId, userId, minutes) {
  if (minutes <= 0) {
    return null;
  }

  const amount = Math.floor(minutes * VOICE_XP_PER_MINUTE);

  if (amount <= 0) {
    return null;
  }

  return addXp(guildId, userId, amount);
}

module.exports = {
  xpRequiredForLevel,
  addXp,
  grantMessageXp,
  grantVoiceXp,
};
