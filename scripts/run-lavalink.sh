#!/usr/bin/env bash
# .env の値を環境変数として渡しつつ Lavalink サーバーを起動する（Docker不使用）。
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LAVALINK_DIR="${ROOT_DIR}/lavalink"

if [ ! -f "${LAVALINK_DIR}/Lavalink.jar" ]; then
  echo "lavalink/Lavalink.jar が見つかりません。先に 'npm run lavalink:setup' を実行してください。" >&2
  exit 1
fi

if [ ! -f "${LAVALINK_DIR}/application.yml" ]; then
  echo "lavalink/application.yml が見つかりません。先に 'npm run lavalink:setup' を実行してください。" >&2
  exit 1
fi

if [ -f "${ROOT_DIR}/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "${ROOT_DIR}/.env"
  set +a
fi

cd "${LAVALINK_DIR}"
exec java -jar Lavalink.jar
