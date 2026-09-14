const { AuditLogEvent, Events } = require("discord.js");
const { getGuildSettings } = require("../utils/app-config");
const { createLogEmbed, sendGuildLog } = require("../utils/guild-log");
const { formatUser } = require("../utils/text");

const INVITE_LINK_PATTERN = /(?:discord\.gg|discord(?:app)?\.com\/invite)\/[a-zA-Z0-9-]+/i;
const userMessageTimestamps = new Map();
const moderationCooldowns = new Map();
const createActionTimestamps = new Map();

function pushTimestamp(map, key, windowMs) {
  const now = Date.now();
  const values = (map.get(key) ?? []).filter((timestamp) => now - timestamp <= windowMs);

  values.push(now);
  map.set(key, values);
  return values.length;
}

function isOnCooldown(key, cooldownMs) {
  const now = Date.now();
  const last = moderationCooldowns.get(key) ?? 0;

  if (now - last < cooldownMs) {
    return true;
  }

  moderationCooldowns.set(key, now);
  return false;
}

async function reportDetection({ guild, user, reason, cooldownKey }) {
  if (!user || user.bot || isOnCooldown(cooldownKey, 60_000)) {
    return;
  }

  const embed = createLogEmbed("アンチレイド検知", 0xed4245).addFields(
    { name: "ユーザー", value: formatUser(user), inline: true },
    { name: "内容", value: reason },
  );

  await sendGuildLog(guild, "moderation", embed);
}

async function findRecentExecutor(guild, type, targetId) {
  try {
    const auditLogs = await guild.fetchAuditLogs({ type, limit: 5 });

    return auditLogs.entries.find((entry) => (
      Date.now() - entry.createdTimestamp < 10_000
      && (!targetId || entry.target?.id === targetId)
    ))?.executor ?? null;
  } catch (error) {
    console.error(`Failed to fetch anti-raid audit logs for ${guild.id}:`, error);
    return null;
  }
}

function registerAntiRaidEvents(client) {
  client.on(Events.MessageCreate, async (message) => {
    if (!message.guild || message.author.bot) {
      return;
    }

    const settings = getGuildSettings(message.guild.id).antiRaid;

    if (settings.enabled === false) {
      return;
    }

    if (settings.messageSpam?.enabled !== false) {
      const windowMs = (settings.messageSpam.windowSeconds ?? 7) * 1000;
      const count = pushTimestamp(userMessageTimestamps, `${message.guild.id}:${message.author.id}`, windowMs);

      if (count >= (settings.messageSpam.threshold ?? 5)) {
        await reportDetection({
          guild: message.guild,
          user: message.author,
          reason: "短時間連投を検知",
          cooldownKey: `spam:${message.guild.id}:${message.author.id}`,
        });
      }
    }

    if (settings.massMentions?.enabled !== false) {
      const mentionCount = message.mentions.users.size + message.mentions.roles.size;

      if (mentionCount >= (settings.massMentions.threshold ?? 5)) {
        await reportDetection({
          guild: message.guild,
          user: message.author,
          reason: "大量メンションを検知",
          cooldownKey: `mentions:${message.guild.id}:${message.author.id}`,
        });
      }
    }

    if (settings.inviteLinks?.enabled !== false && INVITE_LINK_PATTERN.test(message.content)) {
      await reportDetection({
        guild: message.guild,
        user: message.author,
        reason: "Discord招待リンクを検知",
        cooldownKey: `invite:${message.guild.id}:${message.author.id}`,
      });
    }
  });

  client.on(Events.ChannelCreate, async (channel) => {
    if (!channel.guild) {
      return;
    }

    const settings = getGuildSettings(channel.guild.id).antiRaid;

    if (settings.enabled === false || settings.channelCreate?.enabled === false) {
      return;
    }

    const executor = await findRecentExecutor(channel.guild, AuditLogEvent.ChannelCreate, channel.id);

    if (!executor) {
      return;
    }

    const windowMs = (settings.channelCreate.windowSeconds ?? 30) * 1000;
    const count = pushTimestamp(createActionTimestamps, `channel:${channel.guild.id}:${executor.id}`, windowMs);

    if (count >= (settings.channelCreate.threshold ?? 5)) {
      await reportDetection({
        guild: channel.guild,
        user: executor,
        reason: "大量チャンネル作成を検知",
        cooldownKey: `channel-create:${channel.guild.id}:${executor.id}`,
      });
    }
  });

  client.on(Events.GuildRoleCreate, async (role) => {
    const settings = getGuildSettings(role.guild.id).antiRaid;

    if (settings.enabled === false || settings.roleCreate?.enabled === false) {
      return;
    }

    const executor = await findRecentExecutor(role.guild, AuditLogEvent.RoleCreate, role.id);

    if (!executor) {
      return;
    }

    const windowMs = (settings.roleCreate.windowSeconds ?? 30) * 1000;
    const count = pushTimestamp(createActionTimestamps, `role:${role.guild.id}:${executor.id}`, windowMs);

    if (count >= (settings.roleCreate.threshold ?? 5)) {
      await reportDetection({
        guild: role.guild,
        user: executor,
        reason: "大量ロール作成を検知",
        cooldownKey: `role-create:${role.guild.id}:${executor.id}`,
      });
    }
  });
}

module.exports = { registerAntiRaidEvents };
