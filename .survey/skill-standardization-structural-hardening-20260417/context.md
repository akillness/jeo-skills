# Context: skill-standardization structural hardening

## Workflow Context
`skill-standardization` is part of the fixed harness for many `oh-my-skills` maintenance runs: survey charters regularly require `validate_skill.sh` plus `validate_catalog_sync.py` before keeping a rewrite. In practice, the repo uses repo-root commands such as `bash .agent-skills/skill-standardization/scripts/validate_skill.sh ...`, but the skill still shows bare `scripts/...` examples that fail from the repo root. The graph layer also flags `skill-standardization` as an oversized front door (315 lines), which makes this a good structural-hardening target now that repo-wide support coverage is already complete.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Skill maintainer | Create or modernize `SKILL.md` files and keep them standards-compliant | Intermediate |
| Catalog/discovery maintainer | Keep `skills.json`, README/setup, and compact discovery surfaces aligned with live folders | Intermediate |
| Agent/operator using the harness | Reuse fixed validation commands in bounded improvement loops | Intermediate |
| Runtime maintainer | Keep query/load behavior aligned with current metadata and derived artifacts | Advanced |

## Current Workarounds
1. Survey charters bypass the ambiguous examples and hardcode full repo-root paths to the validator scripts.
2. Maintainers manually review `SKILL.toon` / `SKILL.compact.md` drift because the compact-surface step is only partially automated.
3. Repo-wide structural hardening increasingly follows a pattern of shrinking giant front doors and moving slower-changing detail into `references/` packets.
4. When manifest metadata is suspicious, maintainers fall back to filesystem-first checks and manual inspection of runtime/query tooling.

## Adjacent Problems
- Stale discovery metadata can survive even when `SKILL.md` is clean, especially in `skills.json` command examples and compact variants.
- Oversized front doors hide the real operator path and make future maintenance loops less deterministic.
- Generic upstream assumptions about script execution from a skill root do not cleanly match this repo's repeatable repo-root workflow.
- Runtime discovery relies on derived surfaces (`skills.json`, `SKILL.toon`) staying truthful, not just the main `SKILL.md`.

## User Voices
> "Problem: `skill-standardization` is a high-degree maintenance skill whose front door is oversized and still contains repo-path ambiguity (`scripts/validate_skill.sh` examples fail from the repo root), making standardization runs less deterministic than they should be." — `.survey/skill-standardization-structural-hardening-20260417/triage.md`

> "The real gap is not absence of a compact format; it is that the reusable standardization skill and its checklist/evals under-specify variant-sync duties." — `.survey/skill-standardization-variant-sync-20260415/solutions.md`

> Agent Skills docs emphasize that at startup only name + description are loaded, so discovery wording carries the trigger burden; they also assume script paths are relative to the skill directory root, which is the upstream assumption that collides with this repo's repo-root harness workflow. — sources: https://agentskills.io/specification, https://agentskills.io/skill-creation/optimizing-descriptions, https://agentskills.io/skill-creation/using-scripts
