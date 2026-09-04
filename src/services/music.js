const { LavalinkManager } = require("lavalink-client");
const { clientId, lavalink: lavalinkConfig } = require("../config");

const SPOTIFY_URL_REGEX = /open\.spotify\.com\/(?:intl-[a-z]{2}\/)?(track|playlist|album)\/([a-zA-Z0-9]+)/;

let manager = null;

function createLavalinkManager(client) {
  manager = new LavalinkManager({
    nodes: [
      {
        id: "main",
        host: lavalinkConfig.host,
        port: lavalinkConfig.port,
        authorization: lavalinkConfig.password,
        secure: lavalinkConfig.secure,
      },
    ],
    sendToShard: (guildId, payload) => client.guilds.cache.get(guildId)?.shard?.send(payload),
    autoSkip: true,
    client: {
      id: clientId,
      username: "melt-bot",
    },
    playerOptions: {
      defaultSearchPlatform: "ytsearch",
      onDisconnect: {
        autoReconnect: false,
        destroyPlayer: true,
      },
      onEmptyQueue: {
        destroyAfterMs: lavalinkConfig.idleDisconnectMs,
      },
    },
  });

  client.on("raw", (payload) => manager.sendRawData(payload));

  client.once("ready", (readyClient) => {
    manager.init({ id: readyClient.user.id, username: readyClient.user.username });
  });

  return manager;
}

function getLavalink() {
  if (!manager) throw new Error("Lavalink manager is not initialized");
  return manager;
}

function getOrCreatePlayer({ guildId, voiceChannelId, textChannelId }) {
  const lavalink = getLavalink();
  let player = lavalink.getPlayer(guildId);
  if (!player) {
    player = lavalink.createPlayer({
      guildId,
      voiceChannelId,
      textChannelId,
      selfDeaf: true,
    });
  }
  return player;
}

// Spotify Web API の資格情報 (有料/申請制) を用意していない場合のフォールバック。
// oEmbed は無認証で叩けるが、曲名しか取得できずアーティスト名までは分からないため、
// LavaSrc + Spotify資格情報が設定されている場合はそちらを優先する。
async function resolveSpotifyFallbackQuery(url) {
  const match = url.match(SPOTIFY_URL_REGEX);
  if (!match || match[1] !== "track") {
    return null;
  }

  const res = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`);
  if (!res.ok) {
    return null;
  }

  const data = await res.json();
  return data.title ? `ytsearch:${data.title}` : null;
}

function isSpotifyPlaylistOrAlbum(url) {
  const match = url.match(SPOTIFY_URL_REGEX);
  return Boolean(match && match[1] !== "track");
}

module.exports = {
  createLavalinkManager,
  getLavalink,
  getOrCreatePlayer,
  resolveSpotifyFallbackQuery,
  isSpotifyPlaylistOrAlbum,
  SPOTIFY_URL_REGEX,
};
