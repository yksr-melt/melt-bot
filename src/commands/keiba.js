const { EmbedBuilder, SlashCommandBuilder } = require("discord.js");
const { createRace, placeBet, BET_TYPES, RACE_WINDOW_MS } = require("../services/keiba");
const { formatUnlockLines } = require("../services/achievements");

const data = new SlashCommandBuilder()
  .setName("keiba")
  .setDescription("競馬に参加します(AP-1)")
  .addSubcommand((subcommand) => subcommand.setName("race").setDescription("レースを開催します（サーバー共有・5分後に確定）"))
  .addSubcommand((subcommand) =>
    subcommand
      .setName("bet")
      .setDescription("開催中のレースに馬券を賭けます")
      .addStringOption((option) =>
        option
          .setName("type")
          .setDescription("賭式")
          .setRequired(true)
          .addChoices(...Object.entries(BET_TYPES).map(([value, cfg]) => ({ name: cfg.label, value }))),
      )
      .addStringOption((option) =>
        option
          .setName("horses")
          .setDescription("馬番（例: 単勝なら 3 / 馬連なら 3-5 / 3連単なら 3-5-7）")
          .setRequired(true),
      )
      .addIntegerOption((option) =>
        option
          .setName("amount")
          .setDescription("賭け金（コイン）")
          .setRequired(true)
          .setMinValue(1),
      ),
  );

function buildRaceEmbed(horses, tanshoOdds, resolveAt) {
  const lines = tanshoOdds
    .slice()
    .sort((a, b) => a.popularity - b.popularity)
    .map((h) => `${h.popularity}番人気: ${h.number}番（単勝オッズ目安 ${h.odds}倍）`);

  return new EmbedBuilder()
    .setTitle("競馬 - 出走表")
    .setColor(0x5865f2)
    .setDescription(lines.join("\n"))
    .addFields({ name: "発走まで", value: `<t:${Math.floor(resolveAt / 1000)}:R>` })
    .setFooter({ text: "このサーバーの全員が同じレースに `/keiba bet` で参加できます" });
}

async function handleRace(interaction) {
  const { horses, tanshoOdds, resolveAt, alreadyActive } = createRace(
    interaction.guildId,
    interaction.channelId,
    (payload) => sendRaceResults(interaction.client, payload),
  );

  const embed = buildRaceEmbed(horses, tanshoOdds, resolveAt);

  if (alreadyActive) {
    await interaction.reply({ content: "既にこのサーバーで募集中のレースがあります。", embeds: [embed] });
    return;
  }

  await interaction.reply({
    content: `競馬を開催しました！ ${Math.floor(RACE_WINDOW_MS / 60000)}分後に発走します。`,
    embeds: [embed],
  });
}

async function handleBet(interaction) {
  const betType = interaction.options.getString("type", true);
  const horsesInput = interaction.options.getString("horses", true);
  const amount = interaction.options.getInteger("amount", true);

  let result;
  try {
    result = await placeBet(interaction.guildId, interaction.user.id, betType, horsesInput, amount);
  } catch (error) {
    await interaction.reply({ content: error.message, ephemeral: true });
    return;
  }

  if (!result.success) {
    if (result.reason === "NO_RACE") {
      await interaction.reply({ content: "募集中のレースがありません。`/keiba race` で開催してください。", ephemeral: true });
      return;
    }

    if (result.reason === "INSUFFICIENT_AP") {
      await interaction.reply({ content: "APが足りません。（競馬参加には1AP必要です）", ephemeral: true });
      return;
    }

    await interaction.reply({
      content: `コインが足りません。（必要: ${amount}枚 / 所持: ${result.user.coin}枚）`,
      ephemeral: true,
    });
    return;
  }

  await interaction.reply({
    content: `${BET_TYPES[result.betType].label} ${result.picks.join("-")} に${result.amount}コイン賭けました（オッズ${result.odds}倍）。発走: <t:${Math.floor(result.resolveAt / 1000)}:R>`,
    ephemeral: true,
  });
}

async function sendRaceResults(client, { channelId, horses, finishOrder, results }) {
  try {
    const channel = await client.channels.fetch(channelId);

    if (!channel?.isTextBased()) {
      return;
    }

    const horseLines = horses
      .slice()
      .sort((a, b) => a.popularity - b.popularity)
      .map((h) => `${h.popularity}番人気: ${h.number}番`)
      .join(" / ");

    const finishLines = finishOrder.map((n, i) => `${i + 1}着: ${n}番`).join(" / ");

    const resultLines =
      results.length === 0
        ? ["参加者はいませんでした。"]
        : results.flatMap((r) => {
            const line = `<@${r.userId}> ${BET_TYPES[r.betType].label} ${r.picks.join("-")}（${r.amount}コイン／オッズ${r.odds}倍） → ${
              r.won ? `的中！ 払戻${r.payout}コイン` : "ハズレ"
            }`;
            return [line, ...formatUnlockLines(r.unlockedAchievements)];
          });

    const embed = new EmbedBuilder()
      .setTitle("競馬 - レース結果")
      .setColor(0xffd700)
      .addFields(
        { name: "出走馬（人気順）", value: horseLines },
        { name: "着順", value: finishLines },
        { name: "結果", value: resultLines.join("\n") },
      );

    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error("Failed to send keiba race results:", error);
  }
}

async function execute(interaction) {
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === "race") {
    await handleRace(interaction);
    return;
  }

  await handleBet(interaction);
}

module.exports = {
  data,
  execute,
};
