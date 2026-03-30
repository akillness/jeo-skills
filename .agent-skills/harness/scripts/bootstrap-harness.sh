#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: bootstrap-harness.sh --root <dir> [--platform <name>] [--team-name <name>] [--mode <name>] [--with-platform-dirs]

Creates a neutral .harness scaffold and writes a starter manifest.

Options:
  --root <dir>              Target project root
  --platform <name>         claude|codex|gemini|opencode|antigravity|pi|claw
  --team-name <name>        Logical team name (default: harness-team)
  --mode <name>             team|subagents|hybrid (default: hybrid)
  --with-platform-dirs      Also create common platform-facing directories when obvious
  --help                    Show this message
EOF
}

ROOT=""
PLATFORM="claude"
TEAM_NAME="harness-team"
MODE="hybrid"
WITH_PLATFORM_DIRS="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --root)
      ROOT="${2:-}"
      shift 2
      ;;
    --platform)
      PLATFORM="${2:-}"
      shift 2
      ;;
    --team-name)
      TEAM_NAME="${2:-}"
      shift 2
      ;;
    --mode)
      MODE="${2:-}"
      shift 2
      ;;
    --with-platform-dirs)
      WITH_PLATFORM_DIRS="true"
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ -z "$ROOT" ]]; then
  echo "--root is required" >&2
  usage >&2
  exit 1
fi

case "$PLATFORM" in
  claude|codex|gemini|opencode|antigravity|pi|claw) ;;
  *)
    echo "Unsupported platform: $PLATFORM" >&2
    exit 1
    ;;
esac

case "$MODE" in
  team|subagents|hybrid) ;;
  *)
    echo "Unsupported mode: $MODE" >&2
    exit 1
    ;;
esac

mkdir -p \
  "$ROOT/.harness/agents" \
  "$ROOT/.harness/skills" \
  "$ROOT/.harness/workspace" \
  "$ROOT/.harness/manifests"

if [[ "$WITH_PLATFORM_DIRS" == "true" ]]; then
  case "$PLATFORM" in
    claude)
      mkdir -p "$ROOT/.claude/agents" "$ROOT/.claude/skills"
      ;;
    codex)
      mkdir -p "$ROOT/.codex/prompts"
      ;;
    gemini)
      mkdir -p "$ROOT/.gemini"
      ;;
    opencode)
      mkdir -p "$ROOT/.opencode"
      ;;
    antigravity|pi|claw)
      :
      ;;
  esac
fi

MANIFEST="$ROOT/.harness/manifests/bootstrap.json"

cat > "$MANIFEST" <<EOF
{
  "platform": "$PLATFORM",
  "team_name": "$TEAM_NAME",
  "mode": "$MODE",
  "root": "$ROOT",
  "artifact_root": ".harness",
  "directories": {
    "agents": ".harness/agents",
    "skills": ".harness/skills",
    "workspace": ".harness/workspace",
    "manifests": ".harness/manifests"
  },
  "notes": [
    "Keep the harness neutral under .harness before mapping to platform-specific surfaces.",
    "Use native team semantics only where they actually exist.",
    "Assign disjoint file ownership for concurrent lanes."
  ]
}
EOF

cat <<EOF
{
  "status": "ok",
  "platform": "$PLATFORM",
  "team_name": "$TEAM_NAME",
  "mode": "$MODE",
  "manifest": ".harness/manifests/bootstrap.json"
}
EOF
