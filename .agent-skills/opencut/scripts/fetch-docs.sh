#!/usr/bin/env bash
# Re-fetch the current OpenCut README/CONTRIBUTING so guidance in this skill's
# references/ never goes stale. Read-only network fetch, no writes.
#
# Usage: fetch-docs.sh [classic|rewrite]   (default: classic)
set -euo pipefail

TARGET="${1:-classic}"

case "$TARGET" in
  classic)
    OWNER_REPO="opencut-app/opencut-classic"
    ;;
  rewrite)
    OWNER_REPO="OpenCut-app/OpenCut"
    ;;
  *)
    echo "Usage: $0 [classic|rewrite]" >&2
    exit 1
    ;;
esac

BASE="https://raw.githubusercontent.com/${OWNER_REPO}/main"

echo "=== ${OWNER_REPO} README.md ==="
curl -fsSL "${BASE}/README.md" || echo "(fetch failed — check branch name / connectivity)"

echo
echo "=== ${OWNER_REPO} .github/CONTRIBUTING.md ==="
curl -fsSL "${BASE}/.github/CONTRIBUTING.md" || echo "(no CONTRIBUTING.md at this path, or fetch failed)"
