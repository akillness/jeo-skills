#!/usr/bin/env bash
set -euo pipefail

mode=check
for arg in "$@"; do
  case "$arg" in
    --check|--install) mode="${arg#--}" ;;
    -h|--help) echo 'usage: setup.sh [--check|--install]'; exit 0 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done
root="${UNDERWORLD_MAPPER_ROOT:-$PWD/.underworld-overseer-save-mapper}"
printf 'python: '; python3 --version 2>&1 || true
printf 'target: %s\n' "$root"
if [[ "$mode" == check ]]; then
  [[ -d "$root" ]] && echo 'source: present' || echo 'source: missing'
  [[ -x "$root/.venv/bin/python" ]] && echo 'venv: present' || echo 'venv: missing'
  exit 0
fi

command -v git >/dev/null 2>&1 || { echo 'git is required' >&2; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo 'python3 is required' >&2; exit 1; }
[[ ! -e "$root" ]] || { echo "refusing to overwrite: $root" >&2; exit 1; }
mkdir -p "$(dirname "$root")"
git clone https://github.com/RobThePCGuy/Underworld-Overseer-Save-Mapper.git "$root"
if [[ -n "${REF:-}" ]]; then git -C "$root" checkout --detach "$REF"; fi
python3 -m venv "$root/.venv"
"$root/.venv/bin/python" -m pip install --upgrade pip
"$root/.venv/bin/python" -m pip install pandas matplotlib
printf 'installed mapper at %s\n' "$root"
