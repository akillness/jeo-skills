#!/usr/bin/env bash
# Lightweight jeo-skills installer. Default: install only the jeo-skill router.
set -euo pipefail

REPO_URL="${JEO_SKILLS_SOURCE:-https://github.com/akillness/jeo-skills}"
SELECTION="${JEO_SKILLS_SELECTION:-router}" # router | bundle | category | all
BUNDLE="${JEO_SKILLS_BUNDLE:-starter}"
CATEGORY="${JEO_SKILLS_CATEGORY:-}"
SUBCATEGORY="${JEO_SKILLS_SUBCATEGORY:-}"
AGENT="${JEO_SKILLS_AGENT:-universal}"
GLOBAL="${INSTALL_GLOBAL:-true}"

info() { printf '[jeo-skills] %s\n' "$*"; }
fail() { printf '[jeo-skills] ERROR: %s\n' "$*" >&2; exit 1; }

command -v python3 >/dev/null 2>&1 || fail "Python 3.9+ is required"
command -v npx >/dev/null 2>&1 || fail "Node.js/npx is required"

ADD_ARGS=(--skill jeo-skill --agent "$AGENT" --yes --copy --full-depth)
if [ "$GLOBAL" = "true" ]; then
  ADD_ARGS+=(--global)
fi

info "Installing the lightweight jeo-skill router only"
npx --yes skills add "$REPO_URL" "${ADD_ARGS[@]}"

find_cli() {
  local candidate
  for candidate in \
    "$HOME/.agents/skills/jeo-skill/scripts/jeo-skill.py" \
    "$HOME/.claude/skills/jeo-skill/scripts/jeo-skill.py" \
    "$PWD/.agents/skills/jeo-skill/scripts/jeo-skill.py" \
    "$PWD/.claude/skills/jeo-skill/scripts/jeo-skill.py"; do
    if [ -f "$candidate" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}

CLI_PATH="$(find_cli)" || fail "jeo-skill installed, but its CLI path was not found"
python3 "$CLI_PATH" link
jeo-skill doctor

case "$SELECTION" in
  router)
    info "Router ready. No catalog skills or heavy dependencies were installed."
    ;;
  bundle)
    info "Installing curated bundle: $BUNDLE"
    SELECT_ARGS=(--bundle "$BUNDLE" --agent "$AGENT" --yes)
    if [ "$GLOBAL" = "true" ]; then SELECT_ARGS+=(--global); fi
    jeo-skill install "${SELECT_ARGS[@]}"
    ;;
  category)
    [ -n "$CATEGORY" ] || fail "JEO_SKILLS_CATEGORY is required for category mode"
    SELECT_ARGS=(--category "$CATEGORY" --agent "$AGENT" --yes)
    if [ "$GLOBAL" = "true" ]; then SELECT_ARGS+=(--global); fi
    if [ -n "$SUBCATEGORY" ]; then SELECT_ARGS+=(--subcategory "$SUBCATEGORY"); fi
    jeo-skill install "${SELECT_ARGS[@]}"
    ;;
  all)
    info "Explicit full install selected"
    FULL_ARGS=(--skill '*' --agent "$AGENT" --yes --copy --full-depth)
    if [ "$GLOBAL" = "true" ]; then FULL_ARGS+=(--global); fi
    npx --yes skills add "$REPO_URL" "${FULL_ARGS[@]}"
    ;;
  *)
    fail "JEO_SKILLS_SELECTION must be router, bundle, category, or all"
    ;;
esac
