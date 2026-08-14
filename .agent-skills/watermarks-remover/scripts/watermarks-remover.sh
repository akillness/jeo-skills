#!/usr/bin/env bash
# Watermarks Remover skill helper — thin, non-destructive wrapper around the
# upstream guillaumemeyer/watermarks-remover stdlib scripts. This wrapper
# never installs the optional heavy backends (SynthID scorer / CtrlRegen);
# those stay a manual `setup_synthid.sh` / `setup_ctrlregen.sh` step by
# design.
#
# Usage:
#   watermarks-remover.sh doctor  <repo-dir>
#   watermarks-remover.sh inspect <repo-dir> <file> [extra inspect_file.py args...]
#   watermarks-remover.sh clean   <repo-dir> <file> <output> [extra clean_file.py args...]
#   watermarks-remover.sh audit   <repo-dir> <dir> [extra audit_dir.py args...]

set -euo pipefail

cmd="${1:-}"
repo="${2:-}"

usage() {
  sed -n '2,13p' "$0"
  exit 1
}

require_repo() {
  local scripts_dir="${repo%/}/skills/remove-ai-marks/scripts"
  if [[ -z "$repo" || ! -f "${scripts_dir}/inspect_file.py" ]]; then
    echo "error: <repo-dir> must be a watermarks-remover checkout (skills/remove-ai-marks/scripts/inspect_file.py not found under '$repo')" >&2
    exit 1
  fi
  echo "$scripts_dir"
}

case "$cmd" in
  doctor)
    scripts_dir="$(require_repo)"
    echo "== Watermarks Remover prerequisite report (read-only) =="
    if command -v python3 >/dev/null 2>&1; then
      printf '  ok    %-10s %s\n' python3 "$(python3 --version 2>&1)"
    else
      echo "  MISSING python3 not on PATH"
    fi
    for tool in c2patool exiftool; do
      if command -v "$tool" >/dev/null 2>&1; then
        printf '  ok    %-10s optional tool present\n' "$tool"
      else
        printf '  info  %-10s optional, not on PATH (degraded PDF/C2PA handling)\n' "$tool"
      fi
    done
    echo "  info  scripts dir: $scripts_dir"
    echo "  info  optional external backends (not installed by this wrapper):"
    echo "        setup_synthid.sh   -> pixel-domain SynthID confidence score"
    echo "        setup_ctrlregen.sh -> pixel-domain watermark removal (~10 GB, GPU recommended)"
    echo "== end of report; nothing was written to disk =="
    ;;
  inspect)
    scripts_dir="$(require_repo)"
    file="${3:-}"
    if [[ -z "$file" ]]; then
      echo "usage: watermarks-remover.sh inspect <repo-dir> <file> [extra args...]" >&2
      exit 1
    fi
    shift 3 || true
    python3 "$scripts_dir/inspect_file.py" "$file" "$@"
    ;;
  clean)
    scripts_dir="$(require_repo)"
    file="${3:-}"
    output="${4:-}"
    if [[ -z "$file" || -z "$output" ]]; then
      echo "usage: watermarks-remover.sh clean <repo-dir> <file> <output> [extra args...]" >&2
      exit 1
    fi
    shift 4 || true
    python3 "$scripts_dir/clean_file.py" "$file" -o "$output" "$@"
    ;;
  audit)
    scripts_dir="$(require_repo)"
    dir="${3:-}"
    if [[ -z "$dir" ]]; then
      echo "usage: watermarks-remover.sh audit <repo-dir> <dir> [extra args...]" >&2
      exit 1
    fi
    shift 3 || true
    python3 "$scripts_dir/audit_dir.py" "$dir" "$@"
    ;;
  *)
    usage
    ;;
esac
