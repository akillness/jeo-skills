#!/usr/bin/env bash
# Interactive (TUI) optional setup for the Jev control plane, run from install.sh
# or standalone. Non-interactive override: JEO_SKILLS_JEV=skip|api|local|ollama|lmstudio
#   api      also reads JEV_API_KEY from the environment
#   local    also downloads autotrust/JEV-9B unless JEV_SKIP_MODEL_DOWNLOAD=true
#   ollama   pulls the quantized GGUF (Q4_K_M, ~5.6 GB) via the ollama CLI
#   lmstudio points the harness at LM Studio's OpenAI server (macOS)

set -euo pipefail

JEV_HOME="$HOME/.agents/jev"
RULES_DIR="$HOME/.agents/rules"
MODEL_REPO="autotrust/JEV-9B"
MODEL_DIR="${JEV_LOCAL_MODEL_DIR:-$JEV_HOME/models/JEV-9B}"
RAW_BASE="${JEO_SKILLS_RAW_BASE:-https://raw.githubusercontent.com/akillness/jeo-skills/main/jev}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FILES=(jev-setup.sh jev-harness.mjs jev_local_server.py README.md jev-control-plane.rule.md)

bold=$(tput bold 2>/dev/null || true); dim=$(tput dim 2>/dev/null || true); reset=$(tput sgr0 2>/dev/null || true)
info() { printf '%s[jev-setup]%s %s\n' "$bold" "$reset" "$*"; }
fail() { printf '[jev-setup] ERROR: %s\n' "$*" >&2; exit 1; }

MODE="${JEO_SKILLS_JEV:-}"
if [ -z "$MODE" ]; then
  if [ ! -t 0 ]; then info 'No TTY and JEO_SKILLS_JEV unset — skipping optional Jev setup.'; exit 0; fi
  printf '\n%s╭──────────────────────────────────────────────────────╮%s\n' "$bold" "$reset"
  printf '%s│  Jev control plane (optional)                        │%s\n' "$bold" "$reset"
  printf '%s╰──────────────────────────────────────────────────────╯%s\n' "$bold" "$reset"
  printf '%sSkill routing, context pruning, and a review gate for the jeo runtime.%s\n' "$dim" "$reset"
  printf 'Install the Jev control plane? [y/N] '
  read -r yn
  case "$yn" in y|Y|yes|YES) ;; *) info 'Skipped. Re-run jev-setup.sh any time to enable it.'; exit 0 ;; esac
  printf '\nBackend mode:\n'
  printf '  %s1)%s API      — hosted TypeSafe System One (needs a JEV API key, paid)\n' "$bold" "$reset"
  printf '  %s2)%s Local    — full-precision autotrust/JEV-9B via transformers (~18 GB\n' "$bold" "$reset"
  printf '              download, needs ~18 GB RAM, runs offline)\n'
  printf '  %s3)%s Ollama   — quantized JEV-9B GGUF Q4_K_M (~5.6 GB download, ~6 GB RAM,\n' "$bold" "$reset"
  printf '              runs offline; recommended on 16 GB machines)\n'
  if [ "$(uname -s)" = Darwin ]; then
    printf '  %s4)%s LMStudio — same quantized GGUF served by the LM Studio app (macOS)\n' "$bold" "$reset"
    printf 'Select [1/2/3/4]: '
  else
    printf 'Select [1/2/3]: '
  fi
  read -r pick
  case "$pick" in 1) MODE=api ;; 2) MODE=local ;; 3) MODE=ollama ;; 4) [ "$(uname -s)" = Darwin ] && MODE=lmstudio || fail 'LM Studio option is macOS-only here' ;; *) fail 'Pick a listed number' ;; esac
fi
case "$MODE" in skip) info 'JEO_SKILLS_JEV=skip — not installing Jev.'; exit 0 ;; api|local|ollama|lmstudio) ;; *) fail "JEO_SKILLS_JEV must be skip, api, local, ollama, or lmstudio (got '$MODE')" ;; esac
if [ "$MODE" = api ]; then
  KEY="${JEV_API_KEY:-}"
  if [ -z "$KEY" ]; then
    [ -t 0 ] || fail 'api mode without TTY requires JEV_API_KEY in the environment'
    printf 'Enter your JEV API key (input hidden): '
    read -rs KEY; printf '\n'
  fi
  [ -n "$KEY" ] || fail 'Empty API key'
fi
for value in "${KEY:-}" "${JEV_ENDPOINT:-}" "${JEV_LOCAL_MODEL:-}" "$MODEL_DIR"; do
  case "$value" in *$'\n'*|*$'\r'*) fail 'Jev configuration values must be single-line' ;; esac
done
command -v node >/dev/null 2>&1 || fail 'Node.js is required for the Jev harness'
for destination in "$HOME/.agents" "$JEV_HOME" "$RULES_DIR" "$JEV_HOME/.env" "$RULES_DIR/jev-control-plane.md"; do
  [ ! -L "$destination" ] || fail "Refusing symlink destination: $destination"
done
for f in "${FILES[@]}"; do
  [ ! -L "$JEV_HOME/$f" ] || fail "Refusing symlink destination: $JEV_HOME/$f"
done
if [ "$MODE" = local ]; then
  for destination in "$JEV_HOME/venv" "$JEV_HOME/venv/bin" "$JEV_HOME/models" "$MODEL_DIR"; do
    [ ! -L "$destination" ] || fail "Refusing symlink destination: $destination"
  done
  destination="$MODEL_DIR"
  while [[ "$destination" == "$HOME/"* ]]; do
    [ ! -L "$destination" ] || fail "Refusing symlink destination: $destination"
    destination="$(dirname "$destination")"
  done
fi


# ── Install harness files (local checkout first, raw GitHub fallback) ─────────
mkdir -p "$JEV_HOME" "$RULES_DIR"
for f in "${FILES[@]}"; do
  if [ "$SCRIPT_DIR/$f" -ef "$JEV_HOME/$f" ]; then : # running from the installed copy
  elif [ -f "$SCRIPT_DIR/$f" ]; then cp "$SCRIPT_DIR/$f" "$JEV_HOME/$f"
  else curl -fsSL "$RAW_BASE/$f" -o "$JEV_HOME/$f" || fail "Cannot fetch $f (no local copy, download failed)"; fi

done
cp "$JEV_HOME/jev-control-plane.rule.md" "$RULES_DIR/jev-control-plane.md"
node --check "$JEV_HOME/jev-harness.mjs" >/dev/null || fail 'Harness syntax check failed'
info "Harness installed at $JEV_HOME (syntax check passed; no backend inference performed)"

write_env() { # write_env KEY=VALUE lines on stdin
  local env_tmp
  [ ! -d "$JEV_HOME/.env" ] || fail 'Jev .env destination is a directory'
  umask 177
  env_tmp="$(mktemp "$JEV_HOME/.env.XXXXXX")" || fail 'Cannot create Jev configuration temporary file'
  if ! cat > "$env_tmp" || ! chmod 600 "$env_tmp" || ! mv -f "$env_tmp" "$JEV_HOME/.env"; then
    rm -f "$env_tmp"
    fail 'Cannot replace Jev configuration'
  fi
}

if [ "$MODE" = api ]; then
  printf 'JEV_MODE=api\nJEV_API_KEY=%s\nJEV_ENDPOINT=%s\n' "$KEY" "${JEV_ENDPOINT:-https://api.typesafe.ai/v1/systemone}" | write_env
  info 'API mode configured (~/.agents/jev/.env, mode 600).'
elif [ "$MODE" = ollama ]; then
  GGUF_MODEL="${JEV_LOCAL_MODEL:-hf.co/mradermacher/JEV-9B-GGUF:Q4_K_M}"
  command -v ollama >/dev/null 2>&1 || fail 'ollama CLI is required for ollama mode (brew install ollama)'
  if ! pgrep -x ollama >/dev/null 2>&1; then
    info 'Starting ollama serve in the background...'
    (nohup ollama serve >/dev/null 2>&1 &) ; sleep 2
  fi
  if ! ollama show "$GGUF_MODEL" >/dev/null 2>&1; then
    info "Pulling $GGUF_MODEL (quantized JEV-9B, ~5.6 GB)..."
    ollama pull "$GGUF_MODEL" || fail 'ollama pull failed'
  fi
  printf 'JEV_MODE=ollama\nJEV_LOCAL_MODEL=%s\nJEV_ENDPOINT=%s\n' "$GGUF_MODEL" "${JEV_ENDPOINT:-http://127.0.0.1:11434}" | write_env
  info 'Ollama mode configured (Q4_K_M quantization, ~6 GB RAM at inference).'
  info 'Note: this is a quantized third-party distillation, not the original hosted model.'
elif [ "$MODE" = lmstudio ]; then
  [ "$(uname -s)" = Darwin ] || info 'Warning: lmstudio mode is intended for macOS.'
  if command -v lms >/dev/null 2>&1; then
    info 'Downloading quantized JEV-9B via LM Studio CLI (Q4_K_M, ~5.6 GB)...'
    lms get mradermacher/JEV-9B-GGUF@q4_k_m --gguf || info 'lms get failed — download JEV-9B-GGUF (Q4_K_M) in the LM Studio UI instead.'
    lms server start >/dev/null 2>&1 || info 'Could not start the LM Studio server — start it manually in Developer → Start Server.'
    lms load mradermacher/JEV-9B-GGUF >/dev/null 2>&1 || info 'Could not auto-load — find the exact model key with lms ls, then run lms load <model_key>.'
  else
    info 'LM Studio CLI (lms) not found. Install LM Studio (https://lmstudio.ai),'
    info 'download mradermacher/JEV-9B-GGUF (Q4_K_M), and start the server (Developer → Start Server).'
  fi
  # Model id is resolved at runtime from /v1/models (set JEV_LOCAL_MODEL to pin it).
  printf 'JEV_MODE=lmstudio\nJEV_ENDPOINT=%s\nJEV_LOCAL_MODEL=%s\n' "${JEV_ENDPOINT:-http://127.0.0.1:1234}" "${JEV_LOCAL_MODEL:-}" | write_env
  info 'LM Studio mode configured (harness auto-detects the loaded model id).'
else
  PYBIN="$(command -v python3 || true)"; [ -n "$PYBIN" ] || fail 'python3 is required for local mode'
  VENV="$JEV_HOME/venv"
  if [ ! -x "$VENV/bin/python" ] || ! "$VENV/bin/python" -c 'import sys; sys.exit(sys.prefix == sys.base_prefix)' >/dev/null 2>&1 || ! "$VENV/bin/python" -m pip --version >/dev/null 2>&1; then
    info 'Creating/repairing Python venv (one-time)...'
    "$PYBIN" -m venv "$VENV"
  fi
  if ! "$VENV/bin/python" -c 'import torch, transformers, accelerate, huggingface_hub' >/dev/null 2>&1; then
    info 'Installing missing local backend dependencies...'
    "$VENV/bin/python" -m pip install --quiet --upgrade pip
    "$VENV/bin/python" -m pip install --quiet torch transformers accelerate "huggingface_hub[cli]" || fail 'pip install failed'
  fi
  if [ "${JEV_SKIP_MODEL_DOWNLOAD:-false}" != true ]; then
    info "Downloading/resuming $MODEL_REPO to $MODEL_DIR (~18 GB; cached files are reused)..."
    "$VENV/bin/python" - "$MODEL_REPO" "$MODEL_DIR" <<'PY' || fail 'Model download failed'
import sys
from huggingface_hub import snapshot_download
snapshot_download(repo_id=sys.argv[1], local_dir=sys.argv[2])
PY
  fi
  printf 'JEV_MODE=local\nJEV_LOCAL_MODEL_DIR=%s\nJEV_ENDPOINT=%s\n' "$MODEL_DIR" "${JEV_ENDPOINT:-http://127.0.0.1:8763/v1/systemone}" | write_env
  "$VENV/bin/python" "$JEV_HOME/jev_local_server.py" --check >/dev/null || fail 'Local server structural check failed'
  info 'Local mode configured. Start the backend with:'
  info "  $VENV/bin/python $JEV_HOME/jev_local_server.py"
  info 'Note: JEV-9B is a third-party distillation of Jev 1.13, not the original hosted model.'
fi


node "$JEV_HOME/jev-harness.mjs" status || true
info 'Setup complete; status distinguishes configuration from backend readiness: node ~/.agents/jev/jev-harness.mjs status'
