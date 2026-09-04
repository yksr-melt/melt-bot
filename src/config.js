require("dotenv").config();

const requiredEnv = ["DISCORD_TOKEN", "CLIENT_ID"];
const missingEnv = requiredEnv.filter((key) => !process.env[key]);

if (missingEnv.length > 0) {
  throw new Error(`Missing required environment variables: ${missingEnv.join(", ")}`);
}

module.exports = {
  discordToken: process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID,
  guildId: process.env.GUILD_ID || null,
  lavalink: {
    host: process.env.LAVALINK_HOST || "localhost",
    port: parseInt(process.env.LAVALINK_PORT || "2333", 10),
    password: process.env.LAVALINK_PASSWORD || "youshallnotpass",
    secure: process.env.LAVALINK_SECURE === "true",
    idleDisconnectMs: parseInt(process.env.LAVALINK_IDLE_DISCONNECT_MS || "60000", 10),
  },
  spotify: {
    sourceEnabled: process.env.SPOTIFY_SOURCE_ENABLED === "true",
  },
};
