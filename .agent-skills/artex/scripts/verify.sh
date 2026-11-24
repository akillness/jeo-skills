#!/usr/bin/env bash
# Verify ARTEX locally, reproducing the checks from .github/workflows/ci.yml.
#
# Usage:
#   scripts/verify.sh [--full] [--security] [--go-only] [--web-only] [--keep-going]
#
#   --full       also run `go test -race` (the CI package list) and the web static build
#   --security   run `govulncheck ./...` (requires govulncheck in PATH)
#   --go-only    run only the Go checks
#   --web-only   run only the web checks
#   --keep-going continue after a failed step and report every failure at the end
#   -h, --help   show this help
#
# The default is the fast set: gofmt, build, vet, tests, web type-check and web
# unit tests, shellcheck and the shell/python checks. It does not need Docker.
set -euo pipefail
cd "$(dirname "$0")/.."

usage() { sed -n '2,14p' "$0" | sed 's/^# \?//'; }

FULL=0
SECURITY=0
GO_ONLY=0
WEB_ONLY=0
KEEP_GOING=0
while [ $# -gt 0 ]; do
  case "$1" in
    --full) FULL=1; shift ;;
    --security) SECURITY=1; shift ;;
    --go-only) GO_ONLY=1; shift ;;
    --web-only) WEB_ONLY=1; shift ;;
    --keep-going) KEEP_GOING=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done
if [ "$GO_ONLY" -eq 1 ] && [ "$WEB_ONLY" -eq 1 ]; then
  echo "--go-only and --web-only are mutually exclusive" >&2
  exit 2
fi
if [ "$SECURITY" -eq 1 ] && [ "$WEB_ONLY" -eq 1 ]; then
  echo "--security requires the Go checks and cannot be combined with --web-only" >&2
  exit 2
fi

FAILED=0
run_step() {
  local label="$1"
  shift
  printf '\n==> %s\n' "$label"
  if "$@"; then
    return 0
  fi
  printf 'FAILED: %s\n' "$label" >&2
  FAILED=1
  if [ "$KEEP_GOING" -eq 0 ]; then
    exit 1
  fi
  return 0
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'missing prerequisite: %s\n' "$1" >&2
    exit 127
  fi
}

# --go-only and --web-only narrow the run; otherwise both halves are checked.
want_go() { [ "$WEB_ONLY" -eq 0 ]; }
want_web() { [ "$GO_ONLY" -eq 0 ]; }

if want_go; then
  require_cmd go
  require_cmd git

  want=$(awk '/^go /{print $2; exit}' go.mod)
  got=$(go env GOVERSION | sed 's/^go//')
  # Numeric compare, portable to macOS (no GNU `sort -V`). A newer toolchain
  # is fine: CI deliberately runs a `go-stable` job alongside the pinned floor.
  version_ge() {
    awk -v a="$1" -v b="$2" 'BEGIN {
      split(a, A, "."); split(b, B, ".")
      for (i = 1; i <= 3; i++) {
        if (A[i] + 0 > B[i] + 0) exit 0
        if (A[i] + 0 < B[i] + 0) exit 1
      }
      exit 0
    }'
  }
  if [ -z "$want" ] || [ -z "$got" ] || ! version_ge "$got" "$want"; then
    printf 'Go %s does not meet the go.mod floor %s\n' "$got" "$want" >&2
    exit 1
  fi

  if [ -z "${ARTEX_PG_DSN:-}" ]; then
    printf 'note: ARTEX_PG_DSN is unset; PostgreSQL-dependent tests will skip themselves\n'
  fi

  check_gofmt() {
    local -a files=()
    local out
    mapfile -t files < <(git ls-files '*.go')
    if [ "${#files[@]}" -eq 0 ]; then
      return 0
    fi
    out=$(gofmt -l "${files[@]}")
    if [ -n "$out" ]; then
      printf 'gofmt required:\n%s\n' "$out"
      return 1
    fi
  }

  run_step "gofmt" check_gofmt
  run_step "go build" go build ./...
  run_step "go vet" go vet ./...
  run_step "go test -p 1" go test -p 1 ./...

  if [ "$SECURITY" -eq 1 ]; then
    require_cmd govulncheck
    run_step "govulncheck" govulncheck ./...
  fi

  if [ "$FULL" -eq 1 ]; then
    RACE_PKGS=(
      ./agent ./cmd/artex ./config ./db ./evidence ./guard
      ./intercept ./llmpool ./llmrec ./mcphttp ./notify ./server
      ./sidequestion ./traffic ./traffic/rewrite
    )
    run_step "go test -race -p 1" go test -race -p 1 "${RACE_PKGS[@]}"
  fi
fi

if want_web; then
  require_cmd npm
  require_cmd npx

  if [ ! -d web/node_modules ] || [ web/package-lock.json -nt web/node_modules ]; then
    run_step "npm ci" npm --prefix web ci
  fi
  run_step "tsc --noEmit" bash -c 'cd web && npx tsc --noEmit'
  run_step "web polling tests" bash -c 'cd web && npm run test:polling'
  run_step "web replay tests" bash -c 'cd web && npm run test:replay'
  run_step "web upload tests" bash -c 'cd web && npm run test:upload'
  run_step "web traffic stream tests" bash -c 'cd web && npm run test:traffic-stream'
  if [ "$FULL" -eq 1 ]; then
    run_step "web static build" bash -c 'cd web && npm run build:static'
  fi
fi

# The shell/python checks are part of neither --go-only nor --web-only: they
# are cheap and guard the install/update path used by every deployment.
if [ "$GO_ONLY" -eq 0 ] && [ "$WEB_ONLY" -eq 0 ]; then
  require_cmd python3
  if command -v shellcheck >/dev/null 2>&1; then
    run_step "shellcheck" shellcheck -S warning \
      install.sh update.sh start.sh scripts/backup.sh scripts/verify.sh \
      reset-password.sh scripts/extract-changelog-section.sh \
      scripts/test-extract-changelog-section.sh .github/scripts/bot.sh \
      scripts/test-bot-context.sh
  else
    printf 'note: shellcheck is not installed; skipping the shellcheck step\n'
  fi
  run_step "posture check" python3 scripts/posture_check_test.py
  run_step "benchmark tests" python3 -m unittest discover -s scripts/benchmark -p 'test_*.py' -v
  run_step "changelog section tests" bash scripts/test-extract-changelog-section.sh
  run_step "bot context tests" bash scripts/test-bot-context.sh
fi

printf '\n'
if [ "$FAILED" -ne 0 ]; then
  printf 'verification FAILED (one or more steps above)\n' >&2
  exit 1
fi
printf 'verification passed\n'
