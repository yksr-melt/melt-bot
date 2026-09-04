const { EmbedBuilder, SlashCommandBuilder } = require("discord.js");
const { pullCollection, getCollectionSummary } = require("../services/collection");
const { DUPLICATE_COIN_REWARD } = require("../data/collection-items");

const data = new SlashCommandBuilder()
  .setName("collection")
  .setDescription("お菓子コレクションガチャを管理します")
  .addSubcommand((subcommand) =>
    subcommand
      .setName("pull")
      .setDescription("コレクションガチャチケットを使って引きます")
      .addIntegerOption((option) =>
        option
          .setName("times")
          .setDescription("回数")
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(50),
      ),
  )
  .addSubcommand((subcommand) => subcommand.setName("list").setDescription("図鑑の達成状況を確認します"));

async function handlePull(interaction) {
  const times = interaction.options.getInteger("times", true);
  const result = await pullCollection(interaction.guildId, interaction.user.id, times);

  if (!result.success) {
    await interaction.reply({
      content: `コレクションガチャチケットが足りません。（必要: ${times}枚 / 所持: ${result.user.collectionTickets}枚）`,
      ephemeral: true,
    });
    return;
  }

  const lines = result.results.map((r) =>
    r.isNew ? `🆕 ${r.item.name}（${r.item.category}）` : `${r.item.name} × 重複（コイン+${r.coinGain}）`,
  );

  const embed = new EmbedBuilder()
    .setTitle(`コレクションガチャ結果（${times}連）`)
    .setColor(0x57f287)
    .setDescription(lines.join("\n"));

  await interaction.reply({ embeds: [embed] });
}

async function handleList(interaction) {
  const summary = await getCollectionSummary(interaction.guildId, interaction.user.id);
  const ownedIds = new Set(summary.items.map((i) => i.itemId));

  const embed = new EmbedBuilder()
    .setTitle(`${interaction.user.username} のお菓子図鑑`)
    .setColor(0x57f287)
    .setDescription(`達成率: ${summary.owned}/${summary.total}（重複はコイン${DUPLICATE_COIN_REWARD}枚に変換されます）`);

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function execute(interaction) {
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === "pull") {
    await handlePull(interaction);
    return;
  }

  await handleList(interaction);
}

module.exports = { data, execute };
