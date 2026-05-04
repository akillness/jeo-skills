---
name: git-guardrails-claude-code
description: >
  Configure git safety hooks to prevent Claude Code from executing destructive git
  operations: force push, reset --hard, clean -f, branch -D, checkout/restore
  destructive forms. Sets up a PreToolUse hook in Claude Code settings that blocks
  these operations before execution.
allowed-tools: Read Grep Glob Bash Write Edit
compatibility: >
  Claude Code only — uses Claude Code's PreToolUse hook system. Can be installed
  per-project (.claude/hooks/) or globally (~/.claude/hooks/). Pairs with git-workflow
  for safe branching practices.
metadata:
  tags: git, safety, hooks, destructive-operations, guardrails, claude-code
  platforms: Claude
  version: "1.0"
  source: mattpocock/skills
---

# Git Guardrails for Claude Code

Prevent Claude Code from executing destructive git operations via PreToolUse hooks.

## When to use this skill

- Protecting critical repositories from accidental destructive git commands
- Setting up safety nets before giving Claude Code broad git permissions
- After an incident involving unintended git destructive operations

## When not to use this skill

- General git workflow guidance → use `git-workflow`
- Non-Claude-Code platforms → hooks are Claude Code-specific

## Blocked operations

The guardrail blocks:
- `git push --force` / `git push -f`
- `git reset --hard`
- `git clean -f` / `git clean -fd`
- `git branch -D`
- `git checkout -- .` / `git checkout -- <file>`
- `git restore` (destructive forms)

## Installation

### Step 1 — Choose scope

**Project-level** (recommended for critical repos):
```bash
mkdir -p .claude/hooks
```

**Global** (for all Claude Code sessions):
```bash
mkdir -p ~/.claude/hooks
```

### Step 2 — Create the blocking script

Save as `.claude/hooks/git-guardrails.sh` (or `~/.claude/hooks/git-guardrails.sh`):

```bash
#!/bin/bash
# Blocks destructive git operations

COMMAND="$1"

if echo "$COMMAND" | grep -qE 'git (push --force|push -f|reset --hard|clean -f|clean -fd|branch -D|checkout -- |restore )'; then
  echo "BLOCKED: Claude does not have authority to run destructive git operations."
  echo "Command attempted: $COMMAND"
  echo "If you need this operation, run it yourself in the terminal."
  exit 2
fi

exit 0
```

```bash
chmod +x .claude/hooks/git-guardrails.sh
```

### Step 3 — Register the hook in settings

Add to `.claude/settings.json` (project) or `~/.claude/settings.json` (global):

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": ".claude/hooks/git-guardrails.sh"
          }
        ]
      }
    ]
  }
}
```

For global installation, use the full path: `~/.claude/hooks/git-guardrails.sh`

### Step 4 — Verify

```bash
echo "git reset --hard" | .claude/hooks/git-guardrails.sh
# Should exit with status 2 and print BLOCKED message
```

## Customization

Edit the regex pattern in the script to add or remove blocked operations:

```bash
# Add git tag -d to blocked list:
grep -qE 'git (push --force|push -f|reset --hard|clean -f|clean -fd|branch -D|checkout -- |restore |tag -d)'
```
