#!/usr/bin/env bash
# Deploys the current main branch from GitHub to the shared Docker host.
set -euo pipefail

HOST="${DEPLOY_HOST:-ubuntu@46.224.167.199}"
REPO="https://github.com/sensedrive/planr.git"

ssh "$HOST" bash -s <<EOF
set -euo pipefail
if [ -d /opt/planr/app/.git ]; then
  git -C /opt/planr/app fetch --quiet origin main
  git -C /opt/planr/app reset --quiet --hard origin/main
else
  sudo mkdir -p /opt/planr && sudo chown "\$USER" /opt/planr
  git clone --quiet "$REPO" /opt/planr/app
fi
cd /opt/planr/app
docker compose -f deploy/compose.yml up -d --build
cp deploy/planr.caddy /opt/beeryouup/caddy-sites/planr.caddy
docker exec beeryouup-caddy-1 caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null
docker exec beeryouup-caddy-1 caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
echo "deployed \$(git rev-parse --short HEAD)"
EOF

echo "→ https://planr.46-224-167-199.nip.io"
