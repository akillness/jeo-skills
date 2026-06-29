#!/usr/bin/env bash
# webtoon-harness installer
#
# Scaffolds the upstream revfactory/webtoon-harness Claude Code harness
# (27 agents + 6 methodology skills) into a target project's .claude/ directory,
# and can optionally install this routing skill globally.
#
# Idempotent and additive: existing .claude/agents and .claude/skills entries are
# preserved; only the webtoon harness files are copied in (same-named files overwritten).
#
# Env knobs:
#   TARGET=<dir>   - project root to scaffold into (default: current directory)
#   GLOBAL=1       - also install this routing skill globally (npx skills add -g)
#   REF=<gitref>   - upstream ref to clone (default: main)
#   UPSTREAM_URL=  - source repo (default: https://github.com/revfactory/webtoon-harness)
#
# Usage:
#   bash scripts/install.sh
#   TARGET=/path/to/project bash scripts/install.sh
#   GLOBAL=1 bash scripts/install.sh

set -euo pipefail

log()  { printf '\033[1;34m[webtoon-harness]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[webtoon-harness]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[webtoon-harness]\033[0m %s\n' "$*" >&2; exit 1; }

TARGET="${TARGET:-$(pwd)}"
GLOBAL="${GLOBAL:-0}"
REF="${REF:-main}"
UPSTREAM_URL="${UPSTREAM_URL:-https://github.com/revfactory/webtoon-harness}"
SKILL="webtoon-harness"
REPO_URL="https://github.com/akillness/jeo-skills"

command -v git >/dev/null 2>&1 || die "git is required"

# 1) Optionally install this routing skill globally
if [ "$GLOBAL" = "1" ]; then
  if command -v npx >/dev/null 2>&1; then
    log "Installing '$SKILL' skill globally via npx skills add -g"
    npx --yes skills add -g "$REPO_URL" --skill "$SKILL" --yes 2>/dev/null \
      || warn "Global skill install failed — continuing with project scaffold"
  else
    warn "npx not found — skipping global skill install"
  fi
fi

# 2) Clone the upstream harness into a temp dir
TMP_DIR="$(mktemp -d 2>/dev/null || mktemp -d -t webtoon-harness)"
trap 'rm -rf "$TMP_DIR"' EXIT
log "Cloning $UPSTREAM_URL@$REF"
git clone --depth 1 --branch "$REF" "$UPSTREAM_URL" "$TMP_DIR/upstream" >/dev/null 2>&1 \
  || git clone --depth 1 "$UPSTREAM_URL" "$TMP_DIR/upstream" >/dev/null 2>&1 \
  || die "Failed to clone $UPSTREAM_URL"

SRC="$TMP_DIR/upstream/.claude"
[ -d "$SRC/agents" ] || die "Upstream .claude/agents not found — repo layout changed?"
[ -d "$SRC/skills" ] || die "Upstream .claude/skills not found — repo layout changed?"

# 3) Copy agents + skills into the target project (additive)
mkdir -p "$TARGET/.claude/agents" "$TARGET/.claude/skills"
cp -R "$SRC/agents/." "$TARGET/.claude/agents/"
cp -R "$SRC/skills/." "$TARGET/.claude/skills/"

AGENT_COUNT="$(find "$TARGET/.claude/agents" -maxdepth 1 -name '*.md' | wc -l | tr -d ' ')"
SKILL_COUNT="$(find "$TARGET/.claude/skills" -maxdepth 1 -type d -not -path "$TARGET/.claude/skills" | wc -l | tr -d ' ')"

log "Scaffolded into $TARGET/.claude/ (agents: $AGENT_COUNT, skill dirs: $SKILL_COUNT)"
log "Next: open Claude Code on the project with CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1"
log 'Then ask: "Make episode 1 of a webtoon reflecting current trends"'
