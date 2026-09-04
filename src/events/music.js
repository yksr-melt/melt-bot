const { EmbedBuilder } = require("discord.js");
const { formatDuration } = require("../utils/text");

function getTextChannel(client, player) {
  if (!player.textChannelId) return null;
  return client.channels.cache.get(player.textChannelId) ?? null;
}

function registerMusicEvents(client, lavalink) {
  lavalink.on("trackStart", (player, track) => {
    const channel = getTextChannel(client, player);
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("▶️ 再生中")
      .setDescription(`**[${track.info.title}](${track.info.uri})**`)
      .addFields(
        { name: "再生時間", value: track.info.isStream ? "LIVE" : formatDuration(track.info.duration), inline: true },
        { name: "リクエスト", value: `${track.requester ?? "unknown"}`, inline: true }
      )
      .setThumbnail(track.info.artworkUrl ?? null);

    channel.send({ embeds: [embed] }).catch((error) => console.error("Failed to send trackStart message:", error));
  });

  lavalink.on("queueEnd", (player) => {
    const channel = getTextChannel(client, player);
    channel?.send("⏹️ キューが終了しました。").catch(() => undefined);
  });

  lavalink.on("trackError", (player, track, payload) => {
    console.error("Lavalink track error:", payload?.exception ?? payload);
    const channel = getTextChannel(client, player);
    channel
      ?.send(`❌ 再生中にエラーが発生しました: ${payload?.exception?.message ?? "不明なエラー"}`)
      .catch(() => undefined);
  });

  lavalink.on("trackStuck", (player, track) => {
    const channel = getTextChannel(client, player);
    channel?.send(`⚠️ **${track.info.title}** の再生がスタックしたためスキップしました。`).catch(() => undefined);
  });

  lavalink.on("playerDestroy", (player, reason) => {
    const channel = getTextChannel(client, player);
    if (!channel) return;
    if (reason === "QueueEmpty" || reason === "Disconnected") {
      channel.send("👋 一定時間再生がなかったため、ボイスチャンネルから切断しました。").catch(() => undefined);
    }
  });

  lavalink.nodeManager.on("error", (node, error) => {
    console.error(`Lavalink node "${node.id}" error:`, error);
  });

  lavalink.nodeManager.on("disconnect", (node, reason) => {
    console.warn(`Lavalink node "${node.id}" disconnected:`, reason);
  });
}

module.exports = { registerMusicEvents };
