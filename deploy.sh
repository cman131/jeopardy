#!/usr/bin/env bash
set -euo pipefail

# Run from the project root after cloning:
#   chmod +x deploy.sh && ./deploy.sh [domain]
#
# Examples:
#   ./deploy.sh                          # catch-all on port 80
#   ./deploy.sh jeopardy.conorwright.net # serve only on that subdomain

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOMAIN="${1:-}"

echo "==> Installing system dependencies"
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs nginx

echo "==> Installing MongoDB 7"
if ! command -v mongod &>/dev/null; then
  curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc \
    | sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor
  echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] \
https://repo.mongodb.org/apt/ubuntu $(lsb_release -sc)/mongodb-org/7.0 multiverse" \
    | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
  sudo apt-get update
  sudo apt-get install -y mongodb-org
fi

echo "==> Installing PM2"
sudo npm install -g pm2

echo "==> Building client"
cd "$PROJECT_DIR/client"
npm install
npm run build

echo "==> Installing server dependencies"
cd "$PROJECT_DIR/server"
npm install --omit=dev

echo "==> Starting MongoDB"
sudo systemctl enable mongod
sudo systemctl start mongod

echo "==> Starting app with PM2"
cd "$PROJECT_DIR/server"
pm2 delete jeopardy-server 2>/dev/null || true
pm2 start src/index.js --name jeopardy-server -- env PORT=3001
pm2 save

echo "==> Configuring PM2 startup (auto-start on reboot)"
# Capture and run the startup command PM2 emits
PM2_STARTUP=$(pm2 startup | grep "sudo" | tail -1)
if [[ -n "$PM2_STARTUP" ]]; then
  eval "$PM2_STARTUP"
fi

echo "==> Configuring nginx"
if [[ -n "$DOMAIN" ]]; then
  SERVER_NAME="$DOMAIN www.$DOMAIN"
else
  SERVER_NAME="_"
fi

sudo tee /etc/nginx/sites-available/jeopardy > /dev/null <<NGINX
server {
    listen 80;
    server_name $SERVER_NAME;

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

sudo ln -sf /etc/nginx/sites-available/jeopardy /etc/nginx/sites-enabled/jeopardy
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl enable nginx
sudo systemctl reload nginx

echo "==> Configuring firewall"
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw --force enable

echo ""
if [[ -n "$DOMAIN" ]]; then
  echo "Deploy complete. App is running at http://$DOMAIN"
  echo "Note: point DNS A records for $DOMAIN and www.$DOMAIN to $(hostname -I | awk '{print $1}')"
  echo "To enable HTTPS: ./setup-ssl.sh $DOMAIN"
else
  echo "Deploy complete. App is running at http://$(hostname -I | awk '{print $1}')"
fi
