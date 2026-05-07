# Context

## Workflow Context
- Repository: `akillness/oh-my-skills`.
- Run mode: hourly autonomous maintenance.
- Scope: newly added skill packages in last 3 days (`git log --since ... --diff-filter=A`).

## Affected Users
- Skill consumers expecting standard SKILL.md sections.
- Maintainers depending on validator-clean packages and valid external references.

## Current Workarounds
- Manual interpretation when sections are missing.
- Manually resolving broken links outside the skill doc.

## Adjacent Problems
- Duplicate headings can reduce parser and reader clarity.
- Dead external links reduce trust and reproducibility.

## User Voices
- Cron policy requires quality-gate-safe PR output and explicit blocker handling.
