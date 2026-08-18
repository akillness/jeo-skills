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
# `mex mcp` CLI subcommand in the released mex-agent package (verified against
# mex-agent 0.7.1). Do not add one until mex-memory/mex confirms publication.
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
# etc. — it prints a prompt (between the "COPY BELOW/ABOVE THIS LINE" banners)
# that a human must paste into their coding agent chat to actually populate the
# wiki. This script surfaces that requirement; it cannot skip it.
#
# Also note: mex setup's "Has population finished?" grounding prompt is
# TTY-only, so driving setup non-interactively (as this script does) skips
# grounding capture. Run `mex ground` after the agent populates the scaffold.
#
# Env knobs:
#   GLOBAL=1           install the skill globally (npx skills add -g)
#   AGENTS=<list>      comma/space agent IDs for -a targeting (e.g. "claude-code,codex")
#   SKIP_SKILL=1       same as --skip-skill

set -euo pipefail

log() { printf '\033[1;34m[mex]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[mex]\033[0m %s\n' "$*" >&2; }
die() { printf '\033[1;31m[mex]\033[0m %s\n' "$*" >&2; exit 2; }

REPO_URL="https://github.com/akillness/jeo-skills"
SKILL="mex"

PROJECT_PATH="."
MODE=""
FORCE=0
SKIP_SKILL_FLAG=0
TOOL="codex"

# mex setup has no non-interactive tool flag, so the choice is piped to its
# menu. Numbers verified against mex-agent 0.7.1 (selectToolConfig).
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
    # ponytail: help is this header, printed until the first non-comment line —
    # no second copy of the flag docs and no line numbers to drift.
    -h | --help) awk 'NR>1 && /^#/ { sub(/^# ?/, ""); print; next } NR>1 { exit }' "$0"; exit 0 ;;
    -*) die "Unknown flag: $1 (see --help)" ;;
    *) PROJECT_PATH="$1"; shift ;;
  esac
done

TOOL_CHOICE="$(tool_choice_number "$TOOL")"

[ -d "$PROJECT_PATH" ] || die "Project path does not exist: $PROJECT_PATH"

# ---- step 1: skill (plugin) registration ----
# ponytail: build the whole npx invocation in one array — correct quoting with
# no shellcheck word-splitting pragma. Seeded with the fixed args (never empty)
# because bash 3.2, still the system bash on macOS, treats "${arr[@]}" on an
# empty array as an unbound variable under `set -u`.
NPX_ARGS=(skills add "$REPO_URL" --skill "$SKILL" --yes)
[ "${GLOBAL:-0}" = "1" ] && NPX_ARGS+=(-g)
for a in ${AGENTS:+${AGENTS//,/ }}; do
  NPX_ARGS+=(-a "$a")
done


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
  npx "${NPX_ARGS[@]}" \
    || warn "npx skills add failed — install manually (git clone)."

}

# ---- step 2: Node.js and mex-agent ----
require_node() {
  command -v node >/dev/null 2>&1 || die "Node.js >= 22.5 is required. Install it, then re-run."
  # ponytail: parse `node --version` with shell expansion rather than spawning
  # node twice to ask it about itself.
  local ver major minor
  ver="$(node --version)"
  ver="${ver#v}"
  major="${ver%%.*}"
  minor="${ver#*.}"
  minor="${minor%%.*}"
  if [ "$major" -lt 22 ] || { [ "$major" -eq 22 ] && [ "$minor" -lt 5 ]; }; then
    die "Node.js v$ver found; mex requires >= 22.5"
  fi
}

# A `mex` on PATH is not necessarily mex-agent: TeX Live (Homebrew) ships an
# unrelated `mex` (pdfTeX format). Match mex-agent's bare semver output so we
# never drive `mex setup` through the wrong binary.
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
  if ! command -v mex >/dev/null 2>&1; then
    command -v npm >/dev/null 2>&1 || die "npm not found; cannot install mex-agent"
    log "Installing mex-agent globally (npm install -g mex-agent)..."
    npm install -g mex-agent
    command -v mex >/dev/null 2>&1 || die "mex-agent install finished but 'mex' is still not on PATH"
  fi
  # ponytail: no "already on PATH" line here — verify_mex_agent is the single
  # place that reports the version, so a colliding binary is never announced
  # as if it were mex-agent.
  verify_mex_agent
}

# ---- step 3: scaffold project memory ----
run_setup() {
  if [ -d "$PROJECT_PATH/.mex" ] && [ "$FORCE" != "1" ]; then
    log ".mex/ already exists at $PROJECT_PATH — skipping 'mex setup' (use --force to re-run)"
    return 0
  fi
  log "Running 'mex setup' in $PROJECT_PATH (auto-answering the tool prompt: $TOOL -> choice $TOOL_CHOICE)..."
  local setup_log args=(setup)
  if [ -n "$MODE" ]; then
    args+=(--mode "$MODE")
  fi
  setup_log="$(mktemp)"
  # mex setup asks two piped questions: which tool anchor to write, and whether
  # to install mex globally (already handled above, so decline it here).
  (cd "$PROJECT_PATH" && printf '%s\nn\n' "$TOOL_CHOICE" | mex "${args[@]}") | tee "$setup_log"
  if grep -q "COPY ABOVE THIS LINE" "$setup_log"; then
    warn "'mex setup' only created an EMPTY .mex/ scaffold + the $TOOL anchor file."
    warn "The wiki content (context/*.md, patterns/*) is NOT populated yet — copy the"
    warn "prompt printed above (between the two 'COPY ... THIS LINE' banners) into"
    warn "your coding agent's chat so it fills in the scaffold from the real codebase."
    warn "Afterwards run 'mex ground' — grounding capture is TTY-only and was skipped."
  fi
  rm -f "$setup_log"
}

# ---- step 4/5: code graph, then health check ----
run_graph() {
  log "Building the code graph ('mex graph') in $PROJECT_PATH..."
  (cd "$PROJECT_PATH" && mex graph) || warn "'mex graph' reported an issue; see output above"
}

run_check() {
  log "Running 'mex check' in $PROJECT_PATH..."
  (cd "$PROJECT_PATH" && mex check) || warn "'mex check' reported drift or issues; see output above"
}

# ---- step 6: report which project anchor mex installed ----
report_anchor() {
  local found=0
  for anchor in CLAUDE.md AGENTS.md .cursorrules .windsurfrules .github/copilot-instructions.md .opencode/opencode.json; do
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
