# Melt Bot

自鯖で使いたいだけの自己満bot

## Setup

```bash
npm install
cp .env.example .env
cp config.example.json config.json
npm run prisma:migrate -- --name init
npm run lavalink:setup
npm run register
npm run dev
```

`npm run dev` / `npm run start` は Lavalink サーバーとBot本体を同時に起動します（`concurrently`使用、起動時のログは `[lavalink]` / `[bot]` プレフィックスで区別されます）。Botは起動直後にLavalinkへ接続を試み、Lavalinkの起動が完了するまで自動でリトライするため、起動順序は気にしなくて構いません。Lavalinkだけを個別に起動したい場合は `npm run lavalink`、Botだけなら `npm run bot` / `npm run bot:dev` を使ってください。

`.env` に設定する値:

* `DISCORD_TOKEN`: Bot token
* `CLIENT_ID`: Discord application client ID
* `GUILD_ID`: 開発中にギルド単位でコマンド登録する場合のサーバーID
* `DATABASE_URL`: SQLiteの接続先。初期値は `file:./dev.db`
* `LAVALINK_HOST` / `LAVALINK_PORT` / `LAVALINK_PASSWORD` / `LAVALINK_SECURE`: 音楽再生に使うLavalinkサーバーへの接続情報
* `LAVALINK_IDLE_DISCONNECT_MS`: キューが空になってから自動でVCを切断するまでの待機時間(ms)
* `SPOTIFY_SOURCE_ENABLED` / `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET`: SpotifyのURLをLavaSrcプラグインで直接解決したい場合のみ設定（後述）

### Lavalinkサーバー (音楽再生バックエンド)

本Botの音楽再生はDockerを使わず、Lavalink本体 (`Lavalink.jar`, Java製) をローカルプロセスとして直接起動する構成です。Java 17以上が必要です（`brew install openjdk@21` 等）。

```bash
npm run lavalink:setup   # Lavalink.jar のダウンロードと lavalink/application.yml の作成（初回のみ）
npm run lavalink          # lavalink/Lavalink.jar を起動（.env の値を読み込む）
```

`lavalink:setup` は `lavalink/application.yml.example` を `lavalink/application.yml` にコピーします。youtube-plugin / lavasrc-plugin はLavalink自身が初回起動時に自動ダウンロードします（要インターネット接続）。設定を変更したい場合は `lavalink/application.yml` を直接編集してください（gitignore対象）。

#### YouTube再生でエラーになる場合 (bot検知/OAuth)

YouTubeは第三者からの自動再生アクセスへの検知を年々強化しており、`youtube-plugin`だけでは "No supported audio streams available" 等のエラーで再生できないことがあります（[既知の未解決issue](https://github.com/lavalink-devs/youtube-source/issues/240)）。この場合、`lavalink/application.yml` の `plugins.youtube.oauth.enabled: true` でOAuth認証を使うと改善することがあります:

1. `npm run lavalink` で起動すると、ターミナルにYouTubeのdevice code認証URLが表示される
2. **メインアカウントではなく必ずバーナー用Googleアカウント**でそのURLにアクセスして認証する（アカウント制限/BANのリスクがあるため）
3. 認証成功後、ターミナルに出力される `refreshToken` を `lavalink/application.yml` の `plugins.youtube.oauth.refreshToken` に貼り付け、`skipInitialization: true` を有効化すると次回以降は認証フローをスキップできる

なお、`youtube-source`が公式に案内している`poToken`取得ツール（`youtube-trusted-session-generator`）は**開発元により非推奨化**されており動作しない可能性が高いため、本Botでは採用していません。

#### Spotify対応について

Spotifyの曲名解決にはLavaSrcプラグインを使いますが、Spotify Web APIの利用資格情報（Client ID/Secret）取得が必要です。取得コスト・利用条件が変わりつつあるため、本Botはデフォルトでは**Spotify API資格情報なしで動作**します:

* `SPOTIFY_SOURCE_ENABLED=false`（デフォルト）: SpotifyのトラックURLはSpotifyの公開oEmbed（認証不要）から曲名のみ取得し、YouTube検索にフォールバックして再生します。アーティスト名までは取得できないため、同名異曲がヒットする可能性があります。プレイリスト/アルバムURLはoEmbedでは曲一覧を取得できないため非対応です。
* `SPOTIFY_SOURCE_ENABLED=true` + `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET`: LavaSrcプラグインがSpotifyのURLを直接解決します。プレイリストも `lavalink/application.yml` の `lavasrc.spotify.playlistLoadLimit`（デフォルト6ページ=最大600曲）まで読み込めます。この場合は `lavalink/application.yml` の `plugins.lavasrc.sources.spotify` 相当も有効化されるよう、環境変数を反映した上でLavalinkを再起動してください。

`config.json` に設定する値:

* `welcome.enabled`: ようこそメッセージのON/OFF
* `welcome.channelId`: ようこそメッセージ送信先チャンネルID
* `welcome.message`: ようこそメッセージ本文
* `logs.member.channelId`: 鯖参加/脱退ログ
* `logs.message.channelId`: メッセージ削除/編集ログ
* `logs.channel.channelId`: チャンネル/カテゴリ作成/削除/編集ログ
* `logs.role.channelId`: ロール作成/削除/編集/付与ログ
* `logs.voice.channelId`: VC参加/移動/退出、mute/unmute、deafen/undeafen、カメラ、画面共有ログ
* `logs.moderation.channelId`: BAN/KICK/TIMEOUTなど処罰関連ログ
* `logs.invite.channelId`: 招待リンク作成/削除ログ
* `logs.event.channelId`: イベント作成/編集/削除ログ
* `moderation.punishments`: Strike数ごとの自動処罰
* `moderation.strikeRoles`: Strike数ごとの自動付与ロールID
* `antiRaid`: 短時間連投、大量メンション、招待リンク、大量チャンネル/ロール作成の検知設定
* `voiceSystem.createChannelId`: 自動VC生成トリガーVC
* `voiceSystem.categoryId`: 生成VCのカテゴリID。空ならトリガーVCと同じカテゴリ
* `ticket.categoryId`: チケット作成先カテゴリID
* `ticket.supportRoleIds`: チケット閲覧を許可する対応ロールID配列
* `suggestion.channelId`: 意見箱送信先チャンネルID
* `suggestion.anonymous`: 意見箱の匿名ON/OFF

`welcome.message` では `{user}`、`{user.mention}`、`{user.name}`、`{user.tag}`、`{guild.name}`、`{guild.memberCount}` が使えます。設定ファイルは変更時に自動再読み込みされます。

コマンドを追加/変更した後は再登録が必要です。

```bash
npm run register
```

`GUILD_ID` を設定してのサーバー限定登録と、未設定でのグローバル登録を切り替えると、Discord側に両方のスコープでコマンドが残り、コマンド候補が同じコマンドで二重に表示されることがあります。`npm run register` はサーバー限定登録時に自動でグローバル側をクリアしますが、逆方向（サーバー限定→グローバル）に切り替えた場合は以下で古いサーバー限定コマンドを手動でクリアしてください。

```bash
node src/register-commands.js --clear-guild=<古いGUILD_ID>
```

## Commands

* `/config show`
* `/rolepanel create`
* `/rolepanel add-option`
* `/rolepanel post`
* `/rolepanel delete`
* `/rolepanel list`
* `/strike add`
* `/strike remove`
* `/strike set`
* `/strike check`
* `/strike history`
* `/warn`
* `/timeout`
* `/kick`
* `/ban`
* `/vc name`
* `/vc limit`
* `/vc status`
* `/vc lock`
* `/vc unlock`
* `/vc hide`
* `/vc show`
* `/ticket panel`
* `/ticket close`
* `/suggestion panel`
* `/music play`
* `/music pause`
* `/music resume`
* `/music skip`
* `/music stop`
* `/music nowplaying`
* `/music queue`
* `/music volume`
* `/music loop`
* `/gacha pull`
* `/gacha balance`
* `/gacha exchange-to-stone`
* `/gacha exchange-to-coin`
* `/item list`
* `/item use`
* `/collection pull`
* `/collection list`
* `/work`
* `/keiba race`（サーバー共有のレースを開催。5分後に自動で発走し結果を開催チャンネルに投稿。消費なし）
* `/keiba bet`（開催中のレースに賭ける。同じサーバーの誰でも同じレースに参加可能）
* `/slot sit`（着席後はembedのボタンで操作: 「+1 BET」「MAX BET」でベット枚数を決めて「レバー」で回転、「ストップ」を3回押して結果確定。MAXベット未満はボーナス抽選なし）
* `/bj play`（ヒット/スタンドに加え、条件を満たせばダブルダウン・スプリット・サレンダーも選択可）
* `/ranking`

### カジノ系コマンドの`p.`プレフィックス

`/gacha`, `/keiba`, `/slot`, `/bj` はスラッシュコマンドに加えて、`p.`から始まるメッセージでも操作できます。ボタン操作(ヒット/スタンド、回す/やめる等)は通常通りメッセージ上のボタンを押してください。

* `p.gacha pull <1か10>` / `p.gacha balance` / `p.gacha exchange-to-stone` / `p.gacha exchange-to-coin <石の数>`
* `p.bal`（`/gacha balance` のショートカット）
* `p.keiba race` / `p.keiba bet <賭式> <馬番> <賭け金>`（例: `p.keiba bet TANSHO 3 100`）
* `p.slot`
* `p.bj <チップ単価> <賭けチップ数>`（例: `p.bj 10 5`）

全体設計は [docs/design.md](https://github.com/ibutya/melt-bot/blob/master/docs/design.md) を参照。