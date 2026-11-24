#!/usr/bin/env bash
# Backup the ARTEX database (and optionally the data directory) with rotation.
#
# Usage:
#   scripts/backup.sh [--with-data] [--keep N] [--output-dir DIR]
#
#   --with-data    also archive the bind-mounted data/ directory (worker
#                  artifacts, evidence, skills state) as a tar.gz
#   --keep N       number of db dumps to keep (default 14; data archives rotate
#                  to the same count)
#   --output-dir   where to write (default backups/, relative to the repo root)
#
# The database dump runs inside the postgres compose service, so no psql client
# is needed on the host. Restore:
#   gunzip -c backups/artex-db-<ts>.sql.gz | docker compose exec -T postgres \
#     psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
set -euo pipefail
cd "$(dirname "$0")/.."

usage() { sed -n '2,15p' "$0" | sed 's/^# \?//'; }

KEEP=14
OUTPUT_DIR="backups"
WITH_DATA=0
while [ $# -gt 0 ]; do
  case "$1" in
    --keep) KEEP="${2:?}"; shift 2 ;;
    --output-dir) OUTPUT_DIR="${2:?}"; shift 2 ;;
    --with-data) WITH_DATA=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done
# 0* rejects 0, which would make prune delete the dump this run just wrote, and
# leading zeros, which $((KEEP + 1)) would read as octal.
case "$KEEP" in (*[!0-9]*|''|0*) echo "--keep must be a positive integer" >&2; exit 2 ;; esac

# Compose reads .env for credentials; source it for the dump command too.
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi
PGUSER_NAME="${POSTGRES_USER:-artex}"
PGDATABASE_NAME="${POSTGRES_DB:-artex}"

mkdir -p "$OUTPUT_DIR"
TS=$(date -u +%Y%m%dT%H%M%SZ)
DB_OUT="$OUTPUT_DIR/artex-db-$TS.sql.gz"
if [ -e "$DB_OUT" ]; then
  echo "refusing to overwrite $DB_OUT" >&2
  exit 1
fi

if ! docker compose exec -T postgres pg_dump -U "$PGUSER_NAME" "$PGDATABASE_NAME" | gzip > "$DB_OUT"; then
  rm -f "$DB_OUT"
  echo "pg_dump failed (is the stack running?)" >&2
  exit 1
fi
gzip -t "$DB_OUT"
echo "wrote $DB_OUT ($(du -h "$DB_OUT" | cut -f1))"

if [ "$WITH_DATA" -eq 1 ]; then
  DATA_OUT="$OUTPUT_DIR/artex-data-$TS.tar.gz"
  # data/ contains files written by the container (root); unreadable ones make
  # tar exit 2. Fail loudly rather than ship a partial archive.
  if ! tar -czf "$DATA_OUT" data 2>"$OUTPUT_DIR/.tar.err"; then
    rm -f "$DATA_OUT"
    echo "data archive failed (run as root so container-written files are readable):" >&2
    head -5 "$OUTPUT_DIR/.tar.err" >&2
    rm -f "$OUTPUT_DIR/.tar.err"
    exit 1
  fi
  rm -f "$OUTPUT_DIR/.tar.err"
  echo "wrote $DATA_OUT ($(du -h "$DATA_OUT" | cut -f1))"
fi

prune() {
  ls -1t "$OUTPUT_DIR"/$1 2>/dev/null | tail -n +$((KEEP + 1)) | while IFS= read -r old; do
    echo "pruning $old"
    rm -f "$old"
  done
}
prune 'artex-db-*.sql.gz'
[ "$WITH_DATA" -eq 1 ] && prune 'artex-data-*.tar.gz'
echo "backup complete ($KEEP newest kept)"
