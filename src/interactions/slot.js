const { EmbedBuilder } = require("discord.js");
const { spin, leave, getOrCreateSlotMachine, MAX_BET_UNITS, COIN_PER_UNIT } = require("../services/slot");
const {
  buildPanelEmbed,
  buildBetRow,
  buildPekaRow,
  buildStopButton,
  buildReelDisplay,
  generateReelSymbols,
} = require("../commands/slot");

// スピン結果を受け取ってから3回の「ストップ」でレーンを開放していく間の状態。
// プロセスメモリで保持する簡易実装（再起動を跨ぐと途中経過は失われる）。
const pendingReveals = new Map();

function revealKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

async function handleBetChange(interaction, userId, newBet) {
  const machine = await getOrCreateSlotMachine(interaction.guildId, userId);

  await interaction.update({
    embeds: [buildPanelEmbed(machine, null, { bet: newBet })],
    components: [buildBetRow(userId, newBet)],
  });
}

async function handleLever(interaction, userId, bet) {
  const result = await spin(interaction.guildId, userId, bet);

  if (!result.success) {
    if (result.reason === "NOT_SEATED") {
      await interaction.reply({ content: "台に着席していません。", ephemeral: true });
      return;
    }

    await interaction.reply({
      content: `コインが足りません。（必要: ${result.cost / COIN_PER_UNIT}枚 / 所持: ${result.user.coin}コイン）`,
      ephemeral: true,
    });
    return;
  }

  const symbols = generateReelSymbols(result);
  pendingReveals.set(revealKey(interaction.guildId, userId), { symbols, revealed: 0, result, bet });

  const embed = new EmbedBuilder()
    .setTitle("スロット")
    .setColor(0x5865f2)
    .setDescription(`${buildReelDisplay(symbols, 0)}\n\n「ストップ」でレーンを止めましょう`);

  await interaction.update({ embeds: [embed], components: [buildStopButton(userId, 3)] });
}

async function handleStop(interaction, userId) {
  const key = revealKey(interaction.guildId, userId);
  const state = pendingReveals.get(key);

  if (!state) {
    await interaction.reply({ content: "進行中のスピンが見つかりませんでした。ベットからやり直してください。", ephemeral: true });
    return;
  }

  state.revealed += 1;
  const remaining = 3 - state.revealed;

  if (remaining > 0) {
    const embed = new EmbedBuilder()
      .setTitle("スロット")
      .setColor(0x5865f2)
      .setDescription(`${buildReelDisplay(state.symbols, state.revealed)}\n\n「ストップ」でレーンを止めましょう`);

    await interaction.update({ embeds: [embed], components: [buildStopButton(userId, remaining)] });
    return;
  }

  pendingReveals.delete(key);
  const { result, symbols, bet } = state;
  const stillPending = Boolean(result.machine.pendingBonus);

  await interaction.update({
    embeds: [buildPanelEmbed(result.machine, result, { symbols, revealedCount: 3, bet: stillPending ? null : bet })],
    components: [stillPending ? buildPekaRow(userId) : buildBetRow(userId, bet ?? MAX_BET_UNITS)],
  });
}

async function handleLeave(interaction, userId) {
  const result = await leave(interaction.guildId, userId);

  if (!result.success && result.reason === "PEKA_IN_PROGRESS") {
    await interaction.reply({ content: "ペカり中は台を離れられません。当たるまで回してください。", ephemeral: true });
    return;
  }

  await interaction.update({
    embeds: [buildPanelEmbed(result.machine, null).setDescription("台から離れました。お疲れ様でした。")],
    components: [],
  });
}

async function handleSlotInteraction(interaction) {
  if (!interaction.isButton() || !interaction.customId.startsWith("slot:")) {
    return false;
  }

  const [, action, ownerId, arg] = interaction.customId.split(":");

  if (interaction.user.id !== ownerId) {
    await interaction.reply({ content: "この台はあなたのものではありません。", ephemeral: true });
    return true;
  }

  if (action === "betminus") {
    const newBet = Math.max(1, Number(arg) - 1);
    await handleBetChange(interaction, ownerId, newBet);
  } else if (action === "betplus") {
    const newBet = Math.min(MAX_BET_UNITS, Number(arg) + 1);
    await handleBetChange(interaction, ownerId, newBet);
  } else if (action === "betmax") {
    await handleBetChange(interaction, ownerId, MAX_BET_UNITS);
  } else if (action === "lever") {
    await handleLever(interaction, ownerId, Number(arg));
  } else if (action === "stop") {
    await handleStop(interaction, ownerId);
  } else {
    await handleLeave(interaction, ownerId);
  }

  return true;
}

module.exports = { handleSlotInteraction };
