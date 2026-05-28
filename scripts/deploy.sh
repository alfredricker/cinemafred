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

echo "==> Running migrations"
ssh root@main-node 'bash -s' << 'ENDSSH'
set -euo pipefail
DBPASS=$(cat /run/secrets/postgres-cinemafred-password)
DB="postgresql://cinemafred:${DBPASS}@127.0.0.1/cinemafred"

for dir in /srv/cinemafred/prisma/migrations/*/; do
  name=$(basename "$dir")
  sql="${dir}migration.sql"
  [ -f "$sql" ] || continue
  applied=$(psql "$DB" -tAc "SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name='${name}' AND finished_at IS NOT NULL" 2>/dev/null || echo 0)
  if [ "$(echo "$applied" | xargs)" = "0" ]; then
    echo "  Applying: $name"
    psql "$DB" -f "$sql"
    psql "$DB" -c "INSERT INTO _prisma_migrations (id, checksum, migration_name, started_at, finished_at, applied_steps_count) VALUES (gen_random_uuid()::text, 'psql', '${name}', NOW(), NOW(), 1)"
  fi
done
ENDSSH

echo "==> Restarting cinemafred"
ssh fred@main-node sudo systemctl restart cinemafred

echo "==> Status"
ssh fred@main-node systemctl status cinemafred --no-pager -l | head -20

echo ""
echo "Done → https://cinemafred.com"
