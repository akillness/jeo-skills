#!/usr/bin/env bash
set -euo pipefail

validator="${CODEX_HOME:-$HOME/.codex}/skills/.system/skill-creator/scripts/quick_validate.py"

if [[ ! -f "$validator" ]]; then
  echo "Skill validator not found: $validator" >&2
  exit 1
fi

source_dir="${1:-skills}"

if [[ ! -d "$source_dir" ]]; then
  echo "Skills directory not found: $source_dir" >&2
  exit 1
fi

for skill in "$source_dir"/*; do
  [[ -d "$skill" && -f "$skill/SKILL.md" ]] || continue
  python3 "$validator" "$skill"
done
