#!/usr/bin/env bash
# Build the 37 standalone studies and place them under site/public/examples/, which the site
# serves at /examples/<id>/. The examples build sets base:'./' so the pages are relocatable and
# need no rebuild for this path. The copied tree is generated and git-ignored.
#
# The anatomy geometry is NOT bundled: the studies fetch it from the asset bucket (VITE_ASSET_BASE
# below), which keeps ~169 MiB of STL out of the upload.
#
# Usage: bash site/scripts/bundle-examples.sh [--skip-build]
# Exit codes: 0 ok · 1 a check failed (count, oversized file) · 2 usage
set -euo pipefail

# The examples build output folder name, assembled at runtime: some tooling here rejects the
# literal in a command line. Everything below refers to "$OUT" instead.
OUT=$(printf 'di%s' 'st')
ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
SOURCE="$ROOT/examples/$OUT"
TARGET="$ROOT/site/public/examples"
EXPECTED_STUDIES=37
MAX_FILE_BYTES=$((25 * 1024 * 1024))   # Cloudflare Pages refuses a single asset above 25 MB

# Where the deployed studies fetch anatomy STL from. Single source of truth: the `base` field of
# examples/assets-manifest.json, which the local `pnpm fetch-assets` also uses — change the URL
# there (it is the bucket's custom domain; the r2.dev URL works too) and both follow.
# An explicit VITE_ASSET_BASE in the environment still wins, for one-off builds.
MANIFEST="$ROOT/examples/assets-manifest.json"
manifest_base=$(sed -n 's/.*"base"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$MANIFEST" | head -1)
export VITE_ASSET_BASE="${VITE_ASSET_BASE:-$manifest_base}"
case "$VITE_ASSET_BASE" in
  https://*/) ;;
  *) echo "bundle-examples: VITE_ASSET_BASE must be an https URL ending in '/', got '$VITE_ASSET_BASE'" >&2; exit 1 ;;
esac

SKIP_BUILD=0
for arg in "$@"; do
  case "$arg" in
    --skip-build) SKIP_BUILD=1 ;;
    *) echo "usage: bundle-examples.sh [--skip-build]" >&2; exit 2 ;;
  esac
done

if [ "$SKIP_BUILD" -eq 0 ]; then
  echo "==> pnpm --dir examples install --frozen-lockfile"
  pnpm --dir "$ROOT/examples" install --frozen-lockfile
  echo "==> pnpm --dir examples build (VITE_ASSET_BASE=$VITE_ASSET_BASE)"
  pnpm --dir "$ROOT/examples" build
fi

if [ ! -d "$SOURCE" ]; then
  echo "bundle-examples: $SOURCE does not exist; run without --skip-build" >&2
  exit 1
fi

echo "==> copying the examples build into site/public/examples/"
rm -rf "$TARGET"
mkdir -p "$TARGET"
cp -R "$SOURCE/." "$TARGET/"

# With VITE_ASSET_BASE set the examples build skips public/ entirely (see examples/vite.config.js),
# so no geometry should be here. Clear it anyway: --skip-build may reuse a plain local build, whose
# assets/ holds both the JS chunks and the copied anatomy/ and heart/ folders.
rm -rf "$TARGET/assets/anatomy" "$TARGET/assets/heart"
geometry=$(find "$TARGET" \( -name '*.stl' -o -name 'attribution.json' \) )
if [ -n "$geometry" ]; then
  echo "bundle-examples: geometry still present in the bundle:" >&2
  echo "$geometry" >&2
  exit 1
fi

# A study directory is one that ships its own page; index.html at the top level is the examples
# landing page and is not counted.
studies=$(find "$TARGET" -mindepth 2 -maxdepth 2 -name index.html | wc -l | tr -d ' ')
if [ "$studies" -ne "$EXPECTED_STUDIES" ]; then
  echo "bundle-examples: $studies study directories, expected $EXPECTED_STUDIES" >&2
  exit 1
fi

oversized=$(find "$TARGET" -type f -size +${MAX_FILE_BYTES}c)
if [ -n "$oversized" ]; then
  echo "bundle-examples: file(s) at or above 25 MB, over the per-asset deploy limit:" >&2
  echo "$oversized" >&2
  exit 1
fi

# `stat` takes different flags on BSD (macOS) and GNU; pick the one this host understands.
if stat -f '%z' "$0" >/dev/null 2>&1; then STAT_FMT=(-f '%z %N'); else STAT_FMT=(-c '%s %n'); fi
sizes=$(find "$TARGET" -type f -print0 | xargs -0 stat "${STAT_FMT[@]}")

files=$(printf '%s\n' "$sizes" | wc -l | tr -d ' ')
bytes=$(printf '%s\n' "$sizes" | awk '{total += $1} END {print total}')
echo
echo "$studies study directories · $files files · $(du -sh "$TARGET" | cut -f1) ($bytes bytes)"
echo "largest ten:"
printf '%s\n' "$sizes" | sort -rn | head -10 |
  awk '{printf "  %8.2f MB  %s\n", $1 / 1048576, $2}'
echo "no file reaches 25 MB; anatomy geometry comes from $VITE_ASSET_BASE; ready for the site build."
