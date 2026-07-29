#!/usr/bin/env bash
set -euo pipefail

mode=check
for arg in "$@"; do
  case "$arg" in
    --check|--clone|--build) mode="${arg#--}" ;;
    -h|--help) echo 'usage: setup.sh [--check|--clone|--build]'; exit 0 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

printf 'rfxgen: '; if command -v "${RFXGEN_BIN:-rfxgen}" >/dev/null 2>&1; then "${RFXGEN_BIN:-rfxgen}" --help 2>&1 | head -n 1; else echo 'missing'; fi
printf 'cmake: '; if command -v cmake >/dev/null 2>&1; then cmake --version | head -n 1; else echo 'missing'; fi

[[ "$mode" == check ]] && exit 0
command -v git >/dev/null 2>&1 || { echo 'git is required' >&2; exit 1; }
root="${RFXGEN_ROOT:-$PWD/.rfxgen-upstream}"
if [[ "$mode" == clone ]]; then
  [[ ! -e "$root" ]] || { echo "refusing to overwrite: $root" >&2; exit 1; }
  git clone https://github.com/raysan5/rfxgen.git "$root"
  if [[ -n "${REF:-}" ]]; then git -C "$root" checkout --detach "$REF"; fi
  exit 0
fi

[[ -d "$root" ]] || { echo "source directory not found: $root (run --clone first)" >&2; exit 1; }
command -v cmake >/dev/null 2>&1 || { echo 'cmake is required for --build' >&2; exit 1; }
build="${RFXGEN_BUILD_DIR:-$root/build}"
cmake -S "$root" -B "$build" -DCMAKE_BUILD_TYPE=Release
cmake --build "$build" --config Release --parallel "${CMAKE_BUILD_PARALLEL_LEVEL:-2}"
