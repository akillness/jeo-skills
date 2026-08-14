#!/usr/bin/env bash
# Palmier Pro skill helper — read-only environment/connectivity checks.
# Never installs anything, never mutates a project; `doctor` only inspects
# the host and (optionally) pings the running app's local MCP endpoint.
#
# Usage:
#   palmier-pro.sh doctor
#   palmier-pro.sh mcp-status [host:port]   # default 127.0.0.1:19789

set -euo pipefail

cmd="${1:-}"

usage() {
  sed -n '2,9p' "$0"
  exit 1
}

case "$cmd" in
  doctor)
    echo "== Palmier Pro prerequisite report (read-only) =="

    os_ver="$(sw_vers -productVersion 2>/dev/null || echo unknown)"
    arch="$(uname -m 2>/dev/null || echo unknown)"
    if [[ "$arch" == "arm64" ]]; then
      echo "  ok    arch           $arch (Apple Silicon)"
    else
      echo "  WARN  arch           $arch (Palmier Pro requires Apple Silicon)"
    fi
    echo "  info  macOS          $os_ver (app requires macOS 26 Tahoe+)"

    if [[ -d "/Applications/PalmierPro.app" ]]; then
      echo "  ok    app            /Applications/PalmierPro.app present"
    else
      echo "  info  app            not found in /Applications (download from"
      echo "        github.com/palmier-io/palmier-pro/releases/latest)"
    fi

    if command -v swift >/dev/null 2>&1; then
      echo "  ok    swift          $(swift --version 2>&1 | head -1)"
    else
      echo "  info  swift          not on PATH (only needed to build from source; needs Xcode 16+/Swift 6.2)"
    fi

    if command -v curl >/dev/null 2>&1; then
      if curl -s -m 2 -o /dev/null -w '' "http://127.0.0.1:19789/mcp" 2>/dev/null; then
        echo "  ok    MCP server     reachable at http://127.0.0.1:19789/mcp (app is running)"
      else
        echo "  info  MCP server     not reachable at http://127.0.0.1:19789/mcp (open Palmier Pro first)"
      fi
    else
      echo "  info  curl           not on PATH; skipped MCP reachability check"
    fi

    echo "== end of report; nothing was installed or changed =="
    ;;
  mcp-status)
    endpoint="${2:-127.0.0.1:19789}"
    if ! command -v curl >/dev/null 2>&1; then
      echo "error: 'curl' is not on PATH" >&2
      exit 1
    fi
    if curl -s -m 2 -o /dev/null -w '%{http_code}\n' "http://${endpoint}/mcp"; then
      exit 0
    else
      echo "error: no response from http://${endpoint}/mcp — is Palmier Pro open?" >&2
      exit 1
    fi
    ;;
  *)
    usage
    ;;
esac
