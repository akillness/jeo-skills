---
name: superpowers
description: >
  Run obra/superpowers, an agentic software engineering workflow suite enforcing Socratic brainstorming, git worktree isolation, micro-task planning, red-green-refactor TDD, two-stage code review, and fresh verification before completion. Use when installing superpowers across Claude Code, Cursor, Codex, OpenCode, or Gemini CLI, executing brainstorming -> writing-plans -> subagent-driven-development -> verification-before-completion, or coordinating systematic debugging. Do not use for role-based browser QA sprints (route to gstack) or Spec Kit CLI artifacts (route to spec-kit). Triggers on: superpowers, obra/superpowers, subagent-driven-development, systematic-debugging, verification-before-completion.
allowed-tools: Read Glob Grep Bash
compatibility: Works with Claude Code, Cursor, Codex, OpenCode, and Gemini CLI. Preflight runs offline in Python 3.10+.
license: MIT
metadata:
  version: "5.0.7"
  source: https://github.com/obra/superpowers
  upstream_commit: 22f0b463e7a5e579904dd6211a520321035526f7
  pinned_at: "2026-11-03"
---

# Superpowers (`obra/superpowers`)

Source-pinned operator guide for `obra/superpowers` (`v5.0.7`, MIT), a composable 14-skill software development methodology enforcing specification sign-off, test-driven execution, and evidence-backed completion.

## When to use this skill

- Installing or updating `superpowers` in Claude Code (`/plugin install superpowers@claude-plugins-official` or marketplace `obra/superpowers-marketplace`), Cursor, Codex (`.codex/INSTALL.md`), OpenCode (`.opencode/INSTALL.md`), or Gemini CLI (`gemini extensions install https://github.com/obra/superpowers`).
- Executing the full disciplined development loop: `brainstorming` -> `using-git-worktrees` -> `writing-plans` -> `subagent-driven-development` / `executing-plans` -> `test-driven-development` -> `requesting-code-review` -> `verification-before-completion` -> `finishing-a-development-branch`.
- Isolating root causes via `systematic-debugging` (4-phase cause tracing before edits) or dispatching `dispatching-parallel-agents` for independent investigations.
- Routing out: use `gstack` for founder/CEO/design/QA browser sprints, `spec-kit` for `/speckit.*` constitution templates, and `aidlc-workflows` for AWS AI-DLC inception/construction gates.

## Instructions

1. **Run offline preflight first** to confirm host tools (`git`, `claude`, `codex`, `gemini`):
   ```bash
   python3 scripts/preflight.py --json
   ```

2. **Install on the target coding agent platform**:
   - **Claude Code (official marketplace)**: `/plugin install superpowers@claude-plugins-official`
   - **Claude Code (Obra marketplace)**: `/plugin marketplace add obra/superpowers-marketplace` then `/plugin install superpowers@superpowers-marketplace`
   - **Gemini CLI**: `gemini extensions install https://github.com/obra/superpowers`
   - **Codex / OpenCode**: Fetch `.codex/INSTALL.md` or `.opencode/INSTALL.md` directly from upstream pinned commit.

3. **Follow the rigid stage gates without skipping steps**:
   - **No code before design sign-off**: Run `brainstorming` first to refine requirements, produce a concise spec, and get explicit user approval before writing implementation files.
   - **Isolated workspace**: Create a clean worktree via `using-git-worktrees` before multi-file feature execution.
   - **Micro-task implementation**: Break specs into explicit 2-5 minute tasks in `writing-plans` with exact file paths and verification commands.
   - **Red-Green-Refactor TDD**: Never write production code without a failing test first (`test-driven-development`).
   - **Two-stage review**: Verify spec compliance first, then code quality (`requesting-code-review` / `receiving-code-review`).

4. **Enforce verification and stack boundaries**:
   - Never claim a fix or feature passes without running fresh verification commands (`verification-before-completion`).
   - Do not double-stack `superpowers` hooks alongside conflicting methodology plugins (`gstack`, `aidlc-workflows`) on the same active session without choosing one primary orchestrator.

## Examples

- **New feature workflow**:
  Start with `brainstorming` to lock assumptions -> create worktree via `using-git-worktrees` -> author plan in `writing-plans` -> run `subagent-driven-development` with TDD -> close via `finishing-a-development-branch`.
- **Bug triage**:
  Trigger `systematic-debugging` to reproduce and isolate the exact root cause before proposing a regression test and patch.

## Best practices

- Keep `brainstorming` specs succinct and confirm every non-trivial assumption before opening implementation tasks.
- Enforce `verification-before-completion` after the final edit; stale test passes before refactors do not count.
- When extending `superpowers` with new custom skills, follow `writing-skills` TDD-for-prompts discipline.

## References

- Pinned upstream skill catalog and platform installs: [references/upstream.md](references/upstream.md)
- Pinned source provenance and file digests: [references/source.json](references/source.json)
- Offline manifest preflight helper: [scripts/preflight.py](scripts/preflight.py)
- Eval suite: [evals/evals.json](evals/evals.json)
