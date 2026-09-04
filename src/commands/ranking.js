const { EmbedBuilder, SlashCommandBuilder } = require("discord.js");
const { prisma } = require("../db");

const BOARD_LABELS = {
  coin: "コインランキング",
  gacha: "累計ガチャランキング",
  level: "レベルランキング",
  collection: "コレクションランキング",
};

const data = new SlashCommandBuilder()
  .setName("ranking")
  .setDescription("各種ランキングを表示します")
  .addStringOption((option) =>
    option
      .setName("board")
      .setDescription("表示するランキング")
      .setRequired(true)
      .addChoices(...Object.entries(BOARD_LABELS).map(([value, name]) => ({ name, value }))),
  );

async function resolveDisplayName(interaction, userId) {
  const member = await interaction.guild.members.fetch(userId).catch(() => null);
  return member ? member.displayName : `<@${userId}>`;
}

async function getCoinBoard(guildId) {
  const rows = await prisma.economyUser.findMany({
    where: { guildId },
    orderBy: { coin: "desc" },
    take: 10,
  });
  return rows.map((r) => ({ userId: r.userId, value: `${r.coin}枚` }));
}

async function getLevelBoard(guildId) {
  const rows = await prisma.economyUser.findMany({
    where: { guildId },
    orderBy: [{ level: "desc" }, { xp: "desc" }],
    take: 10,
  });
  return rows.map((r) => ({ userId: r.userId, value: `Lv.${r.level}（XP ${r.xp}）` }));
}

async function getGachaBoard(guildId) {
  const rows = await prisma.gachaLog.groupBy({
    by: ["userId"],
    where: { guildId },
    _count: { userId: true },
    orderBy: { _count: { userId: "desc" } },
    take: 10,
  });
  return rows.map((r) => ({ userId: r.userId, value: `${r._count.userId}連` }));
}

async function getCollectionBoard(guildId) {
  const rows = await prisma.userCollectionItem.groupBy({
    by: ["userId"],
    where: { guildId },
    _count: { itemId: true },
    orderBy: { _count: { itemId: "desc" } },
    take: 10,
  });
  return rows.map((r) => ({ userId: r.userId, value: `${r._count.itemId}/200種` }));
}

async function execute(interaction) {
  const board = interaction.options.getString("board", true);
  await interaction.deferReply();

  let rows;
  if (board === "coin") rows = await getCoinBoard(interaction.guildId);
  else if (board === "level") rows = await getLevelBoard(interaction.guildId);
  else if (board === "gacha") rows = await getGachaBoard(interaction.guildId);
  else rows = await getCollectionBoard(interaction.guildId);

  if (rows.length === 0) {
    await interaction.editReply("まだデータがありません。");
    return;
  }

  const lines = await Promise.all(
    rows.map(async (row, index) => `${index + 1}. ${await resolveDisplayName(interaction, row.userId)} - ${row.value}`),
  );

  const embed = new EmbedBuilder()
    .setTitle(BOARD_LABELS[board])
    .setColor(0x5865f2)
    .setDescription(lines.join("\n"));

  await interaction.editReply({ embeds: [embed] });
}

module.exports = { data, execute };
