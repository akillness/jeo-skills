#!/usr/bin/env bash
# skills-upgrade.sh — refresh the installed jeo-skills catalog without legacy accretion.
#
# Safe-by-design flow (coordinate with .agent-skills AGENTS.md non-negotiables):
#   1. fast-forward the trusted checkout (git pull --ff-only)
#   2. validate catalog projections (jeo-skill doctor)
#   3. refresh the SHARED ROOT only (install --all --global); never per-host
#      copy targets, because host roots are per-skill symlinked and the
#      installer rmtree would follow symlink slots into the shared root
#   4. prune retired catalog copies (prune-retired --global)
#   5. reconcile per-host symlinks (scripts/refresh-host-links.py)
#   6. verify: doctor exit code + broken-link scan across host roots
#
# Usage:
#   scripts/skills-upgrade.sh                 # full refresh (shared root + hosts)
#   scripts/skills-upgrade.sh --dry-run       # plan only, no writes
#   scripts/skills-upgrade.sh --skip-pull     # skip git pull (offline/CI)
#   scripts/skills-upgrade.sh --replace-copies # also convert stale host copies
#
# After symlink conversion, do NOT run `jeo-skill install -a claude-code`
# (or gjc/antigravity/pi copy targets) anywhere — see step 5 of refresh-host-links.py.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DRY_RUN=0
SKIP_PULL=0
REPLACE_COPIES=0
HOSTS="${SKILLS_UPGRADE_HOSTS:-claude,pi,gjc,antigravity,cursor,aside-user,opencode-config}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --skip-pull) SKIP_PULL=1 ;;
    --replace-copies) REPLACE_COPIES=1 ;;
    --hosts) HOSTS="$2"; shift ;;
    --hosts=*) HOSTS="${1#*=}" ;;
    -h|--help) sed -n '2,22p' "$0"; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done

export HOME="${HOME:-$(getent passwd "$(id -u)" 2>/dev/null | cut -d: -f6)}"
# Cron/launchd-safe PATH: jeo-skill shells out to `npx`, which lives under nvm.
if ! command -v npx >/dev/null 2>&1; then
  for NODE_BIN in "$HOME"/.nvm/versions/node/*/bin; do
    [[ -x "$NODE_BIN/npx" ]] && export PATH="$NODE_BIN:$PATH"
  done
fi
JEO_SKILL_CMD="${JEO_SKILL_CMD:-jeo-skill}"
if ! command -v "$JEO_SKILL_CMD" >/dev/null 2>&1; then
  if [[ -x "$HOME/.local/bin/jeo-skill" ]]; then
    JEO_SKILL_CMD="$HOME/.local/bin/jeo-skill"
  else
    echo "skills-upgrade: jeo-skill not found (set JEO_SKILL_CMD)" >&2
    exit 3
  fi
fi

DRY_FLAG=(); [[ "$DRY_RUN" -eq 1 ]] && DRY_FLAG=(--dry-run)

step() { printf '\n== %s ==\n' "$*"; }

step "1/6 checkout pull --ff-only"
if [[ "$SKIP_PULL" -eq 1 ]]; then
  echo "skipped (--skip-pull)"
elif [[ "$DRY_RUN" -eq 1 ]]; then
  echo "would run: git -C '$REPO_DIR' pull --ff-only"
else
  git -C "$REPO_DIR" pull --ff-only --quiet || { echo "skills-upgrade: pull failed; refusing to continue" >&2; exit 4; }
fi

step "2/6 catalog doctor"
# doctor is read-only and has no --dry-run flag; run it plainly in both modes.
"$JEO_SKILL_CMD" doctor || true

step "3/6 shared-root refresh (never per-host copy targets)"
"$JEO_SKILL_CMD" install --all --global --yes "${DRY_FLAG[@]+"${DRY_FLAG[@]}"}"

step "4/6 prune retired catalog copies"
"$JEO_SKILL_CMD" prune-retired --global "${DRY_FLAG[@]+"${DRY_FLAG[@]}"}"

step "5/6 reconcile host symlinks"
# refresh-host-links.py has no --dry-run; it is read-only without --apply.
# In dry-run mode, do NOT pass --apply (the old code passed both, which
# would have written links while claiming to be a plan).
REFRESH_ARGS=()
[[ "$DRY_RUN" -eq 0 ]] && REFRESH_ARGS+=(--apply)
[[ "$REPLACE_COPIES" -eq 1 ]] && REFRESH_ARGS+=(--replace-copies)
[[ -n "$HOSTS" ]] && REFRESH_ARGS+=(--hosts "$HOSTS")
python3 "$REPO_DIR/scripts/refresh-host-links.py" \
  "${REFRESH_ARGS[@]+"${REFRESH_ARGS[@]}"}"

step "6/6 verification"
FAIL=0
if [[ "$DRY_RUN" -eq 0 ]]; then
  for HOST_ID in ${HOSTS//,/ }; do
    case "$HOST_ID" in
      claude) ROOT="$HOME/.claude/skills" ;;
      pi) ROOT="$HOME/.pi/agent/skills" ;;
      gjc) ROOT="$HOME/.gjc/agent/skills" ;;
      antigravity) ROOT="$HOME/.gemini/antigravity-cli/skills" ;;
      cursor) ROOT="$HOME/.cursor/skills" ;;
      aside-user) ROOT="$HOME/.aside/u/0/skills/user" ;;
      opencode-config) ROOT="$HOME/.config/opencode/skills" ;;
      *) continue ;;
    esac
    if [[ -d "$ROOT" ]]; then
      BROKEN=$(find "$ROOT" -maxdepth 1 -type l | while read -r LINK; do
        [[ -e "$LINK" ]] || echo "$LINK"
      done | wc -l | tr -d ' ')
      printf '%s: broken_links=%s\n' "$ROOT" "$BROKEN"
      [[ "$BROKEN" -eq 0 ]] || FAIL=1
    fi
  done
  echo "---"
  if [[ "$FAIL" -eq 0 ]]; then
    echo "verification: PASS"
  else
    echo "verification: FAIL (broken links above)" >&2
    exit 5
  fi
else
  echo "verification: skipped (dry-run)"
fi

echo "skills-upgrade: done"
