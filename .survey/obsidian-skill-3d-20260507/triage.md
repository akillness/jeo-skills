# Triage

- Problem: Newly added `obsidian` skill had documentation standard drift (missing `## Examples`) and a dead external reference URL.
- Audience: Maintainers and users who rely on skill metadata/sections for reliable loading and execution guidance.
- Why now: This is part of the hourly 3-day added-skill standardization loop; fixing now prevents repeated validator noise and broken references.

## Candidate selection
- Scope policy: prioritize newly added skills within last 3 days.
- Selected bounded fix: `.agent-skills/obsidian/SKILL.md`.

## Provenance
- direct git history inspection
- local validator output
- direct page retrieval
- package registry metadata lookup
