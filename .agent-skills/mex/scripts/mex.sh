#!/usr/bin/env bash
# Mex skill helper — thin, read-only-by-default wrapper around the
# `mex-agent` (mex-memory/mex) command surface. `doctor` never modifies
# project memory or Git state; `check`/`graph` just pass through to
# the real `mex` CLI so callers get consistent invocation from one place.
#
# For the fully automated install (skill registration + mex-agent install +
# mex setup + mex graph + mex check + anchor-file report), use
# scripts/install.sh instead of this file.
#
# Usage:
#   mex.sh doctor [project_path]
#   mex.sh check <project_path> [extra mex check args...]
#   mex.sh graph <project_path> [extra mex graph args...]

set -euo pipefail

cmd="${1:-}"
project_path="${2:-.}"

# ponytail: help is this header, printed until the first non-comment line —
# no second copy of the usage text and no hardcoded line numbers to drift.
usage() {
  awk 'NR>1 && /^#/ { sub(/^# ?/, ""); print; next } NR>1 { exit }' "$0"
  exit 1
}

# Echoes the version string found. Exit 1: no `mex` on PATH. Exit 2: a `mex`
# exists but is not mex-agent (TeX Live ships an unrelated `mex`), so callers
# can tell "not installed" from "wrong binary" without repeating this check.
mex_agent_version() {
  command -v mex >/dev/null 2>&1 || return 1
  local v
  v="$(mex --version 2>&1 | head -1)"
  echo "$v"
  [[ "$v" =~ ^[0-9]+\.[0-9]+\.[0-9]+ ]] || return 2
}

require_mex() {
  local v status=0
  v="$(mex_agent_version)" || status=$?
  case "$status" in
    1)
      echo "error: 'mex' is not on PATH. Install with: npm install -g mex-agent" >&2
      exit 1
      ;;
    2)
      echo "error: 'mex' on PATH ($(command -v mex)) is not mex-agent (got: $v)." >&2
      echo "       Another tool already owns the 'mex' command on this machine (e.g. TeX" >&2
      echo "       Live's mex/pdfTeX format). Fix PATH order or run 'npx mex-agent' instead." >&2
      exit 1
      ;;
  esac
}

require_git() {
  git -C "$1" rev-parse --git-dir >/dev/null 2>&1 || {
    echo "error: '$1' is not a Git repository. Initialize with: git init" >&2
    exit 1
  }
}

case "$cmd" in
  doctor)
    echo "== Mex prerequisite report (read-only) =="
    if command -v node >/dev/null 2>&1; then
      echo "  ok    Node.js         $(node --version) (mex needs >= 22.5)"
    else
      echo "  MISSING Node.js       not on PATH (mex needs Node.js >= 22.5)"
    fi

    mexver=""
    mexstatus=0
    mexver="$(mex_agent_version)" || mexstatus=$?
    case "$mexstatus" in
      0) echo "  ok    mex-agent       $mexver ($(command -v mex))" ;;
      1) echo "  MISSING mex-agent     not installed (npm install -g mex-agent)" ;;
      2)
        echo "  WARN  mex-agent       'mex' on PATH is not mex-agent (got: $mexver)"
        echo "                        resolved to $(command -v mex)"
        echo "                        another tool already owns 'mex' (e.g. TeX Live's mex/pdfTeX"
        echo "                        format) — fix PATH order or use 'npx mex-agent' instead"
        ;;
    esac

    if git -C "$project_path" rev-parse --git-dir >/dev/null 2>&1; then
      commit="$(git -C "$project_path" rev-parse --short HEAD 2>/dev/null || echo '?')"
      echo "  ok    Git repository   $project_path (commit: $commit)"
    else
      echo "  info  Git repository   $project_path not a Git repo (mex works best with Git)"
    fi

    if [ -d "$project_path/.mex" ]; then
      echo "  ok    .mex/            scaffold present"
    else
      echo "  info  .mex/            not yet scaffolded (run scripts/install.sh or 'mex setup')"
    fi

    anchor_found=""
    for anchor in CLAUDE.md AGENTS.md .cursorrules .windsurfrules .github/copilot-instructions.md .opencode/opencode.json; do
      if [ -f "$project_path/$anchor" ]; then
        echo "  ok    project anchor   $anchor"
        anchor_found="1"
      fi
    done
    if [ -z "$anchor_found" ]; then
      echo "  info  project anchor   none found (mex setup installs one automatically)"
    fi

    echo "  info  MCP server       packages/mex-mcp is not published upstream — no 'mex mcp' subcommand ships"
    echo "== end of report; nothing was installed or modified =="
    ;;
  # ponytail: check and graph differ only by the subcommand name, so they share
  # one branch instead of two near-identical copies.
  check | graph)
    [ $# -ge 2 ] || {
      echo "usage: mex.sh $cmd <project_path> [extra mex $cmd args...]" >&2
      exit 1
    }
    require_mex
    require_git "$project_path"

    shift 2
    (cd "$project_path" && mex "$cmd" "$@")
    ;;
  *)
    usage
    ;;
esac
