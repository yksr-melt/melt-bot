const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const {
  getLavalink,
  getOrCreatePlayer,
  resolveSpotifyFallbackQuery,
  isSpotifyPlaylistOrAlbum,
  SPOTIFY_URL_REGEX,
} = require("../services/music");
const { spotify: spotifyConfig } = require("../config");
const { formatDuration } = require("../utils/text");

const VOLUME_MIN = 1;
const VOLUME_MAX = 100;

const REPEAT_MODE_BY_CHOICE = { 0: "off", 1: "track", 2: "queue" };
const REPEAT_MODE_LABEL = { off: "オフ", track: "1曲ループ", queue: "全曲ループ" };

function requireVoiceChannel(interaction) {
  const vc = interaction.member?.voice?.channel;
  if (!vc) {
    interaction.reply({
      content: "❌ ボイスチャンネルに参加してから使用してください。",
      ephemeral: true,
    });
    return null;
  }
  return vc;
}

function requirePlayer(interaction) {
  const player = getLavalink().getPlayer(interaction.guildId);
  if (!player || (!player.queue.current && player.queue.tracks.length === 0)) {
    interaction.reply({
      content: "❌ 現在再生中の曲がありません。",
      ephemeral: true,
    });
    return null;
  }
  return player;
}

function requireSameVoiceChannel(interaction, player) {
  const vc = interaction.member?.voice?.channel;
  if (player.voiceChannelId && vc?.id !== player.voiceChannelId) {
    interaction.reply({
      content: "❌ Botと同じボイスチャンネルに参加してから使用してください。",
      ephemeral: true,
    });
    return false;
  }
  return true;
}

const data = new SlashCommandBuilder()
  .setName("music")
  .setDescription("音楽再生コマンド")
  .addSubcommand((sub) =>
    sub
      .setName("play")
      .setDescription("曲またはプレイリストを再生・追加します")
      .addStringOption((opt) =>
        opt
          .setName("query")
          .setDescription("URL または検索ワード (YouTube / Spotify / SoundCloud)")
          .setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub.setName("pause").setDescription("一時停止します")
  )
  .addSubcommand((sub) =>
    sub.setName("resume").setDescription("再開します")
  )
  .addSubcommand((sub) =>
    sub.setName("skip").setDescription("次の曲にスキップします")
  )
  .addSubcommand((sub) =>
    sub.setName("stop").setDescription("再生を停止してキューをクリアします")
  )
  .addSubcommand((sub) =>
    sub.setName("nowplaying").setDescription("現在再生中の曲を表示します")
  )
  .addSubcommand((sub) =>
    sub.setName("queue").setDescription("キューを表示します")
  )
  .addSubcommand((sub) =>
    sub
      .setName("volume")
      .setDescription("音量を変更します (1〜100)")
      .addIntegerOption((opt) =>
        opt
          .setName("level")
          .setDescription("音量 (1〜100)")
          .setRequired(true)
          .setMinValue(VOLUME_MIN)
          .setMaxValue(VOLUME_MAX)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("loop")
      .setDescription("ループモードを設定します")
      .addStringOption((opt) =>
        opt
          .setName("mode")
          .setDescription("ループモード")
          .setRequired(true)
          .addChoices(
            { name: "オフ", value: "0" },
            { name: "1曲ループ", value: "1" },
            { name: "全曲ループ", value: "2" }
          )
      )
  );

async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  // play だけ defer（検索に時間がかかる）
  if (sub === "play") {
    await interaction.deferReply();
  }

  try {
    switch (sub) {
      case "play": {
        const vc = requireVoiceChannel(interaction);
        if (!vc) return;

        const lavalink = getLavalink();
        const existingPlayer = lavalink.getPlayer(interaction.guildId);
        if (existingPlayer && existingPlayer.voiceChannelId !== vc.id) {
          await interaction.editReply("❌ Botと同じボイスチャンネルに参加してから使用してください。");
          return;
        }

        const player = getOrCreatePlayer({
          guildId: interaction.guildId,
          voiceChannelId: vc.id,
          textChannelId: interaction.channelId,
        });

        if (!player.connected) {
          await player.connect();
        }

        let query = interaction.options.getString("query");

        if (SPOTIFY_URL_REGEX.test(query)) {
          if (!spotifyConfig.sourceEnabled) {
            if (isSpotifyPlaylistOrAlbum(query)) {
              await interaction.editReply(
                "❌ Spotifyのプレイリスト/アルバムはSpotify連携が未設定のため再生できません。曲を1曲ずつ指定するか、管理者にSpotify APIキーの設定を依頼してください。"
              );
              return;
            }

            const fallbackQuery = await resolveSpotifyFallbackQuery(query);
            if (!fallbackQuery) {
              await interaction.editReply("❌ Spotifyの曲情報を取得できませんでした。");
              return;
            }
            query = fallbackQuery;
          }
        }

        const result = await player.search({ query }, interaction.user);

        if (!result || result.loadType === "error" || result.loadType === "empty" || result.tracks.length === 0) {
          await interaction.editReply("❌ 曲が見つかりませんでした。");
          return;
        }

        let embed;
        if (result.loadType === "playlist") {
          player.queue.add(result.tracks);
          embed = new EmbedBuilder()
            .setColor(0x57f287)
            .setTitle("➕ プレイリストを追加")
            .setDescription(`**${result.playlist.name}** (${result.tracks.length}曲)`);
        } else {
          const track = result.tracks[0];
          player.queue.add(track);
          embed = new EmbedBuilder()
            .setColor(0x57f287)
            .setTitle("➕ キューに追加")
            .setDescription(`**[${track.info.title}](${track.info.uri})**`)
            .addFields(
              {
                name: "再生時間",
                value: track.info.isStream ? "LIVE" : formatDuration(track.info.duration),
                inline: true,
              },
              { name: "キュー位置", value: `#${player.queue.tracks.length}`, inline: true }
            );
        }

        await interaction.editReply({ embeds: [embed] });

        if (!player.playing && !player.paused) {
          await player.play();
        }
        break;
      }

      case "pause": {
        const player = requirePlayer(interaction);
        if (!player) return;
        if (!requireSameVoiceChannel(interaction, player)) return;
        if (player.paused) {
          return interaction.reply({ content: "⚠️ すでに一時停止中です。", ephemeral: true });
        }
        await player.pause();
        await interaction.reply("⏸️ 一時停止しました。");
        break;
      }

      case "resume": {
        const player = requirePlayer(interaction);
        if (!player) return;
        if (!requireSameVoiceChannel(interaction, player)) return;
        if (!player.paused) {
          return interaction.reply({ content: "⚠️ すでに再生中です。", ephemeral: true });
        }
        await player.resume();
        await interaction.reply("▶️ 再開しました。");
        break;
      }

      case "skip": {
        const player = requirePlayer(interaction);
        if (!player) return;
        if (!requireSameVoiceChannel(interaction, player)) return;
        if (player.queue.tracks.length === 0) {
          return interaction.reply({ content: "⚠️ スキップできる次の曲がありません。", ephemeral: true });
        }
        await player.skip();
        await interaction.reply("⏭️ スキップしました。");
        break;
      }

      case "stop": {
        const player = requirePlayer(interaction);
        if (!player) return;
        if (!requireSameVoiceChannel(interaction, player)) return;
        await player.destroy();
        await interaction.reply("⏹️ 停止してキューをクリアしました。");
        break;
      }

      case "nowplaying": {
        const player = requirePlayer(interaction);
        if (!player) return;
        const track = player.queue.current;
        if (!track) {
          return interaction.reply({ content: "❌ 現在再生中の曲がありません。", ephemeral: true });
        }
        const embed = new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle("🎵 再生中")
          .setDescription(`**[${track.info.title}](${track.info.uri})**`)
          .addFields(
            {
              name: "再生時間",
              value: track.info.isStream
                ? "LIVE"
                : `${formatDuration(player.position)} / ${formatDuration(track.info.duration)}`,
              inline: true,
            },
            { name: "音量", value: `${player.volume}%`, inline: true },
            { name: "リクエスト", value: `${track.requester ?? "unknown"}`, inline: true }
          )
          .setThumbnail(track.info.artworkUrl ?? null);
        await interaction.reply({ embeds: [embed] });
        break;
      }

      case "queue": {
        const player = requirePlayer(interaction);
        if (!player) return;
        const current = player.queue.current;
        const upcoming = player.queue.tracks
          .slice(0, 10)
          .map((track, i) => `${i + 1}. ${track.info.title} (${formatDuration(track.info.duration)})`)
          .join("\n");
        const description = [
          current ? `▶️ **${current.info.title}** (${formatDuration(current.info.duration)})` : null,
          upcoming || null,
        ]
          .filter(Boolean)
          .join("\n");
        const embed = new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle("📋 キュー")
          .setDescription(description || "曲がありません")
          .setFooter({ text: `合計 ${player.queue.tracks.length + (current ? 1 : 0)} 曲` });
        await interaction.reply({ embeds: [embed] });
        break;
      }

      case "volume": {
        const player = requirePlayer(interaction);
        if (!player) return;
        if (!requireSameVoiceChannel(interaction, player)) return;
        const level = interaction.options.getInteger("level");
        await player.setVolume(level);
        await interaction.reply(`🔊 音量を ${level}% に設定しました。`);
        break;
      }

      case "loop": {
        const player = requirePlayer(interaction);
        if (!player) return;
        if (!requireSameVoiceChannel(interaction, player)) return;
        const mode = REPEAT_MODE_BY_CHOICE[interaction.options.getString("mode")];
        await player.setRepeatMode(mode);
        await interaction.reply(`🔁 ループモード: **${REPEAT_MODE_LABEL[mode]}**`);
        break;
      }
    }
  } catch (error) {
    console.error("Music command error:", error);
    const msg = `❌ エラーが発生しました: ${error.message}`;
    if (interaction.deferred) {
      await interaction.editReply(msg);
    } else if (!interaction.replied) {
      await interaction.reply({ content: msg, ephemeral: true });
    }
  }
}

module.exports = { data, execute };
