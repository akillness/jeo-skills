#!/usr/bin/env bash
# Runner for modern-web-guidance with local offline fallback
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Try npx if internet is reachable and npx exists
if command -v npx >/dev/null 2>&1; then
  if npx -y modern-web-guidance@latest "$@" 2>/dev/null; then
    exit 0
  fi
fi

# Fallback to local python search engine
python3 "$SCRIPT_DIR/local-search.py" "$@"
