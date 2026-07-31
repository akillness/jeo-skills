#!/usr/bin/env bash
# unirig installer
#
# Registers this skill from jeo-skills (as a plugin) and, when requested, clones the
# upstream UniRig repository (VAST-AI-Research/UniRig, MIT) and installs its dependencies
# following the upstream README exactly.
#
# Idempotent and safe to re-run.
#
# Usage:
#   bash scripts/install.sh --repo-only                 # clone/update the checkout only
#   bash scripts/install.sh --cuda cu121                # clone + venv + dependencies
#   bash scripts/install.sh --cuda cu121 --torch 2.4.0 --vrm
#   SKIP_SKILL=1 bash scripts/install.sh --cuda cu118
#
# Flags:
#   --cuda <cuXXX>      CUDA tag for spconv/PyG wheels (e.g. cu118, cu121). Required for deps.
#   --torch <version>   torch version for the PyG wheel index (default: installed/latest)
#   --repo-only         clone/update the checkout, install nothing
#   --no-venv           install into the active environment instead of $UNIRIG_HOME/.venv
#   --vrm               also install the bundled Blender VRM add-on
#   --force             proceed with CUDA wheels even when nvidia-smi is absent
#
# Env knobs:
#   UNIRIG_HOME=<path>  checkout location (default: ~/.cache/unirig/UniRig)
#   PYTHON_BIN=<path>   interpreter used to create the venv (default: python3.11, then python3)
#   GLOBAL=1            install the skill globally (npx skills add -g)
#   AGENTS=<list>       comma/space agent IDs for -a targeting (e.g. "claude-code,codex")
#   SKIP_SKILL=1        skip the jeo-skills plugin registration step
#   SKIP_REPO=1         skip the UniRig clone/update step

set -euo pipefail

log()  { printf '\033[1;34m[unirig]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[unirig]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[unirig]\033[0m %s\n' "$*" >&2; exit 2; }

REPO_URL="https://github.com/akillness/jeo-skills"
UPSTREAM_URL="https://github.com/VAST-AI-Research/UniRig"
SKILL="unirig"

UNIRIG_HOME="${UNIRIG_HOME:-$HOME/.cache/unirig/UniRig}"
CUDA=""
TORCH_VERSION=""
REPO_ONLY=0
USE_VENV=1
INSTALL_VRM=0
FORCE=0

while (($# > 0)); do
  case "$1" in
    --cuda) CUDA="${2:?--cuda needs a tag like cu121}"; shift 2 ;;
    --torch) TORCH_VERSION="${2:?--torch needs a version}"; shift 2 ;;
    --unirig-home) UNIRIG_HOME="${2:?}"; shift 2 ;;
    --repo-only) REPO_ONLY=1; shift ;;
    --no-venv) USE_VENV=0; shift ;;
    --vrm) INSTALL_VRM=1; shift ;;
    --force) FORCE=1; shift ;;
    -h|--help) sed -n '2,32p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "Unknown argument: $1 (see --help)" ;;
  esac
done

# ---- step 1: skill (plugin) registration ----
GLOBAL_FLAG=""
[ "${GLOBAL:-0}" = "1" ] && GLOBAL_FLAG="-g"

AGENT_FLAGS=""
if [ -n "${AGENTS:-}" ]; then
  for a in ${AGENTS//,/ }; do
    AGENT_FLAGS="$AGENT_FLAGS -a $a"
  done
fi

install_skill() {
  if [ "${SKIP_SKILL:-0}" = "1" ]; then
    log "SKIP_SKILL=1 — skipping jeo-skills plugin registration"
    return 0
  fi
  if ! command -v npx >/dev/null 2>&1; then
    warn "Node.js/npx not found. Manual install:"
    warn "  git clone $REPO_URL && cp -r jeo-skills/.agent-skills/$SKILL ~/.agents/skills/$SKILL"
    return 0
  fi
  log "Registering the '$SKILL' skill via npx skills…"
  # shellcheck disable=SC2086
  npx skills add "$REPO_URL" --skill "$SKILL" $GLOBAL_FLAG $AGENT_FLAGS --yes \
    || warn "npx skills add failed — install manually (git clone)."
}

# ---- step 2: upstream checkout ----
clone_repo() {
  if [ "${SKIP_REPO:-0}" = "1" ]; then
    log "SKIP_REPO=1 — skipping UniRig checkout"
    return 0
  fi
  command -v git >/dev/null 2>&1 || die "git is required to clone UniRig"
  if [ -d "$UNIRIG_HOME/.git" ]; then
    log "Updating existing checkout at $UNIRIG_HOME"
    git -C "$UNIRIG_HOME" pull --ff-only || warn "pull failed; keeping the existing checkout as-is"
  else
    log "Cloning $UPSTREAM_URL into $UNIRIG_HOME"
    mkdir -p "$(dirname "$UNIRIG_HOME")"
    git clone --depth 1 "$UPSTREAM_URL" "$UNIRIG_HOME"
  fi
}

# ---- step 3: python environment ----
pick_python() {
  if [ -n "${PYTHON_BIN:-}" ]; then
    command -v "$PYTHON_BIN" >/dev/null 2>&1 || die "PYTHON_BIN not found: $PYTHON_BIN"
    printf '%s\n' "$(command -v "$PYTHON_BIN")"
    return
  fi
  if command -v python3.11 >/dev/null 2>&1; then
    command -v python3.11
    return
  fi
  command -v python3 >/dev/null 2>&1 || die "python3 not found"
  command -v python3
}

install_deps() {
  [ -n "$CUDA" ] || die "--cuda <cuXXX> is required to install dependencies (or use --repo-only).
Read it from: python -c \"import torch; print(torch.version.cuda)\" or nvidia-smi."

  if ! command -v nvidia-smi >/dev/null 2>&1 && [ "$FORCE" != "1" ]; then
    die "nvidia-smi not found. UniRig inference needs an NVIDIA GPU; spconv/flash_attn/PyG wheels
are CUDA-only. Re-run with --force to install anyway, or see
references/route-outs-and-troubleshooting.md for alternatives."
  fi

  local py
  py="$(pick_python)"
  local pyver
  pyver="$("$py" -c 'import sys; print("%d.%d" % sys.version_info[:2])')"
  [ "$pyver" = "3.11" ] || warn "interpreter is Python $pyver; upstream requires 3.11 (bpy==4.2 ships cp311 wheels)"

  if [ "$USE_VENV" = "1" ]; then
    if [ ! -x "$UNIRIG_HOME/.venv/bin/python" ]; then
      log "Creating venv at $UNIRIG_HOME/.venv (python $pyver)"
      "$py" -m venv "$UNIRIG_HOME/.venv"
    fi
    py="$UNIRIG_HOME/.venv/bin/python"
  fi

  log "Using interpreter: $py"
  "$py" -m pip install --upgrade pip

  log "1/6 torch + torchvision"
  "$py" -m pip install torch torchvision

  if [ -z "$TORCH_VERSION" ]; then
    TORCH_VERSION="$("$py" -c 'import torch; print(torch.__version__.split("+")[0])')"
    log "detected torch $TORCH_VERSION for the PyG wheel index"
  fi

  # flash_attn lives inside requirements.txt; a build failure there aborts everything else,
  # so install the rest first and attempt flash_attn on its own afterwards.
  log "2/6 requirements.txt (flash_attn deferred)"
  local req="$UNIRIG_HOME/requirements.txt"
  [ -f "$req" ] || die "requirements.txt missing from $UNIRIG_HOME — run --repo-only first"
  local filtered
  filtered="$(mktemp)"
  grep -v '^[[:space:]]*flash_attn' "$req" >"$filtered"
  "$py" -m pip install -r "$filtered"
  rm -f "$filtered"

  log "3/6 spconv-$CUDA"
  "$py" -m pip install "spconv-$CUDA"

  log "4/6 torch_scatter + torch_cluster (torch-$TORCH_VERSION+$CUDA)"
  "$py" -m pip install torch_scatter torch_cluster \
    -f "https://data.pyg.org/whl/torch-${TORCH_VERSION}+${CUDA}.html" --no-cache-dir

  log "5/6 flash_attn (upstream warns this often fails to build)"
  if ! "$py" -m pip install flash_attn; then
    warn "flash_attn install FAILED. The rest of the environment is intact, but inference will not"
    warn "run until it is resolved: https://github.com/Dao-AILab/flash-attention"
    warn "See references/route-outs-and-troubleshooting.md."
  fi

  log "6/6 numpy==1.26.4 (pinned last, as upstream instructs)"
  "$py" -m pip install numpy==1.26.4

  if [ "$INSTALL_VRM" = "1" ]; then
    local addon="$UNIRIG_HOME/blender/add-on-vrm-v2.20.77_modified.zip"
    if [ -f "$addon" ]; then
      log "Installing the Blender VRM add-on"
      (cd "$UNIRIG_HOME" && "$py" -c "import bpy, os; bpy.ops.preferences.addon_install(filepath=os.path.abspath('blender/add-on-vrm-v2.20.77_modified.zip'))") \
        || warn "VRM add-on install failed; .vrm import/export will be unavailable"
    else
      warn "VRM add-on zip not found at $addon — skipping"
    fi
  fi
}

# ---- main ----
install_skill
clone_repo

if [ "$REPO_ONLY" = "1" ]; then
  log "--repo-only: dependencies not installed"
else
  install_deps
fi

log "Next: bash \"$(dirname "$0")/doctor.sh\" --unirig-home \"$UNIRIG_HOME\""
