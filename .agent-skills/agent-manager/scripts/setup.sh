#!/usr/bin/env bash
# agent-manager project setup script
# Creates agents/ directory, sample agent config, and HEARTBEAT.md
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
AGENTS_DIR="${REPO_ROOT}/agents"

echo "=== agent-manager project setup ==="
echo "Project root: ${REPO_ROOT}"
echo ""

# Create agents directory
mkdir -p "${AGENTS_DIR}"
echo "  ✓ Created ${AGENTS_DIR}/"

# Create sample agent config if none exist
if [ -z "$(ls -A "${AGENTS_DIR}" 2>/dev/null)" ]; then
  cat > "${AGENTS_DIR}/EMP_0001.md" << 'AGENT_EOF'
---
name: dev
description: Dev Agent — general purpose development assistant
enabled: true
working_directory: ${REPO_ROOT}
launcher: claude
launcher_args:
  - --dangerously-skip-permissions
skills: []
schedules:
  - name: daily-standup
    cron: "0 9 * * 1-5"
    task: |
      Review open GitHub issues and PRs.
      Prioritize today's development work.
      Report status in STANDUP.md.
    max_runtime: 30m
    enabled: false
heartbeat:
  cron: "*/30 * * * *"
  max_runtime: 5m
  session_mode: auto
  enabled: false
---

# DEV AGENT

## Role and Identity
You are the Dev Agent for this project. Your job is to assist with development tasks.

## Responsibilities
- Write and review code
- Fix bugs and implement features
- Run tests and verify changes

## Working Style
- Always read existing code before modifying
- Write tests for new functionality
- Keep changes focused and minimal
AGENT_EOF
  echo "  ✓ Created ${AGENTS_DIR}/EMP_0001.md (sample dev agent)"
else
  echo "  ✓ ${AGENTS_DIR}/ already has agent files, skipping sample creation"
fi

# Create HEARTBEAT.md template
if [ ! -f "${REPO_ROOT}/HEARTBEAT.md" ]; then
  cat > "${REPO_ROOT}/HEARTBEAT.md" << 'HB_EOF'
# HEARTBEAT INSTRUCTIONS

Read this file on every heartbeat check-in.

## Standing Orders

1. Check for any new GitHub issues or PR comments assigned to you
2. Verify your current task is still relevant
3. Report your status

## Response Format

If nothing needs attention: reply with `HEARTBEAT_OK`
If action is needed: describe what you are doing / will do next
HB_EOF
  echo "  ✓ Created ${REPO_ROOT}/HEARTBEAT.md"
fi

# Find CLI path
CLI_PATH=""
for path in \
  "${HOME}/.claude/skills/agent-manager/scripts/main.py" \
  "${HOME}/.agent/skills/agent-manager/scripts/main.py" \
  "${REPO_ROOT}/.claude/skills/agent-manager/scripts/main.py" \
  "${REPO_ROOT}/.agent/skills/agent-manager/scripts/main.py"; do
  if [ -f "${path}" ]; then
    CLI_PATH="${path}"
    break
  fi
done

echo ""
echo "=== Setup complete ==="
echo ""

if [ -n "${CLI_PATH}" ]; then
  echo "Quick start:"
  echo "  CLI=\"python3 ${CLI_PATH}\""
  echo "  \$CLI list"
  echo "  \$CLI doctor"
  echo "  \$CLI start dev"
  echo "  \$CLI monitor dev --follow"
  echo "  \$CLI stop dev"
else
  echo "Install agent-manager first: bash scripts/install.sh"
  echo "Then:"
  echo "  CLI=\"python3 ~/.claude/skills/agent-manager/scripts/main.py\""
  echo "  \$CLI list"
fi

echo ""
echo "Edit ${AGENTS_DIR}/EMP_0001.md to configure your agent."
echo "Edit ${REPO_ROOT}/HEARTBEAT.md to set standing orders."
