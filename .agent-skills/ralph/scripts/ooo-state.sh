#!/usr/bin/env bash
# ooo-state.sh — ralph-ooo state file manager
#
# Manages .omc/state/ralph-ooo-state.json for the ralph-ooo persistent loop.
#
# Usage:
#   bash ooo-state.sh <subcommand> [args]
#
# Subcommands:
#   init <request> [max_iterations]  Create a new state file
#   status                           Print current state summary
#   checkpoint [note]                Increment iteration counter
#   reset                            Clear state file (sets status: cancelled)
#   resume                           Print resume instructions
#   history                          Print verification history

set -euo pipefail

STATE_DIR=".omc/state"
STATE_FILE="$STATE_DIR/ralph-ooo-state.json"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
GRAY='\033[0;37m'
CYAN='\033[0;36m'
NC='\033[0m'

# ── Helpers ──────────────────────────────────────────────────────────────────
require_python() {
  if ! command -v python3 &>/dev/null; then
    echo -e "${RED}✗ python3 required but not found${NC}" >&2
    exit 1
  fi
}

require_state() {
  if [ ! -f "$STATE_FILE" ]; then
    echo -e "${RED}✗ No state file at ${STATE_FILE}${NC}" >&2
    echo -e "${GRAY}  Run: bash ooo-state.sh init \"your task\"${NC}" >&2
    exit 1
  fi
}

generate_uuid() {
  if command -v python3 &>/dev/null; then
    python3 -c "import uuid; print(str(uuid.uuid4()))"
  elif command -v uuidgen &>/dev/null; then
    uuidgen | tr '[:upper:]' '[:lower:]'
  else
    echo "$(date +%s)-$$-$(od -An -N4 -tx4 /dev/urandom 2>/dev/null | tr -d ' ' || echo 'rand')"
  fi
}

now_iso() {
  date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date +"%Y-%m-%dT%H:%M:%SZ"
}

# ── Subcommands ───────────────────────────────────────────────────────────────

cmd_init() {
  local request="${1:-unnamed task}"
  local max_iter="${2:-10}"
  local session_id
  session_id="$(generate_uuid)"
  local timestamp
  timestamp="$(now_iso)"

  require_python
  mkdir -p "$STATE_DIR"

  python3 - "$STATE_FILE" "$session_id" "$request" "$max_iter" "$timestamp" <<'PYEOF'
import json, sys

path, sid, req, max_it, ts = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4]), sys.argv[5]

state = {
    "mode": "ralph-ooo",
    "session_id": sid,
    "request": req,
    "status": "running",
    "iteration": 0,
    "max_iterations": max_it,
    "last_checkpoint": None,
    "seed_path": None,
    "created_at": ts,
    "updated_at": ts,
    "verification_history": []
}

with open(path, "w") as f:
    json.dump(state, f, indent=2)
    f.write("\n")

print(f"session_id: {sid}")
PYEOF

  echo ""
  echo -e "${GREEN}✓ State file initialized: ${STATE_FILE}${NC}"
  echo -e "  session_id:     $(python3 -c "import json; d=json.load(open('$STATE_FILE')); print(d['session_id'])")"
  echo -e "  request:        ${request}"
  echo -e "  max_iterations: ${max_iter}"
  echo -e "  status:         running"
  echo ""
}

cmd_status() {
  require_state
  require_python

  python3 - "$STATE_FILE" <<'PYEOF'
import json, sys

with open(sys.argv[1]) as f:
    d = json.load(f)

status = d.get("status", "unknown")
color = {
    "running": "\033[0;33m",
    "complete": "\033[0;32m",
    "failed": "\033[0;31m",
    "cancelled": "\033[0;37m"
}.get(status, "\033[0m")
NC = "\033[0m"

print(f"\n{color}Status: {status}{NC}")
print(f"  Session:    {d.get('session_id', 'N/A')}")
print(f"  Request:    {d.get('request', 'N/A')}")
print(f"  Iteration:  {d.get('iteration', 0)} / {d.get('max_iterations', 10)}")
print(f"  Checkpoint: {d.get('last_checkpoint', 'none')}")
print(f"  Seed:       {d.get('seed_path', 'none')}")

history = d.get("verification_history", [])
if history:
    print(f"\n  Verification history ({len(history)} entries):")
    for h in history[-5:]:  # last 5
        marker = "✓" if h.get("passed") else "✗"
        score = h.get("score", "?")
        print(f"    [{marker}] Iter {h.get('iteration', '?')}: score={score}")
print()
PYEOF
}

cmd_checkpoint() {
  require_state
  require_python
  local note="${1:-}"
  local timestamp
  timestamp="$(now_iso)"

  python3 - "$STATE_FILE" "$timestamp" "$note" <<'PYEOF'
import json, sys

path, ts, note = sys.argv[1], sys.argv[2], sys.argv[3]

with open(path) as f:
    d = json.load(f)

old_iter = d.get("iteration", 0)
d["iteration"] = old_iter + 1
d["last_checkpoint"] = f"iteration_{d['iteration']}"
d["updated_at"] = ts

with open(path, "w") as f:
    json.dump(d, f, indent=2)
    f.write("\n")

print(f"Iteration {old_iter} → {d['iteration']} (checkpoint: {d['last_checkpoint']})")
PYEOF

  echo -e "${GREEN}✓ Checkpoint saved: iteration $(python3 -c "import json; d=json.load(open('$STATE_FILE')); print(d['iteration'])")${NC}"
}

cmd_complete() {
  require_state
  require_python
  local timestamp
  timestamp="$(now_iso)"

  python3 - "$STATE_FILE" "$timestamp" <<'PYEOF'
import json, sys

path, ts = sys.argv[1], sys.argv[2]

with open(path) as f:
    d = json.load(f)

d["status"] = "complete"
d["last_checkpoint"] = "complete"
d["updated_at"] = ts

with open(path, "w") as f:
    json.dump(d, f, indent=2)
    f.write("\n")

print(f"Marked complete at iteration {d.get('iteration', 0)}")
PYEOF

  echo -e "${GREEN}✓ State marked complete${NC}"
}

cmd_reset() {
  if [ ! -f "$STATE_FILE" ]; then
    echo -e "${YELLOW}⚠ No state file to reset${NC}"
    exit 0
  fi

  require_python
  local timestamp
  timestamp="$(now_iso)"

  python3 - "$STATE_FILE" "$timestamp" <<'PYEOF'
import json, sys

path, ts = sys.argv[1], sys.argv[2]

with open(path) as f:
    d = json.load(f)

d["status"] = "cancelled"
d["last_checkpoint"] = "cancelled"
d["updated_at"] = ts

with open(path, "w") as f:
    json.dump(d, f, indent=2)
    f.write("\n")

print("State reset (status: cancelled)")
PYEOF

  echo -e "${YELLOW}✓ State reset (status: cancelled)${NC}"
  echo -e "${GRAY}  File kept at ${STATE_FILE} — run 'init' to start fresh${NC}"
}

cmd_resume() {
  require_state
  require_python

  local session_id iter max_iter request status
  session_id="$(python3 -c "import json; d=json.load(open('$STATE_FILE')); print(d.get('session_id','?'))")"
  iter="$(python3 -c "import json; d=json.load(open('$STATE_FILE')); print(d.get('iteration',0))")"
  max_iter="$(python3 -c "import json; d=json.load(open('$STATE_FILE')); print(d.get('max_iterations',10))")"
  request="$(python3 -c "import json; d=json.load(open('$STATE_FILE')); print(d.get('request','?'))")"
  status="$(python3 -c "import json; d=json.load(open('$STATE_FILE')); print(d.get('status','?'))")"

  echo ""
  echo -e "${CYAN}ralph-ooo Resume Instructions${NC}"
  echo -e "══════════════════════════════"
  echo -e "  Session:    ${session_id}"
  echo -e "  Request:    ${request}"
  echo -e "  Iteration:  ${iter}/${max_iter}"
  echo -e "  Status:     ${status}"
  echo ""
  echo -e "${BLUE}To resume, say one of:${NC}"
  echo -e "  ooo ralph continue"
  echo -e "  ooo ralph continue --session-id=${session_id}"
  echo -e "  /ralph \"${request}\" --max-iterations=${max_iter}"
  echo ""
}

cmd_history() {
  require_state
  require_python

  python3 - "$STATE_FILE" <<'PYEOF'
import json, sys

with open(sys.argv[1]) as f:
    d = json.load(f)

history = d.get("verification_history", [])
if not history:
    print("No verification history yet.")
    sys.exit(0)

print(f"\nVerification History ({len(history)} entries):")
print("─" * 50)
for h in history:
    marker = "PASS ✓" if h.get("passed") else "FAIL ✗"
    score  = h.get("score", "?")
    itr    = h.get("iteration", "?")
    ts     = h.get("timestamp", "?")
    issues = h.get("issues", [])
    print(f"  Iteration {itr}: {marker} (score={score}) [{ts}]")
    for issue in issues:
        print(f"    - {issue}")
print()
PYEOF
}

# ── Dispatch ──────────────────────────────────────────────────────────────────
SUBCOMMAND="${1:-help}"
shift || true

case "$SUBCOMMAND" in
  init)       cmd_init "$@" ;;
  status)     cmd_status ;;
  checkpoint) cmd_checkpoint "${1:-}" ;;
  complete)   cmd_complete ;;
  reset)      cmd_reset ;;
  resume)     cmd_resume ;;
  history)    cmd_history ;;
  help|--help|-h)
    echo ""
    echo -e "${BLUE}ooo-state.sh — ralph-ooo state manager${NC}"
    echo ""
    echo "Usage: bash ooo-state.sh <subcommand> [args]"
    echo ""
    echo "Subcommands:"
    echo "  init <request> [max]  Create new state file (default max: 10)"
    echo "  status                Print current state summary"
    echo "  checkpoint [note]     Increment iteration counter + save checkpoint"
    echo "  complete              Mark loop as complete"
    echo "  reset                 Set status to cancelled (keeps file)"
    echo "  resume                Print resume instructions"
    echo "  history               Print full verification history"
    echo ""
    echo "State file: ${STATE_FILE}"
    echo ""
    ;;
  *)
    echo -e "${RED}Unknown subcommand: ${SUBCOMMAND}${NC}" >&2
    echo "Run: bash ooo-state.sh help" >&2
    exit 1
    ;;
esac
