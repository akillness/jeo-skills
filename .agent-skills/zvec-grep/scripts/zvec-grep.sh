#!/usr/bin/env bash
# zvec-grep skill helper - read-only inspection and exact search surfaces.
# Never installs packages, starts a server, changes agent config, grants remote
# embedding access, creates/rebuilds/drops an index, or edits a workspace.
#
# Usage:
#   zvec-grep.sh doctor [WORKSPACE]       # host and install report
#   zvec-grep.sh surfaces                  # safe route map
#   zvec-grep.sh help [TOPIC]              # installed CLI help
#   zvec-grep.sh status [WORKSPACE]        # direct read-only index status
#   zvec-grep.sh rg [rg-options] PATTERN [PATH...]

set -euo pipefail

cmd="${1:-}"

usage() {
  sed -n '2,13p' "$0"
  exit 1
}

zg_bin() {
  command -v zg 2>/dev/null || true
}

node_major() {
  local version major
  version="$(node --version 2>/dev/null || true)"
  major="${version#v}"
  major="${major%%.*}"
  printf '%s' "$major"
}

require_zg() {
  local bin
  bin="$(zg_bin)"
  if [[ -z "$bin" ]]; then
    echo "error: zg is not on PATH" >&2
    echo "       npm install -g @zvec/zvec-grep@0.2.2" >&2
    exit 127
  fi
  printf '%s' "$bin"
}

workspace_report() {
  local root="$1"
  if [[ -z "$root" ]]; then
    echo "  workspace       current directory"
    return 0
  fi
  if [[ ! -d "$root" ]]; then
    echo "error: workspace is not a directory: $root" >&2
    exit 2
  fi
  echo "  workspace       $root"
  if [[ -d "$root/.zvec-grep" ]]; then
    echo "  index           present at .zvec-grep/"
  else
    echo "  index           absent; status only, no index will be created"
  fi
}

case "$cmd" in
  doctor)
    root="${2:-}"
    [[ $# -le 2 ]] || usage
    echo "== zvec-grep readiness report (read-only) =="

    if command -v node >/dev/null 2>&1; then
      major="$(node_major)"
      if [[ "$major" =~ ^[0-9]+$ ]] && [[ "$major" -ge 22 ]]; then
        echo "  ok    node            $(node --version 2>/dev/null)"
      else
        echo "  ERROR node            $(node --version 2>/dev/null || echo unknown) (requires >= 22)"
      fi
    else
      echo "  ERROR node            not on PATH (requires >= 22)"
    fi

    if command -v npm >/dev/null 2>&1; then
      echo "  ok    npm             $(npm --version 2>/dev/null || echo present)"
    else
      echo "  info  npm             not on PATH"
    fi

    bin="$(zg_bin)"
    if [[ -n "$bin" ]]; then
      echo "  ok    zg              $bin"
      if version="$($bin --version 2>/dev/null | head -1)"; then
        [[ -n "$version" ]] && echo "  info  version         $version"
      else
        echo "  WARN  version         binary found but could not execute in this host"
      fi
    else
      echo "  info  zg              not on PATH"
      echo "        npm install -g @zvec/zvec-grep@0.2.2"
    fi

    if [[ -n "$root" ]]; then
      workspace_report "$root"
    else
      echo "  workspace       current directory"
      if [[ -d .zvec-grep ]]; then
        echo "  index           present at .zvec-grep/"
      else
        echo "  index           absent; no index command was run"
      fi
    fi

    for name in ZVEC_GREP_HOME ZVEC_GREP_MODE ZVEC_GREP_SERVER_URL ZVEC_GREP_MCP_TOOLSET ZVEC_GREP_EMBEDDING ZVEC_GREP_API_KEY ZVEC_GREP_SERVER_TOKEN; do
      case "$name" in
        ZVEC_GREP_HOME) value="${ZVEC_GREP_HOME:-}" ;;
        ZVEC_GREP_MODE) value="${ZVEC_GREP_MODE:-}" ;;
        ZVEC_GREP_SERVER_URL) value="${ZVEC_GREP_SERVER_URL:-}" ;;
        ZVEC_GREP_MCP_TOOLSET) value="${ZVEC_GREP_MCP_TOOLSET:-}" ;;
        ZVEC_GREP_EMBEDDING) value="${ZVEC_GREP_EMBEDDING:-}" ;;
        ZVEC_GREP_API_KEY) value="${ZVEC_GREP_API_KEY:-}" ;;
        ZVEC_GREP_SERVER_TOKEN) value="${ZVEC_GREP_SERVER_TOKEN:-}" ;;
      esac
      if [[ -n "$value" ]]; then
        echo "  info  env             $name=(set; value hidden)"
      fi
    done

    echo "  note  This helper does not install, index, start, configure, authorize, or delete anything."
    echo "== end of report =="
    ;;

  surfaces)
    cat <<'TEXT'
== zvec-grep safe surfaces ==

  zg query --rg -n -F 'literal' src       exact or exhaustive search, no index
  zg status --mode direct         inspect index state without creating it
  zg server status --check-ready  inspect daemon readiness
  zg help [topic]                 inspect the installed CLI contract
  zg index ...                    explicit persistent index operation
  zg install ...                  explicit agent configuration operation

This helper exposes only the first four surfaces. Use the last two directly
only after the user has explicitly approved the persistent operation.
TEXT
    ;;

  help)
    bin="$(require_zg)"
    if [[ $# -gt 2 ]]; then
      echo "error: help accepts at most one topic" >&2
      exit 2
    fi
    if [[ $# -eq 2 ]]; then
      exec "$bin" help "$2"
    fi
    exec "$bin" help
    ;;

  status)
    bin="$(require_zg)"
    root="${2:-}"
    [[ $# -le 2 ]] || usage
    if [[ -n "$root" ]]; then
      [[ -d "$root" ]] || { echo "error: workspace is not a directory: $root" >&2; exit 2; }
      exec "$bin" status "$root" --mode direct
    fi
    exec "$bin" status --mode direct
    ;;

  rg)
    bin="$(require_zg)"
    shift
    [[ $# -gt 0 ]] || { echo "error: rg needs a pattern" >&2; exit 2; }
    exec "$bin" query --rg "$@"
    ;;

  *)
    usage
    ;;
esac
