const { SlashCommandBuilder } = require("discord.js");
const { doWork, WORK_COOLDOWN_MS } = require("../services/work");
const { formatUnlockLines } = require("../services/achievements");

const data = new SlashCommandBuilder().setName("work").setDescription(`働いてコインを稼ぎます（${WORK_COOLDOWN_MS / 3600000}時間に1回）`);

async function execute(interaction) {
  const result = await doWork(interaction.guildId, interaction.user.id);

  if (!result.success) {
    const timestamp = Math.floor(result.nextAvailableAt.getTime() / 1000);
    await interaction.reply({ content: `まだ働けません。次に働けるのは <t:${timestamp}:R> です。`, ephemeral: true });
    return;
  }

  const lines = [
    `働いてコインを${result.amount}枚獲得しました！（現在のコイン: ${result.user.coin}枚）`,
    ...formatUnlockLines(result.unlockedAchievements),
  ];

  await interaction.reply({ content: lines.join("\n"), ephemeral: true });
}

module.exports = { data, execute };
