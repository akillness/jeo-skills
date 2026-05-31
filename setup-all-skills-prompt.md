# Agent Skills — LLM Installation Delegation Guide

> **For AI Agents**: Read this file in full, then execute all steps without asking for further confirmation. Default installation is **full** — only skip steps if the user explicitly requests "minimal" or "core only."

> **CRITICAL — Preserve Existing Skills**: This installation MUST NOT delete or remove any skills that were not installed by this guide. Only add new skills or overwrite/update skills from this repository. Never run `skills remove`, `skills clear`, `skills reset`, or any destructive command. If a skill already exists, update it in place.

> **CRITICAL — No Duplicate Platform Exposure**: Platform-specific skills (`omc`, `ohmg`, `omx`) MUST only be linked to their target agent(s). Use `-a` to target specific agents — never use `-a '*'` for platform-specific skills.

> ```bash
> curl -s https://raw.githubusercontent.com/akillness/oh-my-skills/main/setup-all-skills-prompt.md
> ```

---

## Execution Principles

| Perspective | Rule |
|-------------|------|
| **Systems Engineer** | Lock defaults explicitly — full install unless overridden |
| **New User** | Eliminate ambiguity — run the complete installation by default |
| **Guide Author** | Skip full install only when user says "core only" or "minimal install" |
| **Preservation Rule** | Never delete existing skills — only add new or overwrite skills from this repo |
| **Dedup Rule** | Platform-specific skills target only their agents; shared skills target all agents |

---

## Step 0 — Environment Assessment

Check which AI platforms are installed and set the installation root:

```bash
# ── OS / platform detection ──────────────────────────────────
_OS="$(uname -s 2>/dev/null || echo Windows)"
case "$_OS" in
  Darwin*)               PLATFORM="macos"   ;;
  Linux*)                PLATFORM="linux"   ;;
  MINGW*|MSYS*|CYGWIN*)  PLATFORM="windows" ;;
  *)                     PLATFORM="windows" ;;
esac
echo "=== OS: $PLATFORM ==="

# Platform-specific home and skills root
# macOS / Linux : $HOME/.agents/skills
# Windows (Git Bash / WSL) : $USERPROFILE/.agents/skills
if [ "$PLATFORM" = "windows" ]; then
  _HOME="${USERPROFILE:-$HOME}"
else
  _HOME="$HOME"
fi
SKILLS_ROOT="$_HOME/.agents/skills"
REPO_URL="https://github.com/akillness/oh-my-skills"
echo "SKILLS_ROOT: $SKILLS_ROOT"

# Claude Code config root (platform-specific)
if [ "$PLATFORM" = "windows" ]; then
  CLAUDE_CONFIG_DIR="${APPDATA:-$_HOME/AppData/Roaming}/Claude"
elif [ "$PLATFORM" = "macos" ]; then
  CLAUDE_CONFIG_DIR="$_HOME/.claude"
else
  CLAUDE_CONFIG_DIR="$_HOME/.claude"
fi
echo "CLAUDE_CONFIG_DIR: $CLAUDE_CONFIG_DIR"

# ── Agent detection ───────────────────────────────────────────
echo ""
echo "=== Platform Detection ==="
DETECTED_AGENTS=""
if command -v claude   &>/dev/null; then echo "✅ Claude Code";  DETECTED_AGENTS="${DETECTED_AGENTS:+$DETECTED_AGENTS,}claude-code"; fi
if command -v codex    &>/dev/null; then echo "✅ Codex CLI";    DETECTED_AGENTS="${DETECTED_AGENTS:+$DETECTED_AGENTS,}codex"; fi
# agy is the canonical binary name (not antigravity); some Linux packagers ship antigravity as an alias.
# Dir-only existence is NOT enough — stale `~/.gemini/antigravity/` from a failed prior install would
# trigger a false positive. Require the binary OR the authoritative config marker.
if command -v agy &>/dev/null \
  || command -v antigravity &>/dev/null \
  || [ -f "$_HOME/.gemini/antigravity-cli/settings.json" ]; then
  echo "✅ Antigravity CLI (agy)"
  DETECTED_AGENTS="${DETECTED_AGENTS:+$DETECTED_AGENTS,}antigravity"
fi
if command -v opencode &>/dev/null; then echo "✅ OpenCode";     DETECTED_AGENTS="${DETECTED_AGENTS:+$DETECTED_AGENTS,}opencode"; fi

[ -z "$DETECTED_AGENTS" ] && { echo "⚠️  No AI agents detected. Install at least one platform first."; exit 1; }
echo ""
echo "Target agents: $DETECTED_AGENTS"

# Snapshot existing skills BEFORE installation (for preservation check)
echo ""
echo "=== Existing Skills (will be preserved) ==="
if [ -d "$SKILLS_ROOT" ]; then
  ls "$SKILLS_ROOT" 2>/dev/null | sort > /tmp/skills_before.txt
  cat /tmp/skills_before.txt
  echo "($(wc -l < /tmp/skills_before.txt | tr -d ' ') skills found — none will be removed)"
else
  echo "(skills directory not yet created)"
  touch /tmp/skills_before.txt
fi

# Ensure skills CLI is available
if ! command -v skills &>/dev/null; then
  echo ""
  echo "Installing skills CLI..."
  npm install -g skills
fi
```

---

## Step 1 — Install All 132 Skills (Batch)

Install all skills to the global location, then link shared skills to all detected agents.
Re-running this step safely overwrites existing skills (symlinks are updated in place).

> **Do not skip Step 2** — it re-links platform-specific skills to their correct agents only.

```bash
# ────────────────────────────────────────────────────────
# Flag reference:
#   -g          : install to global location (~/.agents/skills/)
#   -a <agents> : link to specific agents (comma-separated, or '*' for all)
#   --skill <s> : select specific skills (comma-separated, or '*' for all)
#   --yes       : skip interactive prompts
#   --copy      : copy files instead of symlinks (robust overwrite)
# ────────────────────────────────────────────────────────

# Install ALL 132 skills to global store, link shared skills to all detected agents
# --full-depth: discovers nested skills (7 skills require this to be found)
# Platform-specific skills (omc, ohmg, omx) are re-targeted in Step 2
skills add -g "$REPO_URL" --skill '*' -a '*' --yes --copy --full-depth
```

> **Global vs Project install — why skill files may be missing**
>
> **Global install** (`-g`): downloads all 132 skills from the GitHub repo into the agent's global
> skills store (`~/.claude/skills/`, `~/.codex/skills/`, etc.). Requires `--full-depth` to discover
> the 7 skills whose `SKILL.md` is nested in a subdirectory. Without this flag only ~120 skills
> are found and linked.
>
> **Project install** (`experimental_install` / `skills restore`): reads `skills-lock.json` in the
> project root and restores **only the skills listed there** — not all 132. If `skills-lock.json`
> contains only 8 entries (omc, ooo, ai-tool-compliance, llm-monitoring-dashboard, survey, harness,
> deep-dive, deepinit) then only those 8 are restored regardless of how many are in the global store. To include more
> skills in a project install, add them to `skills-lock.json` first.
>
> **Root cause summary**:
> 1. Missing `--full-depth` → 7 nested skills skipped on global install
> 2. Sparse `skills-lock.json` → project install only restores listed entries
> 3. CLI `isExcluded` drops dotfiles (e.g. `.env.example`) during copy — upstream limitation
> 4. Empty `files` arrays in `skills.json` → HTTP/well-known install path broken for those skills

> **agentation MCP**: `npx add-mcp "npx -y agentation-mcp server"` — auto-detects 9+ agents.
> **agentation Claude Code Official Skill**: `npx skills add benjitaylor/agentation -g` → `/agentation` in conversation.
>
> **presentation-builder**: Requires Node.js 18+, `npx playwright install chromium`, and `slides-grab --help` before first use. Best for real deck artifacts (investor / roadmap / launch / architecture-demo / workshop / game-pitch) when you need one chosen deck mode, one smallest useful artifact packet, and one honest last-mile surface (HTML review, PPTX, PDF, Google Slides, or Figma Slides).

---

## Step 2 — Fix Platform-Specific Skill Links (Dedup)

### Vercel `skills` CLI scope map

`skills add <source>` installs to project scope by default; `skills add -g <source>` installs globally for the selected agent. Use `-a claude-code`, `-a codex`, `-a gemini-cli`, or `-a opencode` to target one agent instead of auto-detection.

| OS / shell | Global examples | Project examples |
|------------|-----------------|------------------|
| macOS / Linux | `$HOME/.claude/skills/`, `$HOME/.codex/skills/`, `$HOME/.gemini/skills/`, `$HOME/.config/opencode/skills/`, `$HOME/.agents/skills/` | `.claude/skills/`, `.agents/skills/` |
| Windows PowerShell | `$env:USERPROFILE\.claude\skills\`, `$env:USERPROFILE\.codex\skills\`, `$env:USERPROFILE\.gemini\skills\`, `$env:APPDATA\opencode\skills\`, `$env:USERPROFILE\.agents\skills\` | `.claude\skills\`, `.agents\skills\` |
| Windows Git Bash / WSL2 | `$HOME/.claude/skills/`, `$HOME/.codex/skills/`, `$HOME/.gemini/skills/`, `$HOME/.config/opencode/skills/`, `$HOME/.agents/skills/` | `.claude/skills/`, `.agents/skills/` |

Install the Claude-derived skills added to this repo:

```bash
skills add -g "$REPO_URL" --skill deepinit --skill deep-dive -a claude-code --yes --copy --full-depth
```

Platform-specific skills must only appear on their target agent(s).
This step **re-links** them with correct `-a` targeting, replacing the `*` links from Step 1.

```bash
# ╔══════════════════════════════════════════════════════════════╗
# ║  Platform Skill Mapping (from SKILL.md metadata)            ║
# ║                                                              ║
# ║  omc       → Claude Code only                               ║
# ║  ohmg      → Gemini CLI (+ Antigravity)                     ║
# ║  omx       → Codex + Claude Code + Gemini CLI               ║
# ╚══════════════════════════════════════════════════════════════╝

# omc — Claude Code only
skills add -g "$REPO_URL" --skill omc -a 'claude-code' --yes --copy

# ohmg — Antigravity CLI
# Binary: agy (canonical); some Linux distros also ship as 'antigravity' alias
# skills CLI globalSkillsDir = ~/.gemini/antigravity/skills; detection requires `agy` or
#   ~/.gemini/antigravity-cli/settings.json (config root for agy lifecycle hooks).
# Older Vercel skills CLI versions reject `-a antigravity`; fall back to gemini-cli and
# mirror the install into the antigravity skills dir so `agy` discovers it.
mkdir -p "$_HOME/.gemini/antigravity/skills"
mkdir -p "$_HOME/.gemini/antigravity-cli/hooks"
# Capture stderr so we can distinguish "unknown agent" rejection from real failures
# (network / source / install errors) — the latter must surface, not silently fall back.
_OHMG_ERR="$(mktemp -t ohmg_skills_err.XXXXXX 2>/dev/null || echo /tmp/ohmg_skills_err.$$)"
if skills add -g "$REPO_URL" --skill ohmg -a 'antigravity' --yes --copy 2>"$_OHMG_ERR"; then
  rm -f "$_OHMG_ERR"
elif grep -qiE 'unknown agent|invalid agent|unsupported agent|agent .* not (recognized|supported|found)' "$_OHMG_ERR"; then
  echo "ℹ️  skills CLI does not recognize '-a antigravity' — using '-a gemini-cli' + refresh mirror"
  rm -f "$_OHMG_ERR"
  skills add -g "$REPO_URL" --skill ohmg -a 'gemini-cli' --yes --copy
  if [ -d "$_HOME/.gemini/skills/ohmg" ]; then
    # Refresh (not append) — older mirrors must not shadow the new install
    rm -rf "$_HOME/.gemini/antigravity/skills/ohmg"
    cp -R "$_HOME/.gemini/skills/ohmg" "$_HOME/.gemini/antigravity/skills/ohmg"
    echo "✅ ohmg mirrored to $_HOME/.gemini/antigravity/skills/ohmg"
  fi
else
  echo "❌ ohmg install failed (non-agent error):" >&2
  cat "$_OHMG_ERR" >&2
  rm -f "$_OHMG_ERR"
  # Do not mask network/source failures with a silent fallback
fi

# omx — Codex CLI primary, also usable from Claude Code
# NOTE: Codex CLI does NOT auto-load `~/.codex/skills/`. The omx skill ships its own
# runtime via `omx setup` (Step 3g via oh-my-codex). Writing to ~/.codex/skills/ is
# kept for parity with other agents but only takes effect through OMX's loader.
skills add -g "$REPO_URL" --skill omx -a 'codex,claude-code' --yes --copy

# ── Clean stale symlinks from non-target agents ──
echo ""
echo "=== Cleaning duplicate platform skill links ==="

cleanup_skill_link() {
  local skill="$1"; shift
  local allowed=("$@")

  for agent_dir in "${CLAUDE_CONFIG_DIR:-$_HOME/.claude}/skills" "$_HOME/.codex/skills" "$_HOME/.gemini/antigravity/skills" "$_HOME/.config/opencode/skills"; do
    local agent_name
    case "$agent_dir" in
      */.claude/*|*/Claude/*)         agent_name="claude-code" ;;
      */.codex/*)                     agent_name="codex" ;;
      */.gemini/antigravity/*)        agent_name="antigravity" ;;
      */.config/opencode/*)           agent_name="opencode" ;;
    esac

    local is_allowed=false
    for a in "${allowed[@]}"; do
      [[ "$a" == "$agent_name" ]] && is_allowed=true
    done

    if ! $is_allowed && [ -e "$agent_dir/$skill" ]; then
      rm -rf "$agent_dir/$skill"
      echo "  Removed $skill from $agent_name (not a target platform)"
    fi
  done
}

cleanup_skill_link "omc"       "claude-code"
cleanup_skill_link "ohmg"      "antigravity"
cleanup_skill_link "omx"       "codex" "claude-code"

echo "✅ Platform skill deduplication complete"
```

---

## Step 3 — Core Tool Installation

Install the tools that power the default operating flow (`$ooo` → `$graphify` → `$rtk` → `$obsidian` → `$llm-wiki`).

> **Prerequisite**: Run Step 0 first so `$PLATFORM`, `$_HOME`, `$SKILLS_ROOT`, and `$CLAUDE_CONFIG_DIR` are set.

### 3a — RTK (Rust Token Killer — compact shell output)

```bash
echo "=== Installing RTK ==="
_HOME="${_HOME:-${USERPROFILE:-$HOME}}"
# WARNING: `brew install rtk` installs the wrong package (Rust Type Kit, not Rust Token Killer).
# Use cargo or the official installer on all platforms.
case "$PLATFORM" in
  macos|linux)
    if command -v cargo &>/dev/null; then
      cargo install rtk
    else
      curl -fsSL https://raw.githubusercontent.com/crates-io/rtk/main/install.sh | sh
    fi
    export PATH="$_HOME/.cargo/bin:$PATH"
    ;;
  windows)
    if command -v cargo &>/dev/null; then
      cargo install rtk
      export PATH="${_HOME//\\//}/.cargo/bin:$PATH"
    else
      echo "⚠️  Install rtk: cargo install rtk  OR  https://github.com/crates-io/rtk/releases"
    fi
    ;;
esac

# Initialize globally (adds rtk hook to shell profile / PowerShell profile on Windows)
if command -v rtk &>/dev/null; then
  rtk init -g
  echo "✅ rtk installed and initialized"
  rtk gain
else
  echo "⚠️  rtk not found — re-run after manual install"
fi
```

### 3b — Graphify (knowledge graph generator)

```bash
echo "=== Installing Graphify ==="
# Package name: graphifyy — but import name is: graphify (not graphifyy)
# Install into a dedicated venv to avoid PEP 668 restrictions on managed Python installs.
_HOME="${_HOME:-${USERPROFILE:-$HOME}}"
GRAPHIFY_VENV="$_HOME/.agents/venvs/graphify"
if [ "$PLATFORM" = "windows" ]; then
  GRAPHIFY_PY="$GRAPHIFY_VENV/Scripts/python.exe"
else
  GRAPHIFY_PY="$GRAPHIFY_VENV/bin/python"
fi
uv venv "$GRAPHIFY_VENV" 2>/dev/null || true
uv pip install graphifyy --python "$GRAPHIFY_PY" 2>&1 | tail -2
echo "✅ graphify installed (venv: $GRAPHIFY_VENV)"
"$GRAPHIFY_PY" -c "import graphify; print('graphify import OK')"
```

### 3c — ooo MCP Server (Ouroboros spec-first dev loop)

```bash
echo "=== Installing ooo (Ouroboros) ==="
_HOME="${_HOME:-${USERPROFILE:-$HOME}}"
# Verify a pip command actually exists before invoking it — prior code fell back to
# `pip` without checking, which crashed on systems with only `python3 -m pip` available.
if command -v pip3 &>/dev/null; then
  PIP_CMD="pip3"
elif command -v pip &>/dev/null; then
  PIP_CMD="pip"
elif command -v python3 &>/dev/null && python3 -m pip --version &>/dev/null; then
  PIP_CMD="python3 -m pip"
else
  echo "❌ No pip found — install Python 3 + pip first (https://pip.pypa.io/en/stable/installation/)" >&2
  return 1 2>/dev/null || exit 1
fi
$PIP_CMD install "ouroboros-ai[all]"
echo "✅ ouroboros-ai installed"

# MCP config paths per platform
CODEX_MCP_DIR="$_HOME/.codex"

# Register ooo MCP with Claude Code
if command -v claude &>/dev/null; then
  claude mcp add ooo -s user -- ouroboros mcp serve
  echo "✅ ooo MCP registered with Claude Code"
fi

# Register ooo MCP with Codex.
# IMPORTANT: Codex CLI reads `~/.codex/config.toml` with `[mcp_servers.<name>]` blocks,
# NOT `~/.codex/mcp.json`. Earlier setup wrote a JSON file that Codex silently ignored,
# so the `ooo` server never registered. Append a TOML block instead, idempotently.
if command -v codex &>/dev/null; then
  mkdir -p "$CODEX_MCP_DIR"
  CODEX_TOML="$CODEX_MCP_DIR/config.toml"
  touch "$CODEX_TOML"
  if ! grep -q '^\[mcp_servers\.ooo\]' "$CODEX_TOML" 2>/dev/null; then
    {
      printf '\n[mcp_servers.ooo]\n'
      printf 'command = "ouroboros"\n'
      printf 'args = ["mcp", "serve"]\n'
    } >> "$CODEX_TOML"
    echo "✅ ooo MCP registered with Codex ($CODEX_TOML)"
  else
    echo "ℹ️  ooo MCP already in $CODEX_TOML — skipping"
  fi
  # Remove obsolete JSON file from older installs (never read by Codex)
  [ -f "$CODEX_MCP_DIR/mcp.json" ] && rm -f "$CODEX_MCP_DIR/mcp.json" \
    && echo "🧹 Removed obsolete $CODEX_MCP_DIR/mcp.json (unused by Codex)"
fi

ouroboros --version 2>/dev/null && echo "✅ ouroboros ready" || echo "⚠️  ouroboros not in PATH — restart shell"
```

### 3d — Obsidian CLI (desktop vault persistence)

```bash
echo "=== Installing Obsidian CLI ==="
_HOME="${_HOME:-${USERPROFILE:-$HOME}}"
case "$PLATFORM" in
  macos)
    # Obsidian is a cask (GUI app), not a formula — --cask is required
    command -v brew &>/dev/null && brew install --cask obsidian \
      || echo "ℹ️  brew not found — install Obsidian from https://obsidian.md/download"
    ;;
  linux)
    # Obsidian is NOT on the Snap Store — use flatpak only
    if command -v flatpak &>/dev/null; then
      flatpak install flathub md.obsidian.Obsidian -y
    else
      echo "ℹ️  Install Obsidian AppImage from https://obsidian.md/download"
    fi
    ;;
  windows)
    if command -v winget &>/dev/null; then
      winget install Obsidian.Obsidian
    elif command -v choco &>/dev/null; then
      choco install obsidian -y
    else
      echo "ℹ️  Install Obsidian from https://obsidian.md/download"
    fi
    ;;
esac

command -v obsidian &>/dev/null \
  && echo "✅ obsidian CLI available" \
  || echo "ℹ️  obsidian desktop CLI not in PATH — URI fallback (obsidian://) will be used"
```

### 3e — llm-wiki (persistent markdown wiki)

```bash
echo "=== Bootstrapping llm-wiki vault ==="
# Defensive home guard (safe when run standalone without Step 0 context)
_HOME="${_HOME:-${USERPROFILE:-$HOME}}"
# Platform-aware default vault location — all platforms use ~/wiki for cross-platform Obsidian compatibility
case "$PLATFORM" in
  windows|macos|linux) WIKI_DEFAULT="$_HOME/wiki" ;;
esac
WIKI_VAULT="${LLM_WIKI_VAULT:-$WIKI_DEFAULT}"

if [ ! -d "$WIKI_VAULT" ]; then
  mkdir -p "$WIKI_VAULT/raw" "$WIKI_VAULT/wiki"
  touch "$WIKI_VAULT/index.md" "$WIKI_VAULT/log.md"
  echo "✅ wiki vault bootstrapped at $WIKI_VAULT"
else
  echo "✅ wiki vault exists at $WIKI_VAULT"
fi
echo "   Set LLM_WIKI_VAULT to override the default location."
```

### 3f — semble MCP (token-efficient code search)

```bash
echo "=== Registering semble MCP ==="
_HOME="${_HOME:-${USERPROFILE:-$HOME}}"
# Re-derive PLATFORM so this step works when re-run standalone after a shell restart
if [ -z "${PLATFORM:-}" ]; then
  case "$(uname -s 2>/dev/null || echo Windows)" in
    Darwin*)              PLATFORM="macos"   ;;
    Linux*)               PLATFORM="linux"   ;;
    MINGW*|MSYS*|CYGWIN*) PLATFORM="windows" ;;
    *)                    PLATFORM="windows" ;;
  esac
fi
# Uses uvx (part of uv) — install uv if missing
if ! command -v uvx &>/dev/null; then
  case "$PLATFORM" in
    macos|linux)
      curl -LsSf https://astral.sh/uv/install.sh | sh
      export PATH="$_HOME/.local/bin:$_HOME/.cargo/bin:$PATH"
      ;;
    windows)
      PS_CMD="pwsh"; command -v pwsh &>/dev/null || PS_CMD="powershell"
      $PS_CMD -c "irm https://astral.sh/uv/install.ps1 | iex"
      _WIN="${_HOME//\\//}"
      export PATH="$_WIN/.local/bin:$_WIN/.cargo/bin:${LOCALAPPDATA//\\//}/uv/bin:${LOCALAPPDATA//\\//}/Programs/uv:$PATH"
      ;;
  esac
fi
if ! command -v uvx &>/dev/null; then
  echo "⚠️  uvx not found after install — restart shell then re-run Step 3f"; return 0 2>/dev/null || exit 0
fi

if command -v claude &>/dev/null; then
  claude mcp add semble -s user -- uvx --from "semble[mcp]" semble
  echo "✅ semble MCP registered with Claude Code"
fi

# Register semble MCP with Codex via config.toml (same constraint as ooo: codex reads TOML, not JSON)
if command -v codex &>/dev/null; then
  mkdir -p "$_HOME/.codex"
  CODEX_TOML="$_HOME/.codex/config.toml"
  touch "$CODEX_TOML"
  if ! grep -q '^\[mcp_servers\.semble\]' "$CODEX_TOML" 2>/dev/null; then
    {
      printf '\n[mcp_servers.semble]\n'
      printf 'command = "uvx"\n'
      printf 'args = ["--from", "semble[mcp]", "semble"]\n'
    } >> "$CODEX_TOML"
    echo "✅ semble MCP registered with Codex ($CODEX_TOML)"
  fi
fi
```

### 3g — Platform Plugin Setup

```bash
echo "=== Platform Plugin Setup ==="
_HOME="${_HOME:-${USERPROFILE:-$HOME}}"

# ── Claude Code: oh-my-claudecode plugin ─────────────────────────
# Provides /team, /autopilot, /ralph, /ultrawork, /ultraqa slash commands.
# Slash commands (/plugin, /omc:omc-setup) only execute INSIDE a Claude Code
# session — they fail with "No such file or directory" when run in bash.
# Use the `claude plugin` CLI subcommand for automated install; if the local
# Claude CLI version does not support it, print the in-session fallback.
if command -v claude &>/dev/null; then
  if claude plugin marketplace add https://github.com/Yeachan-Heo/oh-my-claudecode 2>/dev/null \
     && claude plugin install oh-my-claudecode 2>/dev/null; then
    echo "✅ Claude Code: oh-my-claudecode plugin installed"
    echo "   Open Claude Code once and run: /omc:omc-setup"
  else
    echo "ℹ️  'claude plugin' CLI unavailable in this Claude version."
    echo "   Open Claude Code and run these three slash commands manually:"
    echo "     /plugin marketplace add https://github.com/Yeachan-Heo/oh-my-claudecode"
    echo "     /plugin install oh-my-claudecode"
    echo "     /omc:omc-setup"
  fi
fi

# ── Codex CLI: oh-my-codex (OMX) ─────────────────────────────────
# Without OMX, the skill manuals for omx ship to ~/.codex/skills/ but the
# actual $team / $autopilot / $ulw / $ultraqa workflows have no runtime —
# Codex sees the keywords as unknown. OMX provides the loader + prompts.
if command -v codex &>/dev/null; then
  if command -v npm &>/dev/null; then
    npm install -g oh-my-codex 2>&1 | tail -3
    if command -v omx &>/dev/null; then
      omx setup
      echo "✅ Codex: oh-my-codex (omx) configured — \$team / \$autopilot / \$ulw / \$ultraqa available"
    else
      echo "⚠️  omx CLI not on PATH after install — restart shell, then run: omx setup"
    fi
  else
    echo "⚠️  npm not found — install Node.js to enable OMX workflows on Codex"
    echo "   https://nodejs.org/"
  fi
fi

# ── Antigravity / Gemini CLI: oh-my-agent (OMA) ──────────────────
# Without OMA, the ohmg skill manual lives in ~/.gemini/antigravity/skills/
# but /team /orchestrate /plan /work /ultrawork /review have no implementation.
# Install order preference: bun → npm → curl installer (each is documented upstream).
if command -v agy &>/dev/null || command -v antigravity &>/dev/null \
   || [ -f "$_HOME/.gemini/antigravity-cli/settings.json" ] \
   || command -v gemini &>/dev/null; then
  if command -v bun &>/dev/null; then
    bun install --global oh-my-agent 2>&1 | tail -3
  elif command -v npm &>/dev/null; then
    npm install -g oh-my-agent 2>&1 | tail -3
  else
    curl -fsSL https://raw.githubusercontent.com/first-fluke/oh-my-agent/main/cli/install.sh | bash
  fi
  if command -v oma &>/dev/null; then
    echo "✅ Antigravity/Gemini: oh-my-agent (oma) installed — run 'oma link' inside a project"
  else
    echo "⚠️  oma CLI not on PATH — restart shell, then verify with: oma --version"
  fi
fi

# ── OpenCode: oh-my-opencode ─────────────────────────────────────
if command -v opencode &>/dev/null; then
  echo "ℹ️  OpenCode — manual install required:"
  echo "   https://github.com/code-yeongyu/oh-my-opencode/blob/master/docs/guide/installation.md"
  echo "   After installing, run: skills add -g $REPO_URL --yes --copy"
fi

# ── agentation Official Skill (UI annotation) ────────────────────
npx -y skills add benjitaylor/agentation -g
echo "✅ agentation skill installed"
```

> **TOON Format**: `~/.claude/hooks/toon-inject.mjs` injects the skill catalog into every prompt (40–50% token savings). `~/.gemini/antigravity-cli/hooks/toon-skill-inject.sh` loads it via Antigravity's lifecycle hook system (`agy inspect` shows loaded hooks).

**Windows note**: Run all bash steps in **Git Bash** or **WSL2**. PowerShell users: replace `$_HOME` with `$env:USERPROFILE` and use `python` instead of `python3`.

---

## Step 4 — Verification

```bash
_HOME="${_HOME:-${USERPROFILE:-$HOME}}"
SKILLS_ROOT="${SKILLS_ROOT:-$_HOME/.agents/skills}"
REPO_URL="https://github.com/akillness/oh-my-skills"

# Core skill check
echo ""
echo "=== Core Skill Check ==="
for skill in omc ohmg omx ooo stitch-skills compresso pretext god-tibo-imagen zeude plannotator agentation bmad survey harness rtk graphify obsidian llm-wiki semble; do
  [ -f "$SKILLS_ROOT/$skill/SKILL.md" ] \
    && echo "✅ $skill" \
    || echo "❌ $skill — re-run: skills add -g $REPO_URL --skill $skill --yes --copy"
done

# Platform dedup check
echo ""
echo "=== Platform Dedup Check ==="
check_no_dup() {
  local skill="$1" agent_dir="$2" agent_name="$3"
  [ -e "$agent_dir/$skill" ] && echo "⚠️  $skill found on $agent_name (should not be there)"
}
check_no_dup "omc"  "$_HOME/.gemini/antigravity/skills"             "antigravity"
check_no_dup "omc"  "$_HOME/.codex/skills"                        "codex"
check_no_dup "omc"  "$_HOME/.config/opencode/skills"              "opencode"
check_no_dup "ohmg" "${CLAUDE_CONFIG_DIR:-$_HOME/.claude}/skills" "claude-code"
check_no_dup "ohmg" "$_HOME/.codex/skills"                        "codex"
echo "✅ Platform dedup verified"

# Preservation check
if [ -f /tmp/skills_before.txt ] && [ -s /tmp/skills_before.txt ]; then
  echo ""
  echo "=== Preservation Check ==="
  ls "$SKILLS_ROOT" 2>/dev/null | sort > /tmp/skills_after.txt
  MISSING=$(comm -23 /tmp/skills_before.txt /tmp/skills_after.txt)
  if [ -z "$MISSING" ]; then
    echo "✅ All pre-existing skills preserved — nothing was removed"
  else
    echo "⚠️  Missing skills (were present before):"
    echo "$MISSING"
    echo "Restore: skills add -g <source> --skill <name> --yes --copy"
  fi
  rm -f /tmp/skills_before.txt /tmp/skills_after.txt
fi

# Final count
echo ""
TOTAL=$(ls "$SKILLS_ROOT" 2>/dev/null | wc -l | tr -d ' ')
echo "=== Installation Complete: $TOTAL skills installed ==="
```

First run after installation:

| Platform | Command |
|----------|---------|
| Claude Code | `ooo interview "task"` or `/oh-my-claudecode:team "task"` |
| Gemini CLI | `bmad "task"` or `ooo interview "task"` |
| Codex CLI | `bmad "task"` or `ooo interview "task"` |
| OpenCode | `bmad "task"` or `ooo interview "task"` |

---

## Step 5 — GitHub Star (Consent-First)

> **For AI Agents**: Check `gh` auth status, then ask the user **once**. Execute only on consent. Never re-ask in the same session.

```bash
STAR_GUARD="$HOME/.omc/state/oh-my-skills-star-prompted"
STAR_REPO="akillness/oh-my-skills"

if [ -f "$STAR_GUARD" ]; then
  echo "(star prompt already shown — skipping)"
else
  mkdir -p "$(dirname "$STAR_GUARD")"

  if ! command -v gh &>/dev/null; then
    echo "gh CLI not found. To star later: brew install gh && gh auth login"
    echo "  gh api --method PUT /user/starred/$STAR_REPO"
    touch "$STAR_GUARD"

  elif ! gh auth status &>/dev/null 2>&1; then
    echo "gh CLI not authenticated. To star later: gh auth login"
    echo "  gh api --method PUT /user/starred/$STAR_REPO"
    touch "$STAR_GUARD"

  else
    if [ -t 0 ]; then
      read -p "Star $STAR_REPO? [Y/n] " -n 1 -r REPLY; echo ""
      if [[ -z "$REPLY" || "$REPLY" =~ ^[Yy]$ ]]; then
        gh api --silent --method PUT "/user/starred/$STAR_REPO" 2>/dev/null \
          && echo "⭐ Starred $STAR_REPO" \
          || echo "Star failed — try: gh api --method PUT /user/starred/$STAR_REPO"
      fi
    else
      echo "Run this to star: gh api --method PUT /user/starred/$STAR_REPO"
    fi
    touch "$STAR_GUARD"
  fi
fi
```

**For AI Agents**: After Step 4 succeeds, ask once:
> "Installation complete! Would you like to star the oh-my-skills repository? It helps the project grow."

If yes → `gh api --silent --method PUT /user/starred/akillness/oh-my-skills`
If no → skip silently. Never re-ask.

---

## Quick Reference

| Goal | Command |
|------|---------|
| Start any task | `ooo interview "task"` or `bmad "task"` |
| Claude orchestration | `autopilot: task` or `/oh-my-claudecode:team "task"`; Codex parity: `$autopilot`; Antigravity/OMA parity: `/plan` → `/work` |
| Visual plan review | `plan` (plannotator keyword) |
| Spec-first dev loop | `ooo interview "X"` or `ouroboros init start "X"` *(install: `claude plugin marketplace add Q00/ouroboros` or `pip install ouroboros-ai[all]`)* |
| Pre-impl research | `survey "topic"` *(writes reusable `.survey/{slug}/` artifacts and validates the artifact contract before handoff)* |
| Agent team design | `harness "design team for X"` |
| UI annotation | `annotate` (agentation keyword) |
| Kanban board | `kanbanview` (vibe-kanban keyword) |
| Security scan | `strix --target ./app` |
| Web scraping | `scrapling "URL"` |
| Persistent wiki | `llm-wiki "/path/to/vault"` |
| Token output optimizer | `rtk gain` |

---

## Skill Inventory (132 skills)

| Category | Skills | Agent Target |
|----------|--------|--------------|
| **Core Orchestration** | ooo, plannotator, survey, harness, bmad, bmad-gds, bmad-idea, omc, omx, autopilot, team, ultrawork, ultraqa, deep-dive *(cross-runtime trace-to-interview pipeline for OMC, OMX, and OMA with artifact validation before handoff)*, deepinit *(generate hierarchical AGENTS.md documentation with manual-note preservation, runtime-state exclusion, and parent-link validation)*, vibe-kanban, agentation, ccpi-marketplace *(Tons of Skills marketplace via ccpi CLI and Claude plugin marketplace)* | All (`*`) |
| **Platform Setup** | omc *(Claude-first OMC router; maps `/team`, `/autopilot`, `/ultrawork`, `/ultraqa` intents to OMX/OMA when cross-runtime parity is requested)* | claude-code |
| **Platform Setup** | ohmg *(Gemini/Antigravity OMA harness; maps team/autopilot/ultrawork/ultraqa intents to `/orchestrate`, `/plan` → `/work`, `/ultrawork`, `/review`, or `oma agent:parallel` while keeping `.agents` canonical)* | antigravity |
| **Platform Setup** | omx *(Codex workflow layer with `$team`, `$autopilot`, `$ulw`/`$ultrawork`, and `$ultraqa` equivalents for Claude team/autopilot/ultrawork/ultraqa workflows)* | codex, claude-code |
| **Planning & Review** | browser-harness *(self-healing LLM browser automation via CDP for Claude Code, Codex, Antigravity, Gemini CLI, and OpenCode; replaces agent-browser; includes Claude-safe screenshot/PIL patch, agent-editable `agent_helpers.py`, domain skills, Browser Use Cloud)*, playwriter *(running-browser / authenticated Chrome reuse via CLI+MCP; route clean disposable checks to browser-harness)*, prompt-repetition *(decision-first prompt repetition for non-reasoning/lightweight models on long-context retrieval, options-first MCQ, or position-sensitive lookups; route broader context/retrieval fixes away instead of blanket auto-apply)*, skill-standardization *(SKILL.md validate/rewrite + canonical-vs-alias cleanup + repo-root validator / derived-surface sync for `skills.json`, README/setup, and `SKILL.toon`)*, skill-autoresearch *(repo-local skill ratcheting loop: freeze evals, mutate one thing at a time, keep or revert by score, then sync support surfaces only when the core skill change is justified)* | All (`*`) |
| **Agent Development** | microsoft-agent-framework *(enterprise-grade agent systems with Microsoft agent framework patterns — role separation, workflow control, policy enforcement)*, openai-agents-python *(multi-agent workflows with OpenAI Agents SDK — agents/tools/handoffs, guardrails, async pipelines)*, pydantic-ai *(typed LLM applications — schema-constrained outputs, tool integration, validation, dependency injection)* | All (`*`) |
| **Backend** | api-design *(contract-first API design / compatibility review)*, api-documentation *(developer-facing API docs anchor for reference portals / quickstarts / SDK-webhook guides / truthful examples / auth-error guidance)*, authentication-setup *(product-auth setup router for hosted/framework-native/platform-native auth, sessions/JWTs, org data boundaries, and enterprise SSO handoff; routes hardening to security-best-practices)*, backend-testing *(packet-first backend testing for coverage-plan, fixture/reset, contract/API protection, flake-stabilization, and local-vs-CI lane-split packets; routes policy to testing-strategies, API shape to api-design, and auth implementation to authentication-setup)*, database-schema-design *(packet-first storage-model and migration-safety design for relational/document/hybrid schemas, queryable-vs-flexible field decisions, and staged evolution; routes interface work to api-design, verification to backend-testing, and reporting/telemetry follow-through outward)*, payloadcms *(Payload CMS content/collection management — typed collections, access control, hooks, REST/GraphQL API, local API patterns)*, supabase-agent-skills *(Supabase full-stack patterns — Auth, Database, Storage, Edge Functions, Realtime, RLS policies, and migration workflows)* | All (`*`) |
| **Design Tools** | stitch-skills *(Agent Skills for Stitch MCP — generate high-fidelity UI screens, multi-page websites, DESIGN.md docs, enhance prompts, convert to React/shadcn-ui, Remotion walkthrough videos. Plugin: `claude plugin marketplace add google-labs-code/stitch-skills`)*, compresso *(free offline desktop video/image compression via Tauri+React — batch compress, trim/split, convert, embed subtitles; uses FFmpeg/pngquant/jpegoptim/gifski. Install: `brew install --cask codeforreal1/tap/compresso`)*, open-design *(local-first open-source design tool — generate prototypes, decks, and media artifacts using installed coding agents; 72 built-in design systems, 5 visual directions, multi-format export HTML/PDF/PPTX/ZIP/Markdown, AI media via gpt-image-2 and Seedance 2.0. Plugin: `claude plugin marketplace add nexu-io/open-design`)* | All (`*`) |
| **Creative Media** | god-tibo-imagen *(AI image generation via Codex ChatGPT backend — zero deps, reuses `~/.codex/auth.json`, CLI `gti`, Node.js library, Python SDK, reference image inputs, dry-run mode. Plugin: `claude plugin marketplace add NomaDamas/god-tibo-imagen`)* | All (`*`) |
| **Creative Media** | notebooklm *(query Google NotebookLM notebooks directly from Claude Code — Patchright browser automation, source-grounded citation-backed answers, persistent Google auth, notebook library management. Local Claude Code only. Plugin: `claude plugin marketplace add PleasePrompto/notebooklm-skill`)* | claude-code |
| **Infrastructure** | zeude *(enterprise AI adoption platform for Claude Code — 3× adoption improvement via OpenTelemetry measurement, centralized skill/MCP/hook sync (Zeude Shim), context-aware skill suggestions. Requires Supabase + ClickHouse. Plugin: `claude plugin marketplace add zep-us/zeude`)* | Claude |
| **Frontend** | pretext *(fast, accurate multiline text measurement & layout without DOM reflow — prepare/layout for height, prepareWithSegments/layoutWithLines for per-line access, emoji/CJK/RTL, DOM·Canvas·SVG output. npm: `@chenglou/pretext`)*, design-system *(canonical UI-system anchor for token governance, visual-language rules, primitive naming, and cross-surface direction; routes component API design to ui-component-patterns, responsive layout to responsive-design, accessibility remediation to web-accessibility, and broad critique to web-design-guidelines)*, frontend-design-system *(compatibility alias for design-system)*, react-best-practices *(measurement-led React / Next.js performance audits for waterfalls, bundle size, hydration, rerender churn, and client-boundary mistakes)*, react-grab, vercel-react-best-practices *(compatibility alias for react-best-practices)*, responsive-design *(routing-first responsive layout strategy for page-shell, component-slot, dense-data, media, and reflow-verification packets; routes component API design to ui-component-patterns, accessibility remediation to web-accessibility, system-wide breakpoint policy to design-system, and broad UI critique to web-design-guidelines)*, state-management *(React/fullstack ownership-packet skill for local vs Context vs URL/form vs client-store vs server-state/router-data decisions)*, ui-component-patterns *(routing-first reusable-component architecture for primitive-boundary, slot-anatomy, controlled-ownership, alternate-root composition, and docs/verification packets)*, web-accessibility *(routing-first accessibility remediation and verification for semantics, keyboard/focus, labels/announcements, reflow, media alternatives, and routed-app feedback; routes broad UI critique to web-design-guidelines and layout strategy to responsive-design)*, web-design-guidelines *(broad web UI audit for launch-readiness, polish/consistency, flow-friction, heuristic, and rule-overlay reviews; routes accessibility-heavy work to web-accessibility and layout adaptation to responsive-design)* | All (`*`) |
| **Code Quality** | aider-cli-workflow *(AI pair programming with Aider CLI — architect/editor model split, repo-map, git auto-commit, watch mode, voice, browser UI)*, agentic-skills *(production-grade engineering framework drawing from Google practices — spec-driven development `/spec`, task planning `/plan`, incremental TDD `/build`, browser verification `/test`, five-axis code review `/review`, behavior-preserving simplification `/code-simplify`, and disciplined git/CI/CD shipping `/ship`; Hyrum's Law / Chesterton's Fence / Shift Left / trunk-based development. Plugin: `claude plugin marketplace add addyosmani/agent-skills`)*, code-refactoring *(packet-first behavior-preserving cleanup for local refactors, fragile legacy freeze-first work, cleanup-heavy diff shaping, and repeated migration / codemod planning; routes diagnosis to debugging, review judgment to code-review, test-policy design to testing-strategies, bottleneck-led tuning to performance-optimization, and impact mapping to codebase-search)*, code-review *(evidence-first diff / PR review with severity, missing-proof checks, and route-outs for Git cleanup, debugging, UI critique, and repo-admin work)*, debugging *(routing-first diagnosis for concrete bugs, regressions, flaky failures, and env-specific behavior; routes symptom-first logs to log-analysis, broad test-policy work to testing-strategies, and perf-only work to performance-optimization)*, performance-optimization *(artifact-first measurement-led bottleneck analysis and tuning across traces, reports, query plans, benchmark diffs, CWV packets, and runtime/frame-budget work; routes telemetry setup to monitoring-observability and engine-specific capture interpretation to game-performance-profiler)*, testing-strategies *(packet-first validation-policy router for merge-gate truth, release-only proof, scheduled breadth, and incident-ratchet decisions; routes implementation to backend-testing, diagnosis to debugging, rollout execution to deployment-automation, game launch to steam-store-launch-ops / game-ci-cd-pipeline, accessibility-heavy validation to web-accessibility, and performance gate work to performance-optimization)* | All (`*`) |
| **Code Quality** (mattpocock) | diagnose *(systematic 6-phase debugging: feedback loop → reproduce → hypothesize → instrument → fix+test → cleanup; invest in Phase 1 first)*, tdd *(red-green-refactor vertical slices — test behavior through public interfaces, not implementation details)*, migrate-to-shoehorn *(TypeScript test `as` assertions → type-safe fromPartial/fromAny/fromExact from @total-typescript/shoehorn; test code only)* | All (`*`) |
| **Design Review & Architecture** (mattpocock) | grill-with-docs *(stress-test plans against domain model, sharpen terminology, update CONTEXT.md/ADRs inline)*, improve-codebase-architecture *(surface shallow modules, propose deepening opportunities using deletion-test/seam/locality vocabulary)*, zoom-out *(higher-level architectural perspective mapping modules and caller relationships using domain vocabulary)*, grill-me *(systematic plan stress-testing through relentless one-question-at-a-time decision-tree interviewing)* | All (`*`) |
| **Issue & Project Management** (mattpocock) | triage *(issue state machine: needs-triage → needs-info → ready-for-agent/ready-for-human/wontfix with AI disclaimer on all comments)*, to-issues *(convert plans/specs into independently-grabbable vertical slice issues, classified as HITL or AFK)*, to-prd *(generate structured PRDs from conversation context — problem statement, user stories, implementation decisions, testing strategy)* | All (`*`) |
| **Productivity & Git** (mattpocock) | caveman *(~75% token reduction by eliminating filler; activate: "caveman mode"/"less tokens"; deactivate: "stop caveman")*, write-a-skill *(create structured agent skills with proper SKILL.md — description field is the critical activation trigger)*, git-guardrails-claude-code *(prevent destructive git operations via Claude Code PreToolUse hooks)*, setup-pre-commit *(configure Husky + lint-staged + Prettier pre-commit hooks)*, scaffold-exercises *(create educational exercise directories compliant with pnpm ai-hero-cli lint)* | All (`*`) |
| **Infrastructure** | deployment-automation *(release-execution anchor for preview releases, staging/prod promotion, rollout strategy, post-deploy verification, rollback response, and release hardening; routes CI workflow authoring to workflow-automation, machine setup to system-environment-setup, long-lived telemetry to monitoring-observability, and Vercel-specific linked-project deploy/promote/domain/env/rollback work to vercel-deploy)*, environment-setup *(app-config compatibility alias; routes broader runnable-machine setup to system-environment-setup)*, firebase-ai-logic *(direct Firebase app/client SDK lane for Gemini-powered in-app features; routes backend orchestration to genkit)*, firebase-cli *(Firebase platform/operator anchor for install/auth, bootstrap/config, Emulator Suite workflows, scoped deploy/release, App Hosting, and admin/data operations; routes backend AI workflow orchestration to genkit and direct app SDK integration to firebase-ai-logic)*, genkit *(packet-first backend AI workflow anchor for deciding whether a feature needs a reusable server-owned flow, Genkit eval/tracing, or a fallback to plain SDK routes / `survey`; routes direct app SDK work to firebase-ai-logic and Firebase operator tasks to firebase-cli)*, looker-studio-bigquery *(packet-first BigQuery dashboard/reporting lane for `dashboard-spec`, `slow-dashboard`, `refresh-shape`, `audience-split`, and `exec-handoff`; routes KPI interpretation to data-analysis, repeated anomaly hunting to pattern-detection, and telemetry/alerting coverage to monitoring-observability)*, monitoring-observability *(packet-first observability brief for service health, telemetry rollout, alert/dashboard audits, data-pipeline trust, and game live-ops visibility; routes root-cause log forensics to `log-analysis`, rollout execution to `deployment-automation`, and bottleneck diagnosis to `performance-optimization` / `game-performance-profiler`)*, hyperfine-benchmarking *(CLI command benchmarking via hyperfine — statistical warmup runs, export CSV/JSON/Markdown, cross-platform performance comparison)*, lmstudio-cli *(local LLM management via LM Studio CLI — model discovery, load/unload, chat, server start, OpenAI-compatible endpoint)*, scrapling, rtk, security-best-practices *(routing-first web/ap... [truncated]
| **Documentation** | changelog-maintenance *(routing-first release-history anchor for `CHANGELOG.md`, release notes, migration updates, and lightweight game patch-note packets; routes rollout execution to deployment-automation, launch messaging to marketing-automation, internal specs/runbooks to technical-writing, API portals to api-documentation, and end-user tutorials to user-guide-writing)*, presentation-builder *(packet-first deck artifact anchor for investor / roadmap / launch / architecture-demo / workshop / game-pitch decks; picks one deck mode, one smallest useful artifact packet, and one honest last-mile surface across HTML review, PPTX, PDF, Google Slides, or Figma Slides; routes docs/tutorials/research/non-deck GTM work outward)*, research-paper-writing, technical-writing *(internal technical docs anchor for specs / architecture docs / ADRs / runbooks / migration guides; routes API portals to api-documentation, end-user tutorials to user-guide-writing, and release-note hygiene to changelog-maintenance)*, user-guide-writing *(mode-selecting customer-docs anchor for onboarding guides / tutorials / task how-to articles / FAQs / help-center updates / release-help refresh packets; routes internal docs to technical-writing, API docs to api-documentation, and release-note hygiene to changelog-maintenance)* | All (`*`) |
| **Project Management** | sprint-retrospective *(routing-first retro anchor for sprint/milestone reflection, remote-hybrid facilitation, and dead-action-item recovery)*, standup-meeting *(routing-first coordination-cadence anchor that decides whether daily, async, hybrid, lighter, or no recurring standup is justified before choosing a standup mode)*, task-estimation *(routing-first estimate packet anchor for one sizing horizon, confidence/uncertainty framing, split-or-spike guidance, and cross-functional burden visibility; routes decomposition to `task-planning`, daily sync to `standup-meeting`, and process learning to `sprint-retrospective`)*, task-planning *(packet-first planning anchor for backlog cleanup, feature slicing, sprint/milestone prep, and release packets with explicit route-outs to estimation, boards, review, and pre-planning framing)* | All (`*`) |
| **Search & Analysis** | autoresearch *(Karpathy ML search front door for setup / program.md / bounded loop / results interpretation / constrained-hardware adaptation; preserves the immutable prepare.py / 300s / val_bpb contract and routes prompt-skill eval away)*, codebase-search *(routing-first repo navigation that chooses one search packet for definitions/references, config-content ownership, entry-point discovery, or impact mapping before debugging / refactoring / graphify)*, data-analysis *(decision-first dataset analysis for exports, experiments, telemetry, cohort/funnel work, and stakeholder-ready evidence summaries; routes repeated anomaly hunting to pattern-detection and BI build-out to looker-studio-bigquery)*, langsmith *(routing-first LangSmith packet selector for trace-debug, offline evals, review queues, prompt-registry ownership, and multi-service propagation before SDK code; routes generic dashboards/alerts to `monitoring-observability` and rollout work to `deployment-automation`)*, log-analysis *(routing-first log triage that chooses one evidence packet for app runtime, container/pod, browser+API, CI cascade, structured JSON, or security-signal work before debugging / observability / pattern-detection handoff)*, pattern-detection *(routing-first pattern/anomaly hunting that chooses text-prefilter, structural-code-rule, log-event-pattern, or metric-anomaly before suggesting tools or fixes; routes root-cause forensics to log-analysis, KPI explanation to data-analysis, remediation to specialist skills, and alert ops to monitoring-observability)*, github-repo-candidate-quality-gate *(evaluate GitHub repos as skill/dependency candidates — activity, maintenance health, license, API surface, community signals)*, semble *(token-efficient code search for agents — returns relevant code chunks using ~98% fewer tokens than grep+read; natural-language and symbol queries, `find-related` for semantic discovery, MCP for Claude Code / Codex / Cursor / OpenCode, CPU-only with no GPU or API key. MCP: `claude mcp add semble -s user -- uvx --from "semble[mcp]" semble`)* | All (`*`) |
| **Creative Media** | remotion-video-production *(compatibility alias for video-production when legacy tooling or explicit Remotion naming still expects the old skill)*, video-production *(canonical programmable-video / automated-video production skill for Remotion, template APIs, content repurposing, and QA handoffs)* | All (`*`) |
| **Marketing** | marketing-automation, marketing-skills-collection *(compatibility alias for marketing-automation)* | All (`*`) |
| **Game Development** | game-build-log-triage *(Unity/Unreal build-log triage)*, game-ci-cd-pipeline *(game build/release pipeline design)*, game-demo-feedback-triage *(demo/playtest feedback synthesis)*, game-performance-profiler *(Unity/Unreal performance evidence triage)*, steam-store-launch-ops *(Steam store/festival/wishlist/launch operations)*, unity-gamedev-skill-pack *(Unity-specific game development patterns — scene management, physics, animation, UI Toolkit, addressables, profiling)* | All (`*`) |
| **Utilities** | claudekit *(Claude Code hook library — pre-built PreToolUse/PostToolUse hooks for common guardrails, auto-formatting, and workflow automation)*, clawteam, fabric, file-organization *(repo structure / feature-vs-shared / route-vs-package boundary choice + migration planning)*, ghgrab *(GitHub asset/release downloader — fetch release binaries, source archives, and artifacts from public/private repos via CLI)*, git-submodule, git-workflow, google-workspace, llm-wiki, npm-git-install *(Git dependency / tarball / workspace / publish-first choice)*, obsidian *(unified: plugin dev + CLI automation + markdown/Bases/JSON Canvas — plugin: `claude plugin marketplace add akillness/oh-my-skills`)*, obsidian-cli *(alias → obsidian)*, obsidian-cli-uri-fallback *(obsidian:// URI construction and shell open fallback when desktop CLI is unavailable)*, obsidian-plugin *(alias → obsidian)*, opencontext, workflow-automation *(repo task runners / bootstrap / local-CI automation)* | All (`*`) |

---

## Core Skill Keyword Reference

| Skill | Activation Keyword | Description |
|-------|-------------------|-------------|
| `omc` | `omc`, `autopilot`, `ralph`, `ulw`, `ccg`, `/team`, `omc team`, `omc ask`, `cancelomc` | Claude-first OMC router — distinguish Claude Code slash skills from the `omc` shell CLI, then handle setup/recovery/state issues or route adjacent work outward |
| `stitch-skills` | `stitch`, `stitch-design`, `stitch-loop`, `enhance-prompt`, `screen generation`, `ui generation` | Agent Skills for Stitch MCP — generate UI screens, multi-page sites, enhance prompts, React/shadcn-ui, Remotion videos. Plugin: `claude plugin marketplace add google-labs-code/stitch-skills` |
| `compresso` | `compresso`, `compress video`, `compress image`, `batch compression`, `ffmpeg compression`, `offline video compress` | Free offline desktop video/image compression (Tauri+React) — batch compress, trim/split, convert formats, embed subtitles. Install: `brew install --cask codeforreal1/tap/compresso` |
| `open-design` | `open-design`, `local design tool`, `prototype generation`, `design deck`, `design artifact`, `open design prototype` | Local-first open-source design tool using installed coding agents — 72 built-in design systems, 5 visual directions, multi-format export (HTML/PDF/PPTX/ZIP/Markdown), AI media generation. Plugin: `claude plugin marketplace add nexu-io/open-design` |
| `pretext` | `pretext`, `text measurement`, `text layout`, `paragraph height`, `line layout`, `DOM reflow` | Fast multiline text measurement & layout without DOM reflow — prepare/layout, prepareWithSegments/layoutWithLines, emoji/CJK/RTL. npm: `@chenglou/pretext` |
| `god-tibo-imagen` | `god-tibo-imagen`, `gti`, `image generation`, `codex image`, `chatgpt image`, `ai image` | AI image generation via Codex ChatGPT backend — zero deps, reuses `~/.codex/auth.json`, CLI `gti --prompt`, Node.js and Python SDK. Plugin: `claude plugin marketplace add NomaDamas/god-tibo-imagen` |
| `notebooklm` | `notebooklm`, `notebook lm`, `google notebooklm`, `notebook query`, `ask notebooklm` | Query Google NotebookLM notebooks from Claude Code — Patchright browser automation, source-grounded citation-backed answers, persistent Google auth, notebook library. Local only. Plugin: `claude plugin marketplace add PleasePrompto/notebooklm-skill` |
| `zeude` | `zeude`, `ai adoption`, `claude code adoption`, `enterprise claude`, `opentelemetry claude`, `skill sync` | Enterprise AI adoption platform for Claude Code — 3× adoption improvement via OpenTelemetry, centralized skill/MCP/hook sync (Zeude Shim), context-aware suggestions. Plugin: `claude plugin marketplace add zep-us/zeude` |
| `ooo` | `ooo`, `ouroboros`, `ooo ralph`, `ooo interview` | Ouroboros spec-first development loop — Interview→Seed→Run→Evaluate→Evolve, immutable seed/spec, persistent completion until verification passes. Plugin: `claude plugin marketplace add Q00/ouroboros` |
| `plannotator` | `plan` | Routing-first visual approval gate for concrete plans, markdown specs, and diffs — choose one review packet, keep native-hook vs manual-review reality explicit, and route planning / PR policy / UI critique outward |
| `harness` | `harness`, `build a harness`, `agent team architect` | Meta-skill: design domain-specific agent teams, generate `.claude/agents/` + `.claude/skills/`, validate harness |
| `survey` | `survey` | Bounded cross-platform landscape scan before planning or implementation — classify one survey mode, preserve the 4-lane `.survey/{slug}/` artifact contract, and normalize platform topics as `settings/rules/hooks` |
| `agentation` | `annotate`, `UI검토`, `agentui` | Exact rendered-UI feedback router → choose copy-paste review, watch-loop sync, self-driving critique, or platform setup. MCP: `npx add-mcp "npx -y agentation-mcp server"` |
| `vibe-kanban` | `kanbanview` | Coding-board control plane — bounded coding cards, tracker-linked workspaces, review queues, worktree isolation, and PR handoff |
| `bmad` | `bmad`, `workflow-init`, `workflow-status` | Packet-first BMAD/BMM front door — classify the current packet, choose the next artifact or gate, and route runtime / review / execution detail outward |
| `bmad-gds` | `bmad-gds` | Game-production orchestrator for ideas, GDDs, playtest notes, bugs, and launch beats |
| `bmad-idea` | `bmad-idea` | Pre-planning idea router for product, GTM, consulting, and game concepts → choose one framing mode and one concept artifact |
| `browser-harness` | `browser-harness`, `self-healing browser`, `llm browser automation`, `cdp agent`, `chrome devtools agent`, `codex browser`, `antigravity browser`, `claude screenshot error`, `claude image error` | Self-healing LLM browser automation via CDP for Claude Code, Codex, Antigravity, Gemini CLI, and OpenCode — replaces agent-browser for clean browser verification, uses agent-editable `agent_helpers.py` and domain skills, and documents Claude-safe screenshot handling |
| `obsidian` | `obsidian`, `obsidian plugin`, `obsidian cli`, `obsidian automation`, `obsidian development`, `obsidian eslint`, `obsidian markdown`, `obsidian bases`, `json-canvas`, `obsidian vault`, `obsidian uri` | **Unified Obsidian skill (v2.0)** — plugin development (27 ESLint rules, boilerplate, submission) + CLI automation (commands, TUI, URI handoff, developer mode) + content patterns (markdown, Bases, JSON Canvas). Plugin: `claude plugin marketplace add akillness/oh-my-skills` |
| `obsidian-cli` | `obsidian cli`, `obsidian terminal`, `obsidian plugin reload`, `obsidian://` | *(alias → `obsidian`)* Routing-first Obsidian desktop automation — official CLI command/TUI mode, developer commands, URI handoff |
| `obsidian-plugin` | `obsidian plugin`, `create obsidian plugin` | *(alias → `obsidian`)* Obsidian plugin development — 27 ESLint rules, boilerplate generator, accessibility |
| `llm-wiki` | `llm-wiki`, `obsidian wiki`, `research vault` | Persistent markdown wiki maintenance — bootstrap raw/wiki layers, ingest sources, file queries, run lint passes |
| `game-build-log-triage` | `game build log`, `unity build failed`, `unreal packaging error` | Unity/Unreal build/editor/package log triage — isolate the first actionable engine/build failure |
| `game-ci-cd-pipeline` | `game ci`, `unity build pipeline`, `unreal release pipeline` | Routing-first game CI/CD packets — classify branch-gate vs nightly/package-candidate vs release/certification lane, then choose setup, stage split, cache policy, preflight checks, artifact/release hygiene, or CI trust |
| `game-demo-feedback-triage` | `playtest feedback`, `demo feedback`, `steam feedback triage` | Cluster demo/playtest/community feedback into fix-first priorities and explicit handoffs |
| `game-performance-profiler` | `frame time`, `unity profiler`, `unreal insights` | Turn Unity/Unreal perf packets into one bottleneck-first profiling brief with next captures, benchmark routes, device review, and route-outs |
| `steam-store-launch-ops` | `steam launch`, `steam page`, `wishlist funnel` | Packet-first Steam launch router — choose page promise audit, wishlist signal check, demo readiness gate, event timing workback, or launch-ops runbook |
| `clawteam` | `clawteam`, `agent swarm`, `spawn agents` | Packet-first ClawTeam runtime router — choose manual-team, template-launch, monitor-recover, or profile-setup; route generic orchestration and board-governance outward |
| `autoresearch` | `autoresearch`, `autonomous ml experiments`, `val_bpb` | Karpathy autonomous ML front door — choose setup / `program.md` / bounded loop / results interpretation / constrained-hardware mode, preserve immutable `prepare.py` + 300s + `val_bpb`, not for prompt/skill eval |
| `skill-autoresearch` | `skill-autoresearch`, `optimize this skill`, `eval my skill` | Repo-local skill ratcheting — choose one packet (ratchet eligibility, readiness, charter, baseline, mutation, support-sync, or final report), allow `no ratchet justified`, freeze evals, keep or revert by score, and route hosted eval / ML autoresearch work outward |
| `scrapling` | `scrapling`, `adaptive scraping`, `stealthy fetch`, `selector drift` | Routing-first adaptive web scraping — choose parser-only, HTTP fetch, JS browser, stealth escalation, MCP, or spiders from one intake packet |
| `rtk` | `rtk`, `rust token killer`, `rtk init`, `rtk gain` | RTK install and agent integration — verify correct package, choose init mode, and use compact shell wrappers |
| `strix` | `strix`, `ai pentest`, `vulnerability scan cli` | AI-driven appsec testing — Docker sandbox, LLM provider, local/GitHub/live scans, CI/CD |
| `agentic-skills` | `agentic-skills`, `/spec`, `/plan`, `/build`, `/test`, `/review`, `/code-simplify`, `/ship`, `spec-driven`, `source-driven development`, `google engineering practices` | Production-grade engineering framework for AI agents — spec-driven dev, incremental TDD, five-axis code review, security hardening, and disciplined git/CI/CD workflows. Plugin: `claude plugin marketplace add addyosmani/agent-skills` |
| `research-paper-writing` | `research paper`, `academic paper` | ML/CV/NLP paper + rebuttal workflow — abstract/introduction/method/experiments, figure-table support, reviewer response, camera-ready revision |
| `omx` | `omx`, `$plan`, `$ralph`, `$team`, `$autopilot`, `$ulw`, `$ultraqa`, `$deep-interview`, `$ralplan` | Codex CLI workflow layer with Claude team/autopilot/ultrawork/ultraqa parity — team runtime, explore, sparkshell |
| `autopilot` | `$autopilot`, `autopilot`, `auto pilot`, `full-auto` | Exact-name Codex/OMX front door for idea-to-verified-code autonomous builds |
| `team` | `$team`, `team mode`, `omx team`, `coordinated workers` | Exact-name coordinated multi-agent workflow; prefers `omx team` when the runtime is installed |
| `ultrawork` | `$ultrawork`, `$ulw`, `ultrawork`, `parallel work` | Exact-name high-parallelism burst workflow for independent implementation or cleanup lanes |
| `ultraqa` | `$ultraqa`, `$ultaqa`, `ultraqa`, `QA cycling` | Exact-name QA cycling workflow for tests/build/lint/typecheck/review loops |
| `ohmg` | `ohmg`, `oh-my-agent`, `oma`, `.agents`, `/plan`, `/work`, `/orchestrate`, `/review` | Gemini / Antigravity entry for OMA; maps team/autopilot/ultrawork/ultraqa intents while keeping `.agents` canonical |
| `diagnose` | `diagnose`, `systematic debugging`, `feedback loop`, `six-phase debug` | Systematic debugging: invest in Phase 1 (fast feedback loop), then reproduce → hypothesize → instrument → fix+test → cleanup |
| `tdd` | `tdd`, `test-driven development`, `red-green-refactor`, `test first` | Red-green-refactor TDD using vertical slices — tests specify observable behavior through public interfaces |
| `grill-with-docs` | `grill-with-docs`, `design review`, `challenge my plan` | Stress-test plans against project domain model, sharpen terminology, update CONTEXT.md and ADRs inline |
| `triage` | `triage`, `issue triage`, `state machine issues` | Issue state machine management: needs-triage → needs-info → ready-for-agent / ready-for-human / wontfix |
| `improve-codebase-architecture` | `improve-codebase-architecture`, `deepening opportunities`, `shallow modules` | Identify architectural friction and propose deepening opportunities for testability using deletion-test, seam, locality vocabulary |
| `to-issues` | `to-issues`, `convert to tickets`, `plan to issues` | Convert plans/specs into independently-grabbable vertical slice issues (HITL or AFK classification) |
| `to-prd` | `to-prd`, `generate prd`, `product requirements` | Generate structured PRD from conversation context without interviewing the user |
| `zoom-out` | `zoom-out`, `zoom out`, `architectural overview` | Get higher-level architectural perspective: maps modules, callers, dependencies using domain vocabulary |
| `caveman` | `caveman`, `caveman mode`, `less tokens`, `be brief` | Ultra-compressed communication (~75% token reduction). Activate/deactivate explicitly. |
| `grill-me` | `grill-me`, `stress-test this plan`, `challenge my design` | Systematic plan stress-testing through relentless one-question-at-a-time decision-tree interviewing |
| `write-a-skill` | `write-a-skill`, `create a skill`, `new skill` | Create structured agent skills — description field is the critical trigger agents use for activation |
| `git-guardrails-claude-code` | `git-guardrails-claude-code`, `git guardrails`, `prevent destructive git` | Prevent destructive git operations via Claude Code PreToolUse hooks (force push, reset --hard, etc.) |
| `setup-pre-commit` | `setup-pre-commit`, `pre-commit hooks`, `husky setup` | Configure Husky + lint-staged + Prettier pre-commit hooks for code quality automation |
| `scaffold-exercises` | `scaffold-exercises`, `exercise structure`, `course exercises` | Create educational exercise directories compliant with pnpm ai-hero-cli internal lint |
| `migrate-to-shoehorn` | `migrate-to-shoehorn`, `shoehorn`, `type-safe assertions` | Migrate TypeScript test `as` assertions to fromPartial/fromAny/fromExact from @total-typescript/shoehorn |
| `ccpi-marketplace` | `ccpi`, `ccpi marketplace`, `claude plugin marketplace`, `plugin install` | Tons of Skills marketplace via ccpi CLI and Claude plugin marketplace — browse, install, manage agent skills and plugins |
| `microsoft-agent-framework` | `microsoft agent`, `semantic kernel`, `autogen`, `azure ai agent` | Enterprise-grade agent systems with Microsoft agent framework patterns — role separation, workflow control, policy enforcement |
| `openai-agents-python` | `openai agents`, `openai sdk agents`, `agents sdk`, `handoffs` | Multi-agent workflows with OpenAI Agents SDK — agents/tools/handoffs, guardrails, async pipelines |
| `pydantic-ai` | `pydantic-ai`, `pydantic ai`, `typed llm`, `schema constrained` | Typed LLM applications — schema-constrained outputs, tool integration, validation, dependency injection |
| `payloadcms` | `payload cms`, `payloadcms`, `payload collections`, `payload api` | Payload CMS content/collection management — typed collections, access control, hooks, REST/GraphQL API, local API patterns |
| `supabase-agent-skills` | `supabase`, `supabase auth`, `supabase rls`, `supabase edge functions` | Supabase full-stack patterns — Auth, Database, Storage, Edge Functions, Realtime, RLS policies, migration workflows |
| `aider-cli-workflow` | `aider`, `aider cli`, `ai pair programming`, `aider architect` | AI pair programming with Aider CLI — architect/editor model split, repo-map, git auto-commit, watch mode, voice, browser UI |
| `hyperfine-benchmarking` | `hyperfine`, `benchmark cli`, `command benchmark`, `performance comparison` | CLI command benchmarking via hyperfine — statistical warmup runs, export CSV/JSON/Markdown, cross-platform performance comparison |
| `lmstudio-cli` | `lmstudio`, `lm studio cli`, `local llm`, `lmstudio server` | Local LLM management via LM Studio CLI — model discovery, load/unload, chat, server start, OpenAI-compatible endpoint |
| `github-repo-candidate-quality-gate` | `repo quality gate`, `github repo eval`, `dependency candidate`, `repo health` | Evaluate GitHub repos as skill/dependency candidates — activity, maintenance health, license, API surface, community signals |
| `unity-gamedev-skill-pack` | `unity gamedev`, `unity scene`, `unity ui toolkit`, `unity addressables` | Unity-specific game development patterns — scene management, physics, animation, UI Toolkit, addressables, profiling |
| `claudekit` | `claudekit`, `claude hooks`, `pre tool use hook`, `post tool use hook` | Claude Code hook library — pre-built PreToolUse/PostToolUse hooks for common guardrails, auto-formatting, workflow automation |
| `ghgrab` | `ghgrab`, `github release download`, `github asset`, `download release binary` | GitHub asset/release downloader — fetch release binaries, source archives, artifacts from public/private repos via CLI |
| `obsidian-cli-uri-fallback` | `obsidian uri fallback`, `obsidian:// open`, `obsidian shell open` | obsidian:// URI construction and shell open fallback when desktop CLI is unavailable |
| `semble` | `semble`, `code search`, `semantic code search`, `semble search`, `token-efficient search`, `find code`, `semble find-related`, `agent code search` | Token-efficient code search for agents — returns relevant code chunks using ~98% fewer tokens than grep+read. Natural-language and symbol queries, `find-related` for semantic discovery, MCP for Claude Code / Codex / Cursor / OpenCode, CPU-only. MCP: `claude mcp add semble -s user -- uvx --from "semble[mcp]" semble` |

---

---

## Step 6 — Default Operating Rules (`$ooo` → `$graphify` → `$rtk` → `$obsidian-cli` → `$llm-wiki`)

After installation, treat the following sequence as the **default operating rail** for ongoing work.

> **For AI Agents**: These are permanent operating directives. Follow the order below automatically, but only invoke each skill when it is the honest owner of the next step. Do not force every step onto trivial prompts or onto work that belongs to a different skill.

### Rule 1 — `$ooo` (Specification-First Control)
Start from `$ooo` whenever the request is ambiguous, multi-step, or likely to drift without an explicit contract.

```bash
# Purpose: reduce ambiguity, freeze the contract, execute, and verify before done
# Activation: "ooo", "ouroboros", "ooo ralph", "ooo interview"

# Good defaults:
# - clarify before coding when the request is vague
# - freeze acceptance criteria before larger implementation work
# - keep looping until verification actually passes
```

Operating expectations:
- Clarify before coding when the request is vague enough to risk drift.
- Freeze the seed/spec before substantial execution work.
- Do not silently rewrite acceptance criteria mid-run.
- Treat verification as part of completion, not a final optional check.

### Rule 2 — `$graphify` (Durable Structure and Relationship Memory)
Use `$graphify` when architecture, repo/corpus structure, or relationship tracing should persist across sessions.

```bash
# Purpose: maintain durable graph artifacts and relationship visibility
# Activation: "graphify", "GRAPH_REPORT.md", "graph.json", "graph.html"

# Artifact read order:
# 1. graphify-out/GRAPH_REPORT.md
# 2. graphify-out/graph.html
# 3. graphify-out/graph.json
```

Operating expectations:
- Prefer the existing `graphify-out/GRAPH_REPORT.md` before rebuilding anything.
- Refresh only the smallest useful scope instead of blindly graphing the whole repo.
- Use graph updates for durable structure, not for search-only or wiki-only work.
- Keep the graph packet honest: install vs local build vs refresh vs query vs fallback.

### Rule 3 — `$rtk` (Token-Optimized Shell Execution)
Use `$rtk` as the default shell-output layer so command results stay compact and readable for agent workflows.

```bash
# Purpose: reduce shell-output tokens without losing signal
# Activation: prefix shell commands with rtk

rtk git status
rtk gain
rtk read setup-all-skills-prompt.md
```

Operating expectations:
- Prefix normal shell commands with `rtk` when a compact wrapper exists.
- Verify RTK health with `rtk gain`.
- Use direct `rtk` wrappers when token savings matter or hook behavior is uncertain.
- Remember built-in read/search tools do not automatically pass through RTK shell hooks.

### Rule 4 — `$obsidian-cli` (Official Obsidian Desktop Persistence)
Use `$obsidian-cli` when the next step is to persist or hand off artifacts through a real Obsidian desktop vault.

```bash
# Purpose: official desktop Obsidian CLI/URI control
# Activation: "obsidian cli", "obsidian terminal", "obsidian://"

# Deterministic targeting:
obsidian vault="My Vault" read path="Inbox/Capture.md"
obsidian vault="My Vault" search query="workflow rules"
```

Operating expectations:
- Prefer official CLI/URI surfaces for desktop Obsidian interaction.
- Use deterministic `vault=` plus `path=` targeting when ambiguity matters.
- Route headless sync/publish elsewhere instead of pretending the desktop CLI owns it.
- Use this step only when desktop-vault persistence or URI handoff is actually needed.

### Rule 5 — `$llm-wiki` (Durable Wiki Filing and Retrieval)
Use `$llm-wiki` to file durable findings, decisions, and reusable answers into the persistent markdown wiki.

```bash
# Purpose: accumulate reusable knowledge in markdown, not chat history
# Activation: "llm-wiki", "obsidian wiki", "research vault"

# Core workflow:
# raw/ stays immutable
# wiki/ is the maintained synthesis layer
# index.md and log.md must stay current
```

Operating expectations:
- File significant decisions and reusable answers back into the wiki.
- Keep `raw/` immutable and treat `wiki/`, `index.md`, and `log.md` as maintained artifacts.
- Read `index.md` first during follow-up queries before digging through raw sources.
- Update the schema/operating contract when the workflow itself changes materially.

### Default Operating Flow

```
[1] Start with $ooo to clarify, freeze, and verify the contract
[2] Use $graphify when durable structure or relationship tracing should persist
[3] Run shell work through $rtk for compact execution output
[4] Use $obsidian-cli when desktop Obsidian persistence or URI handoff is the real next step
[5] Use $llm-wiki to file durable discoveries into the wiki and keep index/log current
[6] Continue the loop until the work is verified, not merely described
```

### Setup Script (run once after installation)

```bash
# Re-use PLATFORM / _HOME / SKILLS_ROOT from Step 0 if already set
_OS_STEP6="$(uname -s 2>/dev/null || echo Windows)"
case "$_OS_STEP6" in
  Darwin*)               PLATFORM="${PLATFORM:-macos}"   ;;
  Linux*)                PLATFORM="${PLATFORM:-linux}"   ;;
  MINGW*|MSYS*|CYGWIN*)  PLATFORM="${PLATFORM:-windows}" ;;
  *)                     PLATFORM="${PLATFORM:-windows}" ;;
esac
_HOME="${_HOME:-${USERPROFILE:-$HOME}}"
SKILLS_ROOT="${SKILLS_ROOT:-$_HOME/.agents/skills}"
REPO_URL="${REPO_URL:-https://github.com/akillness/oh-my-skills}"

# Verify the default operating-rule skills are installed
for skill in ooo graphify rtk obsidian llm-wiki semble; do
  [ -f "$SKILLS_ROOT/$skill/SKILL.md" ] \
    && echo "✅ $skill" \
    || echo "❌ $skill — run: skills add -g $REPO_URL --skill $skill --yes --copy"
done

# Initialize RTK when available
if command -v rtk &>/dev/null; then
  rtk init -g && echo "✅ rtk initialized"
else
  echo "⚠️  RTK not found — run Step 3a to install"
fi

# Confirm ooo MCP is registered
if command -v claude &>/dev/null; then
  claude mcp list 2>/dev/null | grep -q "^ooo" \
    && echo "✅ ooo MCP registered with Claude Code" \
    || echo "⚠️  ooo MCP not found — run Step 3c to register"
fi

# ── Knowledge Pipeline Enforcement ───────────────────────────────
# Wire every prompt through: prompt → RTK (bash hook, already installed)
# → graphify (structural graph rebuild) → llm-wiki at ~/vaults/llm-wiki/
# (Obsidian-managed vault). Per-agent hook events:
#   Claude Code   : UserPromptSubmit
#   Codex CLI     : UserPromptSubmit (via ~/.codex/config.toml)
#   Antigravity / : BeforeAgent      (Gemini CLI shares ~/.gemini/settings.json)
#   Gemini CLI

KP_VAULT="$_HOME/vaults/llm-wiki"
KP_SCRIPTS="$KP_VAULT/scripts"
KP_INGEST="$KP_SCRIPTS/ingest-prompt.py"
KP_RAW_URL="https://raw.githubusercontent.com/akillness/oh-my-skills/main/hooks/ingest-prompt.py"

# 1. Bootstrap vault skeleton via llm-wiki skill (or minimal fallback)
if [ ! -f "$KP_VAULT/index.md" ]; then
  if [ -x "$SKILLS_ROOT/llm-wiki/scripts/bootstrap-vault.sh" ]; then
    bash "$SKILLS_ROOT/llm-wiki/scripts/bootstrap-vault.sh" "$KP_VAULT" \
      && echo "✅ vault bootstrapped → $KP_VAULT"
  else
    mkdir -p "$KP_VAULT"/raw/sources "$KP_VAULT"/raw/assets \
             "$KP_VAULT"/wiki/sources "$KP_VAULT"/wiki/entities \
             "$KP_VAULT"/wiki/concepts "$KP_VAULT"/wiki/queries "$KP_VAULT"/wiki/reports
    [ -f "$KP_VAULT/index.md" ] || printf '# Index\n\n<!-- SOURCES:END -->\n<!-- QUERIES:END -->\n' > "$KP_VAULT/index.md"
    [ -f "$KP_VAULT/log.md" ]   || printf '# Log\n' > "$KP_VAULT/log.md"
    echo "ℹ️  llm-wiki skill missing — created minimal vault skeleton"
  fi
fi

# 2. Install graphifyy (best-effort; the ingest script degrades gracefully)
if command -v pipx &>/dev/null; then
  pipx list 2>/dev/null | grep -q graphifyy \
    || pipx install graphifyy 2>/dev/null \
    && echo "✅ graphifyy available via pipx"
else
  command -v graphify &>/dev/null \
    || echo "ℹ️  graphifyy not installed — run: pipx install graphifyy"
fi

# 3. Place the shared ingest script under the vault
mkdir -p "$KP_SCRIPTS"
if [ ! -f "$KP_INGEST" ]; then
  if command -v curl &>/dev/null; then
    curl -fsSL "$KP_RAW_URL" -o "$KP_INGEST" 2>/dev/null \
      && chmod +x "$KP_INGEST" \
      && echo "✅ ingest-prompt.py fetched → $KP_INGEST" \
      || echo "⚠️  could not fetch ingest-prompt.py — copy hooks/ingest-prompt.py manually"
  fi
fi

# 4. Per-agent wrapper installer (forwards stdin to the shared script)
install_kp_wrapper() {
  local dest="$1"
  mkdir -p "$(dirname "$dest")"
  cat >"$dest" <<EOF
#!/bin/bash
set -euo pipefail
INGEST="$KP_INGEST"
[ -x "\$INGEST" ] || exit 0
if [ -n "\${1:-}" ]; then INPUT="\$1"; else INPUT="\$(cat 2>/dev/null || true)"; fi
LLM_WIKI_VAULT="$KP_VAULT" printf '%s' "\$INPUT" | python3 "\$INGEST" >/dev/null 2>&1 || true
exit 0
EOF
  chmod +x "$dest"
}

# 5. Register the hook in each agent's settings (idempotent JSON/TOML edit)
if command -v claude &>/dev/null && command -v python3 &>/dev/null; then
  CLAUDE_HOOK="${CLAUDE_CONFIG_DIR:-$_HOME/.claude}/hooks/llm-wiki-ingest.sh"
  install_kp_wrapper "$CLAUDE_HOOK"
  CLAUDE_SETTINGS="${CLAUDE_CONFIG_DIR:-$_HOME/.claude}/settings.json"
  python3 - "$CLAUDE_SETTINGS" "$CLAUDE_HOOK" <<'PY' && echo "✅ Claude: UserPromptSubmit hook registered"
import json, sys, pathlib
p, wrapper = pathlib.Path(sys.argv[1]), sys.argv[2]
data = json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}
ups = data.setdefault("hooks", {}).setdefault("UserPromptSubmit", [])
cmd = f'bash "{wrapper}"'
if not any(any(h.get("command") == cmd for h in e.get("hooks", [])) for e in ups):
    ups.append({"hooks": [{"type": "command", "command": cmd}]})
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data, indent=2), encoding="utf-8")
PY
fi

if command -v codex &>/dev/null; then
  CODEX_HOOK="$_HOME/.codex/hooks/llm-wiki-ingest.sh"
  install_kp_wrapper "$CODEX_HOOK"
  CODEX_TOML="$_HOME/.codex/config.toml"
  if [ -f "$CODEX_TOML" ] && ! grep -q "llm-wiki-ingest.sh" "$CODEX_TOML"; then
    cat >>"$CODEX_TOML" <<EOF

[[hooks]]
event = "UserPromptSubmit"
command = "$CODEX_HOOK"
EOF
    echo "✅ Codex: UserPromptSubmit hook appended to config.toml"
  fi
fi

if (command -v gemini &>/dev/null || command -v agy &>/dev/null) && command -v python3 &>/dev/null; then
  GEMINI_HOOK="$_HOME/.gemini/hooks/llm-wiki-ingest.sh"
  install_kp_wrapper "$GEMINI_HOOK"
  GEMINI_SETTINGS="$_HOME/.gemini/settings.json"
  python3 - "$GEMINI_SETTINGS" "$GEMINI_HOOK" <<'PY' && echo "✅ Gemini/Antigravity: BeforeAgent hook registered"
import json, sys, pathlib
p, wrapper = pathlib.Path(sys.argv[1]), sys.argv[2]
data = json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}
ba = data.setdefault("hooks", {}).setdefault("BeforeAgent", [])
cmd = f'bash "{wrapper}"'
if not any(any(h.get("command") == cmd for h in e.get("hooks", [])) for e in ba):
    ba.append({"matcher": "", "hooks": [{"name": "llm-wiki-ingest", "type": "command", "command": cmd}]})
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data, indent=2), encoding="utf-8")
PY
fi

# 6. Inject the Knowledge Pipeline rule block into each agent's rules file
KP_RULES="$(cat <<'RULES'

## Knowledge Pipeline (auto-applied)

All prompts in this agent are captured into the canonical vault at
`~/vaults/llm-wiki/` (Obsidian-managed) and indexed by graphify. Before
answering any question, read `~/vaults/llm-wiki/index.md` first, then
the relevant `wiki/` pages. File durable findings back into
`wiki/queries/` or `wiki/reports/`. Shell commands route through `rtk`
for token-compact output.

RULES
)"
inject_kp_rules() {
  local file="$1"
  [ -f "$file" ] || return 0
  grep -q "Knowledge Pipeline (auto-applied)" "$file" && return 0
  printf '%s\n' "$KP_RULES" >>"$file"
  echo "✅ rules injected → $file"
}
inject_kp_rules "${CLAUDE_CONFIG_DIR:-$_HOME/.claude}/CLAUDE.md"
inject_kp_rules "$_HOME/.codex/AGENTS.md"
inject_kp_rules "$_HOME/.gemini/GEMINI.md"

echo ""
echo "✅ Default operating rules configured (platform: $PLATFORM)"
echo "   Baseline flow: \$ooo → \$graphify → \$rtk → \$obsidian → \$llm-wiki"
echo "   Vault         : $KP_VAULT"
echo "   Ingest hook   : $KP_INGEST"
```

> **Note**: This is a default operating sequence, not a blind mandate to run every skill on every prompt. Use the smallest truthful owner step for the current job, then return to the sequence as work moves from specification to structure, execution, persistence, and durable knowledge filing.

---

> Full skill list → [README.md](README.md) · Korean guide → [README.ko.md](README.ko.md)
