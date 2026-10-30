#!/usr/bin/env bash
# Ponytail upstream plugin installer (Ponytail 5.3.3, DietrichGebert/ponytail, MIT).
#
# Prints the plugin install for every detected agent CLI. With APPLY=1 it runs
# the non-interactive CLI steps for exactly one host: the one named in RUNTIME,
# or the only one detected. Manual follow-ups (trusting Codex hooks, enabling
# the Grok plugin) are printed, never automated. In-session-only hosts (Kimi
# Code, Cursor hooks, rules files) are listed in references/commands.md.
#
# Env knobs:
#   RUNTIME  claude | codex | copilot | gemini | qwen | pi | omp | opencode |
#            agy | hermes | devin | goose | openclaw | grok   (default: detect)
#   APPLY    1 runs the steps for one host (default: print only)
#
# Usage:
#   bash scripts/install.sh
#   RUNTIME=codex APPLY=1 bash scripts/install.sh

set -euo pipefail

UPSTREAM="DietrichGebert/ponytail"
REPO="https://github.com/$UPSTREAM"
# grok is never auto-detected: another tool also ships a `grok` binary.
HOSTS="claude codex copilot gemini qwen pi omp opencode agy hermes devin goose openclaw grok"

# One command per line; no argument contains spaces.
steps() {
  case "$1" in
    claude) printf '%s\n' "claude plugin marketplace add $UPSTREAM" "claude plugin install ponytail@ponytail" ;;
    codex) printf '%s\n' "codex plugin marketplace add $UPSTREAM" "codex plugin add ponytail@ponytail" ;;
    copilot) printf '%s\n' "copilot plugin marketplace add $UPSTREAM" "copilot plugin install ponytail@ponytail" ;;
    gemini) echo "gemini extensions install $REPO" ;;
    qwen) echo "qwen extensions install $UPSTREAM:ponytail" ;;
    pi) echo "pi install git:github.com/$UPSTREAM" ;;
    omp) printf '%s\n' "omp plugin marketplace add $UPSTREAM" "omp plugin install ponytail@ponytail" ;;
    opencode) echo "opencode plugin add @dietrichgebert/ponytail" ;;
    agy) echo "agy plugin install $REPO" ;;
    hermes) echo "hermes plugins install $UPSTREAM --enable" ;;
    devin) echo "devin plugins install $UPSTREAM" ;;
    goose) echo "goose plugin install $REPO.git" ;;
    openclaw) echo "clawhub install ponytail" ;;
    grok) echo "grok plugin install $UPSTREAM --trust" ;;
    *) return 1 ;;
  esac
}

follow_up() {
  case "$1" in
    claude) echo "then: start a new session (CodeBuddy uses the same plugin)" ;;
    codex) echo "then: run codex, open /hooks, trust the two lifecycle hooks, start a new thread" ;;
    copilot | devin) echo "then: commands are namespaced, e.g. /ponytail:ponytail-review" ;;
    omp) echo "then: start a new session" ;;
    agy | goose) echo "then: copy upstream AGENTS.md for the always-on rules" ;;
    hermes) echo "if the schema check refuses it: git clone $REPO.git ~/.hermes/plugins/ponytail && hermes plugins enable ponytail; restart Hermes" ;;
    grok) echo "then: enable it under /plugins, or [plugins] enabled = [\"ponytail\"] in ~/.grok/config.toml" ;;
  esac
}

binary_for() {
  case "$1" in
    openclaw) echo clawhub ;;
    grok) ;;
    *) echo "$1" ;;
  esac
}

show() {
  echo "$1:"
  steps "$1" | sed 's/^/  $ /'
  local note
  note="$(follow_up "$1")"
  [ -z "$note" ] || echo "  $note"
}

if [ -n "${RUNTIME:-}" ]; then
  steps "$RUNTIME" >/dev/null || { echo "Unknown RUNTIME: $RUNTIME (one of: $HOSTS)" >&2; exit 2; }
  hosts="$RUNTIME"
else
  hosts=""
  for host in $HOSTS; do
    bin="$(binary_for "$host")"
    if [ -n "$bin" ] && command -v "$bin" >/dev/null 2>&1; then hosts="$hosts $host"; fi
  done
  hosts="${hosts# }"
fi

if [ "${APPLY:-0}" = "1" ]; then
  case "$hosts" in
    "") echo "APPLY=1: no supported agent CLI found; set RUNTIME" >&2; exit 2 ;;
    *" "*) echo "APPLY=1 needs one host; detected: $hosts. Set RUNTIME to one of them." >&2; exit 2 ;;
  esac
  echo "Installing the Ponytail plugin for $hosts:"
  while IFS= read -r line; do
    echo "  \$ $line"
    read -r -a argv <<<"$line"
    "${argv[@]}"
  done < <(steps "$hosts")
  note="$(follow_up "$hosts")"
  [ -z "$note" ] || echo "  $note"
  exit 0
fi

echo "Catalog skill (instruction-only; same 'ponytail' folder as upstream skills CLI installs):"
echo "  \$ npx skills add https://github.com/akillness/jeo-skills --skill ponytail"
echo
if [ -z "$hosts" ]; then
  echo "No supported agent CLI found. Upstream plugin by host:"
  hosts="$HOSTS"
else
  echo "Upstream plugin for detected hosts (APPLY=1 RUNTIME=<host> runs one):"
fi
for host in $hosts; do show "$host"; done
echo
echo "Kimi Code, Cursor hooks and rules-file hosts: see references/commands.md"
