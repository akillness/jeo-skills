#!/usr/bin/env bash
# Open Executive skill helper. Read-only by design.
# It never clones, installs, starts a service, loads or resets fixtures,
# sends a message, calls a paid provider, or writes to a repository.
#
# Usage:
#   openexecutive.sh doctor [repo_path]   # host + checkout readiness report
#   openexecutive.sh safety               # operation risk tiers, runs nothing
#   openexecutive.sh upstream             # commit-pinned source URLs

set -euo pipefail

PIN="3a48f77a35e6980335553b9bdd02724e00f6f239"
BASE="https://github.com/SenteLabsAI/OpenExecutive"

usage() {
  sed -n '2,10p' "$0" >&2
  exit 1
}

have() {
  command -v "$1" >/dev/null 2>&1
}

report_optional() {
  local label="$1"
  local note="$2"
  shift 2
  local candidate found=""
  for candidate in "$@"; do
    if have "$candidate"; then
      found="$(command -v "$candidate")"
      break
    fi
  done
  if [[ -n "$found" ]]; then
    printf '  ok    %-14s %s\n' "$label" "$found"
  else
    printf '  info  %-14s missing (%s)\n' "$label" "$note"
  fi
}

check_python() {
  local version ok
  if ! have python3; then
    echo "  ERROR python3        missing (requires 3.11+)"
    return
  fi
  version="$(python3 -c 'import platform; print(platform.python_version())' 2>/dev/null || echo unknown)"
  ok="$(python3 -c 'import sys; print(int(sys.version_info >= (3, 11)))' 2>/dev/null || echo 0)"
  if [[ "$ok" == "1" ]]; then
    printf '  ok    %-14s %s\n' python3 "$version"
  else
    printf '  ERROR %-14s %s (requires 3.11+)\n' python3 "$version"
  fi
}

check_node() {
  local version ok
  if ! have node; then
    echo "  ERROR node           missing (requires 22+ for the UI)"
    return
  fi
  version="$(node --version 2>/dev/null || echo unknown)"
  ok="$(node -e 'process.stdout.write(String(Number(process.versions.node.split(".")[0]) >= 22))' 2>/dev/null || echo false)"
  if [[ "$ok" == "true" ]]; then
    printf '  ok    %-14s %s (requires 22+)\n' node "$version"
  else
    printf '  ERROR %-14s %s (requires 22+)\n' node "$version"
  fi
}

check_repo() {
  local repo="$1"
  echo "-- Checkout --"
  if [[ ! -d "$repo" ]]; then
    printf '  info  %-14s no directory at %s\n' checkout "$repo"
    echo "        clone: git clone $BASE.git"
    return
  fi
  if [[ -f "$repo/packages/core/pyproject.toml" ]] \
    && grep -q 'name = "openexecutive"' "$repo/packages/core/pyproject.toml" 2>/dev/null; then
    printf '  ok    %-14s Open Executive checkout detected\n' checkout
  else
    printf '  info  %-14s %s is not an Open Executive checkout\n' checkout "$repo"
    return
  fi

  if [[ -d "$repo/.git" ]] && have git; then
    printf '  info  %-14s %s\n' commit "$(git -C "$repo" rev-parse --short HEAD 2>/dev/null || echo unknown)"
    printf '  info  %-14s %s\n' branch "$(git -C "$repo" rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
  fi

  if [[ -f "$repo/.env" ]]; then
    printf '  ok    %-14s present (gitignored; values never read here)\n' .env
  else
    printf '  info  %-14s absent — copy .env.example and edit it\n' .env
  fi

  if [[ -d "$repo/packages/core/.venv" ]]; then
    printf '  ok    %-14s packages/core/.venv present\n' venv
  else
    printf '  info  %-14s absent — uv sync has not run\n' venv
  fi

  if [[ -d "$repo/packages/ui/node_modules" ]]; then
    printf '  ok    %-14s packages/ui/node_modules present\n' ui-deps
  else
    printf '  info  %-14s absent — npm install has not run\n' ui-deps
  fi

  if [[ -d "$repo/packages/core/company" ]]; then
    printf '  WARN  %-14s company data present; never commit it\n' company
  else
    printf '  info  %-14s no company directory yet\n' company
  fi
}

print_env_presence() {
  local key value
  echo "-- Provider and integration variables in this shell (names only) --"
  for key in ANTHROPIC_API_KEY OPENROUTER_ENABLED OPENROUTER_API_KEY \
             LOCAL_MODELS_ENABLED LOCAL_BASE_URL LOCAL_MODELS \
             ENABLE_WEB_SEARCH BACKEND_SHARED_SECRET \
             SLACK_BOT_TOKEN DISCORD_BOT_TOKEN TELEGRAM_BOT_TOKEN \
             EXEC_EMAIL_ADDRESS GOOGLE_OAUTH_CLIENT_ID HONCHO_ENABLED; do
    eval "value=\${$key:-}"
    if [[ -n "$value" ]]; then
      printf '  set     %s\n' "$key"
    else
      printf '  unset   %s\n' "$key"
    fi
  done
  echo "  note  ENABLE_WEB_SEARCH unset means the code default applies, which is ON and billed."
  echo "  note  BACKEND_SHARED_SECRET set in a test shell makes full-app tests return 401."
}

cmd="${1:-}"

case "$cmd" in
  doctor)
    repo="${2:-.}"
    if [[ $# -gt 2 ]]; then
      echo "error: doctor accepts at most one repository path" >&2
      exit 1
    fi
    echo "== Open Executive readiness report (read-only) =="
    printf '  info  %-14s %s %s\n' host "$(uname -s 2>/dev/null || echo unknown)" "$(uname -m 2>/dev/null || echo unknown)"
    echo "-- Toolchain --"
    report_optional git "clone the repository" git
    check_python
    report_optional uv "Python package manager used by the repo" uv
    check_node
    report_optional npm "UI dependency install" npm
    report_optional make "convenience targets" make
    report_optional docker "alternative to a native toolchain" docker
    report_optional flyctl "only needed for Fly.io deployment" flyctl fly
    check_repo "$repo"
    print_env_presence
    echo "== end of report; nothing was installed, started, changed, or billed =="
    ;;

  safety)
    cat <<'EOF'
== Open Executive operation risk tiers (documentation only) ==

READ-ONLY
  GET /health, GET /fixtures, GET /fixtures/status
  listing agents, workflows, people, departments, decisions, audit rows
  openexecutive consolidate-initiatives        (dry run, no --apply)

STATEFUL BUT RECOVERABLE
  loading a fixture company, taking a fixture snapshot
  uploading a document (indexes into ChromaDB)
  any chat turn (spends provider budget)
  onboarding (writes the company profile)

DESTRUCTIVE OR EXTERNALLY VISIBLE — confirm with the user first
  POST /fixtures/reset          irreversible wipe of live state AND snapshot
  POST /fixtures/unload         removes the loaded fixture
  DELETE /fixtures/{name}       deletes a fixture definition
  consolidate-initiatives --apply   deletes merged rows, immediate SQLite write lock
  make clean                    removes .venv, node_modules, .next, caches
  make stop                     kills EVERY process on ports 8000 and 3000
  proactive DM or email send    reaches real people on Slack/Discord/Telegram/Gmail
  flyctl secrets set|unset      restarts a live machine
  merge to main                 auto-deploys the dev environment on Fly.io

INVARIANTS
  Run exactly one API machine; the scheduler double-fires if scaled out.
  The outbound anti-spam guard fails open; it is not an approval gate.
  Never commit packages/core/company/ or .env.
  Keep dynamic content out of cached prompt blocks.
EOF
    ;;

  upstream)
    cat <<EOF
Open Executive upstream pin: $PIN
Repository:        $BASE
Pinned tree:       $BASE/tree/$PIN
README:            $BASE/blob/$PIN/README.md
Contributor notes: $BASE/blob/$PIN/CLAUDE.md
Sample env:        $BASE/blob/$PIN/.env.example
Makefile:          $BASE/blob/$PIN/Makefile
Architecture:      $BASE/blob/$PIN/docs/architecture.md
Deployment:        $BASE/blob/$PIN/docs/deployment.md
Auth:              $BASE/blob/$PIN/docs/auth.md
Config source:     $BASE/blob/$PIN/packages/core/openexecutive/config.py
CLI source:        $BASE/blob/$PIN/packages/core/openexecutive/cli.py
Outbound guard:    $BASE/blob/$PIN/packages/core/openexecutive/orchestrator/outbound_guard.py
Fixture routes:    $BASE/blob/$PIN/packages/core/openexecutive/api/routes/fixtures.py
Note: the repository has no Git tags or GitHub releases; pin this commit.
EOF
    ;;

  *)
    usage
    ;;
esac
