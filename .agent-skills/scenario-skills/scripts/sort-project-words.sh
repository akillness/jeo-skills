#!/usr/bin/env bash
# Keep project-words.txt sorted (byte order, deduplicated). By default sorts
# in place for the pre-commit hook, re-staging the file only when it is
# already part of the commit, so unstaged edits are never pulled in.
# --check verifies without rewriting, for `pnpm validate` and CI.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ "${1:-}" = "--check" ]; then
  if ! LC_ALL=C sort -c -u project-words.txt; then
    echo "project-words.txt is not sorted or has duplicates; run pnpm words:sort" >&2
    exit 1
  fi
  exit 0
fi

LC_ALL=C sort -u -o project-words.txt project-words.txt

if ! git diff --cached --quiet -- project-words.txt; then
  git add project-words.txt
fi
