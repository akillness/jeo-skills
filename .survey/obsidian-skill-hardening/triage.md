# Triage — obsidian skill hardening

- Run time: 2026-05-07 (KST)
- Scope policy: prioritize skills newly added in last 3 days.
- Candidate set source:
  - `git log --since='3 days ago' --diff-filter=A --name-only -- '.agent-skills/*/SKILL.md'`
- Selected bounded candidate: `.agent-skills/obsidian/SKILL.md`

## Why this candidate
- Validator reported a documentation-quality warning (`## Examples` section missing).
- Skill contains remote bootstrap command (`npx github:...`) that benefits from explicit safety guidance.
- Change is narrow and easily reversible (single-file doc edit).

## Decision
- Proceed with minimal standardization + security clarification edits.
- Avoid broad refactoring across all new skills in this run.
