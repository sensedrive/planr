#!/usr/bin/env bash
# Manual deploy from your machine: installs/updates the host-side deploy script, then runs it.
# CI does the same on every push to main (see .github/workflows/ci.yml).
set -euo pipefail

HOST="${DEPLOY_HOST:-ubuntu@46.224.167.199}"
DIR="$(cd "$(dirname "$0")" && pwd)"

ssh "$HOST" 'sudo mkdir -p /opt/planr && sudo chown "$USER" /opt/planr'
scp -q "$DIR/remote-deploy.sh" "$HOST:/opt/planr/deploy.sh"
ssh "$HOST" 'chmod 755 /opt/planr/deploy.sh && /opt/planr/deploy.sh'

echo "→ https://planr.46-224-167-199.nip.io"
