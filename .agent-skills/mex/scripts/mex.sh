#!/usr/bin/env bash
# Mex skill helper — thin, read-only-by-default wrapper around the
# `mex-agent` (mex-memory/mex) command surface. `doctor` never modifies
# project memory or Git state; `check`/`graph` pass through to the resolved
# mex-agent CLI so callers get consistent invocation from one place.
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

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=runtime.sh
source "$SCRIPT_DIR/runtime.sh"

cmd="${1:-}"
project_path="${2:-.}"

# ponytail: help is this header, printed until the first non-comment line —
# no second copy of the usage text and no hardcoded line numbers to drift.
usage() {
  awk 'NR>1 && /^#/ { sub(/^# ?/, ""); print; next } NR>1 { exit }' "$0"
  exit 1
}

require_mex() {
  local status=0
  resolve_mex_agent_bin || status=$?
  if [ "$status" -ne 0 ]; then
    echo "error: $MEX_AGENT_RESOLVE_ERROR" >&2
    echo "       Install with 'npm install -g mex-agent', or expose the skill's" >&2
    echo "       unambiguous wrapper as ~/.local/bin/mex-agent." >&2
    exit 1
  fi
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

    mexstatus=0
    resolve_mex_agent_bin || mexstatus=$?
    if [ "$mexstatus" -eq 0 ]; then
      echo "  ok    mex-agent       $MEX_AGENT_VERSION_RESOLVED ($MEX_AGENT_BIN_RESOLVED)"
    else
      echo "  MISSING mex-agent     $MEX_AGENT_RESOLVE_ERROR"
    fi

    collision="$(bare_mex_collision || true)"
    if [ -n "$collision" ]; then
      collision_path="${collision%%$'\t'*}"
      collision_version="${collision#*$'\t'}"
      echo "  WARN  bare mex        $collision_path is not mex-agent (got: $collision_version)"
      if [ "$mexstatus" -eq 0 ]; then
        echo "                        scripts use $MEX_AGENT_BIN_RESOLVED instead"
      else
        echo "                        install/expose ~/.local/bin/mex-agent before running commands"
      fi
    fi

    if git -C "$project_path" rev-parse --git-dir >/dev/null 2>&1; then
      commit="$(git -C "$project_path" rev-parse --short HEAD 2>/dev/null || echo '?')"
      echo "  ok    Git repository   $project_path (commit: $commit)"
    else
      echo "  info  Git repository   $project_path not a Git repo (mex works best with Git)"
    fi

    if [ -d "$project_path/.mex" ]; then
      echo "  ok    .mex/            scaffold present"
    else
      echo "  info  .mex/            not yet scaffolded (run scripts/install.sh or 'mex-agent setup')"
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
    (cd "$project_path" && "$MEX_AGENT_BIN_RESOLVED" "$cmd" "$@")
    ;;
  *)
    usage
    ;;
esac
