#!/usr/bin/env bash
# new_film.sh <folder> [--example starter|kaiju-postal|tour] [--force]
# Start a film folder: the engine, an example spec.js to edit, the locked Playwright (npm ci), a .venv with the
# pinned Python packages, the fonts, and audio/sfx, art and out folders.
# The folder must be new or empty. --force finishes a scaffold that stopped part way, or refreshes the engine
# after a skill update: it replaces the engine files and keeps spec.js, logo.svg, custom.js, audio/, art/,
# out/ and the package files.
# Needs Node 20 or newer, and uv (preferred: it fetches Python 3.12) or python3 3.12 or newer.
set -euo pipefail
K="$(cd "$(dirname "$0")/.." && pwd)"

usage() {
  echo "usage: new_film.sh <folder> [--example starter|kaiju-postal|tour] [--force]" >&2
  exit 1
}
DIR=""
EXAMPLE=starter
FORCE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --example)
      [ $# -ge 2 ] || usage
      EXAMPLE="$2"
      shift 2
      ;;
    --force)
      FORCE=1
      shift
      ;;
    -*) usage ;;
    *)
      [ -z "$DIR" ] || usage
      DIR="$1"
      shift
      ;;
  esac
done
[ -n "$DIR" ] || usage

case "$EXAMPLE" in "" | */* | .*) EXAMPLE="?$EXAMPLE" ;; esac
if [ ! -d "$K/assets/examples/$EXAMPLE" ]; then
  echo "unknown example: $EXAMPLE (choose from: $(ls "$K/assets/examples" | tr '\n' ' '))" >&2
  exit 1
fi
if [ -d "$DIR" ] && [ -n "$(ls -A "$DIR")" ] && [ "$FORCE" != 1 ]; then
  echo "$DIR is not empty. To finish a scaffold that stopped part way, or to refresh the engine files, run:" >&2
  echo "  bash $K/scripts/new_film.sh $DIR --force   (keeps spec.js, logo.svg, custom.js, audio/, art/, out/)" >&2
  exit 1
fi
if { [ -f "$DIR/package.json" ] && [ ! -f "$DIR/package-lock.json" ]; } ||
  { [ -f "$DIR/package-lock.json" ] && [ ! -f "$DIR/package.json" ]; }; then
  echo "Keep both package.json and package-lock.json in $DIR, or remove both." >&2
  exit 1
fi

# check the tools before touching the folder
for tool in node npm curl; do
  command -v "$tool" >/dev/null || {
    echo "$tool was not found: install it (Node 20 or newer brings npm)" >&2
    exit 1
  }
done
node_major=$(node -p 'process.versions.node.split(".")[0]')
if [ "$node_major" -lt 20 ]; then
  echo "Node $node_major is too old: Playwright needs Node 20 or newer" >&2
  exit 1
fi
if ! command -v uv >/dev/null &&
  ! python3 -c 'import sys; sys.exit(sys.version_info < (3, 12))' 2>/dev/null; then
  echo "Python 3.12 or newer is needed (numpy 2.5.4): install uv, which fetches it, or a newer python3" >&2
  exit 1
fi

STEP=""
on_exit() {
  local code=$?
  if [ "$code" -ne 0 ] && [ -n "$STEP" ]; then
    echo "new_film.sh stopped while $STEP. Fix the cause above, then finish the folder with:" >&2
    echo "  bash $K/scripts/new_film.sh $DIR --force" >&2
  fi
}
trap on_exit EXIT

STEP="copying the engine and the $EXAMPLE example"
mkdir -p "$DIR/audio/sfx" "$DIR/art" "$DIR/out"
cp "$K"/assets/engine/* "$DIR"/
for f in "$K/assets/examples/$EXAMPLE"/*; do
  [ -e "$DIR/$(basename "$f")" ] || cp "$f" "$DIR"/
done
# keep a folder's own (maybe customized) dependency pair
if [ ! -f "$DIR/package.json" ]; then
  cp "$K/assets/npm/package.json" "$K/assets/npm/package-lock.json" "$DIR"/
fi

STEP="installing Playwright (npm ci)"
(cd "$DIR" && npm ci --ignore-scripts --no-audit --no-fund >/dev/null)

STEP="building the Python environment (.venv)"
export UV_NATIVE_TLS=1 # uv ignores the system certificate store by default and fails behind a TLS-inspecting proxy
if command -v uv >/dev/null; then
  [ -x "$DIR/.venv/bin/python" ] || uv venv -q "$DIR/.venv" --python 3.12
  uv pip install -q --python "$DIR/.venv/bin/python" -r "$K/assets/requirements.txt"
else
  [ -x "$DIR/.venv/bin/python" ] || python3 -m venv "$DIR/.venv"
  "$DIR/.venv/bin/python" -m pip install -q -r "$K/assets/requirements.txt"
fi
if ! "$DIR/.venv/bin/python" -c 'import sys; sys.exit(sys.version_info < (3, 12))'; then
  echo "$DIR/.venv runs a Python older than 3.12: remove $DIR/.venv" >&2
  exit 1
fi

STEP="fetching the fonts"
bash "$K/scripts/get_fonts.sh" "$DIR" >/dev/null
STEP=""

echo "film folder ready: $DIR ($EXAMPLE). Edit spec.js, then preview:"
echo "  cd $DIR && python3 -m http.server 5671   (http://127.0.0.1:5671: space plays, arrows step one beat)"
echo "Scripts run from the folder with its Python: .venv/bin/python $K/scripts/render.py . --res 1080"
echo "If Google Chrome is not installed: (cd $DIR && npx playwright install chromium)"
command -v ffmpeg >/dev/null && command -v ffprobe >/dev/null ||
  echo "ffmpeg and ffprobe were not found: install them before mix.py, render.py and finish.py"
