#!/usr/bin/env bash
# After a publish (or on a draft URL before promoting it): does the site actually work?
# Checks the page and every script and image it references, plus optional gate checks and extra paths.
# A page that returns 200 while its art returns 404 is a broken deploy (for example one that shipped without its edge
# function). Exit 1 if anything is broken.
#   verify-live.sh <url> [extra-path ...]
# env (optional, for sites behind a sign-in gate):
#   AUTH_PATH=/auth/session       POSTed without a token: 404 means the gate is missing; 400/401/403 means it answers
#   PRIVATE_PATH=/models/x.glb    fetched without a session: must be refused (401/403/3xx); 200 = ungated, 404 = missing
set -uo pipefail
URL="${1:-${LIVE_URL:-}}"; [ -n "$URL" ] || { echo "usage: verify-live.sh <url> [extra-path ...]"; exit 1; }; shift || true; URL="${URL%/}"
tmp=$(mktemp); code=$(curl -s -o "$tmp" -w '%{http_code}' "$URL/")
echo "page  $URL/  $code"
bad=0; [ "${code:0:1}" = 2 ] || bad=1
for p in $(grep -oE '(src|href)="/[^"]+"' "$tmp" | sed -E 's/^(src|href)="//; s/"$//' | sort -u | head -10) "$@"; do
  c=$(curl -s -o /dev/null -w '%{http_code}' "$URL$p"); echo "      $p  $c"
  case "$c" in 2*|3*) ;; *) bad=$((bad+1)) ;; esac
done
if [ -n "${AUTH_PATH:-}" ]; then
  auth=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H "Origin: $URL" "$URL$AUTH_PATH")
  echo "      $AUTH_PATH (POST, no token)  $auth   (404 = gate missing; 400/401/403 = gate answering)"
  [ "$auth" = 404 ] && bad=$((bad+1))
fi
if [ -n "${PRIVATE_PATH:-}" ]; then
  priv=$(curl -s -o /dev/null -w '%{http_code}' "$URL$PRIVATE_PATH")
  echo "      $PRIVATE_PATH (no session)  $priv   (expect 401/403 or 3xx; 200 = ungated, 404 = missing)"
  case "$priv" in 401|403|3*) ;; *) bad=$((bad+1)) ;; esac
fi
rm -f "$tmp"
[ "$bad" = 0 ] && echo "OK" || { echo "BROKEN: $bad check(s) failed"; exit 1; }
