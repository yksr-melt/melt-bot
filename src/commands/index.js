const achievementCommand = require("./achievement");
const banCommand = require("./ban");
const blackjackCommand = require("./blackjack");
const collectionCommand = require("./collection");
const configCommand = require("./config");
const gachaCommand = require("./gacha");
const itemCommand = require("./item");
const keibaCommand = require("./keiba");
const kickCommand = require("./kick");
const rankingCommand = require("./ranking");
const rolePanelCommand = require("./role-panel");
const slotCommand = require("./slot");
const strikeCommand = require("./strike");
const suggestionCommand = require("./suggestion");
const ticketCommand = require("./ticket");
const timeoutCommand = require("./timeout");
const vcCommand = require("./vc");
const warnCommand = require("./warn");
const musicCommand = require("./music");
const workCommand = require("./work");

const commands = [
  achievementCommand,
  banCommand,
  blackjackCommand,
  collectionCommand,
  configCommand,
  gachaCommand,
  itemCommand,
  keibaCommand,
  kickCommand,
  rankingCommand,
  rolePanelCommand,
  slotCommand,
  strikeCommand,
  suggestionCommand,
  ticketCommand,
  timeoutCommand,
  vcCommand,
  warnCommand,
  musicCommand,
  workCommand,
];

module.exports = { commands };
