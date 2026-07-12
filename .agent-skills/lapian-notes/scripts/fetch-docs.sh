#!/usr/bin/env bash
# Re-fetch current Lapian Notes docs so guidance in this skill's references/
# never goes stale. Read-only network fetch, no writes.
#
# Usage: fetch-docs.sh [readme|readme-en|package|contributing]
#        (default: readme)
set -euo pipefail

TARGET="${1:-readme}"
OWNER_REPO="bkingfilm/lapian-notes"
BASE="https://raw.githubusercontent.com/${OWNER_REPO}/main"

case "$TARGET" in
  readme)
    PATH_="README.md"
    ;;
  readme-en)
    PATH_="README.en.md"
    ;;
  package)
    PATH_="package.json"
    ;;
  contributing)
    PATH_="CONTRIBUTING.md"
    ;;
  *)
    echo "Usage: $0 [readme|readme-en|package|contributing]" >&2
    exit 1
    ;;
esac

echo "=== ${OWNER_REPO} ${PATH_} ==="
curl -fsSL "${BASE}/${PATH_}" || echo "(fetch failed — check branch name / connectivity, or the file genuinely does not exist e.g. CONTRIBUTING.md)"
