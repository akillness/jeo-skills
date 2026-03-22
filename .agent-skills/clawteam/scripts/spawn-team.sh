#!/usr/bin/env bash
# Spawn a ClawTeam from command line with a task description
# Usage: bash spawn-team.sh [team-name] [task] [worker-count] [agent-type]

set -euo pipefail

TEAM="${1:-my-team}"
TASK="${2:-Build a feature}"
WORKERS="${3:-3}"
AGENT="${4:-claude}"

echo "=== Spawning ClawTeam ==="
echo "Team:    $TEAM"
echo "Task:    $TASK"
echo "Workers: $WORKERS"
echo "Agent:   $AGENT"
echo ""

# Verify clawteam is installed
if ! command -v clawteam &>/dev/null; then
  echo "ERROR: clawteam not installed. Run: pip install clawteam"
  exit 1
fi

# Spawn worker agents
echo "Spawning $WORKERS workers..."
clawteam spawn "$AGENT" "$TASK" \
  --workers "$WORKERS" \
  --team "$TEAM"

echo ""
echo "Team '$TEAM' spawned with $WORKERS workers."
echo ""
echo "Monitor your team:"
echo "  clawteam status --team $TEAM"
echo "  clawteam board --team $TEAM"
echo "  clawteam monitor --team $TEAM"
echo ""
echo "Communicate with workers:"
echo "  clawteam broadcast --team $TEAM 'New instructions here'"
echo ""
echo "Shut down when complete:"
echo "  clawteam teardown --team $TEAM"
