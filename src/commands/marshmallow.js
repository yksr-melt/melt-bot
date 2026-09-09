const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
} = require("discord.js");

const data = new SlashCommandBuilder()
  .setName("marshmallow-panel")
  .setDescription("マシュマロ（匿名メッセージ）パネルを投稿します")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

async function execute(interaction) {
  const embed = new EmbedBuilder()
    .setTitle("🍡 マシュマロ")
    .setDescription(
      "匿名で質問やメッセージを送れます！\n\n" +
        "1回につき1質問/1メッセージにしてください！\n\n" +
        "どんな内容でもok!!NGはありません！！",
    )
    .setColor(0x57f287);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("marshmallow:open")
      .setLabel("ましゅまろを送る")
      .setEmoji("🍡")
      .setStyle(ButtonStyle.Primary),
  );

  await interaction.channel.send({ embeds: [embed], components: [row] });
  await interaction.reply({ content: "マシュマロパネルを投稿しました。", ephemeral: true });
}

module.exports = {
  data,
  execute,
};
