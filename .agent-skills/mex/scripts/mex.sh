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

usage() {
  sed -n '2,16p' "$0"
  exit 1
}

require_mex() {
  if ! command -v mex >/dev/null 2>&1; then
    echo "error: 'mex' is not on PATH. Install with: npm install -g mex-agent" >&2
    exit 1
  fi
  local mexver
  mexver="$(mex --version 2>&1 | head -1)"
  if [[ ! "$mexver" =~ ^[0-9]+\.[0-9]+\.[0-9]+ ]]; then
    echo "error: 'mex' on PATH ($(command -v mex)) is not mex-agent (got: $mexver)." >&2
    echo "       Another tool already owns the 'mex' command on this machine (e.g. TeX" >&2
    echo "       Live's mex/pdfTeX format). Fix PATH order or run 'npx mex-agent' instead." >&2
    exit 1
  fi
}


require_git() {
  if ! git -C "$project_path" rev-parse --git-dir >/dev/null 2>&1; then
    echo "error: '$project_path' is not a Git repository. Initialize with: git init" >&2
    exit 1
  fi
}

case "$cmd" in
  doctor)
    echo "== Mex prerequisite report (read-only) =="
    if command -v node >/dev/null 2>&1; then
      nodever="$(node --version 2>&1)"
      echo "  ok    Node.js         $nodever (mex needs >= 22.5)"
    else
      echo "  MISSING Node.js       not on PATH (mex needs Node.js >= 22.5)"
    fi
    if command -v mex >/dev/null 2>&1; then
      mexver="$(mex --version 2>&1 | head -1)"
      if [[ "$mexver" =~ ^[0-9]+\.[0-9]+\.[0-9]+ ]]; then
        echo "  ok    mex-agent       $mexver ($(command -v mex))"
      else
        echo "  WARN  mex-agent       'mex' on PATH is not mex-agent (got: $mexver)"
        echo "                        resolved to $(command -v mex)"
        echo "                        another tool already owns 'mex' (e.g. TeX Live's mex/pdfTeX"
        echo "                        format) — fix PATH order or use 'npx mex-agent' instead"
      fi
    else
      echo "  MISSING mex-agent     not installed (npm install -g mex-agent)"
    fi

    if [ -n "${2:-}" ]; then
      check_project_path="$2"
    else
      check_project_path="."
    fi
    if git -C "$check_project_path" rev-parse --git-dir >/dev/null 2>&1; then
      commit="$(git -C "$check_project_path" rev-parse --short HEAD 2>/dev/null || echo '?')"
      echo "  ok    Git repository   $check_project_path (commit: $commit)"
    else
      echo "  info  Git repository   $check_project_path not a Git repo (mex works best with Git)"
    fi
    if [ -d "$check_project_path/.mex" ]; then
      echo "  ok    .mex/            scaffold present"
    else
      echo "  info  .mex/            not yet scaffolded (run scripts/install.sh or 'mex setup')"
    fi
    anchor_found=""
    for anchor in CLAUDE.md AGENTS.md .cursorrules .windsurfrules .github/copilot-instructions.md .opencode/opencode.json; do
      if [ -f "$check_project_path/$anchor" ]; then
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
  check)
    require_mex
    if [[ -z "$project_path" || "$project_path" == "doctor" ]]; then
      echo "usage: mex.sh check <project_path> [extra mex check args...]" >&2
      exit 1
    fi
    require_git "$project_path"
    shift 2 || true
    (cd "$project_path" && mex check "$@")
    ;;
  graph)
    require_mex
    if [[ -z "$project_path" || "$project_path" == "doctor" ]]; then
      echo "usage: mex.sh graph <project_path> [extra mex graph args...]" >&2
      exit 1
    fi
    require_git "$project_path"
    shift 2 || true
    (cd "$project_path" && mex graph "$@")
    ;;
  *)
    usage
    ;;
esac
