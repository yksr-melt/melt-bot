#!/usr/bin/env bash
# Lavalink サーバー本体とプラグインをダウンロードする（Docker不使用、要 Java 17+）。
set -euo pipefail

LAVALINK_VERSION="4.2.2"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LAVALINK_DIR="${ROOT_DIR}/lavalink"

mkdir -p "${LAVALINK_DIR}/plugins"

if ! command -v java >/dev/null 2>&1; then
  echo "Java が見つかりません。Java 17 以上をインストールしてください (例: brew install openjdk@21)。" >&2
  exit 1
fi

echo "Lavalink.jar (v${LAVALINK_VERSION}) をダウンロードしています..."
curl -fL -o "${LAVALINK_DIR}/Lavalink.jar" \
  "https://github.com/lavalink-devs/Lavalink/releases/download/${LAVALINK_VERSION}/Lavalink.jar"

if [ ! -f "${LAVALINK_DIR}/application.yml" ]; then
  cp "${LAVALINK_DIR}/application.yml.example" "${LAVALINK_DIR}/application.yml"
  echo "application.yml を作成しました。"
fi

echo "完了しました。'npm run lavalink' で起動できます。"
echo "(youtube-plugin / lavasrc-plugin は application.yml の lavalink.plugins 設定に従い、初回起動時に自動ダウンロードされます)"
