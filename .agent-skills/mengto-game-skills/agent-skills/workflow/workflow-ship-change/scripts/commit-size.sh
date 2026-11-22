#!/usr/bin/env bash
# Measured size of a commit (or of what is staged), for the report the user asks for with every commit:
# how many files it changes, the total size of the new or changed files, and the largest ones.
#   commit-size.sh            size of the staged changes (run before committing)
#   commit-size.sh <rev>      size of that commit (default comparison: its first parent)
set -uo pipefail
if [ $# -eq 0 ]; then
  list=$(git diff --cached --name-status); side=':'; label="staged"
else
  list=$(git diff --name-status "$1^" "$1"); side="$1:"; label="$(git log -1 --format='%h %s' "$1" | cut -c1-70)"
fi
[ -n "$list" ] || { echo "nothing to measure ($label)"; exit 0; }
total=0; rows=""; count=0; deleted=0
while IFS=$'\t' read -r status path rest; do
  count=$((count+1))
  [ -n "$rest" ] && path="$rest"          # renames: take the new path
  case "$status" in D*) deleted=$((deleted+1)); continue ;; esac
  size=$(git cat-file -s "$side$path" 2>/dev/null || echo 0)
  total=$((total+size)); rows+="$size	$path"$'\n'
done <<< "$list"
human() { awk -v b="$1" 'BEGIN{ if (b>=1048576) printf "%.2f MiB", b/1048576; else if (b>=1024) printf "%.1f KiB", b/1024; else printf "%d B", b }'; }
echo "commit: $label"
echo "files changed: $count ($deleted deleted)   size of new or changed files: $(human $total) ($total bytes)"
echo "largest:"
printf '%s' "$rows" | sort -rn | head -5 | while IFS=$'\t' read -r s p; do echo "  $(human "$s")  $p"; done
