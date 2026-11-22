#!/usr/bin/env bash
# Spell check for authored markdown, shared by CI and the pre-commit hook.
# Legitimate project terms go in project-words.txt, never inline disables.
# tests/ holds authored markdown too: the evidence READMEs that skills link as review records.
set -euo pipefail
cd "$(dirname "$0")/.."

pnpm exec cspell --no-progress --relative --no-must-find-files \
  'skills/**/*.md' \
  'README.md' \
  'INSTALL.md' \
  'AGENTS.md' \
  'REVIEW.md' \
  'CODE_OF_CONDUCT.md' \
  'CONTRIBUTING.md' \
  'SECURITY.md' \
  'SUPPORT.md' \
  'docs/**/*.md' \
  'tests/**/*.md' \
  '.github/**/*.md' \
  '.claude/commands/*.md' \
  '.agents/skills/skills-*/SKILL.md' \
  '.claude/agents/*.md'
