#!/usr/bin/env bash
set -euo pipefail

preset=""
output=""
format=""
extra=()
while (($#)); do
  case "$1" in
    --preset) (($# >= 2)) || { echo '--preset needs a value' >&2; exit 2; }; preset="$2"; shift 2 ;;
    --output) (($# >= 2)) || { echo '--output needs a value' >&2; exit 2; }; output="$2"; shift 2 ;;
    --format) (($# >= 2)) || { echo '--format needs a value' >&2; exit 2; }; format="$2"; shift 2 ;;
    --) shift; extra+=("$@"); break ;;
    -h|--help) echo 'usage: generate.sh --preset NAME --output FILE [--format RATE,SIZE,CHANNELS] [-- extra args]'; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

case "$preset" in coin|laser|explosion|powerup|hit|jump|blip) ;; *) echo 'preset must be one of: coin laser explosion powerup hit jump blip' >&2; exit 2 ;; esac
[[ -n "$output" ]] || { echo '--output is required' >&2; exit 2; }
ext="${output##*.}"
case "$ext" in wav|qoa|raw|h) ;; *) echo 'output extension must be .wav, .qoa, .raw, or .h' >&2; exit 2 ;; esac
if [[ -n "$format" && ! "$format" =~ ^(22050|44100),(8|16|32),(1|2)$ ]]; then
  echo 'format must be RATE,SIZE,CHANNELS using 22050|44100, 8|16|32, and 1|2' >&2
  exit 2
fi
bin="${RFXGEN_BIN:-rfxgen}"
command -v "$bin" >/dev/null 2>&1 || { echo "rFXGen binary not found: $bin" >&2; exit 1; }
mkdir -p "$(dirname "$output")"
args=(--preset "$preset" --output "$output")
[[ -n "$format" ]] && args+=(--format "$format")
"$bin" "${args[@]}" "${extra[@]}"
[[ -s "$output" ]] || { echo "rFXGen produced no non-empty output: $output" >&2; exit 1; }
printf 'generated %s\n' "$output"
