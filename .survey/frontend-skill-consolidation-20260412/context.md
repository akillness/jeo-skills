# Context: Frontend skill consolidation

## Workflow Context
The repository’s discovery path is frontmatter-first: the skill standardization guidance and vendored skill-writing guide both stress that skill activation depends heavily on `name` and `description`. In the frontend cluster, `react-best-practices` and `vercel-react-best-practices` currently ship the same high-level description, and the public inventory surfaces list both side-by-side. The same pattern also exists for `design-system` and `frontend-design-system`.

The current docs/setup surfaces behave as indexing hubs, not deep guidance. That means duplicated Tier-1 descriptions create noise before an agent even opens the skill body. The repo already has install-time duplicate cleanup for platform links, but that workaround happens after catalog discovery.

Sources:
- `README.md`
- `.agent-skills/skills.json`
- `graphify-out/GRAPH_REPORT.md`
- `.agent-skills/skill-standardization/SKILL.md`
- `.agent-skills/harness/references/upstream/skill-writing-guide.md`

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Catalog maintainer | Keep the skill set discoverable, non-duplicative, and easy to update | Advanced |
| Agent using skill catalog | Choose the right frontend skill from name/description alone | Intermediate to advanced |
| Frontend developer | Ask for React/Next.js performance help or design-system guidance without learning repo internals | Mixed |

## Current Workarounds
1. Use soft redirect notes inside the variant skills: `vercel-react-best-practices` already says to prefer `react-best-practices` for general use.
2. Rely on install-time duplicate link cleanup in `setup-all-skills-prompt.md` for platform-specific wrappers.
3. Depend on maintainer memory to know which entry is canonical.
4. Accept shallow duplication in README/setup/manifest inventory surfaces.

## Adjacent Problems
- Uneven support coverage across the catalog makes it harder to prove when two neighboring skills are truly different.
- README/setup inventories amplify overlap because they list duplicates without enough boundary context.
- The design-system pair likely needs the same treatment later.
- Older skills with non-standard headings are more likely to trigger validator warnings, which weakens skill quality over time.

## User Voices
> "The `description` field determines when a skill triggers. A weak description means the skill never activates; an over-broad one triggers at wrong times."
- Source: `.agent-skills/skill-standardization/SKILL.md`

> "Claude decides whether to use a skill based on `name` + `description` alone (Tier 1 catalog)."
- Source: `.agent-skills/harness/references/upstream/skill-writing-guide.md`

> "Documentation surfaces ... act as indexing hubs rather than detailed guidance, so description quality inside each SKILL.md remains the main discoverability lever."
- Source: `graphify-out/GRAPH_REPORT.md`
