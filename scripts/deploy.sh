#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Cleaning .next cache"
rm -rf .next

echo "==> Building (nix-shell)"
nix-shell --run "npm run build"

echo "==> Syncing to main-node"
rsync -av --delete .next/standalone/ root@main-node:/srv/cinemafred/
rsync -av --delete .next/static/     root@main-node:/srv/cinemafred/.next/static/
rsync -av --delete public/           root@main-node:/srv/cinemafred/public/

echo "==> Restarting cinemafred"
ssh fred@main-node sudo systemctl restart cinemafred

echo "==> Status"
ssh fred@main-node systemctl status cinemafred --no-pager -l | head -20

echo ""
echo "Done → https://cinemafred.com"
