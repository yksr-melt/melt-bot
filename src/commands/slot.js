const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, SlashCommandBuilder } = require("discord.js");
const { sit, MAX_BET_UNITS, COIN_PER_UNIT, PEKA_COIN_COST } = require("../services/slot");
const { formatUnlockLines } = require("../services/achievements");

const data = new SlashCommandBuilder()
  .setName("slot")
  .setDescription("スロット台に着席します（AP-1）")
  .addSubcommand((subcommand) => subcommand.setName("sit").setDescription("台に着席してパネルを表示します"));

// ハズレ時の飾り絵柄（ぶどう・リプレイ・ボーナス絵柄とは別枠のハズレ目）。
const MISS_SYMBOLS = ["🍒", "🔔", "⭐", "🍋", "💎"];
const BONUS_SYMBOL = { BIG: "7️⃣", REG: "🅱️" };
const GRAPE_SYMBOL = "🍇";
const REPLAY_SYMBOL = "🔃";
const HIDDEN_SYMBOL = "❔";

function randomMissSymbol() {
  return MISS_SYMBOLS[Math.floor(Math.random() * MISS_SYMBOLS.length)];
}

// 表示は常にチップ(枚)単位に統一する。内部の金額はコイン建てで扱われているため、
// UIに出す直前でチップへ変換する（20コイン=1枚）。
function toChips(coinAmount) {
  return coinAmount / COIN_PER_UNIT;
}

// スピン結果(spin()の戻り値)を、3レーン分の絵柄に変換する。
// 抽選そのものはspin()側で既に確定しており、ここは演出用の見た目を作るだけ。
function generateReelSymbols(result) {
  if (result.phase === "REVEAL") {
    const symbol = BONUS_SYMBOL[result.bonus];
    return [symbol, symbol, symbol];
  }

  if (result.phase === "PEKA" || result.phase === "PEKA_CONTINUE") {
    // まだ揃わない「テンパイ」演出：ボーナス絵柄2つ+ハズレ絵柄1つをランダムな位置に配置する。
    const bonusType = result.bonus ?? result.machine.pendingBonus;
    const symbol = BONUS_SYMBOL[bonusType];
    const symbols = [symbol, symbol, symbol];
    symbols[Math.floor(Math.random() * 3)] = randomMissSymbol();
    return symbols;
  }

  if (result.phase === "GRAPE") {
    return [GRAPE_SYMBOL, GRAPE_SYMBOL, GRAPE_SYMBOL];
  }

  if (result.phase === "REPLAY") {
    return [REPLAY_SYMBOL, REPLAY_SYMBOL, REPLAY_SYMBOL];
  }

  let symbols;
  do {
    symbols = [randomMissSymbol(), randomMissSymbol(), randomMissSymbol()];
  } while (symbols[0] === symbols[1] && symbols[1] === symbols[2]);
  return symbols;
}

function buildReelDisplay(symbols, revealedCount) {
  return symbols.map((symbol, i) => (i < revealedCount ? symbol : HIDDEN_SYMBOL)).join("  ");
}

// 着席中・非ペカり時のベット選択パネル。「-1/+1 BET」「MAX BET」でベット枚数を決め、「レバー」で回す。
function buildBetRow(userId, bet) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`slot:betminus:${userId}:${bet}`)
      .setLabel("-1 BET")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(bet <= 1),
    new ButtonBuilder()
      .setCustomId(`slot:betplus:${userId}:${bet}`)
      .setLabel("+1 BET")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(bet >= MAX_BET_UNITS),
    new ButtonBuilder()
      .setCustomId(`slot:betmax:${userId}:${bet}`)
      .setLabel("MAX BET")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(bet >= MAX_BET_UNITS),
    new ButtonBuilder()
      .setCustomId(`slot:lever:${userId}:${bet}`)
      .setLabel(`レバー（${bet}枚）`)
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`slot:leave:${userId}`).setLabel("やめる").setStyle(ButtonStyle.Secondary),
  );
}

// ペカり中（当たるまで1枚継続）は回す操作を「ストップ」に固定する。
function buildPekaRow(userId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`slot:lever:${userId}:1`)
      .setLabel(`回す（${toChips(PEKA_COIN_COST)}枚）`)
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`slot:leave:${userId}`).setLabel("やめる").setStyle(ButtonStyle.Secondary).setDisabled(true),
  );
}

function buildStopButton(userId, remaining) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`slot:stop:${userId}`)
      .setLabel(`ストップ（残り${remaining}レーン）`)
      .setStyle(ButtonStyle.Danger),
  );
}

const RESULT_LINES = {
  MISS: () => "ハズレ...",
  GRAPE: (r) => `🍇 ぶどう成立！ 獲得: ${toChips(r.payoutCoin)}枚`,
  REPLAY: (r) => `🔃 リプレイ成立！ 今回の${toChips(r.cost)}枚が返却されました`,
  PEKA: () => `✨ **ペカった!!** 当たるまで${toChips(PEKA_COIN_COST)}枚で回せます...`,
  PEKA_CONTINUE: () => "まだ揃わない...もう一度回してみましょう",
  REVEAL: (r) => `🎉 **${r.bonus}ボーナス確定!!** 獲得: ${toChips(r.payoutCoin)}枚`,
};

function buildResultLine(result) {
  if (!result) {
    return "着席しました。「+1 BET」「MAX BET」でベットを決めて「レバー」を押しましょう。";
  }

  return RESULT_LINES[result.phase](result);
}

function buildPanelEmbed(machine, result, { symbols, revealedCount, bet } = {}) {
  const pending = Boolean(machine.pendingBonus);
  const reelLine = symbols ? `${buildReelDisplay(symbols, revealedCount)}\n\n` : "";
  const unlockLines = formatUnlockLines(result?.unlockedAchievements ?? []);
  const resultLine = [buildResultLine(result), ...unlockLines].join("\n");
  const betLine = !pending && bet != null ? `現在のベット: ${bet}枚${bet < MAX_BET_UNITS ? "（MAX未満はボーナス抽選なし）" : "（MAX BET）"}\n\n` : "";

  const embed = new EmbedBuilder()
    .setTitle("スロット")
    .setColor(pending ? 0xffd700 : 0x5865f2)
    .setDescription(`${betLine}${reelLine}${resultLine}`)
    .setFooter({
      text: pending
        ? "ペカり中：当たるまで自動で降りられません"
        : machine.renchanGamesLeft > 0
          ? `連チャンチャンス中（残り${machine.renchanGamesLeft}回転）`
          : "ベットを決めて「レバー」を押しましょう",
    });

  return embed;
}

async function handleSit(interaction) {
  const result = await sit(interaction.guildId, interaction.user.id);

  if (!result.success) {
    await interaction.reply({ content: "APが足りません。（着席には1AP必要です）", ephemeral: true });
    return;
  }

  if (result.alreadySeated) {
    await interaction.reply({ content: "既に着席しています。", ephemeral: true });
    return;
  }

  const initialBet = 1;
  await interaction.reply({
    embeds: [buildPanelEmbed(result.machine, null, { bet: initialBet })],
    components: [buildBetRow(interaction.user.id, initialBet)],
  });
}

async function execute(interaction) {
  await handleSit(interaction);
}

module.exports = {
  data,
  execute,
  buildPanelEmbed,
  buildBetRow,
  buildPekaRow,
  buildStopButton,
  buildReelDisplay,
  buildResultLine,
  generateReelSymbols,
  HIDDEN_SYMBOL,
  MAX_BET_UNITS,
};
