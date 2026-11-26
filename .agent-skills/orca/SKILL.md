---
name: orca
description: >
  Operate stablyai/orca, an agent orchestration workspace and CLI managing isolated Git worktrees, embedded terminals, multi-agent orchestration runs, Slack/Linear/Jira bot dispatches, and remote servers for Claude Code, Codex, Gemini CLI, and OpenCode. Use when installing Orca via Homebrew cask, inspecting orca status --json, creating isolated worktrees with orca worktree create, or coordinating multi-agent runs. Do not use for mobile E2E encrypted session relay (route to happy) or swarm memory frameworks (route to ruflo). Triggers on: orca, stablyai/orca, orca worktree, orca orchestration, git worktree agent fleet.
allowed-tools: Read Glob Grep Bash
compatibility: macOS Apple Silicon app/CLI (brew install --cask orca) or Node/pnpm source checkout with git. Preflight runs offline in Python 3.10+.
license: MIT
metadata:
  version: "1.0.0"
  source: https://github.com/stablyai/orca
  upstream_commit: 687383b94b9453d52e3dc368a87465a7ce5ebc58
  pinned_at: "2026-11-26"
---

# Orca (`stablyai/orca`)

Source-pinned operator guide for `stablyai/orca` (MIT), a Git-worktree-first parallel agent orchestration desktop app and CLI (`orca`).

## When to use this skill

- Installing Orca (`brew install --cask orca`) or launching the workspace (`orca open`, `orca status --json`).
- Creating isolated Git worktrees bound to specific coding agents and prompts (`orca worktree create --name ... --repo ... --agent ... --prompt ...`).
- Inspecting or orchestrating parallel agent runs (`orca orchestration ...`, `orca agents ...`, `orca dispatch ...`, `orca diagnostics ...`).
- Wiring or troubleshooting Slack/Linear/Jira bot integrations (`orca bots ...`), automations (`orca automations ...`), or remote server access (`orca server ...`).
- Routing out: use `happy` for encrypted mobile session handoff (`happy claude`), `ruflo` for swarm memory/hooks orchestration, and `git-workflow` for standard manual Git branch hygiene.

## Instructions

1. **Run offline preflight first** to confirm `orca`, `git`, `node`, and `pnpm` availability:
   ```bash
   python3 scripts/preflight.py --json
   ```

2. **Inspect workspace state before mutating worktrees**:
   - Check running app/CLI state with machine-readable JSON:
     ```bash
     orca status --json
     ```
   - Open or focus the desktop workspace when needed: `orca open`.

3. **Create isolated Git worktrees and launch parallel agents**:
   - Use `orca worktree create` with explicit repo, branch/name, agent, and prompt flags:
     ```bash
     orca worktree create --name feat-auth --repo /abs/path/to/repo --agent claude --prompt "Implement OAuth callback tests"
     ```
   - Inspect orchestration runs and agent status via `orca orchestration`, `orca agents`, and `orca dispatch` (`orca --help` / `orca <cmd> --help` for subcommand flags).

4. **Enforce worktree, remote server, and bot token boundaries**:
   - Require explicit user confirmation before removing unmerged worktrees or deleting worktree branches.
   - Gate `orca server` listeners, webhook endpoints (`orca webhooks`), and Slack/Linear/Jira bots (`orca bots`) behind explicit security/network approval before binding remote access or loading external tokens.

## Examples

- **Parallel feature + review worktrees**:
  Run `orca status --json` -> create two isolated worktrees (`orca worktree create --name api-fix ...` and `orca worktree create --name ui-fix ...`) -> inspect diffs before merging back into the main branch.
- **Diagnostics check**:
  Run `orca diagnostics` when an embedded terminal or agent runtime fails to attach inside Orca.

## Best practices

- Keep every parallel agent inside its own dedicated worktree so concurrent edits never collide on working-tree files or staging indexes.
- Prefer `--json` flags (`orca status --json`) in automated scripts instead of parsing human-formatted output.
- Audit `orca.yaml` and repo automation configs before enabling automatic bot or webhook triggers.

## References

- Pinned upstream CLI specs and module map: [references/upstream.md](references/upstream.md)
- Pinned source provenance and file digests: [references/source.json](references/source.json)
- Offline manifest preflight helper: [scripts/preflight.py](scripts/preflight.py)
- Eval suite: [evals/evals.json](evals/evals.json)
