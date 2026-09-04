const { prisma } = require("../db");
const { getOrCreateUser, addCoin } = require("./economy");
const { unlockMany } = require("./achievements");
const { COLLECTION_ITEMS, DUPLICATE_COIN_REWARD, drawRandomCollectionItem } = require("../data/collection-items");

async function pullCollection(guildId, userId, times) {
  const user = await getOrCreateUser(guildId, userId);

  if (user.collectionTickets < times) {
    return { success: false, reason: "INSUFFICIENT_TICKETS", user };
  }

  await prisma.economyUser.update({
    where: { guildId_userId: { guildId, userId } },
    data: { collectionTickets: { decrement: times } },
  });

  const results = [];

  for (let i = 0; i < times; i += 1) {
    const item = drawRandomCollectionItem();
    const existing = await prisma.userCollectionItem.findUnique({
      where: { guildId_userId_itemId: { guildId, userId, itemId: item.id } },
    });

    if (existing) {
      await prisma.userCollectionItem.update({
        where: { guildId_userId_itemId: { guildId, userId, itemId: item.id } },
        data: { count: { increment: 1 } },
      });
      await addCoin(guildId, userId, DUPLICATE_COIN_REWARD);
      results.push({ item, isNew: false, coinGain: DUPLICATE_COIN_REWARD });
    } else {
      await prisma.userCollectionItem.create({
        data: { guildId, userId, itemId: item.id },
      });
      results.push({ item, isNew: true, coinGain: 0 });
    }
  }

  const ownedCount = await prisma.userCollectionItem.count({ where: { guildId, userId } });
  const achievementIds = ["FIRST_COLLECTION_PULL"];
  if (ownedCount >= 50) achievementIds.push("COLLECTION_50");
  if (ownedCount >= COLLECTION_ITEMS.length) achievementIds.push("COLLECTION_COMPLETE");
  const unlockedAchievements = await unlockMany(guildId, userId, achievementIds);

  return { success: true, results, unlockedAchievements };
}

async function getCollectionSummary(guildId, userId) {
  const owned = await prisma.userCollectionItem.findMany({ where: { guildId, userId } });
  return { owned: owned.length, total: COLLECTION_ITEMS.length, items: owned };
}

module.exports = {
  pullCollection,
  getCollectionSummary,
};
