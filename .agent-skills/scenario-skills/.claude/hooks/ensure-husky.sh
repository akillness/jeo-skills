#!/usr/bin/env bash
# SessionStart hook: make sure dev dependencies and the husky git hooks are
# installed, so commitlint and the pre-commit checks fire for every commit.
set -uo pipefail
cd "${CLAUDE_PROJECT_DIR:-.}"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "ensure-husky: pnpm not found; run 'pnpm install' manually to enable the git hooks" >&2
  exit 0
fi

hooks_path=$(git config --local core.hooksPath 2>/dev/null || true)
if [ ! -d node_modules ] || [ "$hooks_path" != ".husky/_" ]; then
  echo "Installing dev dependencies and husky git hooks (pnpm install)"
  pnpm install --frozen-lockfile --silent ||
    echo "ensure-husky: pnpm install failed; run it manually so the git hooks are active" >&2
fi

exit 0
