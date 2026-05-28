#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Cleaning .next cache"
rm -rf .next

echo "==> Building (nix-shell)"
nix-shell --run "npm run build"

echo "==> Syncing to main-node"
rsync -av --delete .next/standalone/                        root@main-node:/srv/cinemafred/
rsync -av --delete .next/static/                            root@main-node:/srv/cinemafred/.next/static/
rsync -av --delete public/                                  root@main-node:/srv/cinemafred/public/
rsync -av --delete node_modules/prisma/                     root@main-node:/srv/cinemafred/node_modules/prisma/
rsync -av --delete node_modules/@prisma/                    root@main-node:/srv/cinemafred/node_modules/@prisma/

echo "==> Running migrations"
ssh root@main-node 'bash -s' << 'ENDSSH'
set -euo pipefail
export DATABASE_URL="postgresql://cinemafred:$(cat /run/secrets/postgres-cinemafred-password)@127.0.0.1/cinemafred"
cd /srv/cinemafred
node node_modules/prisma/build/index.js migrate deploy
ENDSSH

echo "==> Restarting cinemafred"
ssh fred@main-node sudo systemctl restart cinemafred

echo "==> Status"
ssh fred@main-node systemctl status cinemafred --no-pager -l | head -20

echo ""
echo "Done → https://cinemafred.com"
