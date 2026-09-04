const { hit, stand, doubleDown, split, surrender } = require("../services/blackjack");
const { buildGameEmbed, buildResultEmbed, buildActionRow } = require("../commands/blackjack");

const HANDLERS = {
  hit,
  stand,
  double: doubleDown,
  split,
  surrender,
};

async function handleBlackjackInteraction(interaction) {
  if (!interaction.isButton() || !interaction.customId.startsWith("bj:")) {
    return false;
  }

  const [, action, ownerId] = interaction.customId.split(":");

  if (interaction.user.id !== ownerId) {
    await interaction.reply({ content: "このゲームはあなたのものではありません。", ephemeral: true });
    return true;
  }

  const handler = HANDLERS[action];
  if (!handler) {
    return false;
  }

  let result;
  try {
    result = await handler(interaction.guildId, interaction.user.id);
  } catch (error) {
    await interaction.reply({ content: error.message, ephemeral: true });
    return true;
  }

  if (!result) {
    await interaction.update({ content: "進行中のゲームが見つかりませんでした。", embeds: [], components: [] });
    return true;
  }

  if (result.insufficientCoin) {
    await interaction.reply({ content: `コインが足りません。（所持: ${result.user.coin}枚）`, ephemeral: true });
    return true;
  }

  if (result.finished) {
    await interaction.update({ embeds: [buildResultEmbed(result.game, result)], components: [] });
    return true;
  }

  await interaction.update({
    embeds: [buildGameEmbed(result.game, { hideDealerHole: true })],
    components: [buildActionRow(interaction.user.id, result.game)],
  });
  return true;
}

module.exports = { handleBlackjackInteraction };
