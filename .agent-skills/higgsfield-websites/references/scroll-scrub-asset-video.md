# Scroll scrub video helper asset

Read `references/scroll-scrub.md` first. Copy the fenced source to a temporary
`scroll-scrub-video.sh` file and invoke it with `bash`.

```bash
#!/usr/bin/env bash
# Deterministic boundary-frame extraction and scroll-scrub encoding.

set -euo pipefail

usage() {
  echo "Usage:" >&2
  echo "  $0 bounds <input.mp4> <output-prefix>" >&2
  echo "  $0 desktop <input.mp4> <output.mp4>" >&2
  echo "  $0 mobile <input.mp4> <output.mp4>" >&2
  echo "  $0 poster <input.mp4> <output.png>" >&2
  exit 2
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 127
  }
}

require_input() {
  [ -f "$1" ] || {
    echo "Input file does not exist: $1" >&2
    exit 2
  }
}

ensure_parent() {
  local parent
  parent=$(dirname "$1")
  mkdir -p "$parent"
}

[ "$#" -eq 3 ] || usage
require_command ffmpeg

action=$1
input=$2
output=$3
require_input "$input"

case "$action" in
  bounds)
    ensure_parent "$output-first.png"
    ffmpeg -v error -y -ss 0 -i "$input" \
      -frames:v 1 -q:v 2 "$output-first.png"
    # Reverse buffers this short generated clip, making frame 1 the exact final
    # decoded frame instead of a timestamp approximation near the end.
    ffmpeg -v error -y -i "$input" -vf reverse \
      -frames:v 1 -q:v 2 "$output-last.png"
    ;;
  desktop)
    ensure_parent "$output"
    ffmpeg -v error -y -i "$input" -an \
      -vf "unsharp=5:5:0.8:5:5:0.0" \
      -c:v libx264 -preset slow -crf 20 -pix_fmt yuv420p \
      -g 8 -keyint_min 8 -sc_threshold 0 -movflags +faststart "$output"
    ;;
  mobile)
    ensure_parent "$output"
    ffmpeg -v error -y -i "$input" -an \
      -vf "scale=-2:'min(720,ih)',unsharp=5:5:0.6:5:5:0.0" \
      -c:v libx264 -preset slow -crf 23 -pix_fmt yuv420p \
      -g 4 -keyint_min 4 -sc_threshold 0 -movflags +faststart "$output"
    ;;
  poster)
    ensure_parent "$output"
    ffmpeg -v error -y -ss 0 -i "$input" -frames:v 1 -q:v 2 "$output"
    ;;
  *)
    usage
    ;;
esac
```
