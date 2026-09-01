#!/usr/bin/env bash
# Read-only ECC readiness and command-planning helper.
#
# Usage:
#   ecc.sh doctor
#   ecc.sh plan claude [user|project|local] [off|minimal|standard|strict]
#   ecc.sh plan codex
#   ecc.sh plan kimi
#   ecc.sh self-test
#
# This helper never installs, updates, configures, or removes ECC. `plan` only
# prints an upstream command that requires separate confirmation to apply.

set -euo pipefail

say() {
  printf '%s\n' "$*"
}

fail() {
  printf 'BLOCK %s\n' "$*" >&2
  exit 2
}

have() {
  command -v "$1" >/dev/null 2>&1
}

print_binary() {
  local name="$1"
  if have "$name"; then
    printf 'binary.%s=FOUND %s\n' "$name" "$(command -v "$name")"
  else
    printf 'binary.%s=MISSING\n' "$name"
  fi
}

node_major() {
  node --version 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/'
}

quote_command() {
  local part
  for part in "$@"; do
    printf '%q ' "$part"
  done
  printf '\n'
}

doctor() {
  local major=""
  say 'mode=doctor'
  say "host.os=$(uname -s 2>/dev/null || printf unknown)"
  say "host.arch=$(uname -m 2>/dev/null || printf unknown)"
  print_binary node
  print_binary npm
  print_binary npx
  print_binary git
  print_binary claude
  print_binary codex

  if have node; then
    major="$(node_major || true)"
    say "node.version=$(node --version 2>/dev/null || printf unknown)"
    if [ -n "$major" ] && [ "$major" -ge 18 ] 2>/dev/null; then
      say 'node.ecc_requirement=READY'
    else
      say 'node.ecc_requirement=BLOCKED requires Node.js >=18'
    fi
  else
    say 'node.ecc_requirement=BLOCKED requires Node.js >=18'
  fi

  say 'result=INVENTORY_ONLY'
}

plan() {
  local target="${1:-}"
  shift || true

  case "$target" in
    claude)
      local scope="${1:-user}"
      local hooks="${2:-standard}"
      case "$scope" in user|project|local) ;; *) fail 'Claude scope must be user, project, or local' ;; esac
      case "$hooks" in off|minimal|standard|strict) ;; *) fail 'Claude hooks must be off, minimal, standard, or strict' ;; esac
      say 'mode=plan'
      say 'target=claude'
      say "scope=$scope"
      say "hooks=$hooks"
      say 'action=PREVIEW_ONLY'
      quote_command npx --yes --package ecc-universal ecc setup --mode claude-plugin --scope "$scope" --hooks "$hooks" --dry-run --json
      ;;
    codex)
      [ "$#" -eq 0 ] || fail 'Codex plan accepts no additional values'
      say 'mode=plan'
      say 'target=codex'
      say 'action=PREVIEW_ONLY'
      say 'inventory:'
      quote_command codex plugin marketplace list --json
      quote_command codex plugin list --json
      say 'apply_after_confirmation:'
      quote_command codex plugin marketplace add affaan-m/ECC
      quote_command codex plugin add ecc@ecc --json
      ;;
    kimi)
      [ "$#" -eq 0 ] || fail 'Kimi plan accepts no additional values'
      say 'mode=plan'
      say 'target=kimi'
      say 'action=PREVIEW_ONLY'
      quote_command npx --yes --package ecc-universal ecc install --profile core --target kimi --dry-run
      ;;
    *)
      fail 'plan target must be claude, codex, or kimi'
      ;;
  esac
}

self_test() {
  local script_path output
  script_path="${BASH_SOURCE[0]}"
  output="$(bash "$script_path" plan claude user standard)"
  case "$output" in
    *'target=claude'*'--scope user --hooks standard --dry-run --json'*)
      say 'self-test=PASS'
      ;;
    *)
      fail 'Claude plan output changed unexpectedly'
      ;;
  esac
}

case "${1:-doctor}" in
  doctor)
    [ "$#" -eq 1 ] || fail 'doctor accepts no additional values'
    doctor
    ;;
  plan)
    shift
    plan "$@"
    ;;
  self-test)
    [ "$#" -eq 1 ] || fail 'self-test accepts no additional values'
    self_test
    ;;
  --help|-h|help)
    sed -n '1,11p' "$0"
    ;;
  *)
    fail "unknown command: $1"
    ;;
esac
