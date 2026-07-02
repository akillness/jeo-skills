#!/usr/bin/env bash
# ooo installer
#
# Installs this skill from jeo-skills (as a plugin), the upstream
# ouroboros-ai Python package (Q00/ouroboros, MIT), and — by default —
# the two integrations that bind the Ouroboros philosophy to a real repo:
#
#   1. git-aware interview: generates .ouroboros/interview-context.md from
#      live git data so the Socratic interview's brownfield Context weighting
#      is grounded in updated commits/churn/contributors, not chat memory.
#   2. spec-kit execution planning: installs GitHub's `specify-cli` so the
#      frozen seed can be rendered into a reviewable execution plan via
#      /speckit.plan → /speckit.tasks before /speckit.implement runs inside
#      the ooo verify loop.
#
# Idempotent and safe to re-run.
#
# Env knobs:
#   GLOBAL=1              - install the skill globally (npx skills add -g)
#   AGENTS=<list>         - comma/space agents for -a targeting (e.g. "claude-code,codex")
#   SKIP_SKILL=1          - skip the jeo-skills plugin registration step
#   SKIP_PACKAGE=1        - skip the `pip install ouroboros-ai[...]` step
#   OOO_EXTRAS=<extras>   - pip extras for ouroboros-ai (default: all)
#   OOO_GIT_INTERVIEW=0   - do NOT wire the git-aware interview context (default: 1)
#   OOO_SPEC_KIT=0        - do NOT install spec-kit/`specify-cli` (default: 1)
#   SPEC_KIT_REF=<ref>    - git ref for specify-cli when OOO_SPEC_KIT=1 (default: main)
#   PYTHON_BIN=<path>     - python interpreter to use (default: python3)
#
# Usage:
#   bash scripts/install.sh
#   GLOBAL=1 AGENTS="claude-code,codex" bash scripts/install.sh
#   OOO_SPEC_KIT=0 OOO_GIT_INTERVIEW=0 bash scripts/install.sh   # base ooo only

set -euo pipefail

log()  { printf '\033[1;34m[ooo]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[ooo]\033[0m %s\n' "$*" >&2; }

REPO_URL="https://github.com/akillness/jeo-skills"
SKILL="ooo"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

PYTHON_BIN="${PYTHON_BIN:-python3}"
OOO_EXTRAS="${OOO_EXTRAS:-all}"
OOO_GIT_INTERVIEW="${OOO_GIT_INTERVIEW:-1}"
OOO_SPEC_KIT="${OOO_SPEC_KIT:-1}"

# ---- step 1: skill (plugin) install ----
install_skill() {
  if [ "${SKIP_SKILL:-0}" = "1" ]; then
    log "SKIP_SKILL=1 — skipping plugin registration"
    return 0
  fi
  local global_flag="" agent_flags=""
  [ "${GLOBAL:-0}" = "1" ] && global_flag="-g"
  if [ -n "${AGENTS:-}" ]; then
    for a in $(echo "$AGENTS" | tr ',' ' '); do
      agent_flags="$agent_flags -a $a"
    done
  fi
  if ! command -v npx >/dev/null 2>&1; then
    warn "npx not found — skipping plugin registration (install Node.js first)"
    return 0
  fi
  # shellcheck disable=SC2086
  npx skills add $global_flag "$REPO_URL" --skill "$SKILL" $agent_flags -y \
    || warn "plugin registration failed — continuing with package install"
}

# ---- step 2: upstream ouroboros-ai package ----
install_package() {
  if [ "${SKIP_PACKAGE:-0}" = "1" ]; then
    log "SKIP_PACKAGE=1 — skipping ouroboros-ai install"
    return 0
  fi
  local pip_cmd=""
  if command -v pip3 >/dev/null 2>&1; then pip_cmd="pip3";
  elif command -v pip >/dev/null 2>&1; then pip_cmd="pip";
  elif "$PYTHON_BIN" -m pip --version >/dev/null 2>&1; then pip_cmd="$PYTHON_BIN -m pip";
  else
    warn "no pip found — install Python 3.11+ and re-run, or SKIP_PACKAGE=1"
    return 1
  fi
  log "installing ouroboros-ai[${OOO_EXTRAS}] via $pip_cmd"
  # shellcheck disable=SC2086
  $pip_cmd install --upgrade "ouroboros-ai[${OOO_EXTRAS}]"
  command -v ouroboros >/dev/null 2>&1 \
    && log "ouroboros $(ouroboros --version 2>/dev/null || echo installed)" \
    || warn "ouroboros not on PATH yet — check your pip bin dir"
}

# ---- step 3: git-aware interview context ----
wire_git_interview() {
  if [ "$OOO_GIT_INTERVIEW" != "1" ]; then
    log "OOO_GIT_INTERVIEW=0 — skipping git-aware interview wiring"
    return 0
  fi
  if git rev-parse --show-toplevel >/dev/null 2>&1; then
    log "git repo detected — generating .ouroboros/interview-context.md from live git data"
    bash "$SCRIPT_DIR/git-interview-context.sh" || warn "context generation failed (non-fatal)"
    log "regenerate before every interview: bash $SCRIPT_DIR/git-interview-context.sh"
  else
    log "not inside a git repo — git-aware interview activates on first use inside one"
  fi
}

# ---- step 4: spec-kit for the execution-planning stage ----
install_spec_kit() {
  if [ "$OOO_SPEC_KIT" != "1" ]; then
    log "OOO_SPEC_KIT=0 — skipping spec-kit install"
    return 0
  fi
  if command -v specify >/dev/null 2>&1; then
    log "specify already installed ($(specify --version 2>/dev/null || echo ok)) — skipping"
    return 0
  fi
  local sibling="$SCRIPT_DIR/../../spec-kit/scripts/install.sh"
  if [ -f "$sibling" ]; then
    log "installing spec-kit via sibling skill installer"
    SPEC_KIT_REF="${SPEC_KIT_REF:-main}" bash "$sibling" \
      || { warn "spec-kit install failed — execution planning falls back to seed-only"; return 0; }
    return 0
  fi
  local repo="git+https://github.com/github/spec-kit.git@${SPEC_KIT_REF:-main}"
  if command -v uv >/dev/null 2>&1; then
    log "installing specify-cli via uv"
    uv tool install --force specify-cli --from "$repo" \
      || warn "uv install failed — execution planning falls back to seed-only"
  elif command -v pipx >/dev/null 2>&1; then
    log "installing specify-cli via pipx"
    pipx install --force "$repo" \
      || warn "pipx install failed — execution planning falls back to seed-only"
  else
    warn "neither uv nor pipx found — skipping spec-kit (install uv, then re-run)"
  fi
}

# ---- main ----
log "Starting $SKILL setup (git-interview: $OOO_GIT_INTERVIEW, spec-kit: $OOO_SPEC_KIT)"
install_skill
install_package
wire_git_interview
install_spec_kit
log "Done. Flow: interview (git-grounded) → seed → /speckit.plan + /speckit.tasks → run → evaluate."
log "See .agent-skills/$SKILL/SKILL.md for the full workflow."
