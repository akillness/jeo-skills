#!/usr/bin/env bash
# unirig environment doctor
#
# Reports whether this machine can actually run UniRig inference, instead of
# discovering it halfway through a GPU job. Blocking items make the script exit 1.
#
# Usage:
#   bash scripts/doctor.sh [--unirig-home <path>] [--json]
#
# Env knobs:
#   UNIRIG_HOME=<path>   UniRig checkout (default: ~/.cache/unirig/UniRig)
#   PYTHON_BIN=<path>    interpreter to probe when the checkout has no .venv

set -uo pipefail

UNIRIG_HOME="${UNIRIG_HOME:-$HOME/.cache/unirig/UniRig}"
PYTHON_BIN="${PYTHON_BIN:-python3}"
JSON=0

while (($# > 0)); do
  case "$1" in
    --unirig-home) UNIRIG_HOME="${2:?--unirig-home needs a path}"; shift 2 ;;
    --json) JSON=1; shift ;;
    -h|--help)
      sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

# Each record: <status>|<severity>|<name>|<detail>
#   status:   ok | missing
#   severity: block | warn
RECORDS=()
FAILED=0

record() {
  local status="$1" severity="$2" name="$3" detail="$4"
  RECORDS+=("$status|$severity|$name|$detail")
  if [ "$status" != "ok" ] && [ "$severity" = "block" ]; then
    FAILED=1
  fi
}

# ---- interpreter selection ----
PY=""
if [ -x "$UNIRIG_HOME/.venv/bin/python" ]; then
  PY="$UNIRIG_HOME/.venv/bin/python"
  record ok warn "python source" "venv at $UNIRIG_HOME/.venv"
elif command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  PY="$(command -v "$PYTHON_BIN")"
  record ok warn "python source" "PATH interpreter $PY (no venv at $UNIRIG_HOME/.venv)"
else
  record missing block "python source" "no interpreter found (PYTHON_BIN=$PYTHON_BIN)"
fi

py_probe() { # <import-name> <severity> <label> [<version-expr>]
  local mod="$1" severity="$2" label="$3" expr="${4:-}"
  if [ -z "$PY" ]; then
    record missing "$severity" "$label" "no interpreter to probe"
    return
  fi
  local out
  if [ -n "$expr" ]; then
    out="$("$PY" -c "import $mod; print($expr)" 2>/dev/null)"
  else
    out="$("$PY" -c "import $mod; print(getattr($mod, '__version__', 'installed'))" 2>/dev/null)"
  fi
  if [ -n "$out" ]; then
    record ok "$severity" "$label" "$out"
  else
    record missing "$severity" "$label" "import failed"
  fi
}

# ---- python version (bpy==4.2 ships cp311 wheels) ----
if [ -n "$PY" ]; then
  PYVER="$("$PY" -c 'import sys; print("%d.%d.%d" % sys.version_info[:3])' 2>/dev/null)"
  case "$PYVER" in
    3.11.*) record ok block "python 3.11" "$PYVER" ;;
    "")     record missing block "python 3.11" "could not read version" ;;
    *)      record missing block "python 3.11" "$PYVER (upstream requires 3.11 for bpy==4.2)" ;;
  esac
fi

# ---- GPU ----
if command -v nvidia-smi >/dev/null 2>&1; then
  GPU="$(nvidia-smi --query-gpu=name,memory.total --format=csv,noheader 2>/dev/null | head -1)"
  record ok block "nvidia gpu" "${GPU:-nvidia-smi present}"
else
  record missing block "nvidia gpu" "nvidia-smi not found; UniRig inference needs CUDA"
fi

# ---- torch + CUDA ----
if [ -n "$PY" ]; then
  TORCH="$("$PY" -c 'import torch; print(torch.__version__, torch.version.cuda, torch.cuda.is_available())' 2>/dev/null)"
  if [ -z "$TORCH" ]; then
    record missing block "torch" "not installed"
  else
    set -- $TORCH
    if [ "${3:-False}" = "True" ]; then
      record ok block "torch" "$1 (cuda $2, available)"
    else
      record missing block "torch" "$1 (cuda ${2:-none}, torch.cuda.is_available()=False)"
    fi
  fi
fi

# ---- CUDA-only extensions and runtime deps ----
py_probe spconv        block "spconv"        "spconv.__version__ if hasattr(spconv,'__version__') else 'installed'"
py_probe torch_scatter block "torch_scatter"
py_probe torch_cluster block "torch_cluster"
py_probe flash_attn    block "flash_attn"
py_probe bpy           block "bpy"           "bpy.app.version_string"
py_probe trimesh       warn  "trimesh"
py_probe numpy         warn  "numpy"
py_probe transformers  warn  "transformers"
py_probe huggingface_hub warn "huggingface_hub"

# ---- checkout ----
if [ -d "$UNIRIG_HOME" ]; then
  record ok block "unirig checkout" "$UNIRIG_HOME"
  for s in extract.sh generate_skeleton.sh generate_skin.sh merge.sh; do
    if [ -f "$UNIRIG_HOME/launch/inference/$s" ]; then
      record ok block "launch/$s" "present"
    else
      record missing block "launch/$s" "missing from $UNIRIG_HOME/launch/inference"
    fi
  done
  if [ -f "$UNIRIG_HOME/run.py" ]; then
    record ok block "run.py" "present"
  else
    record missing block "run.py" "missing from $UNIRIG_HOME"
  fi
else
  record missing block "unirig checkout" "$UNIRIG_HOME not found — run scripts/install.sh --repo-only"
fi

# ---- checkpoint host reachability (never fatal; offline caches are valid) ----
if command -v curl >/dev/null 2>&1; then
  if curl -fsS -m 8 -o /dev/null "https://huggingface.co/VAST-AI/UniRig" 2>/dev/null; then
    record ok warn "huggingface" "VAST-AI/UniRig reachable"
  else
    record missing warn "huggingface" "VAST-AI/UniRig unreachable (offline? set HF_HOME cache or HF_ENDPOINT)"
  fi
else
  record missing warn "huggingface" "curl not available to probe"
fi

# ---- report ----
if [ "$JSON" = "1" ]; then
  printf '{\n  "unirig_home": "%s",\n  "python": "%s",\n  "blocked": %s,\n  "checks": [\n' \
    "$UNIRIG_HOME" "$PY" "$([ "$FAILED" = "1" ] && echo true || echo false)"
  first=1
  for rec in "${RECORDS[@]}"; do
    IFS='|' read -r status severity name detail <<<"$rec"
    detail="${detail//\\/\\\\}"
    detail="${detail//\"/\\\"}"
    [ "$first" = "1" ] || printf ',\n'
    printf '    {"name": "%s", "status": "%s", "severity": "%s", "detail": "%s"}' \
      "$name" "$status" "$severity" "$detail"
    first=0
  done
  printf '\n  ]\n}\n'
else
  printf '\033[1mUniRig readiness\033[0m (home: %s)\n\n' "$UNIRIG_HOME"
  for rec in "${RECORDS[@]}"; do
    IFS='|' read -r status severity name detail <<<"$rec"
    if [ "$status" = "ok" ]; then
      mark="  ok  "
    elif [ "$severity" = "block" ]; then
      mark=" BLOCK"
    else
      mark=" warn "
    fi
    printf '[%s] %-20s %s\n' "$mark" "$name" "$detail"
  done
  printf '\n'
  if [ "$FAILED" = "1" ]; then
    printf 'Blocking items above must be resolved before inference.\n'
    printf 'Install: bash scripts/install.sh --cuda <cuXXX> --torch <version>\n'
    printf 'No CUDA GPU? See references/route-outs-and-troubleshooting.md.\n'
  else
    printf 'Ready. Plan a run with: bash scripts/rig.sh --input <model> --output <out.glb> --dry-run\n'
  fi
fi

exit "$FAILED"
