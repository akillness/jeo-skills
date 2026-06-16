#!/usr/bin/env bash
set -euo pipefail

repo_root="${1:-/Users/jang_jennie/projects/jeo-skills}"
validator="$repo_root/.agent-skills/skill-standardization/scripts/validate_skill.sh"

tmpdir=$(mktemp -d)
trap 'rm -rf "$tmpdir"' EXIT
mkdir -p "$tmpdir/problem-skill"

cat > "$tmpdir/problem-skill/SKILL.md" <<'EOF'
---
name: problem-skill
description: >
  Validate a skill when the ClawTeam's operator guide includes shell-like text and route-outs.
allowed-tools: Bash Read Write
---

# Problem Skill

## When to use this skill
- Demo.

## Instructions
- Demo.

## Examples
- Demo.

## Best practices
1. Demo.

## References
- Demo.
EOF

bash "$validator" "$tmpdir/problem-skill"
