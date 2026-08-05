#!/usr/bin/env bash
# Soup skill helper — thin, read-only-by-default wrapper around the
# `soup-cli` (MakazhanAlpamys/Soup) command surface. `doctor` never installs
# packages or starts training; `advise`/`profile`/`cost` just pass through to
# the real `soup` CLI so callers get consistent invocation from one place.
#
# Usage:
#   soup.sh doctor
#   soup.sh advise <data.jsonl> --goal "..."
#   soup.sh profile <config.yaml> [extra soup profile args...]
#   soup.sh cost    <config.yaml> [extra soup cost args...]

set -euo pipefail

cmd="${1:-}"

usage() {
  sed -n '2,10p' "$0"
  exit 1
}

require_soup() {
  if ! command -v soup >/dev/null 2>&1; then
    echo "error: 'soup' is not on PATH. Install with: pip install soup-cli  (add '[train]' to fine-tune)" >&2
    exit 1
  fi
}

case "$cmd" in
  doctor)
    echo "== Soup prerequisite report (read-only) =="
    if command -v python3 >/dev/null 2>&1; then
      pyver="$(python3 --version 2>&1)"
      echo "  ok    python3        $pyver"
    else
      echo "  MISSING python3      not on PATH (Soup needs Python 3.10+)"
    fi
    if command -v soup >/dev/null 2>&1; then
      echo "  ok    soup           $(soup --version 2>&1 | head -1)"
    else
      echo "  MISSING soup-cli     not installed (pip install soup-cli)"
    fi
    for pkg in torch transformers peft trl; do
      if python3 -c "import $pkg" >/dev/null 2>&1; then
        ver="$(python3 -c "import $pkg; print(getattr($pkg, '__version__', '?'))" 2>/dev/null)"
        printf '  ok    %-14s %s (train extras present)\n' "$pkg" "$ver"
      else
        printf '  info  %-14s not importable (only needed for pip install "soup-cli[train]")\n' "$pkg"
      fi
    done
    if python3 -c "import torch,sys; sys.exit(0 if torch.cuda.is_available() else 1)" >/dev/null 2>&1; then
      echo "  ok    CUDA GPU available"
    elif python3 -c "import torch,sys; sys.exit(0 if getattr(torch.backends,'mps',None) and torch.backends.mps.is_available() else 1)" >/dev/null 2>&1; then
      echo "  ok    Apple MLX/MPS backend available"
    else
      echo "  info  no CUDA/MPS backend detected (CPU-only: init/advise/data/profile/cost still work)"
    fi
    echo "== end of report; nothing was installed or trained =="
    ;;
  advise)
    require_soup
    shift || true
    soup advise "$@"
    ;;
  profile)
    require_soup
    config="${2:-}"
    if [[ -z "$config" ]]; then
      echo "usage: soup.sh profile <config.yaml> [extra soup profile args...]" >&2
      exit 1
    fi
    shift 2 || true
    soup profile --config "$config" "$@"
    ;;
  cost)
    require_soup
    config="${2:-}"
    if [[ -z "$config" ]]; then
      echo "usage: soup.sh cost <config.yaml> [extra soup cost args...]" >&2
      exit 1
    fi
    shift 2 || true
    soup cost --config "$config" "$@"
    ;;
  *)
    usage
    ;;
esac
