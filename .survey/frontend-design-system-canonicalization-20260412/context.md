# Context: frontend design-system canonicalization

## Workflow Context
The problem sits at the repo's Tier-1 discovery layer. `design-system` and `frontend-design-system` share effectively the same frontmatter description and almost the same body content, but both are listed side by side in `README.md`, `README.ko.md`, `setup-all-skills-prompt.md`, and `.agent-skills/skills.json`. Because skill activation depends heavily on `name + description`, the current pair creates avoidable routing noise before an agent ever reads the full body.

Primary sources:
- `.agent-skills/design-system/SKILL.md`
- `.agent-skills/frontend-design-system/SKILL.md`
- `.agent-skills/skills.json`
- `README.md`
- `README.ko.md`
- `setup-all-skills-prompt.md`
- `graphify-out/GRAPH_REPORT.md`
- `.agent-skills-wiki/concepts/frontend-skill-canonicalization.md`

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Repo maintainer | Keep skill folders, manifest, docs, setup prompt, graph, and wiki aligned | Advanced |
| Agent runtime | Choose the best skill from metadata before deeper instructions load | Variable |
| Frontend developer / operator | Find the right UI-system skill for landing pages, dashboards, or product UI work | Mixed |
| Improvement loop | Decide whether to merge, alias, or leave adjacent frontend skills alone | Advanced |

## Current Workarounds
1. `frontend-design-system` contains a note that says it is a variant and to prefer `design-system` for general use.
2. Maintainers mentally treat `frontend-design-system` as a soft alias even though the public inventory still presents it as a peer skill.
3. The repo currently uses the React pair canonicalization as the working model for future frontend duplicate cleanup.

## Adjacent Problems
- Support coverage is still uneven across the corpus, so boundary decisions are harder when older skills have no evals or reference notes.
- Inventory hubs (`README.md`, `README.ko.md`, `setup-all-skills-prompt.md`) amplify ambiguous descriptions because they are the main browse surfaces.
- `design-system` and `frontend-design-system` currently look more like shallow aliasing than a justified scope split.

## User Voices
> "The `description` field determines when a skill triggers. A weak description means the skill never activates; an over-broad one triggers at wrong times."  
Source: `.agent-skills/skill-standardization/SKILL.md`

> "`design-system` and `frontend-design-system` remain close enough in metadata that they should be reviewed in a future consolidation pass."  
Source: `graphify-out/GRAPH_REPORT.md`

> "Public inventory surfaces list frontend skills side-by-side, so duplicated descriptions create avoidable activation noise."  
Source: `.agent-skills-wiki/concepts/frontend-skill-canonicalization.md`
