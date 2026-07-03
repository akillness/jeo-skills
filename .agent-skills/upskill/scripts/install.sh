#!/usr/bin/env bash
# upskill installer wrapper.
#
# Installs HKUDS/UpSkill's Claude Code integration (hooks, skills, config,
# skill store) into ~/.claude/, and optionally registers this routing skill
# as a jeo-skills plugin.
#
# Env knobs:
#   LOCAL_REPO=<dir>   — install from an existing local UpSkill clone instead
#                        of downloading (skips network, passes --local semantics)
#   UPSKILL_REF=<ref>  — Git ref to clone when LOCAL_REPO is unset and a clone
#                        is needed (default: main)
#   GLOBAL=1           — also install this routing skill globally
#                        (npx skills add -g)
#   DRY_RUN=1          — pass --dry-run through to the upstream installer
#
# Usage:
#   bash scripts/install.sh                       # remote install (default)
#   LOCAL_REPO=/path/to/UpSkill bash scripts/install.sh
#   GLOBAL=1 bash scripts/install.sh
#   DRY_RUN=1 bash scripts/install.sh

set -euo pipefail

log()  { printf '\033[1;34m[upskill]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[upskill]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[upskill]\033[0m %s\n' "$*" >&2; exit 1; }

GLOBAL="${GLOBAL:-0}"
DRY_RUN="${DRY_RUN:-0}"
UPSKILL_REF="${UPSKILL_REF:-main}"
UPSTREAM_URL="https://github.com/HKUDS/UpSkill"
SKILL="upskill"
REPO_URL="https://github.com/akillness/jeo-skills"

command -v bash >/dev/null 2>&1 || die "bash is required"
command -v python3 >/dev/null 2>&1 || die "python3 is required"
command -v git >/dev/null 2>&1 || die "git is required"

# 1) Optionally install this routing skill globally
if [ "$GLOBAL" = "1" ]; then
  if command -v npx >/dev/null 2>&1; then
    log "Installing '$SKILL' skill globally via npx skills add -g"
    npx --yes skills add -g "$REPO_URL" --skill "$SKILL" --yes 2>/dev/null \
      || warn "Global skill install failed — continuing with UpSkill install"
  else
    warn "npx not found — skipping global skill install"
  fi
fi

DRY_RUN_FLAG=()
[ "$DRY_RUN" = "1" ] && DRY_RUN_FLAG=(--dry-run)

if [ -n "${LOCAL_REPO:-}" ]; then
  # 2a) Install from an existing local clone
  [ -d "$LOCAL_REPO/cc-integration" ] || die "LOCAL_REPO=$LOCAL_REPO has no cc-integration/ — wrong path?"
  log "Installing from local clone: $LOCAL_REPO"
  ( cd "$LOCAL_REPO/cc-integration" && bash install.sh "${DRY_RUN_FLAG[@]}" )
else
  # 2b) Remote one-line install (downloads each file individually — no full clone)
  command -v curl >/dev/null 2>&1 || die "curl is required for remote install (or set LOCAL_REPO=<clone>)"
  log "Installing remotely from $UPSTREAM_URL@$UPSKILL_REF"
  curl -sSL "https://raw.githubusercontent.com/HKUDS/Upskill/${UPSKILL_REF}/cc-integration/install.sh" \
    | bash -s -- --remote "${DRY_RUN_FLAG[@]}"
fi

log "Done. Next steps:"
log "  1. Edit ~/.claude/upskill.conf — set UPSKILL_TEACHER and UPSKILL_STUDENT"
log "  2. Inside each project: run /upskill-configure"
log "  3. Use Claude Code normally — a failed session prompts /upskill-build next time"
log "  4. Browse skills any time with /upskill-list or /upskill-run"
