#!/bin/sh
# jeo-skills-managed: llm-wiki-ingest
# Portable wrapper for prompt/turn-end ingest across coding-agent hosts.
set -u

MODE="${1:-}"
HOOKS_DIR="${HOME}/.agents/hooks"
INGEST_PY="${HOOKS_DIR}/ingest-prompt.py"

case "$MODE" in
  *-stop|stop|Stop|AfterAgent|turn-end)
    export JEO_HOOK_EVENT="${JEO_HOOK_EVENT:-Stop}"
    ;;
  PostCompact|post-compact|compact)
    export JEO_HOOK_EVENT="${JEO_HOOK_EVENT:-PostCompact}"
    ;;
esac

if [ -f "$INGEST_PY" ] && command -v python3 >/dev/null 2>&1; then
  python3 "$INGEST_PY" >/dev/null 2>&1 || true
fi

case "$MODE" in
  cursor-prompt)
    printf '{"continue":true}\n'
    ;;
  cursor-stop|agy|agy-stop|gemini|gemini-stop|codex|codex-stop)
    printf '{}\n'
    ;;
esac

exit 0
