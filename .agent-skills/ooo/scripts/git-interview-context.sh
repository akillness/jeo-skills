#!/usr/bin/env bash
# ooo git-interview-context generator.
#
# Grounds the Ouroboros Socratic interview in *live* git evidence instead of
# stale chat memory. Regenerates .ouroboros/interview-context.md from the
# repository's current state so the brownfield Context weighting (15%) is fed
# by updated git data on every interview run.
#
# Idempotent and read-only with respect to the repo: it only writes the
# context file (and its parent dir). Safe to wire into a pre-interview hook.
#
# Env knobs:
#   OOO_GIT_WINDOW=<days>     - churn/contributor lookback window (default: 90)
#   OOO_GIT_COMMITS=<n>       - recent commits to list (default: 20)
#   OOO_GIT_TOP=<n>           - churn hotspot rows (default: 15)
#   OOO_GIT_CONTEXT_OUT=<path>- output file (default: .ouroboros/interview-context.md
#                               under the repo root; "-" writes to stdout)
#
# Usage:
#   bash scripts/git-interview-context.sh
#   OOO_GIT_WINDOW=30 OOO_GIT_TOP=10 bash scripts/git-interview-context.sh
#   OOO_GIT_CONTEXT_OUT=- bash scripts/git-interview-context.sh   # stdout only

set -euo pipefail

log()  { printf '\033[1;34m[ooo-git]\033[0m %s\n' "$*" >&2; }
warn() { printf '\033[1;33m[ooo-git]\033[0m %s\n' "$*" >&2; }

if ! command -v git >/dev/null 2>&1; then
  warn "git is not installed — cannot generate interview context."
  exit 1
fi

if ! REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"; then
  warn "not inside a git repository — greenfield interview needs no git context."
  warn "run again from a repo, or start: ouroboros init start \"<goal>\""
  exit 0
fi

WINDOW_DAYS="${OOO_GIT_WINDOW:-90}"
N_COMMITS="${OOO_GIT_COMMITS:-20}"
N_TOP="${OOO_GIT_TOP:-15}"
OUT="${OOO_GIT_CONTEXT_OUT:-$REPO_ROOT/.ouroboros/interview-context.md}"

BRANCH="$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo detached)"
HEAD_SHA="$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || echo none)"
REMOTE="$(git -C "$REPO_ROOT" remote get-url origin 2>/dev/null || echo none)"
STAGED="$(git -C "$REPO_ROOT" diff --cached --name-only | wc -l | tr -d ' ')"
UNSTAGED="$(git -C "$REPO_ROOT" diff --name-only | wc -l | tr -d ' ')"
UNTRACKED="$(git -C "$REPO_ROOT" ls-files --others --exclude-standard | wc -l | tr -d ' ')"

render() {
  printf '# ooo interview context (generated from live git data)\n\n'
  printf '> Generated: %s · Regenerate before every interview:\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf '> `bash scripts/git-interview-context.sh` (this file is derived — do not hand-edit)\n\n'

  printf '## Repository\n\n'
  printf -- '- root: `%s`\n' "$REPO_ROOT"
  printf -- '- branch: `%s` @ `%s`\n' "$BRANCH" "$HEAD_SHA"
  printf -- '- remote: `%s`\n' "$REMOTE"
  printf -- '- working tree: %s staged · %s unstaged · %s untracked\n\n' \
    "$STAGED" "$UNSTAGED" "$UNTRACKED"

  printf '## Recent commits (last %s)\n\n```\n' "$N_COMMITS"
  git -C "$REPO_ROOT" log --oneline --no-decorate -n "$N_COMMITS" 2>/dev/null || true
  printf '```\n\n'

  printf '## Churn hotspots (top %s files, last %s days)\n\n' "$N_TOP" "$WINDOW_DAYS"
  printf 'Files that change most are where constraints and regressions live.\n\n```\n'
  git -C "$REPO_ROOT" log --since="${WINDOW_DAYS} days ago" --name-only --pretty=format: 2>/dev/null \
    | sed '/^$/d' | sort | uniq -c | sort -rn | head -n "$N_TOP" || true
  printf '```\n\n'

  printf '## Active contributors (last %s days)\n\n```\n' "$WINDOW_DAYS"
  git -C "$REPO_ROOT" shortlog -sn --since="${WINDOW_DAYS} days ago" HEAD 2>/dev/null || true
  printf '```\n\n'

  printf '## How the interview must use this\n\n'
  printf -- '- Brownfield gate: Goal 35%% + Constraints 25%% + Success 25%% + **Context 15%%** — score Context against THIS file, not memory.\n'
  printf -- '- Ask about churn hotspots before proposing changes that touch them.\n'
  printf -- '- A dirty working tree (staged/unstaged > 0) is an interview question, not an assumption.\n'
  printf -- '- Seed constraints that contradict recent commit direction must be surfaced during the interview, not discovered at evaluate.\n'
}

if [ "$OUT" = "-" ]; then
  render
  exit 0
fi

mkdir -p "$(dirname "$OUT")"
render > "$OUT"
log "wrote $OUT (branch $BRANCH @ $HEAD_SHA, window ${WINDOW_DAYS}d)"
