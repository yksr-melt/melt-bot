const { Events } = require("discord.js");
const { grantMessageXp, grantVoiceXp } = require("../services/xp");

// VC参加中の経過時間はプロセスメモリで追跡する（再起動を跨いだ計測は行わない簡易実装）。
const voiceJoinTimestamps = new Map();

function voiceKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

async function notifyLevelUp(member, result) {
  if (!result?.leveledUp) {
    return;
  }

  const latest = result.rewards[result.rewards.length - 1];
  const channel = member.guild.systemChannel;

  if (!channel?.isTextBased()) {
    return;
  }

  await channel
    .send(`🎉 ${member} がレベル${latest.level}になりました！（石+${latest.stone}、コイン+${latest.coin}）`)
    .catch(() => undefined);
}

function registerLevelingEvents(client) {
  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot || !message.guildId) {
      return;
    }

    try {
      const result = await grantMessageXp(message.guildId, message.author.id);
      if (result?.leveledUp && message.member) {
        await notifyLevelUp(message.member, result);
      }
    } catch (error) {
      console.error("Failed to grant message xp:", error);
    }
  });

  client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    const guildId = newState.guild.id;
    const userId = newState.id;
    const key = voiceKey(guildId, userId);

    const wasInChannel = Boolean(oldState.channelId);
    const isInChannel = Boolean(newState.channelId);

    if (!wasInChannel && isInChannel) {
      voiceJoinTimestamps.set(key, Date.now());
      return;
    }

    if (wasInChannel && !isInChannel) {
      const joinedAt = voiceJoinTimestamps.get(key);
      voiceJoinTimestamps.delete(key);

      if (!joinedAt) {
        return;
      }

      const minutes = (Date.now() - joinedAt) / 60000;

      try {
        const result = await grantVoiceXp(guildId, userId, minutes);
        if (result?.leveledUp) {
          const member = newState.member ?? oldState.member;
          if (member) {
            await notifyLevelUp(member, result);
          }
        }
      } catch (error) {
        console.error("Failed to grant voice xp:", error);
      }
    }
  });
}

module.exports = { registerLevelingEvents };
