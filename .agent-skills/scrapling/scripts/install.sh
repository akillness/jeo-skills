#!/usr/bin/env bash
set -euo pipefail

PYTHON_BIN="${PYTHON_BIN:-python3}"
PROFILE="${PROFILE:-all}"
SCRAPLING_SPEC=""
FORCE_FLAG=""

while (($# > 0)); do
  case "$1" in
    --profile)
      PROFILE="$2"
      shift 2
      ;;
    --force)
      FORCE_FLAG="--force"
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      echo "Usage: bash scripts/install.sh [--profile parser|fetchers|shell|ai|all] [--force]" >&2
      exit 2
      ;;
  esac
done

if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  echo "Python interpreter not found: $PYTHON_BIN" >&2
  exit 1
fi

case "$PROFILE" in
  parser)
    SCRAPLING_SPEC="scrapling>=0.4.2"
    ;;
  fetchers)
    SCRAPLING_SPEC='scrapling[fetchers]>=0.4.2'
    ;;
  shell)
    SCRAPLING_SPEC='scrapling[shell]>=0.4.2'
    ;;
  ai)
    SCRAPLING_SPEC='scrapling[ai]>=0.4.2'
    ;;
  all)
    SCRAPLING_SPEC='scrapling[all]>=0.4.2'
    ;;
  *)
    echo "Unsupported profile: $PROFILE" >&2
    exit 2
    ;;
esac

"$PYTHON_BIN" -m pip install "$SCRAPLING_SPEC"
"$PYTHON_BIN" -c 'import scrapling; print(f"scrapling {scrapling.__version__}")'

if [[ "$PROFILE" != "parser" ]]; then
  "$PYTHON_BIN" -m scrapling.cli install ${FORCE_FLAG:+$FORCE_FLAG}
fi
