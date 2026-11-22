#!/usr/bin/env bash
# Download the anatomy/heart payloads listed in examples/assets-manifest.json into
# examples/public/assets/, which is git-ignored: the 169 MB of STL lives in the R2 bucket, not in
# the repository. Files already present with the manifest's sha256 are left alone, so a re-run is
# cheap and interrupted runs resume.
#
# Usage: bash examples/scripts/fetch-assets.sh [--force] [--manifest]
#   --force     re-download even when the local file already matches
#   --manifest  regenerate assets-manifest.json from the local files instead of downloading
# Env: ASSET_BASE  override the manifest's `base` (must end with `/`)
# Exit codes: 0 ok · 1 a download or checksum failed · 2 usage
set -euo pipefail

ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
MANIFEST="$ROOT/assets-manifest.json"
TARGET="$ROOT/public/assets"

FORCE=0
MODE=fetch
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    --manifest) MODE=manifest ;;
    *) echo "usage: fetch-assets.sh [--force] [--manifest]" >&2; exit 2 ;;
  esac
done

command -v python3 >/dev/null || { echo "fetch-assets: python3 is required" >&2; exit 1; }

if [ "$MODE" = manifest ]; then
  # Rewrite the manifest from whatever is on disk. Only run this after intentionally adding,
  # removing or replacing an asset — and upload the same files to the bucket.
  python3 - "$TARGET" "$MANIFEST" <<'PY'
import hashlib, json, pathlib, sys
target, manifest_path = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
base = json.loads(manifest_path.read_text())['base'] if manifest_path.exists() else ''
files = sorted(p for p in target.rglob('*')
               if p.is_file() and p.suffix in {'.stl', '.json'}
               and not any(part.startswith('.') for part in p.relative_to(target).parts))
entries = [{'key': p.relative_to(target).as_posix(), 'bytes': p.stat().st_size,
            'sha256': hashlib.sha256(p.read_bytes()).hexdigest()} for p in files]
manifest = {'note': 'Every file the anatomy studies fetch from ASSET_BASE. Regenerate with '
                    'examples/scripts/fetch-assets.sh --manifest after changing the assets.',
            'base': base, 'files': entries}
manifest_path.write_text(json.dumps(manifest, indent=1) + '\n')
print(f'{len(entries)} files · {sum(e["bytes"] for e in entries)} bytes -> {manifest_path.name}')
PY
  exit 0
fi

[ -f "$MANIFEST" ] || { echo "fetch-assets: $MANIFEST is missing" >&2; exit 1; }
command -v curl >/dev/null || { echo "fetch-assets: curl is required" >&2; exit 1; }

# `shasum` ships with macOS, `sha256sum` with most Linux images; either is fine.
if command -v shasum >/dev/null; then SHA=(shasum -a 256)
elif command -v sha256sum >/dev/null; then SHA=(sha256sum)
else echo "fetch-assets: no shasum or sha256sum on PATH" >&2; exit 1; fi

# One `key<TAB>bytes<TAB>sha256` line per file, plus the manifest base on the first line.
listing=$(python3 - "$MANIFEST" <<'PY'
import json, pathlib, sys
manifest = json.loads(pathlib.Path(sys.argv[1]).read_text())
print(manifest.get('base', ''))
for entry in manifest['files']:
    key = entry['key']
    if key.startswith('/') or '..' in key.split('/'):
        raise SystemExit(f'unsafe key in manifest: {key}')
    print(f'{key}\t{entry["bytes"]}\t{entry["sha256"]}')
PY
)

manifest_base=$(printf '%s\n' "$listing" | head -1)
BASE=${ASSET_BASE:-$manifest_base}
case "$BASE" in
  */) ;;
  '') echo "fetch-assets: no base URL; set ASSET_BASE or fix the manifest" >&2; exit 1 ;;
  *) BASE="$BASE/" ;;
esac

echo "==> base $BASE"
echo "==> target $TARGET"

downloaded=0 skipped=0 failed=0
while IFS=$'\t' read -r key bytes want; do
  [ -n "$key" ] || continue
  path="$TARGET/$key"
  if [ "$FORCE" -eq 0 ] && [ -f "$path" ]; then
    have=$("${SHA[@]}" "$path" | cut -d' ' -f1)
    if [ "$have" = "$want" ]; then skipped=$((skipped + 1)); continue; fi
    echo "!! $key checksum differs locally, re-downloading"
  fi
  mkdir -p "$(dirname -- "$path")"
  tmp="$path.part"
  if ! curl --fail --location --silent --show-error --retry 3 --retry-delay 2 \
       --output "$tmp" "$BASE$key"; then
    rm -f "$tmp"
    echo "!! $key download failed" >&2
    failed=$((failed + 1))
    continue
  fi
  have=$("${SHA[@]}" "$tmp" | cut -d' ' -f1)
  if [ "$have" != "$want" ]; then
    rm -f "$tmp"
    echo "!! $key sha256 mismatch (expected $want, got $have)" >&2
    failed=$((failed + 1))
    continue
  fi
  mv "$tmp" "$path"
  downloaded=$((downloaded + 1))
  printf '   %-34s %8.2f MB\n' "$key" "$(awk -v b="$bytes" 'BEGIN{print b / 1048576}')"
done < <(printf '%s\n' "$listing" | tail -n +2)

echo
echo "downloaded=$downloaded up-to-date=$skipped failed=$failed"
[ "$failed" -eq 0 ] || exit 1
echo "assets ready under public/assets/ — the studies now load them from /assets/"
