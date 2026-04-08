#!/usr/bin/env bash
set -euo pipefail

SHOW=0

usage() {
  cat <<'EOF'
Usage: bash scripts/check-status.sh [--show]

Options:
  --show     Also run rtk init --show when RTK is installed
  -h, --help Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --show)
      SHOW=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      printf '[rtk-status][error] Unknown argument: %s\n' "$1" >&2
      exit 1
      ;;
  esac
done

say() {
  printf '[rtk-status] %s\n' "$*"
}

warn() {
  printf '[rtk-status][warn] %s\n' "$*" >&2
}

if ! command -v rtk >/dev/null 2>&1; then
  warn "rtk is not installed or not on PATH."
  exit 0
fi

say "binary: $(command -v rtk)"
say "version: $(rtk --version)"

if rtk gain >/dev/null 2>&1; then
  say "verification: correct RTK detected because 'rtk gain' succeeded."
else
  warn "'rtk gain' failed. This often means the wrong rtk package is installed."
fi

case ":${PATH}:" in
  *":$HOME/.local/bin:"*) say "path: ~/.local/bin present" ;;
  *) warn "path: ~/.local/bin not detected" ;;
esac

case ":${PATH}:" in
  *":$HOME/.cargo/bin:"*) say "path: ~/.cargo/bin present" ;;
  *) warn "path: ~/.cargo/bin not detected" ;;
esac

if [[ "$SHOW" -eq 1 ]]; then
  say "running: rtk init --show"
  rtk init --show || true
fi
