---
name: resolving-merge-conflicts
description: >
  Use when you need to resolve an in-progress git merge/rebase conflict.
allowed-tools: Read Grep Glob Bash Write Edit
compatibility: >
  For an in-progress merge or rebase only. Route branch strategy and history cleanup to git-
  workflow and submodule pointer conflicts to git-submodule.
metadata:
  tags: merge-conflict, rebase, intent-preservation, automated-checks, git-recovery
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "1.0"
  source: mattpocock/skills
  upstream_commit: 3cca18b368ae95cdbdebbff572ccafa662551015
  invocation: model-invoked
---

# Resolving Merge Conflicts

Use when you need to resolve an in-progress git merge/rebase conflict.

This skill is imported from `mattpocock/skills` (MIT) and is **model-invoked** upstream.

## When to use this skill

- Use when you need to resolve an in-progress git merge/rebase conflict.

## Instructions

1. **See the current state** of the merge/rebase. Check git history, and the conflicting files.

2. **Find the primary sources** for each conflict. Understand deeply why each change was made, and what the original intent was. Read the commit messages, check the PRs, check original issues/tickets.

3. **Resolve each hunk.** Preserve both intents where possible. Where incompatible, pick the one matching the merge's stated goal and note the trade-off. Do **not** invent new behaviour. Always resolve; never `--abort`.

4. Discover the project's **automated checks** and run them, typically typecheck, then tests, then format. Fix anything the merge broke.

5. **Finish the merge/rebase.** Stage everything and commit. If rebasing, continue the rebase process until all commits are rebased.

## Examples

- Apply this skill to one narrow scope first, confirm the output matches the shape described above, then widen to the full task.
- When a step needs a fact from the repository or the environment, look it up instead of asking the user for it.

## Best practices

- Keep the upstream procedure intact; record deviations explicitly instead of silently improvising.
- Stop and hand control back to the user at every decision point this skill marks as theirs.
- Prefer small reversible changes, and state assumptions rather than burying them.

## References

- Upstream skill: `mattpocock/skills` `skills/engineering/resolving-merge-conflicts/SKILL.md` (commit `3cca18b`, MIT)
- Project standards: `.agent-skills/skill-standardization/SKILL.md`
- Validator script: `.agent-skills/skill-standardization/scripts/validate_skill.sh`
