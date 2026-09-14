const { registerLoggingEvents } = require("./logging");
const { registerWelcomeEvents } = require("./welcome");
const { registerLevelingEvents } = require("./leveling");
const { registerPrefixCommands } = require("./prefix-commands");
const { registerAntiRaidEvents } = require("../services/anti-raid");
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
}

module.exports = { registerEvents };
