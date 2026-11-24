#!/usr/bin/env bash
# Guards the triage bot's repository summary (.github/scripts/bot.sh,
# repo_context). Every top-level directory must be visible in it: an earlier
# version printed the first 120 tracked paths alphabetically, which stopped at
# config/ and made the bot tell a contributor that docs/ and scripts/benchmark/
# do not exist.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

eval "$(sed -n '/^repo_context()/,/^}$/p' .github/scripts/bot.sh)"
[ "$(type -t repo_context)" = "function" ] || { echo "repo_context not found in bot.sh"; exit 1; }

out=$(repo_context) || { echo "repo_context failed"; exit 1; }
[ -n "$out" ] || { echo "repo_context printed nothing"; exit 1; }

status=0
while read -r dir; do
  case "$out" in
    *"  $dir/"*) ;;
    *) echo "missing top-level directory in the bot summary: $dir"; status=1 ;;
  esac
done < <(git ls-files | awk -F/ 'NF >= 2 { print $1 }' | sort -u)

# The two paths the truncated list used to hide, asserted by name.
for path in docs scripts/benchmark; do
  case "$out" in
    *"  $path/"*) ;;
    *) echo "missing from the bot summary: $path/"; status=1 ;;
  esac
done

[ "$status" = 0 ] && echo "ok: the bot summary exposes every top-level directory"
exit "$status"
