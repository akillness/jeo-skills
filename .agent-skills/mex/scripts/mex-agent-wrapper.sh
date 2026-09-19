#!/usr/bin/env bash
# Unambiguous entrypoint for mex-agent. TeX Live also ships a different `mex`.

set -euo pipefail

find_cli() {
  local candidate npm_cmd npm_root
  if [ -n "${MEX_AGENT_CLI:-}" ] && [ -f "$MEX_AGENT_CLI" ]; then
    printf '%s\n' "$MEX_AGENT_CLI"
    return 0
  fi

  for candidate in \
    "$HOME"/.nvm/versions/node/*/lib/node_modules/mex-agent/dist/cli.js \
    "$HOME"/.local/lib/node_modules/mex-agent/dist/cli.js \
    "$HOME"/.aside/runtime/node/lib/node_modules/mex-agent/dist/cli.js \
    /opt/homebrew/lib/node_modules/mex-agent/dist/cli.js \
    /usr/local/lib/node_modules/mex-agent/dist/cli.js; do
    [ -f "$candidate" ] && { printf '%s\n' "$candidate"; return 0; }
  done

  for npm_cmd in "$(command -v npm 2>/dev/null || true)" /opt/homebrew/bin/npm /usr/local/bin/npm "$HOME/.aside/runtime/bin/npm"; do
    [ -n "$npm_cmd" ] && [ -x "$npm_cmd" ] || continue
    npm_root="$("$npm_cmd" root -g 2>/dev/null || true)"
    candidate="$npm_root/mex-agent/dist/cli.js"
    [ -f "$candidate" ] && { printf '%s\n' "$candidate"; return 0; }
  done
  return 1
}

find_node() {
  local candidate
  if [ -n "${MEX_AGENT_NODE:-}" ] && [ -x "$MEX_AGENT_NODE" ]; then
    printf '%s\n' "$MEX_AGENT_NODE"
    return 0
  fi
  if command -v node >/dev/null 2>&1; then
    command -v node
    return 0
  fi
  for candidate in \
    "$HOME"/.nvm/versions/node/*/bin/node \
    /opt/homebrew/bin/node \
    /usr/local/bin/node \
    "$HOME"/.aside/runtime/bin/node; do
    [ -x "$candidate" ] && { printf '%s\n' "$candidate"; return 0; }
  done
  return 1
}

CLI="$(find_cli)" || {
  echo "mex-agent: could not find mex-agent's dist/cli.js." >&2
  echo "           Install it with: npm install -g mex-agent" >&2
  echo "           Or point MEX_AGENT_CLI at the cli.js path." >&2
  exit 127
}
NODE="$(find_node)" || {
  echo "mex-agent: could not find Node.js >= 22.5." >&2
  echo "           Point MEX_AGENT_NODE at a node executable." >&2
  exit 127
}

exec "$NODE" "$CLI" "$@"
