#!/usr/bin/env bash
set -euo pipefail

AGENT="claude"
SCOPE=""
AUTO_PATCH=0
NO_PATCH=0
HOOK_ONLY=0
SHOW=0
UNINSTALL=0

usage() {
  cat <<'EOF'
Usage: bash scripts/init-agent.sh [options]

Options:
  --agent claude|codex|gemini|cursor|copilot|windsurf|cline|opencode
  --global                       Force global setup
  --local                        Force local setup
  --auto-patch                   Pass --auto-patch when supported
  --no-patch                     Pass --no-patch when supported
  --hook-only                    Pass --hook-only for Claude hook-first installs
  --show                         Run rtk init --show instead of installing
  --uninstall                    Uninstall the selected integration
  -h, --help                     Show this help
EOF
}

die() {
  printf '[rtk-init][error] %s\n' "$*" >&2
  exit 1
}

log() {
  printf '[rtk-init] %s\n' "$*"
}

have_cmd() {
  command -v "$1" >/dev/null 2>&1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --agent)
      AGENT="${2:-}"
      shift 2
      ;;
    --global)
      SCOPE="global"
      shift
      ;;
    --local)
      SCOPE="local"
      shift
      ;;
    --auto-patch)
      AUTO_PATCH=1
      shift
      ;;
    --no-patch)
      NO_PATCH=1
      shift
      ;;
    --hook-only)
      HOOK_ONLY=1
      shift
      ;;
    --show)
      SHOW=1
      shift
      ;;
    --uninstall)
      UNINSTALL=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "Unknown argument: $1"
      ;;
  esac
done

have_cmd rtk || die "rtk is not installed. Run bash scripts/install.sh first."

if [[ "$SHOW" -eq 1 ]]; then
  exec rtk init --show
fi

case "$AGENT" in
  claude)
    : "${SCOPE:=global}"
    ;;
  codex|gemini|cursor|copilot|opencode)
    : "${SCOPE:=global}"
    ;;
  windsurf|cline)
    : "${SCOPE:=local}"
    ;;
  *)
    die "Unsupported agent: $AGENT"
    ;;
esac

if [[ "$AGENT" =~ ^(gemini|copilot|opencode|cursor)$ ]] && [[ "$SCOPE" != "global" ]]; then
  die "$AGENT setup is documented as global-only."
fi

if [[ "$AGENT" =~ ^(windsurf|cline)$ ]] && [[ "$SCOPE" != "local" ]]; then
  die "$AGENT setup is project-scoped and should stay local."
fi

cmd=(rtk init)
if [[ "$SCOPE" == "global" ]]; then
  cmd+=(-g)
fi

case "$AGENT" in
  claude)
    ;;
  codex)
    cmd+=(--codex)
    ;;
  gemini)
    cmd+=(--gemini)
    ;;
  cursor)
    cmd+=(--agent cursor)
    ;;
  copilot)
    cmd+=(--copilot)
    ;;
  windsurf)
    cmd+=(--agent windsurf)
    ;;
  cline)
    cmd+=(--agent cline)
    ;;
  opencode)
    cmd+=(--opencode)
    ;;
esac

if [[ "$AUTO_PATCH" -eq 1 ]]; then
  cmd+=(--auto-patch)
fi

if [[ "$NO_PATCH" -eq 1 ]]; then
  cmd+=(--no-patch)
fi

if [[ "$HOOK_ONLY" -eq 1 ]]; then
  cmd+=(--hook-only)
fi

if [[ "$UNINSTALL" -eq 1 ]]; then
  cmd+=(--uninstall)
fi

log "Running: ${cmd[*]}"
exec "${cmd[@]}"
