#!/usr/bin/env bash
# Bootstrap one shared router, then let that router resolve the requested target.
set -euo pipefail

REPO_URL="${JEO_SKILLS_SOURCE:-https://github.com/akillness/jeo-skills}"
SELECTION="${JEO_SKILLS_SELECTION:-router}"
AGENT="${JEO_SKILLS_AGENT:-universal}"
GLOBAL="${INSTALL_GLOBAL:-true}"
DRY_RUN="${JEO_SKILLS_DRY_RUN:-false}"
info() { printf '[jeo-skills] %s\n' "$*"; }
fail() { printf '[jeo-skills] ERROR: %s\n' "$*" >&2; exit 1; }

case "$GLOBAL:$DRY_RUN" in true:true|true:false|false:true|false:false) ;; *) fail 'INSTALL_GLOBAL and JEO_SKILLS_DRY_RUN must be true or false' ;; esac
case "$SELECTION" in router|bundle|all) ;; category) [ -n "${JEO_SKILLS_CATEGORY:-}" ] || fail 'JEO_SKILLS_CATEGORY is required' ;; *) fail 'JEO_SKILLS_SELECTION must be router, bundle, category, or all' ;; esac
if [ "$AGENT" = aside ] && [ "$GLOBAL" != true ]; then fail 'Aside is account-scoped; INSTALL_GLOBAL=true is required'; fi

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
  info "Dry run: shared router destination $ROOT; bootstrap resolves target $AGENT; no changes made."
  info 'Runtime support, account selection, and catalog selections are validated during execution, not by this bootstrap preview.'
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
if [ "$GLOBAL" = true ] && ! command -v jeo-skill >/dev/null 2>&1; then
  info 'Add $HOME/.local/bin to PATH to use jeo-skill.'
fi
info 'Selected installation completed; runtime activation may require a reload.'
