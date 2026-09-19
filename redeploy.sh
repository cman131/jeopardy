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
  echo "==> Updating nginx server_name to include www.$DOMAIN"
  sudo sed -i "s/server_name $DOMAIN;/server_name $DOMAIN www.$DOMAIN;/" \
    /etc/nginx/sites-available/jeopardy
  sudo nginx -t
  sudo systemctl reload nginx

  echo "==> Expanding SSL certificate to include www.$DOMAIN"
  sudo certbot --nginx -d "$DOMAIN" -d "www.$DOMAIN" --non-interactive --agree-tos --redirect \
    --email "admin@$(echo "$DOMAIN" | cut -d. -f2-)"
fi

echo "Done."
