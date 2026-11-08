#!/usr/bin/env bash
# One-shot deploy on the Vultr VPS (run from the repo root, after filling in .env). Safe to re-run.
#   bash scripts/deploy/up.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
[ -f .env ] || { echo "missing .env (cp .env.example .env and fill it in)"; exit 1; }
grep -q '^POSTGRES_PASSWORD=..*' .env || { echo "set POSTGRES_PASSWORD in .env"; exit 1; }
grep -q '^BASE_DOMAIN=localhost' .env && { echo "set BASE_DOMAIN to your domain in .env"; exit 1; }

docker compose build
docker compose up -d db                                                     # self-hosted TimescaleDB
docker compose --profile tools run --rm tools npm run db:migrate            # hypertable + continuous aggregate
docker compose --profile tools run --rm tools npm run db:seed               # demo user, registry, game cards (idempotent)
docker compose --profile tools run --rm tools npm run nessie:seed           # no-op if the Nessie account already has purchases
docker compose up -d web caddy
docker compose --profile ops up -d backup                                   # nightly pg_dump → ./backups

echo "--- TimescaleDB check"
docker compose exec -T db psql -U bluff -d bluff -tAc "select 'agg_mode=' || value from bluff_meta where key='agg_mode'"
docker compose exec -T db psql -U bluff -d bluff -tAc "select 'hypertables=' || count(*) from timescaledb_information.hypertables"
docker compose exec -T db psql -U bluff -d bluff -tAc "select 'continuous_aggregates=' || count(*) from timescaledb_information.continuous_aggregates"
echo "--- health"
sleep 5
docker compose exec -T web node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>r.text()).then(console.log)"
