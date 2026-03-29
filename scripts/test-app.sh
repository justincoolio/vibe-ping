#!/bin/sh

set -eu

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

cd "$ROOT_DIR"

echo "[test-app] starting watcher..."
pnpm --filter @vibeping/watcher start
