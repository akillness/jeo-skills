# Context: skill-standardization variant sync

## Workflow Context
This problem shows up in the repo's skill-maintenance loop after a skill rewrite is already "done" at the `SKILL.md` level. The live repo now ships token-optimized discovery variants (`SKILL.toon`, and runtime fallback support for `SKILL.compact.md`) through `skill-query-handler.py` and `skill_loader.py`, while the current `skill-standardization` guidance and checklist focus mostly on `SKILL.md`, `skills.json`, README/setup counts, and general runtime discovery. In practice, recent modernization runs repeatedly refresh `SKILL.toon`, which means compact discovery variants have become part of the real maintenance workflow rather than an optional afterthought.

Sources:
- GitHub raw primary-source retrieval: `https://raw.githubusercontent.com/aiskillstore/marketplace/main/skills/supercent-io/code-refactoring/SKILL.toon`
- Direct page retrieval: `https://agentskills.io/specification`
- Repo evidence: `.agent-skills/skill-query-handler.py`, `.agent-skills/skill_loader.py`, `.agent-skills/skill-standardization/SKILL.md`, `.agent-skills-wiki/log.md`

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Skill maintainers | Rewrite or add skills without leaving discovery artifacts stale | Intermediate |
| Agent runtime maintainers | Keep loaders/query tooling aligned with actual shipped skill formats | Advanced |
| Downstream agents | Decide which skill to load from short descriptions and compact variants | N/A |

## Current Workarounds
1. Manually remember to refresh `SKILL.toon` whenever `SKILL.md` changes materially.
2. Rely on README / setup / manifest drift checks, even though they do not inspect compact variants.
3. Mention `SKILL.toon` ad hoc in per-run survey charters and wiki logs instead of codifying it in the reusable standardization skill.

## Adjacent Problems
- A skill can pass spec validation and catalog-sync validation while still advertising stale trigger scope in `SKILL.toon`.
- Compact runtime retrieval can lag behind the canonical file, creating false confidence during repeated modernization loops.
- Eval coverage can miss variant-sync regressions if prompts only test `SKILL.md` or manifest/docs drift.

## User Voices
- Agent Skills spec: progressive disclosure loads `name` + `description` first, then the full skill only on activation, which makes concise discovery surfaces important (`https://agentskills.io/specification`).
- Agent Skills description guidance says the description in frontmatter is the primary trigger mechanism and under/over-broad descriptions directly hurt activation quality (`https://agentskills.io/skill-creation/optimizing-descriptions`).
- Agent Skills eval guidance says evaluation should include cost/benefit and realistic prompts, which supports adding explicit variant-sync checks instead of assuming the compressed layer stays correct (`https://agentskills.io/skill-creation/evaluating-skills`).
