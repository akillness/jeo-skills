#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UPSTREAM_BASE="https://raw.githubusercontent.com/revfactory/harness/main"
TARGET_DIR="$ROOT_DIR/references/upstream"
CHECK_ONLY="${1:-}"

FILES=(
  "README.md"
  "skills/harness/references/agent-design-patterns.md"
  "skills/harness/references/orchestrator-template.md"
  "skills/harness/references/qa-agent-guide.md"
  "skills/harness/references/skill-testing-guide.md"
  "skills/harness/references/skill-writing-guide.md"
  "skills/harness/references/team-examples.md"
)

mkdir -p "$TARGET_DIR"

for file in "${FILES[@]}"; do
  base_name="$(basename "$file")"
  target_path="$TARGET_DIR/$base_name"
  source_url="$UPSTREAM_BASE/$file"

  if [[ "$CHECK_ONLY" == "--check" ]]; then
    echo "CHECK $source_url -> $target_path"
    continue
  fi

  echo "SYNC $source_url -> $target_path"
  curl -L -s "$source_url" -o "$target_path"
done

echo "Harness upstream references synced."
