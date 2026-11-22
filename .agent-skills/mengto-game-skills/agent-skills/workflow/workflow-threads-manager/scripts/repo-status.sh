#!/usr/bin/env bash
# The repository side of a threads check: where main is, which local branches hold commits main lacks, and which
# worktrees hold uncommitted edits (with the newest edit time, so an active thread can be told from an abandoned one).
#   repo-status.sh [repo]        (default: the current checkout's top level)
# Slow on a busy machine with many worktrees: run it with run_in_background and read the output file.
set -uo pipefail
REPO="${1:-$(git rev-parse --show-toplevel)}"
cd "$REPO" || exit 1
git fetch -q origin 2>/dev/null
echo "now      $(date '+%Y-%m-%d %H:%M %Z')"
echo "main     $(git log -1 --format='%h %cd  %s' --date=format:'%m-%d %H:%M' origin/main | cut -c1-110)"
echo
echo "# local branches with commits not on origin/main"
found=0
for b in $(git for-each-ref --format='%(refname:short)' refs/heads/); do
  n=$(git rev-list --count "origin/main..$b" 2>/dev/null || echo 0)
  [ "$n" -gt 0 ] || continue
  found=1
  wt=$(git worktree list --porcelain | awk -v b="refs/heads/$b" '/^worktree /{w=$2} $0=="branch "b{print w}')
  printf '%-44s +%-3s %-16s %s\n' "$b" "$n" "$(git log -1 --format='%cr' "$b")" "${wt:+[$(basename "$wt")]} $(git log -1 --format='%s' "$b" | cut -c1-60)"
done
[ "$found" = 1 ] || echo "(none)"
echo
echo "# worktrees with uncommitted tracked edits"
found=0
git worktree list --porcelain | awk '/^worktree /{w=$2} /^locked/{l[w]=1} END{for (k in l) print "LOCKED " k}' > /tmp/.repo-status-locked.$$
git worktree list --porcelain | awk '/^worktree /{print $2}' | while read -r w; do
  [ -d "$w" ] || continue
  files=$(git -C "$w" status --porcelain 2>/dev/null | grep -v '^??' | awk '{print $NF}')
  [ -n "$files" ] || continue
  count=$(printf '%s\n' "$files" | wc -l | tr -d ' ')
  newest=$(printf '%s\n' "$files" | head -60 | while read -r f; do stat -f '%m' "$w/$f" 2>/dev/null || stat -c '%Y' "$w/$f" 2>/dev/null; done | sort -n | tail -1)
  when=$( [ -n "$newest" ] && (date -r "$newest" '+%m-%d %H:%M' 2>/dev/null || date -d "@$newest" '+%m-%d %H:%M') )
  lock=$(grep -qx "LOCKED $w" /tmp/.repo-status-locked.$$ && echo locked)
  printf '%-40s %-36s %4s files  newest %s %s\n' "$(basename "$w")" "[$(git -C "$w" rev-parse --abbrev-ref HEAD 2>/dev/null)]" "$count" "${when:-?}" "$lock"
  found=1
done
rm -f /tmp/.repo-status-locked.$$
