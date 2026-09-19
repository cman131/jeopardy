#!/usr/bin/env bash
set -euo pipefail

# Run after deploy.sh to enable HTTPS via Let's Encrypt.
# DNS for the domain AND www.domain must already point to this server.
#
# Usage: ./setup-ssl.sh <domain>
# Example: ./setup-ssl.sh jeopardy.conorwright.net

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <domain>"
  echo "Example: $0 jeopardy.conorwright.net"
  exit 1
fi

DOMAIN="$1"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EMAIL="admin@$(echo "$DOMAIN" | cut -d. -f2-)"

echo "==> Installing certbot"
sudo apt-get install -y certbot

echo "==> Stopping nginx temporarily for ACME challenge"
sudo systemctl stop nginx

echo "==> Obtaining certificate for $DOMAIN and www.$DOMAIN"
sudo certbot certonly --standalone \
  -d "$DOMAIN" -d "www.$DOMAIN" \
  --non-interactive --agree-tos --expand \
  --email "$EMAIL"

echo "==> Writing nginx HTTPS config"
sudo tee /etc/nginx/sites-available/jeopardy > /dev/null <<NGINX
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl;
    server_name $DOMAIN www.$DOMAIN;

    ssl_certificate     /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers off;
    ssl_session_cache   shared:SSL:10m;
    ssl_session_timeout 10m;

    root $PROJECT_DIR/client/dist;
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }

    location /socket.io/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }
}
NGINX

sudo nginx -t

echo "==> Starting nginx"
sudo systemctl start nginx

echo "==> Setting up deploy hook so nginx reloads after auto-renewal"
sudo tee /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh > /dev/null <<'HOOK'
#!/bin/bash
systemctl reload nginx
HOOK
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh

echo "==> Enabling auto-renewal timer"
sudo systemctl enable --now certbot.timer
systemctl status certbot.timer --no-pager

echo ""
echo "HTTPS enabled. App is live at https://$DOMAIN (and https://www.$DOMAIN)"
echo "Certificate auto-renews via systemd — no action needed."
