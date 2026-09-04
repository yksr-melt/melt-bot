# issues & Tasks

## bugs
- [x] 音楽再生コマンドでspotifyのプレイリストを再生しようとすると最初の100曲までしかロードできない (Lavalink移行, LavaSrcの`playlistLoadLimit`で解消。Spotify API資格情報を設定した場合のみ)
- [x] 音楽再生が終了しても自動でvcから切断されない。 (Lavalink移行, `LAVALINK_IDLE_DISCONNECT_MS`で自動切断)
- [x] 音楽再生コマンドでspotifyの曲を流す時にsoundcloudから持ってくる関係上、ユーザーが求めていたものが流れてこないことがある (Lavalink移行。LavaSrc未設定時はSpotify oEmbedの曲名でYouTube検索にフォールバック、設定時はLavaSrcが直接解決)
- [ ] ロール関連のログが変更していないのに謎のタイミングで出ることがある
- [ ] `/vc lock` で@everyoneだけでなく作成者のconnect権限まで拒否されるバグの修正（show/hideも同様に権限設定を要見直し）
- [x] 音楽再生コマンドでループがまともに機能しない？ (Lavalink移行, `player.setRepeatMode("off"|"track"|"queue")`で解消)
- [x] サーバーID指定パターンとグローバル登録時にコマンド候補が同じコマンドが二つ出てしまう (`register-commands.js`が反対側のスコープを自動クリアするように修正)

## features
- [ ] 音楽再生コマンドにshuffleを追加
- [ ] `vc allow-user`及び`vc deny-user`を追加し、作成したvcに参加できるユーザーを制限する
