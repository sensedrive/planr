#!/usr/bin/env bash
# Runs ON the Docker host. Installed once as /opt/planr/deploy.sh (outside the repo) and used as
# the forced command of the CI deploy key, so that key can do nothing but this.
set -euo pipefail

REPO="https://github.com/sensedrive/planr.git"
APP=/opt/planr/app

if [ -d "$APP/.git" ]; then
  git -C "$APP" fetch --quiet origin main
  git -C "$APP" reset --quiet --hard origin/main
else
  git clone --quiet "$REPO" "$APP"
fi
cd "$APP"
docker compose -f deploy/compose.yml up -d --build
cp deploy/planr.caddy /opt/beeryouup/caddy-sites/planr.caddy
docker exec beeryouup-caddy-1 caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null
docker exec beeryouup-caddy-1 caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
docker image prune -f >/dev/null
echo "deployed $(git rev-parse --short HEAD)"
