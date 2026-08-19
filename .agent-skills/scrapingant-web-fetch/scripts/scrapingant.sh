#!/usr/bin/env bash
# ScrapingAnt skill helper — hosted MCP (https://api.scrapingant.com/mcp).
# `doctor` is read-only and offline; `install` only touches the MCP client
# registry; `credits`/`probe` call the documented REST endpoints so a key can
# be validated without an MCP client attached. The API key is read from
# $SCRAPINGANT_API_KEY, is never echoed, and is passed to curl over stdin so it
# does not appear in `ps` output.
#
# Usage:
#   scrapingant.sh doctor
#   scrapingant.sh install [claude-code|claude-desktop|vscode|cursor|cline|windsurf]
#   scrapingant.sh credits
#   scrapingant.sh probe <url> [--no-browser] [--proxy datacenter|residential] [--country XX]
#
# Free key (10,000 credits/month at signup, no card):
#   https://scrapingant.com?ref=ztewzmv

set -euo pipefail

MCP_URL="https://api.scrapingant.com/mcp"
API_BASE="https://api.scrapingant.com/v2"
SIGNUP_URL="https://scrapingant.com?ref=ztewzmv"

usage() {
  awk 'NR>1 && /^#/ { sub(/^# ?/, ""); print; next } NR>1 { exit }' "$0"
  exit 1
}

mask_key() {
  local key="$1"
  local len=${#key}
  if [ "$len" -le 8 ]; then
    printf '****'
  else
    printf '%s...%s (%d chars)' "${key:0:4}" "${key: -4}" "$len"
  fi
}

require_key() {
  if [ -z "${SCRAPINGANT_API_KEY:-}" ]; then
    echo "error: SCRAPINGANT_API_KEY is not set." >&2
    echo "       Get a free key (10,000 credits/month, no card): $SIGNUP_URL" >&2
    echo "       Then: export SCRAPINGANT_API_KEY=\"<your-key>\"" >&2
    exit 1
  fi
}

require_curl() {
  command -v curl >/dev/null 2>&1 || {
    echo "error: curl is required for this command." >&2
    exit 1
  }
}

# curl with the API key supplied through a stdin config file instead of argv.
# --fail-with-body needs curl >= 7.76; fall back to a plain call on older curl
# so the HTTP error body is still printed instead of swallowed.
sa_curl() {
  local endpoint="$1"
  shift
  local fail_opt=()
  if curl --help all 2>/dev/null | grep -q -- "--fail-with-body"; then
    fail_opt=(--fail-with-body)
  fi
  printf 'data-urlencode = "x-api-key=%s"\n' "$SCRAPINGANT_API_KEY" |
    curl -sS "${fail_opt[@]}" --get "$endpoint" "$@" --config -
}

mcp_json_block() {
  cat <<'JSON'
{
  "mcpServers": {
    "scrapingant": {
      "url": "https://api.scrapingant.com/mcp",
      "transport": "streamableHttp",
      "headers": {
        "x-api-key": "<YOUR-API-KEY>"
      }
    }
  }
}
JSON
}

cmd="${1:-}"

case "$cmd" in
  doctor)
    echo "== ScrapingAnt skill report (read-only, no network calls) =="
    if [ -n "${SCRAPINGANT_API_KEY:-}" ]; then
      echo "  ok      API key         SCRAPINGANT_API_KEY set: $(mask_key "$SCRAPINGANT_API_KEY")"
    else
      echo "  MISSING API key         export SCRAPINGANT_API_KEY=... — free key: $SIGNUP_URL"
    fi

    if command -v curl >/dev/null 2>&1; then
      echo "  ok      curl            $(curl --version | head -1 | cut -d' ' -f1-2)"
    else
      echo "  MISSING curl            needed for 'credits' and 'probe'"
    fi

    if command -v claude >/dev/null 2>&1; then
      echo "  ok      claude CLI      $(command -v claude)"
      if claude mcp list 2>/dev/null | grep -q "scrapingant"; then
        echo "  ok      MCP registered  'scrapingant' found in claude mcp list"
      else
        echo "  info    MCP registered  not in claude mcp list (run: scrapingant.sh install claude-code)"
      fi
    else
      echo "  info    claude CLI      not on PATH (only needed for the claude-code install path)"
    fi

    found_cfg=""
    for cfg in \
      "$HOME/Library/Application Support/Claude/claude_desktop_config.json" \
      "$HOME/.config/Claude/claude_desktop_config.json" \
      "$HOME/.cursor/mcp.json" \
      "$HOME/.codeium/windsurf/mcp_config.json" \
      ".vscode/mcp.json"; do
      if [ -f "$cfg" ]; then
        if grep -q "api.scrapingant.com/mcp" "$cfg" 2>/dev/null; then
          echo "  ok      client config   scrapingant present in $cfg"
        else
          echo "  info    client config   $cfg exists without a scrapingant entry"
        fi
        found_cfg="1"
      fi
    done
    [ -n "$found_cfg" ] || echo "  info    client config   no known MCP client config files found"

    echo "  info    endpoint        $MCP_URL (streamableHttp, x-api-key header)"
    echo "  info    tools           get_web_page_markdown | get_web_page_html | get_web_page_text"
    echo "== end of report; nothing was installed or modified =="
    ;;

  install)
    client="${2:-claude-code}"
    case "$client" in
      claude-code)
        require_key
        command -v claude >/dev/null 2>&1 || {
          echo "error: 'claude' CLI not on PATH. Install Claude Code, or register manually:" >&2
          mcp_json_block >&2
          exit 1
        }
        claude mcp add scrapingant --transport http "$MCP_URL" \
          -H "x-api-key: $SCRAPINGANT_API_KEY"
        echo "registered. verify with: claude mcp list"
        ;;
      claude-desktop)
        echo "# macOS:   ~/Library/Application Support/Claude/claude_desktop_config.json"
        echo "# Windows: %APPDATA%\\Claude\\claude_desktop_config.json"
        mcp_json_block
        echo "# restart Claude Desktop after saving"
        ;;
      vscode)
        echo "# VS Code settings or .vscode/mcp.json (different shape: servers + requestInit)"
        cat <<'JSON'
{
  "servers": {
    "scrapingant": {
      "url": "https://api.scrapingant.com/mcp/",
      "requestInit": {
        "headers": {
          "x-api-key": "<YOUR-API-KEY>"
        }
      }
    }
  }
}
JSON
        ;;
      cursor)
        echo "# Cursor: Settings -> MCP -> Add new MCP Server"
        echo "#   Name:      scrapingant"
        echo "#   URL:       $MCP_URL"
        echo "#   Transport: streamableHttp"
        echo "#   Headers:   x-api-key: <YOUR-API-KEY>"
        ;;
      cline)
        echo "# cline_mcp_settings.json"
        mcp_json_block
        ;;
      windsurf)
        echo "# Windsurf MCP config (standard mcpServers shape)"
        mcp_json_block
        ;;
      *)
        echo "error: unknown client '$client'." >&2
        echo "       known: claude-code claude-desktop vscode cursor cline windsurf" >&2
        echo "       see references/mcp-clients.md" >&2
        exit 1
        ;;
    esac
    ;;

  credits)
    require_key
    require_curl
    sa_curl "$API_BASE/usage"
    echo
    ;;

  probe)
    require_key
    require_curl
    target="${2:-}"
    [ -n "$target" ] || {
      echo "usage: scrapingant.sh probe <url> [--no-browser] [--proxy datacenter|residential] [--country XX]" >&2
      exit 1
    }
    shift 2

    browser="true"
    proxy_type="datacenter"
    country=""
    while [ $# -gt 0 ]; do
      case "$1" in
        --no-browser) browser="false"; shift ;;
        --browser) browser="true"; shift ;;
        --proxy) proxy_type="${2:-datacenter}"; shift 2 ;;
        --country) country="${2:-}"; shift 2 ;;
        *) echo "error: unknown probe option '$1'" >&2; exit 1 ;;
      esac
    done

    if [ "$browser" = "true" ]; then
      if [ "$proxy_type" = "residential" ]; then cost=125; else cost=10; fi
    else
      if [ "$proxy_type" = "residential" ]; then cost=25; else cost=1; fi
    fi
    echo "probe: browser=$browser proxy_type=$proxy_type${country:+ proxy_country=$country} (~$cost credits)" >&2

    args=(--data-urlencode "url=$target"
          --data-urlencode "browser=$browser"
          --data-urlencode "proxy_type=$proxy_type")
    if [ -n "$country" ]; then
      args+=(--data-urlencode "proxy_country=$country")
    fi

    sa_curl "$API_BASE/markdown" "${args[@]}"
    echo
    ;;

  *)
    usage
    ;;
esac
