#!/bin/bash
# Start a throwaway local Postgres 16 for dev/tests (port 5432, user postgres/postgres).
# Usage: scripts/db/local-pg.sh [start|stop|status]
set -e
PGBIN=${PGBIN:-/usr/lib/postgresql/16/bin}
DATA=${PGDATA_DIR:-/var/tmp/bluff-pgdata}
RUN_AS=""; [ "$(id -u)" = "0" ] && RUN_AS="runuser -u postgres --"
case "${1:-start}" in
  start)
    if [ ! -d "$DATA" ]; then
      mkdir -p "$DATA"; [ -n "$RUN_AS" ] && chown postgres "$DATA"
      $RUN_AS $PGBIN/initdb -D "$DATA" -U postgres --auth=trust >/dev/null
    fi
    $RUN_AS $PGBIN/pg_ctl -D "$DATA" -l "$DATA/log" -o "-p 5432 -k /tmp" -w start >/dev/null || true
    until psql -h localhost -U postgres -tc "select 1" >/dev/null 2>&1; do sleep 0.3; done
    psql -h localhost -U postgres -tc "select 1 from pg_database where datname='bluff'" | grep -q 1 || psql -h localhost -U postgres -qc "create database bluff"
    echo "postgres ready: postgres://postgres:postgres@localhost:5432/bluff" ;;
  stop) $RUN_AS $PGBIN/pg_ctl -D "$DATA" -m fast stop ;;
  status) $RUN_AS $PGBIN/pg_ctl -D "$DATA" status ;;
esac
