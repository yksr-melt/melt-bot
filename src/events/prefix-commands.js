const { Events } = require("discord.js");
const slotCommand = require("../commands/slot");
const blackjackCommand = require("../commands/blackjack");
const gachaCommand = require("../commands/gacha");
const keibaCommand = require("../commands/keiba");
const { BET_TYPES } = require("../services/keiba");

const PREFIX = "p.";

// スラッシュコマンドの execute(interaction) をそのまま再利用するための簡易アダプタ。
// ボタン操作(ヒット/スタンド、回す/やめる等)は通常のDiscordメッセージ上の
// 本物のボタンとして送られるため、既存のインタラクションハンドラがそのまま使える。
function buildFakeInteraction(message, { subcommand = null, integers = {}, strings = {} } = {}) {
  const normalize = (payload) => (typeof payload === "string" ? { content: payload } : payload);
  let sentMessage = null;

  return {
    guildId: message.guildId,
    guild: message.guild,
    user: message.author,
    member: message.member,
    channelId: message.channelId,
    channel: message.channel,
    client: message.client,
    options: {
      getSubcommand: () => subcommand,
      getInteger: (name, required) => {
        const value = integers[name];
        if (value === undefined || value === null) {
          if (required) {
            throw new Error(`引数「${name}」を指定してください。`);
          }
          return null;
        }
        return value;
      },
      getString: (name, required) => {
        const value = strings[name];
        if (value === undefined || value === null) {
          if (required) {
            throw new Error(`引数「${name}」を指定してください。`);
          }
          return null;
        }
        return value;
      },
    },
    deferReply: async () => {
      sentMessage = await message.reply("処理中...");
    },
    editReply: async (payload) => {
      const data = normalize(payload);
      if (sentMessage) {
        return sentMessage.edit(data);
      }
      sentMessage = await message.reply(data);
      return sentMessage;
    },
    reply: async (payload) => {
      sentMessage = await message.reply(normalize(payload));
      return sentMessage;
    },
  };
}

async function handleSlotPrefix(message) {
  await slotCommand.execute(buildFakeInteraction(message));
}

async function handleBalancePrefix(message) {
  await gachaCommand.execute(buildFakeInteraction(message, { subcommand: "balance" }));
}

async function handleBlackjackPrefix(message, args) {
  const chip = Number(args[0]);
  const bet = Number(args[1]);

  if (!Number.isInteger(chip) || !Number.isInteger(bet)) {
    await message.reply("使い方: `p.bj <チップ単価> <賭けチップ数>`（例: `p.bj 10 5`）");
    return;
  }

  await blackjackCommand.execute(buildFakeInteraction(message, { integers: { chip, bet } }));
}

const GACHA_SUBCOMMANDS = ["pull", "balance", "exchange-to-stone", "exchange-to-coin"];

async function handleGachaPrefix(message, args) {
  const subcommand = args[0]?.toLowerCase();

  if (!GACHA_SUBCOMMANDS.includes(subcommand)) {
    await message.reply(
      "使い方: `p.gacha pull <1か10>` / `p.gacha balance` / `p.gacha exchange-to-stone` / `p.gacha exchange-to-coin <石の数>`",
    );
    return;
  }

  if (subcommand === "pull") {
    const times = Number(args[1]);
    if (times !== 1 && times !== 10) {
      await message.reply("使い方: `p.gacha pull <1か10>`");
      return;
    }
    await gachaCommand.execute(buildFakeInteraction(message, { subcommand, integers: { times } }));
    return;
  }

  if (subcommand === "exchange-to-coin") {
    const stone = Number(args[1]);
    if (!Number.isInteger(stone) || stone <= 0) {
      await message.reply("使い方: `p.gacha exchange-to-coin <石の数（10の倍数）>`");
      return;
    }
    await gachaCommand.execute(buildFakeInteraction(message, { subcommand, integers: { stone } }));
    return;
  }

  await gachaCommand.execute(buildFakeInteraction(message, { subcommand }));
}

const KEIBA_BET_USAGE = `使い方: \`p.keiba bet <賭式> <馬番> <賭け金>\`（賭式: ${Object.keys(BET_TYPES).join("/")}、例: \`p.keiba bet TANSHO 3 100\`）`;

async function handleKeibaPrefix(message, args) {
  const subcommand = args[0]?.toLowerCase();

  if (subcommand === "race") {
    await keibaCommand.execute(buildFakeInteraction(message, { subcommand }));
    return;
  }

  if (subcommand === "bet") {
    const type = args[1]?.toUpperCase();
    const horses = args[2];
    const amount = Number(args[3]);

    if (!BET_TYPES[type] || !horses || !Number.isInteger(amount) || amount <= 0) {
      await message.reply(KEIBA_BET_USAGE);
      return;
    }

    await keibaCommand.execute(
      buildFakeInteraction(message, { subcommand, strings: { type, horses }, integers: { amount } }),
    );
    return;
  }

  await message.reply("使い方: `p.keiba race`（出走表確認） / " + KEIBA_BET_USAGE);
}

function registerPrefixCommands(client) {
  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot || !message.guildId || !message.content.startsWith(PREFIX)) {
      return;
    }

    const [commandToken, ...args] = message.content.trim().split(/\s+/);
    const commandName = commandToken.slice(PREFIX.length).toLowerCase();

    try {
      if (commandName === "slot") {
        await handleSlotPrefix(message);
      } else if (commandName === "bal") {
        await handleBalancePrefix(message);
      } else if (commandName === "bj") {
        await handleBlackjackPrefix(message, args);
      } else if (commandName === "gacha") {
        await handleGachaPrefix(message, args);
      } else if (commandName === "keiba") {
        await handleKeibaPrefix(message, args);
      }
    } catch (error) {
      console.error("Prefix command failed:", error);
      await message.reply(error.message || "処理中にエラーが発生しました。").catch(() => undefined);
    }
  });
}

module.exports = { registerPrefixCommands };
