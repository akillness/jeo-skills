#!/usr/bin/env bash
# mex installer — one-shot: register the jeo-skills plugin, install mex-agent,
# scaffold project memory (mex setup), build the code graph (mex graph), and
# report a health check (mex check).
#
# mex setup itself writes the project's "rule document" — a root anchor file
# (CLAUDE.md, AGENTS.md, .cursorrules, .windsurfrules,
# .github/copilot-instructions.md, or .opencode/opencode.json) chosen by
# detected tooling. This script does not invent its own anchor logic; it
# reports whichever file mex actually created.
#
# Idempotent and safe to re-run: mex setup is skipped once .mex/ exists,
# unless --force is given. mex graph and mex check are always safe to re-run.
#
# There is intentionally no MCP registration step here: mex's MCP package
# (packages/mex-mcp) is not published to npm as of this writing and ships no
# `mex mcp` CLI subcommand in the released mex-agent package. Do not add one
# until https://github.com/mex-memory/mex confirms publication.
#
# Usage:
#   bash scripts/install.sh [project_path]
#   bash scripts/install.sh /path/to/project --mode agent-memory
#   bash scripts/install.sh /path/to/project --force
#   bash scripts/install.sh /path/to/project --tool claude
#   SKIP_SKILL=1 bash scripts/install.sh /path/to/project
#
# Flags:
#   --mode <mode>    passed through to `mex setup --mode <mode>` (e.g. agent-memory)
#   --force          re-run `mex setup` even if .mex/ already exists
#   --skip-skill     skip the jeo-skills plugin registration step
#   --tool <name>    which anchor `mex setup`'s interactive prompt should pick:
#                    claude | cursor | windsurf | copilot | opencode | codex |
#                    multiple | none (default: codex, i.e. AGENTS.md — the
#                    anchor jeo/gjc/jeopi/Codex all read the same way)
#
# IMPORTANT: `mex setup` only creates an EMPTY .mex/ scaffold plus the project
# anchor file. It does NOT auto-populate context/architecture.md, patterns/*,
# etc. — it prints a prompt (between "COPY ABOVE THIS LINE" banners) that a
# human must paste into their coding agent chat to actually populate the
# wiki. This script surfaces that requirement; it cannot skip it.
#
# Env knobs:
#   GLOBAL=1           install the skill globally (npx skills add -g)
#   AGENTS=<list>       comma/space agent IDs for -a targeting (e.g. "claude-code,codex")
#   SKIP_SKILL=1        same as --skip-skill

set -euo pipefail

log()  { printf '\033[1;34m[mex]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[mex]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[mex]\033[0m %s\n' "$*" >&2; exit 2; }

REPO_URL="https://github.com/akillness/jeo-skills"
SKILL="mex"

PROJECT_PATH="."
MODE=""
FORCE=0
SKIP_SKILL_FLAG=0
TOOL="codex"

tool_choice_number() {
  case "$1" in
    claude) echo 1 ;;
    cursor) echo 2 ;;
    windsurf) echo 3 ;;
    copilot) echo 4 ;;
    opencode) echo 5 ;;
    codex) echo 6 ;;
    multiple) echo 7 ;;
    none) echo 8 ;;
    *) die "Unknown --tool value: $1 (claude|cursor|windsurf|copilot|opencode|codex|multiple|none)" ;;
  esac
}

while (($# > 0)); do
  case "$1" in
    --mode) MODE="${2:?--mode needs a value, e.g. agent-memory}"; shift 2 ;;
    --force) FORCE=1; shift ;;
    --skip-skill) SKIP_SKILL_FLAG=1; shift ;;
    --tool) TOOL="${2:?--tool needs a value}"; shift 2 ;;
    -h|--help) sed -n '2,37p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*) die "Unknown flag: $1 (see --help)" ;;
    *) PROJECT_PATH="$1"; shift ;;
  esac
done

TOOL_CHOICE="$(tool_choice_number "$TOOL")"

[ -d "$PROJECT_PATH" ] || die "Project path does not exist: $PROJECT_PATH"

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
  if [ "${SKIP_SKILL:-0}" = "1" ] || [ "$SKIP_SKILL_FLAG" = "1" ]; then
    log "SKIP_SKILL — skipping jeo-skills plugin registration"
    return 0
  fi
  if ! command -v npx >/dev/null 2>&1; then
    warn "Node.js/npx not found. Manual install:"
    warn "  git clone $REPO_URL && cp -r jeo-skills/.agent-skills/$SKILL ~/.agents/skills/$SKILL"
    return 0
  fi
  log "Registering the '$SKILL' skill via npx skills..."
  # shellcheck disable=SC2086
  npx skills add "$REPO_URL" --skill "$SKILL" $GLOBAL_FLAG $AGENT_FLAGS --yes \
    || warn "npx skills add failed — install manually (git clone)."
}

# ---- step 2: Node.js and mex-agent ----
require_node() {
  command -v node >/dev/null 2>&1 || die "Node.js >= 22.5 is required. Install it, then re-run."
  local major minor
  major="$(node -e 'console.log(process.versions.node.split(".")[0])')"
  minor="$(node -e 'console.log(process.versions.node.split(".")[1])')"
  if [ "$major" -lt 22 ] || { [ "$major" -eq 22 ] && [ "$minor" -lt 5 ]; }; then
    die "Node.js $(node --version) found; mex requires >= 22.5"
  fi
}

verify_mex_agent() {
  local ver
  ver="$(mex --version 2>&1 | head -1)"
  if [[ ! "$ver" =~ ^[0-9]+\.[0-9]+\.[0-9]+ ]]; then
    warn "'mex' on PATH does not look like mex-agent (got: $ver)"
    warn "resolved to: $(command -v mex)"
    warn "Another tool already owns the 'mex' command on this machine (a common collision"
    warn "is TeX Live's mex/pdfTeX format, installed via Homebrew). Fix PATH so the npm"
    warn "global bin dir wins, or run every mex-agent command as 'npx mex-agent <command>'"
    warn "instead of bare 'mex'."
    die "Refusing to run 'mex setup' against a binary that is not mex-agent."
  fi
  log "Confirmed mex-agent on PATH: $ver ($(command -v mex))"
}

install_mex_agent() {
  if command -v mex >/dev/null 2>&1; then
    log "'mex' already on PATH: $(mex --version 2>&1 | head -1)"
  else
    command -v npm >/dev/null 2>&1 || die "npm not found; cannot install mex-agent"
    log "Installing mex-agent globally (npm install -g mex-agent)..."
    npm install -g mex-agent
    command -v mex >/dev/null 2>&1 || die "mex-agent install finished but 'mex' is still not on PATH"
  fi
  verify_mex_agent
}

# ---- step 3: scaffold project memory ----
run_setup() {
  if [ -d "$PROJECT_PATH/.mex" ] && [ "$FORCE" != "1" ]; then
    log ".mex/ already exists at $PROJECT_PATH — skipping 'mex setup' (use --force to re-run)"
    return 0
  fi
  log "Running 'mex setup' in $PROJECT_PATH (auto-answering the tool prompt: $TOOL -> choice $TOOL_CHOICE)..."
  local setup_log
  setup_log="$(mktemp)"
  # mex setup asks two interactive questions: which tool anchor to write, and
  # whether to install mex globally (already handled by install_mex_agent
  # above, so decline it here). Piping answers keeps this script non-interactive.
  if [ -n "$MODE" ]; then
    (cd "$PROJECT_PATH" && printf '%s\nn\n' "$TOOL_CHOICE" | mex setup --mode "$MODE") | tee "$setup_log"
  else
    (cd "$PROJECT_PATH" && printf '%s\nn\n' "$TOOL_CHOICE" | mex setup) | tee "$setup_log"
  fi
  if grep -q "COPY ABOVE THIS LINE" "$setup_log"; then
    warn "'mex setup' only created an EMPTY .mex/ scaffold + the $TOOL anchor file."
    warn "The wiki content (context/*.md, patterns/*) is NOT populated yet — copy the"
    warn "prompt printed above (between the two 'COPY ABOVE THIS LINE' banners) into"
    warn "your coding agent's chat so it fills in the scaffold from the real codebase."
  fi
  rm -f "$setup_log"
}

# ---- step 4: build the code graph ----
run_graph() {
  log "Building the code graph ('mex graph') in $PROJECT_PATH..."
  (cd "$PROJECT_PATH" && mex graph) || warn "'mex graph' reported an issue; see output above"
}

# ---- step 5: health check ----
run_check() {
  log "Running 'mex check' in $PROJECT_PATH..."
  (cd "$PROJECT_PATH" && mex check) || warn "'mex check' reported drift or issues; see output above"
}

# ---- step 6: report which project anchor mex installed ----
report_anchor() {
  local anchors=(
    "CLAUDE.md"
    "AGENTS.md"
    ".cursorrules"
    ".windsurfrules"
    ".github/copilot-instructions.md"
    ".opencode/opencode.json"
  )
  local found=0
  for anchor in "${anchors[@]}"; do
    if [ -f "$PROJECT_PATH/$anchor" ]; then
      log "Project anchor present: $anchor"
      found=1
    fi
  done
  if [ "$found" = "0" ]; then
    warn "No known project anchor file found under $PROJECT_PATH — check 'mex setup' output above"
  else
    log "jeo, gjc, and jeopi read a root AGENTS.md the same way Codex does, so that anchor"
    log "(when present) doubles as their rule document with no extra step."
  fi
}

# ---- main ----
install_skill
require_node
install_mex_agent
run_setup
run_graph
run_check
report_anchor

log "Done. Edit $PROJECT_PATH/.mex/ROUTER.md to route agent context by task type."
log "MCP: not published upstream yet — see https://github.com/mex-memory/mex#mcp-server"
