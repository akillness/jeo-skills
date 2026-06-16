#!/usr/bin/env bash
# ponytail installer wrapper.
# Wires the upstream Ponytail marketplace plugin / extension for the detected
# runtime. Ponytail is rules + commands only — there is no package to compile,
# so this script just prints (and, where a CLI exists, runs) the right install
# line. Upstream: https://github.com/DietrichGebert/ponytail (MIT).
#
# Env knobs:
#   RUNTIME   — force a runtime: claude | codex | gemini | pi | opencode
#               (default: autodetect from PATH, fallback: print all)
#   APPLY     — "1" actually run the detected CLI install (default: print only)
#
# Usage:
#   bash scripts/install.sh
#   RUNTIME=claude APPLY=1 bash scripts/install.sh

set -euo pipefail

UPSTREAM="DietrichGebert/ponytail"
CATALOG="https://github.com/akillness/jeo-skills"

detect() {
  if [ -n "${RUNTIME:-}" ]; then echo "$RUNTIME"; return; fi
  if command -v claude  >/dev/null 2>&1; then echo claude;   return; fi
  if command -v codex   >/dev/null 2>&1; then echo codex;    return; fi
  if command -v gemini  >/dev/null 2>&1; then echo gemini;   return; fi
  if command -v pi      >/dev/null 2>&1; then echo pi;       return; fi
  if command -v opencode >/dev/null 2>&1; then echo opencode; return; fi
  echo all
}

run() {
  # Print the command; only execute when APPLY=1.
  echo "  \$ $*"
  if [ "${APPLY:-0}" = "1" ]; then "$@"; fi
}

rt="$(detect)"
echo "=== ponytail installer ==="
echo "runtime: ${rt}   apply: ${APPLY:-0}"
echo ""
echo "Catalog (skill copy of this repo):"
echo "  \$ npx skills add ${CATALOG} --skill ponytail"
echo ""

case "$rt" in
  claude)
    echo "Claude Code (upstream plugin):"
    run claude plugin marketplace add "${UPSTREAM}"
    echo "  then in Claude Code: /plugin install ponytail@ponytail"
    ;;
  codex)
    echo "Codex (upstream plugin):"
    run codex plugin marketplace add "${UPSTREAM}"
    echo "  then: /plugins -> select Ponytail -> install; /hooks -> trust 2 hooks; new thread"
    ;;
  gemini)
    echo "Gemini CLI (extension):"
    run gemini extensions install "https://github.com/${UPSTREAM}"
    ;;
  pi)
    echo "Pi agent harness:"
    run pi install "git:github.com/${UPSTREAM}"
    ;;
  opencode)
    echo "OpenCode: run from a checkout and add to opencode.json:"
    echo '  { "plugin": ["./.opencode/plugins/ponytail.mjs"] }'
    ;;
  all|*)
    echo "No agent CLI detected on PATH. Pick one:"
    echo "  Claude Code : claude plugin marketplace add ${UPSTREAM}  &&  /plugin install ponytail@ponytail"
    echo "  Codex       : codex plugin marketplace add ${UPSTREAM}"
    echo "  Gemini CLI  : gemini extensions install https://github.com/${UPSTREAM}"
    echo "  Pi          : pi install git:github.com/${UPSTREAM}"
    echo "  OpenCode    : add { \"plugin\": [\"./.opencode/plugins/ponytail.mjs\"] } to opencode.json"
    echo ""
    echo "Instruction-only adapters (Cursor/Windsurf/Cline/Copilot/Kiro/Antigravity):"
    echo "  copy the matching rules file from https://github.com/${UPSTREAM}"
    ;;
esac

echo ""
echo "Done. He'd be proud. He won't say it."
