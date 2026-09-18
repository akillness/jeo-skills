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

# Bare `mex` is ambiguous: TeX Live ships an unrelated `mex` (pdfTeX
# Multilingual format) that wins on PATH for many Homebrew users. Detecting
# that is not enough — refusing to run leaves the caller with no way forward
# on a machine that HAS mex-agent under a different name. So resolve across
# every candidate name and pick the first one whose --version is a bare semver.
#
# Echoes "<binary>\t<version>" on success.
# Exit 1: no usable mex-agent found anywhere.
# Exit 2: a `mex` exists but is not mex-agent, and no fallback was found.
MEX=""
resolve_mex() {
  local c v
  for c in "${MEX_AGENT_BIN:-}" mex-agent mex; do
    [ -n "$c" ] || continue
    command -v "$c" >/dev/null 2>&1 || continue
    v="$("$c" --version 2>&1 | head -1)"
    if [[ "$v" =~ ^[0-9]+\.[0-9]+\.[0-9]+ ]]; then
      printf '%s\t%s\n' "$(command -v "$c")" "$v"
      return 0
    fi
  done
  command -v mex >/dev/null 2>&1 && return 2
  return 1
}

require_mex() {
  local resolved status=0
  resolved="$(resolve_mex)" || status=$?
  case "$status" in
    0) MEX="${resolved%%$'\t'*}" ;;
    2)
      echo "error: 'mex' on PATH ($(command -v mex)) is not mex-agent, and no" >&2
      echo "       mex-agent fallback was found." >&2
      echo "       Another tool already owns the 'mex' command on this machine (e.g. TeX" >&2
      echo "       Live's mex/pdfTeX format). Fix it with any one of:" >&2
      echo "         - npm install -g mex-agent, then put its bin dir ahead of TeX on PATH" >&2
      echo "         - expose an unambiguous 'mex-agent' command on PATH" >&2
      echo "         - export MEX_AGENT_BIN=/abs/path/to/mex-agent" >&2
      exit 1
      ;;
    *)
      echo "error: mex-agent is not installed. Install with: npm install -g mex-agent" >&2
      echo "       Or point MEX_AGENT_BIN at an existing mex-agent executable." >&2
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

    mexresolved=""
    mexstatus=0
    mexresolved="$(resolve_mex)" || mexstatus=$?
    case "$mexstatus" in
      0)
        mexbin="${mexresolved%%$'\t'*}"
        mexver="${mexresolved##*$'\t'}"
        echo "  ok    mex-agent       $mexver ($mexbin)"
        # Surface the ambiguity even when a fallback saved us, so the operator
        # knows a bare `mex` in a script or doc will still run the wrong tool.
        if command -v mex >/dev/null 2>&1 && [ "$(command -v mex)" != "$mexbin" ]; then
          echo "  info  'mex' name      shadowed by $(command -v mex) ($(mex --version 2>&1 | head -1))"
          echo "                        use '$mexbin' — a bare 'mex' runs the other tool"
        fi
        ;;
      2)
        echo "  WARN  mex-agent       'mex' on PATH is not mex-agent and no fallback found"
        echo "                        resolved to $(command -v mex) ($(mex --version 2>&1 | head -1))"
        echo "                        another tool already owns 'mex' (e.g. TeX Live's mex/pdfTeX"
        echo "                        format) — install mex-agent, expose a 'mex-agent' command,"
        echo "                        or set MEX_AGENT_BIN=/abs/path/to/mex-agent"
        ;;
      *) echo "  MISSING mex-agent     not installed (npm install -g mex-agent)" ;;
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
    (cd "$project_path" && "$MEX" "$cmd" "$@")
    ;;
  *)
    usage
    ;;
esac
