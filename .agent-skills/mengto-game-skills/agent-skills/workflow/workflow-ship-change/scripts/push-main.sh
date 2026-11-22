#!/usr/bin/env bash
# Push HEAD to origin/main the safe way, and measure it.
#  1. refuses unless HEAD already contains origin/main (a fast-forward: no force, ever)
#  2. measures the pack git will send; over 50 MB (the whole push) it stops so you can ask the user (exit 3)
#  3. pushes with --progress so git prints its "Writing objects" line even without a terminal, and reports it
#  4. fetches and confirms origin/main is exactly HEAD
#   push-main.sh [--limit-mb 50]
set -uo pipefail
LIMIT_MB=50; [ "${1:-}" = "--limit-mb" ] && LIMIT_MB="$2"
git fetch -q origin || { echo "fetch failed"; exit 1; }
head=$(git rev-parse HEAD); main=$(git rev-parse origin/main)
if ! git merge-base --is-ancestor "$main" "$head"; then
  echo "NOT A FAST-FORWARD: origin/main ${main:0:8} moved. Rebase or merge origin/main, re-run the tests the incoming commits touch, then push again."
  exit 1
fi
[ "$head" = "$main" ] && { echo "nothing to push: HEAD is origin/main (${head:0:8})"; exit 0; }
commits=$(git rev-list --count "$main..$head")
pack=$(printf '%s\n^%s\n' "$head" "$main" | git pack-objects --stdout --revs --thin 2>/dev/null | wc -c | tr -d ' ')
mib=$(awk -v b="$pack" 'BEGIN{printf "%.2f", b/1048576}')
echo "to push: $commits commit(s), pack about $mib MiB ($pack bytes)"
if awk -v b="$pack" -v l="$LIMIT_MB" 'BEGIN{exit !(b > l*1000*1000)}'; then
  echo "OVER ${LIMIT_MB} MB: ask the user before pushing (state this size). Do not split it to get under."
  exit 3
fi
out=$(git push --progress origin HEAD:main 2>&1); status=$?
printf '%s\n' "$out" | tr '\r' '\n' | grep -E 'Writing objects: 100%|Total |->|rejected|error|fatal' | sed 's/^/  /'
[ $status -eq 0 ] || { echo "PUSH FAILED (exit $status)"; exit $status; }
git fetch -q origin
if [ "$(git rev-parse origin/main)" = "$head" ]; then echo "confirmed: origin/main is ${head:0:8}"; else echo "NOT CONFIRMED: origin/main is $(git rev-parse --short origin/main), HEAD is ${head:0:8}"; exit 1; fi
