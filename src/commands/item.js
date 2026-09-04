const { EmbedBuilder, SlashCommandBuilder } = require("discord.js");
const { prisma } = require("../db");
const { addAp, getOrCreateUser } = require("../services/economy");
const { grantTimedBuff, grantOneShotBuff, COIN_MULTIPLIER, AP_FREE, SLOT_BONUS_CONFIRM, BJ_WIN_CONFIRM } = require("../services/buffs");
const { getOrCreateSlotMachine } = require("../services/slot");

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

const ITEM_NAMES = {
  r_ap_drink1: "AP1回復ドリンク",
  r_coin_boost_10m: "10分コイン獲得量1.1倍",
  r_ap_free_5m: "5分間AP使い放題チケット",
  sr_ap_drink3: "AP3回復ドリンク",
  sr_coin_boost_1h: "1時間コイン獲得量1.1倍",
  sr_coin_boost_3m: "3分コイン獲得量1.5倍",
  sr_slot_check: "スロット設定確認チケット",
  sr_slot_plus1: "スロット設定+1チケット",
  sr_slot_456: "スロット設定456確定チケット",
  ssr_slot_6: "設定6確定チケット",
  ssr_coin_boost_10m_x2: "10分間コイン獲得量2倍",
  ssr_ap_free_1h: "1時間AP使い放題チケット",
  ssr_bonus_confirm: "ボーナス1回確定チケット",
  ssr_bj_win_confirm: "BJ勝利確定チケット",
  pu_favor: "私に好きなことをさせることができる",
  pu_title: "お好みの独自称号",
};

const USABLE_ITEMS = new Set(Object.keys(ITEM_NAMES).filter((key) => !key.startsWith("pu_")));

const data = new SlashCommandBuilder()
  .setName("item")
  .setDescription("ガチャで入手したアイテムを管理します")
  .addSubcommand((subcommand) => subcommand.setName("list").setDescription("所持アイテム一覧を表示します"))
  .addSubcommand((subcommand) =>
    subcommand
      .setName("use")
      .setDescription("アイテムを使用します")
      .addStringOption((option) =>
        option
          .setName("key")
          .setDescription("使用するアイテム")
          .setRequired(true)
          .addChoices(...[...USABLE_ITEMS].map((key) => ({ name: ITEM_NAMES[key], value: key }))),
      ),
  );

async function consumeItem(guildId, userId, itemKey) {
  const record = await prisma.userItem.findUnique({
    where: { guildId_userId_itemKey: { guildId, userId, itemKey } },
  });

  if (!record || record.count <= 0) {
    return false;
  }

  await prisma.userItem.update({
    where: { guildId_userId_itemKey: { guildId, userId, itemKey } },
    data: { count: { decrement: 1 } },
  });

  return true;
}

async function applyItemEffect(guildId, userId, itemKey) {
  switch (itemKey) {
    case "r_ap_drink1":
      await addAp(guildId, userId, 1);
      return "APを1回復しました。";
    case "sr_ap_drink3":
      await addAp(guildId, userId, 3);
      return "APを3回復しました。";
    case "r_coin_boost_10m":
      await grantTimedBuff(guildId, userId, COIN_MULTIPLIER, 1.1, 10 * MINUTE);
      return "10分間コイン獲得量が1.1倍になりました。";
    case "sr_coin_boost_1h":
      await grantTimedBuff(guildId, userId, COIN_MULTIPLIER, 1.1, HOUR);
      return "1時間コイン獲得量が1.1倍になりました。";
    case "sr_coin_boost_3m":
      await grantTimedBuff(guildId, userId, COIN_MULTIPLIER, 1.5, 3 * MINUTE);
      return "3分間コイン獲得量が1.5倍になりました。";
    case "ssr_coin_boost_10m_x2":
      await grantTimedBuff(guildId, userId, COIN_MULTIPLIER, 2, 10 * MINUTE);
      return "10分間コイン獲得量が2倍になりました。";
    case "r_ap_free_5m":
      await grantTimedBuff(guildId, userId, AP_FREE, 1, 5 * MINUTE);
      return "5分間AP消費が無効になりました。";
    case "ssr_ap_free_1h":
      await grantTimedBuff(guildId, userId, AP_FREE, 1, HOUR);
      return "1時間AP消費が無効になりました。";
    case "sr_slot_check": {
      const machine = await getOrCreateSlotMachine(guildId, userId);
      return `現在のスロット設定は「設定${machine.setting}」です。`;
    }
    case "sr_slot_plus1": {
      const machine = await getOrCreateSlotMachine(guildId, userId);
      const newSetting = Math.min(6, machine.setting + 1);
      await prisma.slotMachine.update({ where: { guildId_userId: { guildId, userId } }, data: { setting: newSetting } });
      return `スロット設定が${machine.setting}→${newSetting}になりました。`;
    }
    case "sr_slot_456": {
      const newSetting = 4 + Math.floor(Math.random() * 3);
      await getOrCreateSlotMachine(guildId, userId);
      await prisma.slotMachine.update({ where: { guildId_userId: { guildId, userId } }, data: { setting: newSetting } });
      return `スロット設定が${newSetting}に確定しました。`;
    }
    case "ssr_slot_6": {
      await getOrCreateSlotMachine(guildId, userId);
      await prisma.slotMachine.update({ where: { guildId_userId: { guildId, userId } }, data: { setting: 6 } });
      return "スロット設定が6に確定しました。";
    }
    case "ssr_bonus_confirm":
      await grantOneShotBuff(guildId, userId, SLOT_BONUS_CONFIRM, 1, 1);
      return "次回のスロット1回転でボーナス確定になりました。";
    case "ssr_bj_win_confirm":
      await grantOneShotBuff(guildId, userId, BJ_WIN_CONFIRM, 1, 1);
      return "次回のBJ勝利が確定しました。";
    default:
      return null;
  }
}

async function execute(interaction) {
  const subcommand = interaction.options.getSubcommand();
  const guildId = interaction.guildId;
  const userId = interaction.user.id;

  if (subcommand === "list") {
    await getOrCreateUser(guildId, userId);
    const records = await prisma.userItem.findMany({ where: { guildId, userId, count: { gt: 0 } } });

    if (records.length === 0) {
      await interaction.reply({ content: "所持しているアイテムはありません。", ephemeral: true });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle(`${interaction.user.username} の所持アイテム`)
      .setColor(0x5865f2)
      .setDescription(records.map((r) => `${ITEM_NAMES[r.itemKey] ?? r.itemKey} × ${r.count}`).join("\n"));

    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  const itemKey = interaction.options.getString("key", true);

  const consumed = await consumeItem(guildId, userId, itemKey);

  if (!consumed) {
    await interaction.reply({ content: "そのアイテムを所持していません。", ephemeral: true });
    return;
  }

  const message = await applyItemEffect(guildId, userId, itemKey);
  await interaction.reply({ content: message ?? "アイテムを使用しました。", ephemeral: true });
}

module.exports = {
  data,
  execute,
  ITEM_NAMES,
};
