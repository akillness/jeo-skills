#!/usr/bin/env bash
# slides-grab installer wrapper.
# Installs the slides-grab CLI (NomaDamas/slides-grab, MIT) the recommended way:
# the npm package + Playwright Chromium (needed for render/validate/export),
# then registers its shared agent skills via `npx skills add`.
# slides-grab is a Node.js >= 20 package; HTML/CSS slides export to PDF/PNG and
# experimental/unstable PPTX/Figma. To develop slides-grab itself, clone the
# repo instead: git clone https://github.com/NomaDamas/slides-grab.git
#
# Env knobs:
#   SLIDES_GRAB_DIR        — install target directory (default: ~/.slides-grab)
#   SLIDES_GRAB_NO_SKILLS=1 — install the package only, skip `npx skills add`
#   SLIDES_GRAB_AGENTS     — agents for skills registration (default: "codex claude-code")
#
# Usage:
#   bash scripts/install.sh
#   SLIDES_GRAB_DIR=~/tools/slides-grab bash scripts/install.sh
#   SLIDES_GRAB_NO_SKILLS=1 bash scripts/install.sh

set -euo pipefail

SLIDES_GRAB_DIR="${SLIDES_GRAB_DIR:-$HOME/.slides-grab}"
SLIDES_GRAB_AGENTS="${SLIDES_GRAB_AGENTS:-codex claude-code}"

echo "=== slides-grab installer ==="
echo "dir:    ${SLIDES_GRAB_DIR}"
echo "agents: ${SLIDES_GRAB_AGENTS}"

if ! command -v node >/dev/null 2>&1; then
  echo "  ⚠️  node not found — install Node.js >= 20 first: https://nodejs.org/" >&2
  exit 1
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "  ⚠️  Node.js >= 20 required (found $(node -v)). Upgrade Node before continuing." >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "  ⚠️  npm not found — it ships with Node.js; check your install." >&2
  exit 1
fi

echo "[1/3] Installing the slides-grab npm package into ${SLIDES_GRAB_DIR}"
mkdir -p "$SLIDES_GRAB_DIR"
( cd "$SLIDES_GRAB_DIR" \
  && { [ -f package.json ] || npm init -y >/dev/null 2>&1; } \
  && npm install slides-grab ) \
  && echo "  ✅ slides-grab installed"

echo "[2/3] Installing Playwright Chromium (render / validate / export pipeline)"
( cd "$SLIDES_GRAB_DIR" && npx --yes playwright install chromium ) \
  && echo "  ✅ Chromium ready" \
  || echo "  ⚠️  Chromium install failed — re-run: (cd $SLIDES_GRAB_DIR && npx playwright install chromium)"

if [ "${SLIDES_GRAB_NO_SKILLS:-0}" = "1" ]; then
  echo "[3/3] SLIDES_GRAB_NO_SKILLS=1 — skipping agent-skill registration."
else
  echo "[3/3] Registering shared slides-grab agent skills"
  AGENT_FLAGS=()
  for a in $SLIDES_GRAB_AGENTS; do
    AGENT_FLAGS+=( -a "$a" )
  done
  ( cd "$SLIDES_GRAB_DIR" \
    && npx --yes skills add ./node_modules/slides-grab -g "${AGENT_FLAGS[@]}" --yes --copy ) \
    && echo "  ✅ skills registered for: ${SLIDES_GRAB_AGENTS}" \
    || echo "  ⚠️  'npx skills add' failed — register later from ${SLIDES_GRAB_DIR}/node_modules/slides-grab"
fi

echo ""
echo "Done. Next steps:"
echo "  • CLI lives under: ${SLIDES_GRAB_DIR}/node_modules/.bin/slides-grab"
echo "  • From that dir:    npx slides-grab list-styles    # browse 35 design styles"
echo "  • Plan → Design a deck, then:  npx slides-grab edit --slides-dir decks/my-deck"
echo "  • Validate before export:      npx slides-grab validate --slides-dir decks/my-deck"
echo "  • Export PDF:                   npx slides-grab pdf --slides-dir decks/my-deck --output deck.pdf"
echo "  • Live showcase: https://nomadamas.github.io/slides-grab/"
echo "  • To develop slides-grab itself: git clone https://github.com/NomaDamas/slides-grab.git"
