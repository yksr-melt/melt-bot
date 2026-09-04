const { EmbedBuilder, SlashCommandBuilder } = require("discord.js");
const { pullGacha, PITY_LIMIT, SINGLE_PULL_STONE_COST, TEN_PULL_STONE_COST } = require("../services/gacha");
const {
  syncAp,
  exchangeCoinToStone,
  exchangeStoneToCoin,
  MAX_AP,
  COIN_TO_STONE_COIN_COST,
  COIN_TO_STONE_STONE_REWARD,
  COIN_TO_STONE_MONTHLY_LIMIT,
} = require("../services/economy");
const { formatUnlockLines } = require("../services/achievements");

const RARITY_EMOJI = { R: "⚪", SR: "🔵", SSR: "🟡" };

const data = new SlashCommandBuilder()
  .setName("gacha")
  .setDescription("ガチャ・石/コインの管理を行います")
  .addSubcommand((subcommand) =>
    subcommand
      .setName("pull")
      .setDescription("ガチャを引きます")
      .addIntegerOption((option) =>
        option
          .setName("times")
          .setDescription("回数")
          .setRequired(true)
          .addChoices({ name: "1連", value: 1 }, { name: "10連", value: 10 }),
      ),
  )
  .addSubcommand((subcommand) => subcommand.setName("balance").setDescription("石・コインの残高を確認します"))
  .addSubcommand((subcommand) =>
    subcommand
      .setName("exchange-to-stone")
      .setDescription(`コイン${COIN_TO_STONE_COIN_COST}枚を石${COIN_TO_STONE_STONE_REWARD}個に交換します（月${COIN_TO_STONE_MONTHLY_LIMIT}回まで）`),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("exchange-to-coin")
      .setDescription("石10個につきコイン80枚に交換します")
      .addIntegerOption((option) =>
        option
          .setName("stone")
          .setDescription("交換する石の数（10の倍数）")
          .setRequired(true)
          .setMinValue(10),
      ),
  );

async function handlePull(interaction) {
  const times = interaction.options.getInteger("times", true);
  await interaction.deferReply();

  const result = await pullGacha(interaction.guildId, interaction.user.id, times);

  if (!result.success) {
    const cost = times === 10 ? TEN_PULL_STONE_COST : SINGLE_PULL_STONE_COST;
    await interaction.editReply(`石が足りません。（必要: ${cost}個 / 所持: ${result.user.stone}個）`);
    return;
  }

  const lines = result.results.map((r, index) => {
    const label = r.isPickup ? `${RARITY_EMOJI[r.rarity]} ★PU★` : RARITY_EMOJI[r.rarity];
    return `${index + 1}. ${label} ${r.item.name}`;
  });

  const pickupHit = result.results.some((r) => r.isPickup);
  const description = [...lines, ...formatUnlockLines(result.unlockedAchievements)].join("\n");
  const embed = new EmbedBuilder()
    .setTitle(`ガチャ結果（${times}連）`)
    .setColor(pickupHit ? 0xffd700 : 0x5865f2)
    .setDescription(description)
    .setFooter({
      text: `消費: 石${result.cost}個 / 残り石: ${result.user.stone}個 / 天井まで残り${PITY_LIMIT - result.user.gachaPullCount}連`,
    });

  await interaction.editReply({ embeds: [embed] });
}

async function handleBalance(interaction) {
  const user = await syncAp(interaction.guildId, interaction.user.id);
  const embed = new EmbedBuilder()
    .setTitle(`${interaction.user.username} の所持状況`)
    .setColor(0x5865f2)
    .addFields(
      { name: "石", value: `${user.stone}個`, inline: true },
      { name: "コイン", value: `${user.coin}枚`, inline: true },
      { name: "AP", value: `${user.ap}/${MAX_AP}`, inline: true },
      { name: "コレクションガチャチケット", value: `${user.collectionTickets}枚`, inline: true },
      { name: "天井まで", value: `${PITY_LIMIT - user.gachaPullCount}連`, inline: true },
    );

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleExchangeToStone(interaction) {
  const result = await exchangeCoinToStone(interaction.guildId, interaction.user.id);

  if (!result.success) {
    const message =
      result.reason === "MONTHLY_LIMIT"
        ? `今月の交換上限（${COIN_TO_STONE_MONTHLY_LIMIT}回）に達しています。`
        : `コインが足りません。（必要: ${COIN_TO_STONE_COIN_COST}枚 / 所持: ${result.user.coin}枚）`;
    await interaction.reply({ content: message, ephemeral: true });
    return;
  }

  await interaction.reply({
    content: `コイン${COIN_TO_STONE_COIN_COST}枚を石${COIN_TO_STONE_STONE_REWARD}個に交換しました。（残りコイン: ${result.user.coin}枚 / 石: ${result.user.stone}個 / 今月${result.user.coinExchangeCount}/${COIN_TO_STONE_MONTHLY_LIMIT}回）`,
    ephemeral: true,
  });
}

async function handleExchangeToCoin(interaction) {
  const stoneAmount = interaction.options.getInteger("stone", true);
  const result = await exchangeStoneToCoin(interaction.guildId, interaction.user.id, stoneAmount);

  if (!result.success) {
    const message =
      result.reason === "INVALID_AMOUNT"
        ? "交換する石の数は10の倍数で指定してください。"
        : `石が足りません。（必要: ${stoneAmount}個 / 所持: ${result.user.stone}個）`;
    await interaction.reply({ content: message, ephemeral: true });
    return;
  }

  await interaction.reply({
    content: `石${stoneAmount}個をコイン${result.coinGain}枚に交換しました。（残り石: ${result.user.stone}個 / コイン: ${result.user.coin}枚）`,
    ephemeral: true,
  });
}

async function execute(interaction) {
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === "pull") {
    await handlePull(interaction);
    return;
  }

  if (subcommand === "balance") {
    await handleBalance(interaction);
    return;
  }

  if (subcommand === "exchange-to-stone") {
    await handleExchangeToStone(interaction);
    return;
  }

  await handleExchangeToCoin(interaction);
}

module.exports = {
  data,
  execute,
};
