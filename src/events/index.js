const { registerLoggingEvents } = require("./logging");
const { registerWelcomeEvents } = require("./welcome");
const { registerLevelingEvents } = require("./leveling");
const { registerPrefixCommands } = require("./prefix-commands");
const { registerAntiRaidEvents } = require("../services/anti-raid");
const { runStrikeDecay } = require("../services/strikes");
const { registerTempVoiceEvents } = require("../services/temp-vc");
const { registerMusicEvents } = require("./music");
const { createLavalinkManager } = require("../services/music");

function registerEvents(client) {
  registerLoggingEvents(client);
  registerWelcomeEvents(client);
  registerLevelingEvents(client);
  registerPrefixCommands(client);
  registerTempVoiceEvents(client);
  registerAntiRaidEvents(client);

  const lavalink = createLavalinkManager(client);
  registerMusicEvents(client, lavalink);

  client.once("ready", () => {
    runStrikeDecay(client).catch((error) => {
      console.error("Failed to run strike decay:", error);
    });

    setInterval(() => {
      runStrikeDecay(client).catch((error) => {
        console.error("Failed to run strike decay:", error);
      });
    }, 60 * 60 * 1000);
  });
}

module.exports = { registerEvents };
