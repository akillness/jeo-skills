#!/usr/bin/env bash
# NightRun skill helper — thin, non-destructive wrapper around the upstream
# hardrave/NIGHTRUN workspace commands. This script never flashes real
# media; ./install.sh stays a manual, interactive step by design.
#
# Usage:
#   nightrun.sh doctor  <repo-dir>
#   nightrun.sh build   <repo-dir>
#   nightrun.sh convert <repo-dir> <in.gguf> <out.nrm>
#   nightrun.sh qemu    <repo-dir> <model.nrm> [extra cargo xtask run args...]
#   nightrun.sh test    <repo-dir> [crate]

set -euo pipefail

cmd="${1:-}"
repo="${2:-}"

usage() {
  sed -n '2,10p' "$0"
  exit 1
}

require_repo() {
  if [[ -z "$repo" || ! -f "$repo/Cargo.toml" ]]; then
    echo "error: <repo-dir> must be a NightRun checkout (Cargo.toml not found at '$repo')" >&2
    exit 1
  fi
}

case "$cmd" in
  doctor)
    require_repo
    echo "== NightRun prerequisite report (read-only) =="
    for tool in rustc cargo qemu-system-x86_64; do
      if command -v "$tool" >/dev/null 2>&1; then
        printf '  ok    %-20s %s\n' "$tool" "$("$tool" --version 2>&1 | head -1)"
      else
        printf '  MISSING %-18s not on PATH\n' "$tool"
      fi
    done
    if command -v rustup >/dev/null 2>&1; then
      if rustup toolchain list 2>/dev/null | grep -q nightly; then
        echo "  ok    rust nightly toolchain installed"
      else
        echo "  MISSING rust nightly toolchain (nr-boot needs -Zbuild-std)"
      fi
    else
      echo "  info  rustup not found; cannot check nightly toolchain"
    fi
    avail_kb=$(df -Pk "$repo" | awk 'NR==2 {print $4}')
    avail_gb=$(( avail_kb / 1024 / 1024 ))
    echo "  info  free disk at repo path: ${avail_gb} GB (need ~6 GB per model)"
    echo "== end of report; nothing was written to disk =="
    ;;
  build)
    require_repo
    (cd "$repo" && cargo xtask build)
    ;;
  convert)
    require_repo
    in_gguf="${3:-}"
    out_nrm="${4:-}"
    if [[ -z "$in_gguf" || -z "$out_nrm" ]]; then
      echo "usage: nightrun.sh convert <repo-dir> <in.gguf> <out.nrm>" >&2
      exit 1
    fi
    (cd "$repo" && cargo run --release -p nrconvert -- "$in_gguf" "$out_nrm")
    ;;
  qemu)
    require_repo
    model="${3:-}"
    if [[ -z "$model" ]]; then
      echo "usage: nightrun.sh qemu <repo-dir> <model.nrm> [extra cargo xtask run args...]" >&2
      exit 1
    fi
    shift 3 || true
    (cd "$repo" && cargo xtask image --model "$model" && cargo xtask run --img --model "$model" --mem 4G "$@")
    ;;
  test)
    require_repo
    crate="${3:-}"
    if [[ -n "$crate" ]]; then
      (cd "$repo" && cargo test -p "$crate")
    else
      (cd "$repo" && cargo test)
    fi
    ;;
  *)
    usage
    ;;
esac
