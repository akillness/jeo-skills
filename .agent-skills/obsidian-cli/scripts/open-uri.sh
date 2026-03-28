#!/usr/bin/env bash
set -euo pipefail

if (($# != 1)); then
  echo "Usage: bash scripts/open-uri.sh 'obsidian://open?...'" >&2
  exit 2
fi

URI="$1"

case "$OSTYPE" in
  darwin*)
    exec open "$URI"
    ;;
  linux*)
    exec xdg-open "$URI"
    ;;
  msys*|cygwin*|win32*)
    exec cmd.exe /c start "" "$URI"
    ;;
  *)
    echo "Unsupported platform for automatic URI opening: $OSTYPE" >&2
    exit 1
    ;;
esac
