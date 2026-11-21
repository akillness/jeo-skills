#!/usr/bin/env bash
# install.sh - check requirements, then link (or copy) this folder into a skills directory.
#
# Usage:  bash install.sh [--dir ~/.claude/skills/motionmaxxing] [--copy] [--force]
#   default target   ~/.claude/skills/motionmaxxing  (Claude Code user skills)
#   --dir PATH       install somewhere else (any agent that reads a SKILL.md folder)
#   --copy           copy files instead of symlinking this checkout
#   --force          replace an existing target
# Nothing is downloaded or installed system-wide; missing requirements are reported, not fixed.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="$HOME/.claude/skills/motionmaxxing"; COPY=0; FORCE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --dir) TARGET="${2:?--dir needs a path}"; shift 2;;
    --copy) COPY=1; shift;;
    --force) FORCE=1; shift;;
    -h|--help) sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 0;;
    *) echo "unknown option: $1 (try --help)" >&2; exit 2;;
  esac
done

ok()   { printf '  [ok]   %s\n' "$1"; }
bad()  { printf '  [miss] %s\n' "$1"; MISSING=1; }
note() { printf '  [opt]  %s\n' "$1"; }
MISSING=0
REPORT="$(mktemp)"; trap 'rm -f "$REPORT"' EXIT

echo "motionmaxxing: checking requirements"
if command -v node >/dev/null 2>&1 && node -e 'process.exit(+process.versions.node.split(".")[0] >= 22 ? 0 : 1)'; then ok "node $(node -v)"; else bad "Node 22+ (https://nodejs.org)"; fi
if command -v python3 >/dev/null 2>&1 && python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)'; then ok "python3 $(python3 -V 2>&1 | awk '{print $2}')"; else bad "Python 3.9+"; fi
if command -v ffmpeg >/dev/null 2>&1; then ok "ffmpeg $(ffmpeg -version 2>/dev/null | head -1 | awk '{print $3}')"; else bad "ffmpeg (brew install ffmpeg)"; fi
bash "$HERE/scripts/providers.sh" >"$REPORT" 2>/dev/null || true
if grep -q '"chrome": "' "$REPORT"; then ok "Google Chrome"; else bad "Google Chrome (set CHROME_PATH if it is somewhere unusual)"; fi
if grep -q '"key": true' "$REPORT"; then ok "ElevenLabs key found (voice, sfx, music)"; else note "no ElevenLabs key: films are made without voice or music (set ELEVENLABS_API_KEY)"; fi
if grep -q '"image_generation": true' "$REPORT"; then ok "Codex image generation (surface plates)"; else note "Codex CLI image generation not available: surfaces come from code or captured assets"; fi

if [ "$MISSING" != 0 ]; then
  echo; echo "Install the missing requirements above, then run this again. Nothing was changed." >&2; exit 1
fi

echo
PARENT="$(cd "$(dirname "$TARGET")" 2>/dev/null && pwd || true)"
if [ -n "$PARENT" ] && [ "$PARENT/$(basename "$TARGET")" = "$HERE" ]; then
  echo "Already installed at $HERE"; exit 0
fi
if [ -e "$TARGET" ] || [ -L "$TARGET" ]; then
  [ "$FORCE" = 1 ] || { echo "$TARGET already exists. Re-run with --force to replace it." >&2; exit 1; }
  rm -rf "$TARGET"
fi
mkdir -p "$(dirname "$TARGET")"
if [ "$COPY" = 1 ]; then
  mkdir -p "$TARGET"
  (cd "$HERE" && tar --exclude=.git --exclude=docs/media -cf - .) | (cd "$TARGET" && tar -xf -)
  echo "Copied to $TARGET (docs/media left out)"
else
  ln -s "$HERE" "$TARGET"; echo "Linked $TARGET -> $HERE"
fi
echo "Done. In Claude Code, ask for a motion graphic or run /motionmaxxing."
