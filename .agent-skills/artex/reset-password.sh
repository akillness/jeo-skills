#!/usr/bin/env bash
# =============================================================================
# ARTEX admin password reset script
#
# The login username is fixed as ARTEX; the password is stored as a bcrypt hash in
# the auth.password_hash key of the settings table. The same transaction increments
# auth.password_version. This script uses pgcrypto to generate the bcrypt hash
# in-database, compatible with the backend (x/crypto/bcrypt). The running process
# reads that version only at startup, so ARTEX must be restarted after a reset.
#
# Two deployments:
#   local (default) — host connects to the database directly with psql. Connection
#                    info priority: args > --dsn/$ARTEX_PG_DSN > config.json database.*
#   docker          — runs psql inside the postgres container via `docker compose
#                    exec` (or `docker exec`) (compose does not expose 5432 by default).
#
# Usage examples:
#   ./reset-password.sh                          # local, auto-reads config.json/env, prompts for the new password
#   ./reset-password.sh -p 'New-Passphrase!'     # local, new password given directly (at least 12 characters)
#   ./reset-password.sh --dsn postgres://u:p@h:5432/artex
#   ./reset-password.sh -H 127.0.0.1 -P 5433 -U autopentest -W pass -d artex
#   ./reset-password.sh -m docker                # docker deployment (reads POSTGRES_* from .env)
#   ./reset-password.sh -m docker -c pg-container-name --exec docker
#
# Security: new password via env var + psql \getenv (never in argv), auto-escaped
# with :'var' (anti-SQL-injection); DB password via PGPASSWORD, also not in argv.
# =============================================================================
set -euo pipefail

PASS_KEY="auth.password_hash"
VERSION_KEY="auth.password_version"
BCRYPT_COST=10

MODE=""            # local | docker (empty = auto-detect)
DSN=""
HOST="" PORT="" USER="" DBPASS="" DBNAME="" SSLMODE=""
CONFIG=""
CONTAINER=""       # postgres service/container name in docker mode (default postgres)
EXEC_KIND=""       # compose | docker (which exec to use in docker mode; empty = auto)
NEWPASS=""
ASSUME_YES=0

die() { echo "error: $*" >&2; exit 1; }
info() { echo "· $*" >&2; }

usage() { sed -n '2,40p' "$0" | sed 's/^# \{0,1\}//'; exit 0; }

# ---- Argument parsing -------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    -m|--mode)        MODE="${2:-}"; shift 2 ;;
    --dsn)            DSN="${2:-}"; shift 2 ;;
    -H|--host)        HOST="${2:-}"; shift 2 ;;
    -P|--port)        PORT="${2:-}"; shift 2 ;;
    -U|--user)        USER="${2:-}"; shift 2 ;;
    -W|--db-password) DBPASS="${2:-}"; shift 2 ;;
    -d|--dbname)      DBNAME="${2:-}"; shift 2 ;;
    --sslmode)        SSLMODE="${2:-}"; shift 2 ;;
    --config)         CONFIG="${2:-}"; shift 2 ;;
    -c|--container)   CONTAINER="${2:-}"; shift 2 ;;
    --exec)           EXEC_KIND="${2:-}"; shift 2 ;;
    -p|--new-password) NEWPASS="${2:-}"; shift 2 ;;
    -y|--yes)         ASSUME_YES=1; shift ;;
    -h|--help)        usage ;;
    *) die "unknown argument: $1 (see -h for usage)" ;;
  esac
done

# ---- Read database.* from config.json (local mode only, and only when no explicit connection is given) -----
# Prefer python3 for parsing (robust); fall back to grep when python3 is missing (config.json is a flat per-key file).
read_config_json() {
  local path="$1"
  [[ -f "$path" ]] || return 1
  if command -v python3 >/dev/null 2>&1; then
    python3 - "$path" <<'PY'
import json, sys
try:
    d = json.load(open(sys.argv[1])).get("database", {})
except Exception:
    sys.exit(1)
# Supports a direct dsn, or individual fields
if d.get("dsn"):
    print("DSN\t" + d["dsn"]); sys.exit(0)
for k in ("host","port","user","password","dbname","sslmode"):
    if d.get(k) is not None:
        print(k.upper() + "\t" + str(d[k]))
PY
  else
    # Minimal fallback: grep key by key (values are strings or numbers)
    local k
    for k in host port user password dbname sslmode; do
      local v
      v=$(grep -oE "\"$k\"[[:space:]]*:[[:space:]]*(\"[^\"]*\"|[0-9]+)" "$path" 2>/dev/null \
            | head -1 | sed -E "s/.*:[[:space:]]*//; s/^\"//; s/\"$//") || true
      [[ -n "$v" ]] && echo -e "${k^^}\t$v"
    done
  fi
}

apply_config_fields() {
  local key val
  while IFS=$'\t' read -r key val; do
    [[ -z "$key" ]] && continue
    case "$key" in
      DSN)      [[ -z "$DSN" ]] && DSN="$val" ;;
      HOST)     [[ -z "$HOST" ]] && HOST="$val" ;;
      PORT)     [[ -z "$PORT" ]] && PORT="$val" ;;
      USER)     [[ -z "$USER" ]] && USER="$val" ;;
      PASSWORD) [[ -z "$DBPASS" ]] && DBPASS="$val" ;;
      DBNAME)   [[ -z "$DBNAME" ]] && DBNAME="$val" ;;
      SSLMODE)  [[ -z "$SSLMODE" ]] && SSLMODE="$val" ;;
    esac
  done
}

# ---- Auto-detect mode ---------------------------------------------------------
if [[ -z "$MODE" ]]; then
  if [[ -n "$DSN$HOST$USER$DBNAME" || -n "${ARTEX_PG_DSN:-}" || -f "${CONFIG:-config.json}" ]]; then
    MODE="local"
  elif command -v docker >/dev/null 2>&1 && [[ -f docker-compose.yml ]]; then
    MODE="docker"
  else
    MODE="local"
  fi
fi
info "deployment mode: $MODE"

# ---- Collect the new password -------------------------------------------------
if [[ -z "$NEWPASS" ]]; then
  read -r -s -p "Enter new password (username is fixed as ARTEX): " NEWPASS; echo >&2
  [[ -n "$NEWPASS" ]] || die "password cannot be empty"
  read -r -s -p "Enter again to confirm: " NEWPASS2; echo >&2
  [[ "$NEWPASS" == "$NEWPASS2" ]] || die "the two entries do not match"
fi
[[ -n "$NEWPASS" ]] || die "password cannot be empty"
# Same minimum as the server (minPasswordRunes in server/auth.go), counted in
# characters like the server: UTF-8 bytes minus continuation bytes, whatever the locale.
NEWPASS_CHARS=$(printf '%s' "$NEWPASS" | LC_ALL=C tr -d '\200-\277' | wc -c)
(( NEWPASS_CHARS >= 12 )) || die "password must be at least 12 characters"

# Hand the password to psql via environment variable (read with \getenv, never in argv/ps)
export ARTEX_RESET_NEWPASS="$NEWPASS"

# Generate bcrypt in-database and upsert the hash and the password version in one
# transaction. The password is auto-escaped with :'newpw'. CREATE EXTENSION is
# idempotent; if the database role lacks permission to create extensions it errors
# here (see the hint in the run failure branch below).
SQL=$(cat <<SQL
\\set ON_ERROR_STOP on
\\getenv newpw ARTEX_RESET_NEWPASS
CREATE EXTENSION IF NOT EXISTS pgcrypto;
BEGIN;
INSERT INTO settings(key, value)
VALUES ('$PASS_KEY', crypt(:'newpw', gen_salt('bf', $BCRYPT_COST)))
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
INSERT INTO settings(key, value)
VALUES ('$VERSION_KEY', '1')
ON CONFLICT (key) DO UPDATE
SET value = (settings.value::bigint + 1)::text, updated_at = now();
COMMIT;
SQL
)

# ---- Execute ------------------------------------------------------------------
if [[ "$MODE" == "local" ]]; then
  # Connection info priority: command line > --dsn/$ARTEX_PG_DSN > config.json
  if [[ -z "$DSN" && -z "$HOST$USER$DBNAME" ]]; then
    [[ -n "${ARTEX_PG_DSN:-}" ]] && DSN="$ARTEX_PG_DSN"
  fi
  if [[ -z "$DSN" && -z "$HOST$USER$DBNAME" ]]; then
    cfg="${CONFIG:-config.json}"
    if [[ -f "$cfg" ]]; then
      info "reading database config from $cfg"
      apply_config_fields < <(read_config_json "$cfg")
    fi
  fi

  command -v psql >/dev/null 2>&1 || die "psql not found on this machine (install postgresql-client, or use -m docker instead)"

  declare -a PSQL_ARGS=()
  if [[ -n "$DSN" ]]; then
    PSQL_ARGS=("$DSN")
    target="$DSN"
  else
    [[ -n "$USER"   ]] || die "missing database user (-U) or a valid config.json/DSN"
    [[ -n "$DBNAME" ]] || die "missing database name (-d) or a valid config.json/DSN"
    HOST="${HOST:-127.0.0.1}"; PORT="${PORT:-5432}"; SSLMODE="${SSLMODE:-disable}"
    PSQL_ARGS=(-h "$HOST" -p "$PORT" -U "$USER" -d "$DBNAME")
    [[ -n "$SSLMODE" ]] && export PGSSLMODE="$SSLMODE"
    [[ -n "$DBPASS" ]] && export PGPASSWORD="$DBPASS"
    target="$USER@$HOST:$PORT/$DBNAME"
  fi

  info "target database: $target"
  if [[ "$ASSUME_YES" -ne 1 ]]; then
    read -r -p "Reset the ARTEX password in this database? [y/N] " ans
    [[ "$ans" == "y" || "$ans" == "Y" ]] || die "cancelled"
  fi

  if ! printf '%s\n' "$SQL" | psql "${PSQL_ARGS[@]}" -v ON_ERROR_STOP=1 -q >/dev/null; then
    die "write failed. If it reports a pgcrypto permission/missing error, use a role allowed to create extensions, or run CREATE EXTENSION pgcrypto manually first."
  fi

else
  # ---- docker ----
  command -v docker >/dev/null 2>&1 || die "docker not found"
  CONTAINER="${CONTAINER:-postgres}"

  # Choose the exec method: prefer docker compose exec (service name), otherwise docker exec (container name)
  if [[ -z "$EXEC_KIND" ]]; then
    if docker compose version >/dev/null 2>&1 && [[ -f docker-compose.yml ]]; then
      EXEC_KIND="compose"
    else
      EXEC_KIND="docker"
    fi
  fi

  # psql credentials inside the container: command line first, then POSTGRES_* from .env, then compose defaults (artex)
  if [[ -f .env ]]; then
    # shellcheck disable=SC1091
    set -a; . ./.env; set +a
  fi
  DUSER="${USER:-${POSTGRES_USER:-artex}}"
  DNAME="${DBNAME:-${POSTGRES_DB:-artex}}"
  [[ -n "$DBPASS" ]] && export PGPASSWORD="$DBPASS"
  [[ -z "${PGPASSWORD:-}" && -n "${POSTGRES_PASSWORD:-}" ]] && export PGPASSWORD="$POSTGRES_PASSWORD"

  info "target: psql -U $DUSER -d $DNAME inside container $CONTAINER (exec=$EXEC_KIND)"
  if [[ "$ASSUME_YES" -ne 1 ]]; then
    read -r -p "Reset the ARTEX password in this container database? [y/N] " ans
    [[ "$ans" == "y" || "$ans" == "Y" ]] || die "cancelled"
  fi

  # -e with a name only (no value) → inherited from the current environment, so the password never appears in the docker command argv.
  declare -a EXEC_CMD
  if [[ "$EXEC_KIND" == "compose" ]]; then
    EXEC_CMD=(docker compose exec -T -e ARTEX_RESET_NEWPASS -e PGPASSWORD "$CONTAINER"
              psql -U "$DUSER" -d "$DNAME" -v ON_ERROR_STOP=1 -q)
  else
    EXEC_CMD=(docker exec -i -e ARTEX_RESET_NEWPASS -e PGPASSWORD "$CONTAINER"
              psql -U "$DUSER" -d "$DNAME" -v ON_ERROR_STOP=1 -q)
  fi

  if ! printf '%s\n' "$SQL" | "${EXEC_CMD[@]}" >/dev/null; then
    die "write failed. Check the container name (-c), the database account (POSTGRES_* in .env), and that the role has pgcrypto permission."
  fi
fi

unset ARTEX_RESET_NEWPASS
echo "✓ ARTEX admin password has been reset. Restart ARTEX, then log in with username ARTEX and the new password. Sessions from before the restart stop working."
