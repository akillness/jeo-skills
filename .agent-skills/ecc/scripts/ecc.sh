#!/usr/bin/env bash
# Read-only ECC readiness and command-planning helper.
#
# Usage:
#   ecc.sh doctor
#   ecc.sh plan claude [user|project|local] [off|minimal|standard|strict] [--proposal]
#   ecc.sh plan codex [--proposal]
#   ecc.sh plan kimi [--proposal]
#   ecc.sh self-test
#
# This helper never installs, updates, configures, or removes ECC. `plan` only
# prints an upstream command that requires separate confirmation to apply.
# `--proposal` additionally prints a `jevproposal=<json>` line shaped for a
# `jev-harness.mjs review` call; it is a decision envelope, not approval.

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

# Collects --proposal separately while preserving each positional as its own
# argv slot. This avoids newline serialization and validates boundaries before
# any branch can emit a plan or proposal.
plan_setup() {
  PLAN_PROPOSAL=no
  PLAN_POSITIONAL_COUNT=0
  PLAN_ARG1=""
  PLAN_ARG2=""
  PLAN_ARG3=""
  local a
  [ $# -gt 0 ] || return 0
  for a in "$@"; do
    case "$a" in
      --proposal)
        if [ "$PLAN_PROPOSAL" = yes ]; then
          fail 'plan accepts --proposal at most once'
        fi
        PLAN_PROPOSAL=yes
        ;;
      *" "*|*[![:print:]]*)
        fail 'plan arguments may not contain spaces or control characters'
        ;;
      *)
        case "$PLAN_POSITIONAL_COUNT" in
          0) PLAN_ARG1="$a" ;;
          1) PLAN_ARG2="$a" ;;
          2) PLAN_ARG3="$a" ;;
          *) fail 'plan accepts at most three positional values' ;;
        esac
        PLAN_POSITIONAL_COUNT=$((PLAN_POSITIONAL_COUNT + 1))
        ;;
    esac
  done
}

# Prints the branch's deterministic Jev review proposal. Values come only from
# the fixed command shape and already-validated whitelists, never raw input.
# Output is valid JSON on one 'jevproposal=' line, ready for review.
emit_proposal_json() {
  local target="$1" first second
  case "$target" in
    claude)
      first="${2-}"
      second="${3-}"
      say "jevproposal={\"summary\":\"Select the Claude ECC installation branch: claude plugin path with explicit scope and hook profile\",\"branch\":\"install-path\",\"harness\":\"claude\",\"plan\":{\"mode\":\"claude-plugin\",\"scope\":\"$first\",\"hooks\":\"$second\",\"sequence\":[\"npx --yes --package ecc-universal ecc setup --mode claude-plugin --scope $first --hooks $second --dry-run --json\",\"npx --yes --package ecc-universal ecc setup --mode claude-plugin --scope $first --hooks $second --yes --json\"]}}"
      ;;
    codex)
      say "jevproposal={\"summary\":\"Select the Codex branch: native marketplace add and plugin add; hook trust is provider-owned\",\"branch\":\"install-path\",\"harness\":\"codex\",\"plan\":{\"mode\":\"native-marketplace\",\"sequence\":[\"codex plugin marketplace add affaan-m/ECC\",\"codex plugin add ecc@ecc --json\"]}}"
      ;;
    kimi)
      say "jevproposal={\"summary\":\"Select the Kimi branch: project-local ECC adapter via npx core install; ECC does not configure Kimi hooks\",\"branch\":\"install-path\",\"harness\":\"kimi\",\"plan\":{\"mode\":\"project-local-adapter\",\"target\":\"kimi\",\"sequence\":[\"npx --yes --package ecc-universal ecc install --profile core --target kimi --dry-run\",\"npx --yes --package ecc-universal ecc install --profile core --target kimi\"]}}"
      ;;
  esac
}

plan() {
  local target="${1:-}"
  shift || true
  plan_setup "$@"

  case "$target" in
    claude)
      local scope hooks
      [ "$PLAN_POSITIONAL_COUNT" -le 2 ] || fail 'Claude plan accepts scope, hooks, and --proposal only'
      case "$PLAN_POSITIONAL_COUNT" in
        0)
          scope=user
          hooks=standard
          ;;
        1)
          scope="$PLAN_ARG1"
          hooks=standard
          ;;
        2)
          scope="$PLAN_ARG1"
          hooks="$PLAN_ARG2"
          ;;
      esac
      case "$scope" in user|project|local) ;; *) fail 'Claude scope must be user, project, or local' ;; esac
      case "$hooks" in off|minimal|standard|strict) ;; *) fail 'Claude hooks must be off, minimal, standard, or strict' ;; esac
      say 'mode=plan'
      say 'target=claude'
      say "scope=$scope"
      say "hooks=$hooks"
      say 'action=PREVIEW_ONLY'
      quote_command npx --yes --package ecc-universal ecc setup --mode claude-plugin --scope "$scope" --hooks "$hooks" --dry-run --json
      if [ "$PLAN_PROPOSAL" = yes ]; then
        say 'note=proposal is decision evidence only; final apply always requires human confirmation and provider authorization'
        emit_proposal_json claude "$scope" "$hooks"
      fi
      ;;
    codex)
      [ "$PLAN_POSITIONAL_COUNT" -eq 0 ] || fail 'Codex plan accepts only --proposal'
      say 'mode=plan'
      say 'target=codex'
      say 'action=PREVIEW_ONLY'
      say 'inventory:'
      quote_command codex plugin marketplace list --json
      quote_command codex plugin list --json
      say 'apply_after_confirmation:'
      quote_command codex plugin marketplace add affaan-m/ECC
      quote_command codex plugin add ecc@ecc --json
      if [ "$PLAN_PROPOSAL" = yes ]; then
        say 'note=hook activation is a separate provider-owned trust decision, not part of this proposal'
        emit_proposal_json codex
      fi
      ;;
    kimi)
      [ "$PLAN_POSITIONAL_COUNT" -eq 0 ] || fail 'Kimi plan accepts only --proposal'
      say 'mode=plan'
      say 'target=kimi'
      say 'action=PREVIEW_ONLY'
      quote_command npx --yes --package ecc-universal ecc install --profile core --target kimi --dry-run
      if [ "$PLAN_PROPOSAL" = yes ]; then
        say 'note=ECC does not configure lifecycle hooks for Kimi'
        emit_proposal_json kimi
      fi
      ;;
    *)
      fail 'plan target must be claude, codex, or kimi'
      ;;
  esac
}

self_test() {
  local script_path output default_output proposal_out proposal_json
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
  default_output="$(bash "$script_path" plan claude)"
  case "$default_output" in
    *'scope=user'*'hooks=standard'*)
      say 'self-test-defaults=PASS'
      ;;
    *)
      fail 'Claude plan defaults changed unexpectedly'
      ;;
  esac
  proposal_out="$(bash "$script_path" plan claude local strict --proposal)"
  proposal_json="$(printf '%s\n' "$proposal_out" | sed -n 's/^jevproposal=//p')"
  [ -n "$proposal_json" ] || fail 'proposal output missing jevproposal line'
  case "$proposal_json" in
    *'"branch":"install-path"'*'"scope":"local"'*'"hooks":"strict"'*"--dry-run --json"*)
      say 'self-test-proposal=PASS'
      ;;
    *)
      fail 'jevproposal content changed unexpectedly'
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
