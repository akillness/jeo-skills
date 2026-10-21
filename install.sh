#!/usr/bin/env bash
# Bootstrap one shared router, then let that router resolve the requested target.
set -euo pipefail

REPO_URL="${JEO_SKILLS_SOURCE:-https://github.com/akillness/jeo-skills}"
SELECTION="${JEO_SKILLS_SELECTION:-router}"
AGENT="${JEO_SKILLS_AGENT:-universal}"
JEV_PROFILE="${JEO_SKILLS_JEV_PROFILE:-$AGENT}"
GLOBAL="${INSTALL_GLOBAL:-true}"
DRY_RUN="${JEO_SKILLS_DRY_RUN:-false}"
info() { printf '[jeo-skills] %s\n' "$*"; }
fail() { printf '[jeo-skills] ERROR: %s\n' "$*" >&2; exit 1; }

case "$GLOBAL:$DRY_RUN" in true:true|true:false|false:true|false:false) ;; *) fail 'INSTALL_GLOBAL and JEO_SKILLS_DRY_RUN must be true or false' ;; esac
case "$SELECTION" in router|bundle|all) ;; category) [ -n "${JEO_SKILLS_CATEGORY:-}" ] || fail 'JEO_SKILLS_CATEGORY is required' ;; *) fail 'JEO_SKILLS_SELECTION must be router, bundle, category, or all' ;; esac
if [ "$AGENT" = aside ] && [ "$GLOBAL" != true ]; then fail 'Aside is account-scoped; INSTALL_GLOBAL=true is required'; fi
case "${JEO_SKILLS_JEV:-}" in ''|skip|api|local|ollama|lmstudio|systemone) ;; *) info 'WARNING: Invalid optional JEO_SKILLS_JEV; skipping Jev. JEO_SKILLS_JEV must be skip, api, local, ollama, lmstudio, or systemone. Continuing skill installation.'; JEO_SKILLS_JEV=skip ;; esac
if [ "$GLOBAL" != true ] && [ -n "${JEO_SKILLS_JEV:-}" ] && [ "${JEO_SKILLS_JEV:-}" != skip ]; then
  info 'WARNING: Jev is home-scoped; skipping optional Jev for project installation. Run approved standalone setup separately.'
  JEO_SKILLS_JEV=skip
fi

ROOT="$PWD/.agents/skills"
if [ "$GLOBAL" = true ]; then ROOT="$HOME/.agents/skills"; fi
CLI_PATH="$ROOT/jeo-skill/scripts/jeo-skill.py"
TARGET_ARGS=(--source "$REPO_URL" --agent "$AGENT")
if [ -n "${JEO_SKILLS_ASIDE_HOME:-}" ]; then TARGET_ARGS+=(--aside-home "$JEO_SKILLS_ASIDE_HOME"); fi
if [ -n "${JEO_SKILLS_ASIDE_ACCOUNT:-}" ]; then TARGET_ARGS+=(--aside-account "$JEO_SKILLS_ASIDE_ACCOUNT"); fi
ADD_ARGS=(--skill jeo-skill --agent universal --yes --copy --full-depth)
if [ "$GLOBAL" = true ]; then ADD_ARGS+=(--global); TARGET_ARGS+=(--global); fi
SELECT_ARGS=()
case "$SELECTION" in
  bundle) SELECT_ARGS=(--bundle "${JEO_SKILLS_BUNDLE:-starter}") ;;
  category) SELECT_ARGS=(--category "$JEO_SKILLS_CATEGORY"); if [ -n "${JEO_SKILLS_SUBCATEGORY:-}" ]; then SELECT_ARGS+=(--subcategory "$JEO_SKILLS_SUBCATEGORY"); fi ;;
  all) SELECT_ARGS=(--all) ;;
esac

if [ "$DRY_RUN" = true ]; then
  printf 'Command: '; printf '%q ' npx --yes skills@1.7.0 add "$REPO_URL" "${ADD_ARGS[@]}"; printf '\n'
  printf 'Command: '; printf '%q ' python3 "$CLI_PATH" bootstrap "${TARGET_ARGS[@]}"; printf '\n'
  if [ "$SELECTION" != router ]; then
    printf 'Command: '; printf '%q ' python3 "$CLI_PATH" install "${TARGET_ARGS[@]}" "${SELECT_ARGS[@]}" --yes; printf '\n'
  fi
  if [ "$GLOBAL" = true ]; then
    printf 'Command: '; printf '%q ' python3 "$CLI_PATH" prune-retired --global; printf '\n'
  else
    printf 'Command: '; printf '%q ' python3 "$CLI_PATH" prune-retired; printf '\n'
  fi
  info "Dry run: shared router destination $ROOT; bootstrap resolves target $AGENT; no changes made."
  info 'Runtime support, account selection, and catalog selections are validated during execution, not by this bootstrap preview.'
  info "After install, optional Jev setup targets profile '$JEV_PROFILE'; set JEO_SKILLS_JEV_PROFILE for an independent profile when AGENT=universal."

  exit 0
fi

command -v python3 >/dev/null 2>&1 || fail 'Python 3.9+ is required'
python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)' >/dev/null 2>&1 || fail 'python3 is not usable; check your Python installation or Xcode license'
command -v node >/dev/null 2>&1 || fail 'Node.js 22.20+ is required by skills@1.7.0'
node -e 'const v=process.versions.node.split(".").map(Number);process.exit(v[0]>22||(v[0]===22&&v[1]>=20)?0:1)' || fail 'Node.js 22.20+ is required by skills@1.7.0'
command -v npx >/dev/null 2>&1 || fail 'Node.js/npx is required'
npx --version >/dev/null 2>&1 || fail 'npx does not run; reinstall Node.js'
# Do not allow the bootstrap transport to replace linked user installations.
python3 - "$ROOT" "$HOME" "$PWD" <<'PY'
import pathlib, sys
root = pathlib.Path(sys.argv[1])
scope = pathlib.Path(sys.argv[2]) if pathlib.Path(sys.argv[2]) in root.parents else pathlib.Path(sys.argv[3])
parents = list(root.parents)
parents = parents[:parents.index(scope) + 1] if scope in parents else []
for path in (root, *parents, root / 'jeo-skill'):
    if path.is_symlink():
        sys.exit(f'Refusing symlink destination: {path}')
if (root / 'jeo-skill').is_dir():
    for path in (root / 'jeo-skill').rglob('*'):
        if path.is_symlink():
            sys.exit(f'Refusing symlink in router tree: {path}')
PY

info 'Installing the lightweight shared jeo-skill router'
npx --yes skills@1.7.0 add "$REPO_URL" "${ADD_ARGS[@]}"
[ -f "$CLI_PATH" ] && [ -f "$ROOT/jeo-skill/SKILL.md" ] && [ -f "$ROOT/jeo-skill/scripts/install_support.py" ] || fail "Router verification failed at $ROOT"
python3 "$CLI_PATH" bootstrap "${TARGET_ARGS[@]}"
if [ "$SELECTION" != router ]; then
  python3 "$CLI_PATH" install "${TARGET_ARGS[@]}" "${SELECT_ARGS[@]}" --yes
fi
# Remove stale catalog copies of retired skills (jeo, harness) from every runtime root in scope.
if [ "$GLOBAL" = true ]; then
  python3 "$CLI_PATH" prune-retired --global || info 'WARNING: retired-skill cleanup did not complete; installed skills remain available.'
else
  python3 "$CLI_PATH" prune-retired || info 'WARNING: retired-skill cleanup did not complete; installed skills remain available.'
fi
if [ "$GLOBAL" = true ] && ! command -v jeo-skill >/dev/null 2>&1; then
  info 'Add $HOME/.local/bin to PATH to use jeo-skill.'
fi
info 'Selected installation completed; runtime activation may require a reload.'

# Optional Jev control plane (interactive TUI; JEO_SKILLS_JEV=skip|api|local|ollama|lmstudio|systemone to force).
if [ "$GLOBAL" = true ] && [ "${JEO_SKILLS_JEV:-}" != skip ] && { [ -n "${JEO_SKILLS_JEV:-}" ] || [ -t 0 ]; }; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || echo "$PWD")"
  if [ -f "$SCRIPT_DIR/jev/jev-setup.sh" ]; then
    bash "$SCRIPT_DIR/jev/jev-setup.sh" --profile "$JEV_PROFILE" --agent "$AGENT" || info "WARNING: Jev setup did not complete; installed skills remain available. Re-run approved standalone setup later."
  else
    JEV_SETUP_URL="${JEO_SKILLS_RAW_BASE:-https://raw.githubusercontent.com/akillness/jeo-skills/main/jev}/jev-setup.sh"
    if JEV_SETUP_TMP="$(mktemp -d "${TMPDIR:-/tmp}/jev-setup.XXXXXX")"; then
      trap 'rm -rf "$JEV_SETUP_TMP" || info "WARNING: Optional Jev temporary setup cleanup failed."' EXIT
      curl -fsSL "$JEV_SETUP_URL" -o "$JEV_SETUP_TMP/jev-setup.sh" 2>/dev/null \
        && bash "$JEV_SETUP_TMP/jev-setup.sh" --profile "$JEV_PROFILE" --agent "$AGENT" || info 'WARNING: Optional Jev setup unavailable; installed skills remain available. Run approved standalone setup later.'
      rm -rf "$JEV_SETUP_TMP" || info 'WARNING: Optional Jev temporary setup cleanup failed.'
      trap - EXIT
    else
      info 'WARNING: Cannot create private Jev setup directory; skipping optional Jev. Installed skills remain available.'
    fi
  fi
fi

