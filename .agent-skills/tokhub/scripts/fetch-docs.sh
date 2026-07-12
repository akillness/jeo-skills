#!/usr/bin/env bash
# Re-fetch current TokHub docs so guidance in this skill's references/ never
# goes stale. Read-only network fetch, no writes.
#
# Usage: fetch-docs.sh [readme|contributing|deployment|api|release|open-source]
#        (default: readme)
set -euo pipefail

TARGET="${1:-readme}"
OWNER_REPO="yaojingang/TokHub"
BASE="https://raw.githubusercontent.com/${OWNER_REPO}/main"

case "$TARGET" in
  readme)
    PATH_="README.md"
    ;;
  contributing)
    PATH_="CONTRIBUTING.md"
    ;;
  deployment)
    PATH_="docs/DEPLOYMENT.md"
    ;;
  api)
    PATH_="docs/API.md"
    ;;
  release)
    PATH_="docs/RELEASE.md"
    ;;
  open-source)
    PATH_="docs/OPEN_SOURCE.md"
    ;;
  *)
    echo "Usage: $0 [readme|contributing|deployment|api|release|open-source]" >&2
    exit 1
    ;;
esac

echo "=== ${OWNER_REPO} ${PATH_} ==="
curl -fsSL "${BASE}/${PATH_}" || echo "(fetch failed — check branch name / connectivity)"
