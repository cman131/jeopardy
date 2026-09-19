#!/usr/bin/env bash
set -euo pipefail

# Run after deploy.sh to enable HTTPS via Let's Encrypt.
# DNS for the domain must already point to this server.
#
# Usage: ./setup-ssl.sh <domain>
# Example: ./setup-ssl.sh jeopardy.conorwright.net

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <domain>"
  echo "Example: $0 jeopardy.conorwright.net"
  exit 1
fi

DOMAIN="$1"

echo "==> Installing certbot"
sudo apt-get install -y certbot python3-certbot-nginx

echo "==> Obtaining certificate for $DOMAIN and www.$DOMAIN"
sudo certbot --nginx -d "$DOMAIN" -d "www.$DOMAIN" --non-interactive --agree-tos --redirect \
  --email "admin@$(echo "$DOMAIN" | cut -d. -f2-)"

echo "==> Verifying auto-renewal timer"
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer
systemctl status certbot.timer --no-pager

echo ""
echo "HTTPS enabled. App is live at https://$DOMAIN (and https://www.$DOMAIN)"
echo "Certificates auto-renew via systemd — no action needed."
