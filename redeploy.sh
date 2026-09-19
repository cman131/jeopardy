#!/usr/bin/env bash
set -euo pipefail

# Run after pulling new changes:
#   ./redeploy.sh [domain]
#
# Pass the domain to also update nginx and the SSL certificate (e.g. to
# pick up www-subdomain support on an existing deployment):
#   ./redeploy.sh jeopardy.conorwright.net

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOMAIN="${1:-}"

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

if [[ -n "$DOMAIN" ]]; then
  echo "==> Re-running SSL setup to add www.$DOMAIN"
  "$PROJECT_DIR/setup-ssl.sh" "$DOMAIN"
fi

echo "Done."
