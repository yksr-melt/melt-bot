const {
  ActionRowBuilder,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");

const RECEIVE_CHANNEL_ID = "1541797233769578618";

function buildMarshmallowModal() {
  const input = new TextInputBuilder()
    .setCustomId("content")
    .setLabel("メッセージ")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1000);

  return new ModalBuilder()
    .setCustomId("marshmallow:submit")
    .setTitle("ましゅまろを送る")
    .addComponents(new ActionRowBuilder().addComponents(input));
}

async function handleMarshmallowInteraction(interaction) {
  if (interaction.isButton() && interaction.customId === "marshmallow:open") {
    await interaction.showModal(buildMarshmallowModal());
    return true;
  }

  if (!interaction.isModalSubmit() || interaction.customId !== "marshmallow:submit") {
    return false;
  }

  const content = interaction.fields.getTextInputValue("content").trim();

  if (!content) {
    await interaction.reply({ content: "メッセージが空だよ〜", ephemeral: true });
    return true;
  }

  const channel = await interaction.client.channels.fetch(RECEIVE_CHANNEL_ID).catch(() => null);

  if (!channel?.isTextBased()) {
    await interaction.reply({ content: "受け取りチャンネルが見つかりません。", ephemeral: true });
    return true;
  }

  const embed = new EmbedBuilder()
    .setTitle("🍡 マシュマロ")
    .setDescription(content)
    .setColor(0x5865f2)
    .setTimestamp();

  await channel.send({ embeds: [embed] });
  await interaction.reply({ content: "記録したよ〜", ephemeral: true });
  return true;
}

module.exports = { handleMarshmallowInteraction };
