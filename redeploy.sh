#!/usr/bin/env bash
set -euo pipefail

# Run after pulling new changes:
#   ./redeploy.sh

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==> Pulling latest changes"
git -C "$PROJECT_DIR" pull

echo "==> Rebuilding client"
cd "$PROJECT_DIR/client"
npm install
npm run build

echo "==> Updating server dependencies"
cd "$PROJECT_DIR/server"
npm install --omit=dev

echo "==> Restarting server"
pm2 restart jeopardy-server

echo "Done."
