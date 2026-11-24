#!/usr/bin/env bash
# Applies the [hardening] intercept rules and skill visibility (idempotent),
# then restarts the artex service so the interceptor reloads its rule cache.
#
# This script does NOT source .env. Sourcing it (`set -a; . ./.env`) runs any
# value containing $(...) as a command and expands $VARs, which can execute code
# or leak a secret in an error. POSTGRES_USER / POSTGRES_DB are read from the
# postgres container's own environment instead, with no host-side evaluation.
set -euo pipefail
cd "$(dirname "$0")/.."

# psql runs inside the container; $POSTGRES_USER/$POSTGRES_DB are the container's
# env (set by compose), expanded by the container shell, never by this host shell.
docker compose exec -T postgres sh -c \
  'exec psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  < hardening/intercept-rules.sql

docker compose restart artex

docker compose exec -T postgres sh -c 'exec psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
SELECT id, name, action, priority, timeout_seconds, timeout_action
FROM intercept_rules WHERE name LIKE '[hardening]%' ORDER BY priority DESC;
SQL
