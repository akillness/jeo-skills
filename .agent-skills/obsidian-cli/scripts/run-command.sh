#!/usr/bin/env bash
set -euo pipefail

OBSIDIAN_BIN="${OBSIDIAN_BIN:-obsidian}"

if (($# >= 2)) && [[ "$1" == "--vault" ]]; then
  VAULT_NAME="$2"
  shift 2
  if (($# == 0)); then
    exec "$OBSIDIAN_BIN" "vault=${VAULT_NAME}"
  fi
  exec "$OBSIDIAN_BIN" "vault=${VAULT_NAME}" "$@"
fi

if (($# == 0)); then
  exec "$OBSIDIAN_BIN"
fi

exec "$OBSIDIAN_BIN" "$@"
