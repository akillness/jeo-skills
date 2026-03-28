#!/usr/bin/env bash

set -euo pipefail

MODE=""
NON_INTERACTIVE=false
BROWSER_OFF=false
DRY_RUN=false
CONFIG_FILE=""
INSTRUCTION=""
INSTRUCTION_FILE=""
declare -a TARGETS=()
declare -a EXTRA_ARGS=()

usage() {
  cat <<'EOF'
Usage: bash scripts/run-scan.sh --target <target> [options] [-- extra strix args]

Options:
  --target, -t <target>         Add a target. Repeat for multi-target scans.
  --scan-mode, -m <mode>        quick | standard | deep
  --instruction <text>          Inline scope or credential instructions
  --instruction-file <file>     File-based instructions
  --config <file>               Custom Strix config file
  --non-interactive, -n         Headless mode
  --browser-off                 Export STRIX_DISABLE_BROWSER=true for this run
  --dry-run                     Print the command without executing
  -h, --help                    Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target|-t)
      TARGETS+=("${2:-}")
      shift 2
      ;;
    --scan-mode|-m)
      MODE="${2:-}"
      shift 2
      ;;
    --instruction)
      INSTRUCTION="${2:-}"
      shift 2
      ;;
    --instruction-file)
      INSTRUCTION_FILE="${2:-}"
      shift 2
      ;;
    --config)
      CONFIG_FILE="${2:-}"
      shift 2
      ;;
    --non-interactive|-n)
      NON_INTERACTIVE=true
      shift
      ;;
    --browser-off)
      BROWSER_OFF=true
      shift
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --)
      shift
      EXTRA_ARGS+=("$@")
      break
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if ! command -v strix >/dev/null 2>&1; then
  echo "Strix is not installed. Run bash scripts/install.sh first." >&2
  exit 1
fi

if [[ ${#TARGETS[@]} -eq 0 ]]; then
  echo "At least one --target is required." >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1 || ! docker info >/dev/null 2>&1; then
  echo "Docker must be available and running before invoking Strix." >&2
  exit 1
fi

if [[ -z "${STRIX_LLM:-}" ]]; then
  echo "Warning: STRIX_LLM is not set. Strix may fail without an explicit model configuration." >&2
fi

declare -a CMD=(strix)

for target in "${TARGETS[@]}"; do
  CMD+=(--target "$target")
done

if [[ -n "$MODE" ]]; then
  CMD+=(--scan-mode "$MODE")
fi

if [[ -n "$INSTRUCTION" ]]; then
  CMD+=(--instruction "$INSTRUCTION")
fi

if [[ -n "$INSTRUCTION_FILE" ]]; then
  CMD+=(--instruction-file "$INSTRUCTION_FILE")
fi

if [[ -n "$CONFIG_FILE" ]]; then
  CMD+=(--config "$CONFIG_FILE")
fi

if [[ "$NON_INTERACTIVE" == true ]]; then
  CMD+=(--non-interactive)
fi

if [[ ${#EXTRA_ARGS[@]} -gt 0 ]]; then
  CMD+=("${EXTRA_ARGS[@]}")
fi

if [[ "$BROWSER_OFF" == true ]]; then
  export STRIX_DISABLE_BROWSER=true
fi

printf 'Running:' >&2
for part in "${CMD[@]}"; do
  printf ' %q' "$part" >&2
done
printf '\n' >&2

if [[ "$DRY_RUN" == true ]]; then
  exit 0
fi

exec "${CMD[@]}"
