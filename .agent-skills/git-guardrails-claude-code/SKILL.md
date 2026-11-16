---
name: git-guardrails-claude-code
description: >
  Set up Claude Code hooks to block dangerous git commands (push, reset --hard, clean, branch -D,
  etc.) before they execute. Use when user wants to prevent destructive git operations, add git
  safety hooks, or block git push/reset in Claude Code.
allowed-tools: Read Grep Glob Bash Write Edit
compatibility: >
  Claude Code hook setup only. Route general Git workflow guidance to git-workflow.
metadata:
  tags: git-safety, claude-code-hooks, pretooluse, destructive-commands, guardrails
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "1.0"
  source: mattpocock/skills
  upstream_commit: 3cca18b368ae95cdbdebbff572ccafa662551015
  invocation: model-invoked
---

# Git Guardrails for Claude Code

Set up Claude Code hooks to block dangerous git commands (push, reset --hard, clean, branch -D, etc.) before they execute. Use when user wants to prevent destructive git operations, add git safety hooks, or block git push/reset in Claude Code.

This skill is imported from `mattpocock/skills` (MIT) and is **model-invoked** upstream.

## When to use this skill

- Set up Claude Code hooks to block dangerous git commands (push, reset --hard, clean, branch -D, etc.) before they execute.
- Use when user wants to prevent destructive git operations, add git safety hooks, or block git push/reset in Claude Code.

## Instructions

## Setup Git Guardrails

Sets up a PreToolUse hook that intercepts and blocks dangerous git commands before Claude executes them.

### What Gets Blocked

- `git push` (all variants including `--force`)
- `git reset` with `--hard`
- `git clean -f` / `git clean -fd`
- `git branch -D`
- `git checkout .` / `git restore .`

When blocked, Claude sees a message telling it that it does not have authority to access these commands.

### Steps

#### 1. Ask scope

Ask the user: install for **this project only** or **all projects**?

#### 2. Copy the hook script

The bundled script is at: [scripts/block-dangerous-git.sh](scripts/block-dangerous-git.sh)

Copy it to the target location based on scope:

- **Project**: `<project-root>/hooks/block-dangerous-git.sh`
- **Global**: `<user-hooks-dir>/block-dangerous-git.sh`

Make it executable with `chmod +x`.

#### 3. Add hook to settings

Register the command hook via `/hooks` (or your Claude Code hook configuration) for the selected scope:

**Project**:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/hooks/block-dangerous-git.sh"
          }
        ]
      }
    ]
  }
}
```

**Global**:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "<user-hooks-dir>/block-dangerous-git.sh"
          }
        ]
      }
    ]
  }
}
```

If a hook configuration already exists, merge the hook into the existing `PreToolUse` array rather than overwriting other hooks.

#### 4. Ask about customization

Ask if user wants to add or remove any patterns from the blocked list. Edit the copied script accordingly.

#### 5. Verify

Run a quick test:

```bash
echo '{"tool_input":{"command":"git push origin main"}}' | <path-to-script>
```

Should exit with code 2 and print a BLOCKED message to stderr.

## Examples

- Apply this skill to one narrow scope first, confirm the output matches the shape described above, then widen to the full task.
- When a step needs a fact from the repository or the environment, look it up instead of asking the user for it.

## Best practices

- Keep the upstream procedure intact; record deviations explicitly instead of silently improvising.
- Stop and hand control back to the user at every decision point this skill marks as theirs.
- Prefer small reversible changes, and state assumptions rather than burying them.

## References

- Upstream skill: `mattpocock/skills` (`git-guardrails-claude-code`, commit `3cca18b`, MIT)
- Script: `scripts/block-dangerous-git.sh`
- Project standards: `skill-standardization`
