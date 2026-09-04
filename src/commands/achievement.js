const { EmbedBuilder, SlashCommandBuilder } = require("discord.js");
const { ACHIEVEMENTS, getUserAchievements } = require("../services/achievements");

const data = new SlashCommandBuilder().setName("achievement").setDescription("実績の達成状況を確認します");

async function execute(interaction) {
  const unlocked = await getUserAchievements(interaction.guildId, interaction.user.id);

  const lines = Object.entries(ACHIEVEMENTS).map(([id, def]) => {
    const mark = unlocked.has(id) ? "✅" : "🔒";
    return `${mark} **${def.name}**（石${def.stoneReward}）- ${def.description}`;
  });

  const embed = new EmbedBuilder()
    .setTitle(`${interaction.user.username} の実績`)
    .setColor(0x5865f2)
    .setDescription(lines.join("\n"))
    .setFooter({ text: `達成: ${unlocked.size}/${Object.keys(ACHIEVEMENTS).length}` });

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

module.exports = { data, execute };
