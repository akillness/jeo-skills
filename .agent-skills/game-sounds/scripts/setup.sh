#!/usr/bin/env bash
set -euo pipefail

mode="check"
for arg in "$@"; do
  case "$arg" in
    --check|--npm|--clone) mode="${arg#--}" ;;
    -h|--help)
      printf '%s\n' 'usage: setup.sh [--check|--npm|--clone]'
      exit 0
      ;;
    *) printf 'unknown option: %s\n' "$arg" >&2; exit 2 ;;
  esac
done

printf 'platform: %s\n' "$(uname -s 2>/dev/null || printf unknown)"
printf 'node: '; if command -v node >/dev/null 2>&1; then node --version; else printf 'missing\n'; fi
printf 'npm: '; if command -v npm >/dev/null 2>&1; then npm --version; else printf 'missing\n'; fi
printf 'game-sounds: '; if command -v game-sounds >/dev/null 2>&1; then game-sounds status || true; else printf 'missing\n'; fi

if [[ "$mode" == "check" ]]; then
  exit 0
fi

if [[ "$mode" == "npm" ]]; then
  command -v npm >/dev/null 2>&1 || { echo 'npm is required for --npm' >&2; exit 1; }
  exec npm install --global @citedy/game-sounds
fi

command -v git >/dev/null 2>&1 || { echo 'git is required for --clone' >&2; exit 1; }
target="${GAME_SOUNDS_DIR:-$HOME/.claude/plugins/game-sounds}"
if [[ -e "$target" ]]; then
  echo "refusing to overwrite existing directory: $target" >&2
  exit 1
fi
mkdir -p "$(dirname "$target")"
exec git clone https://github.com/Citedy/game-sounds.git "$target"
