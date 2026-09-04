const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, SlashCommandBuilder } = require("discord.js");
const {
  startGame,
  handValue,
  formatHand,
  canDouble,
  canSplit,
  canSurrender,
  CHIP_VALUES,
  MAX_BET_CHIPS,
} = require("../services/blackjack");
const { formatUnlockLines } = require("../services/achievements");

const data = new SlashCommandBuilder()
  .setName("bj")
  .setDescription("ブラックジャックで遊びます(AP-1)")
  .addSubcommand((subcommand) =>
    subcommand
      .setName("play")
      .setDescription("BJを開始します")
      .addIntegerOption((option) =>
        option
          .setName("chip")
          .setDescription("1チップあたりのコイン")
          .setRequired(true)
          .addChoices(...CHIP_VALUES.map((v) => ({ name: `${v}コイン`, value: v }))),
      )
      .addIntegerOption((option) =>
        option
          .setName("bet")
          .setDescription(`賭けチップ数（最大${MAX_BET_CHIPS}）`)
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(MAX_BET_CHIPS),
      ),
  );

function buildActionRow(userId, game) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bj:hit:${userId}`).setLabel("ヒット").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`bj:stand:${userId}`).setLabel("スタンド").setStyle(ButtonStyle.Secondary),
  );

  if (canDouble(game)) {
    row.addComponents(
      new ButtonBuilder().setCustomId(`bj:double:${userId}`).setLabel("ダブルダウン").setStyle(ButtonStyle.Success),
    );
  }

  if (canSplit(game)) {
    row.addComponents(
      new ButtonBuilder().setCustomId(`bj:split:${userId}`).setLabel("スプリット").setStyle(ButtonStyle.Success),
    );
  }

  if (canSurrender(game)) {
    row.addComponents(
      new ButtonBuilder().setCustomId(`bj:surrender:${userId}`).setLabel("サレンダー").setStyle(ButtonStyle.Danger),
    );
  }

  return row;
}

function formatHandLine(hand, index, { active, hideValue = false } = {}) {
  const marker = active ? "▶ " : "";
  const label = `${marker}ハンド${index + 1}`;
  const cards = formatHand(hand.cards);
  const value = hideValue ? "" : ` (${handValue(hand.cards)})`;
  const tags = [hand.doubled ? "Double" : null, hand.surrendered ? "Surrender" : null].filter(Boolean);
  const tagText = tags.length > 0 ? ` [${tags.join(", ")}]` : "";

  return `${label}: ${cards}${value}${tagText} - ${hand.bet}コイン`;
}

function buildGameEmbed(game, { hideDealerHole = false, title = "ブラックジャック" } = {}) {
  const dealerDisplay = hideDealerHole
    ? `${game.dealerHand[0].rank}${game.dealerHand[0].suit} ?`
    : `${formatHand(game.dealerHand)} (${handValue(game.dealerHand)})`;

  const handsText = game.hands
    .map((h, i) => formatHandLine(h, i, { active: i === game.activeHandIndex && !h.done }))
    .join("\n");

  return new EmbedBuilder()
    .setTitle(title)
    .setColor(0x2f3136)
    .addFields(
      { name: "ディーラー", value: dealerDisplay },
      { name: "あなた", value: handsText },
    );
}

const OUTCOME_LABEL = {
  WIN: "勝利！",
  BLACKJACK: "ブラックジャック！",
  LOSE: "敗北...",
  PUSH: "引き分け",
  SURRENDER: "サレンダー",
};

function buildResultEmbed(game, result) {
  const multiHand = result.hands.length > 1;
  const overallOutcome = multiHand
    ? result.hands.some((h) => h.outcome === "WIN" || h.outcome === "BLACKJACK")
      ? "決着"
      : result.hands.every((h) => h.outcome === "LOSE")
        ? "敗北..."
        : "決着"
    : OUTCOME_LABEL[result.hands[0].outcome];

  const embed = buildGameEmbed(game, { title: `ブラックジャック - ${overallOutcome}` });
  const resultLines = result.hands.map(
    (h, i) => `${formatHandLine(h, i)} → ${OUTCOME_LABEL[h.outcome]}（${h.payout}コイン）`,
  );

  embed.spliceFields(1, 1, { name: "あなた", value: resultLines.join("\n") });
  embed.addFields({
    name: "合計払戻",
    value: `${result.totalPayout}コイン${result.forcedWin ? "（勝利確定チケット適用）" : ""}`,
  });

  const unlockLines = formatUnlockLines(result.unlockedAchievements ?? []);
  if (unlockLines.length > 0) {
    embed.addFields({ name: "実績", value: unlockLines.join("\n") });
  }

  return embed;
}

async function execute(interaction) {
  const chipValue = interaction.options.getInteger("chip", true);
  const bet = interaction.options.getInteger("bet", true);

  await interaction.deferReply();

  let result;
  try {
    result = await startGame(interaction.guildId, interaction.user.id, chipValue, bet);
  } catch (error) {
    await interaction.editReply(error.message);
    return;
  }

  if (!result.success) {
    if (result.reason === "INSUFFICIENT_AP") {
      await interaction.editReply("APが足りません。（BJ参加には1AP必要です）");
      return;
    }

    await interaction.editReply(`コインが足りません。（必要: ${chipValue * bet}枚 / 所持: ${result.user.coin}枚）`);
    return;
  }

  if (result.finished) {
    await interaction.editReply({ embeds: [buildResultEmbed(result.game, result)] });
    return;
  }

  await interaction.editReply({
    embeds: [buildGameEmbed(result.game, { hideDealerHole: true })],
    components: [buildActionRow(interaction.user.id, result.game)],
  });
}

module.exports = {
  data,
  execute,
  buildGameEmbed,
  buildResultEmbed,
  buildActionRow,
};
