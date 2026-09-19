#!/usr/bin/env bash
# Shared mex-agent runtime resolution for the mex skill scripts.
# Source this file; do not execute it directly.

mex_agent_version_for() {
  local candidate="$1"
  "$candidate" --version 2>&1 | head -1
}

mex_agent_is_valid() {
  local candidate="$1" version
  [ -n "$candidate" ] && [ -x "$candidate" ] || return 1
  version="$(mex_agent_version_for "$candidate")" || return 1
  [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-]|$) ]]
}

# Sets MEX_AGENT_BIN_RESOLVED and MEX_AGENT_VERSION_RESOLVED.
# Resolution order is explicit override -> mex-agent on PATH -> the conventional
# ~/.local/bin wrapper -> bare mex only when it is actually mex-agent.
resolve_mex_agent_bin() {
  local candidate version
  MEX_AGENT_BIN_RESOLVED=""
  MEX_AGENT_VERSION_RESOLVED=""
  MEX_AGENT_RESOLVE_ERROR=""

  if [ -n "${MEX_AGENT_BIN:-}" ]; then
    if ! mex_agent_is_valid "$MEX_AGENT_BIN"; then
      MEX_AGENT_RESOLVE_ERROR="MEX_AGENT_BIN is not an executable mex-agent binary: $MEX_AGENT_BIN"
      return 2
    fi
    MEX_AGENT_BIN_RESOLVED="$MEX_AGENT_BIN"
    MEX_AGENT_VERSION_RESOLVED="$(mex_agent_version_for "$MEX_AGENT_BIN")"
    return 0
  fi

  candidate="$(command -v mex-agent 2>/dev/null || true)"
  if mex_agent_is_valid "$candidate"; then
    MEX_AGENT_BIN_RESOLVED="$candidate"
    MEX_AGENT_VERSION_RESOLVED="$(mex_agent_version_for "$candidate")"
    return 0
  fi

  candidate="${HOME:-}/.local/bin/mex-agent"
  if mex_agent_is_valid "$candidate"; then
    MEX_AGENT_BIN_RESOLVED="$candidate"
    MEX_AGENT_VERSION_RESOLVED="$(mex_agent_version_for "$candidate")"
    return 0
  fi

  candidate="$(command -v mex 2>/dev/null || true)"
  if mex_agent_is_valid "$candidate"; then
    MEX_AGENT_BIN_RESOLVED="$candidate"
    MEX_AGENT_VERSION_RESOLVED="$(mex_agent_version_for "$candidate")"
    return 0
  fi

  if [ -n "$candidate" ]; then
    version="$(mex_agent_version_for "$candidate" 2>/dev/null || true)"
    MEX_AGENT_RESOLVE_ERROR="'mex' resolves to $candidate but is not mex-agent (got: ${version:-unknown})"
  else
    MEX_AGENT_RESOLVE_ERROR="mex-agent was not found"
  fi
  return 1
}

bare_mex_collision() {
  local candidate version
  candidate="$(command -v mex 2>/dev/null || true)"
  [ -n "$candidate" ] || return 1
  mex_agent_is_valid "$candidate" && return 1
  version="$(mex_agent_version_for "$candidate" 2>/dev/null || true)"
  printf '%s\t%s\n' "$candidate" "${version:-unknown}"
}
