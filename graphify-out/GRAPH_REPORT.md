# GRAPH_REPORT

## Scope
- Path analyzed: `.agent-skills/` plus repository discovery docs
- Method: custom graphify-style structural graph over skill metadata, support-file presence, compact-variant coverage, and documentation indexing
- Total skills: 89
- Manifest skills in `.agent-skills/skills.json`: 89
- Skills with references/: 83
- Skills with evals/: 84
- Skills with scripts/: 24
- Skills with compact variants (`SKILL.toon` or `SKILL.compact.md`): 89
- Skills missing compact variants: 0
- Graph nodes: 374
- Graph edges: 1004

## Strongest structural findings
1. The graph remains docs-first: README.md, README.ko.md, setup-all-skills-prompt.md, skills.json, and skills.toon index every live skill and remain the highest-degree maintenance nodes.
2. research-paper-writing is no longer a support-gap outlier in the documentation cluster: this run added references and evals, plus refreshed compact/discovery wording.
3. The useful boundary for research-paper-writing remains manuscript-package work: abstract/introduction/method/experiments, figure-table support, rebuttal, and camera-ready revision rather than general documentation or marketing copy.
4. Support-coverage leverage continues to come from upgrading legacy skills with references/evals instead of adding duplicates.

## Highest-degree nodes
- .agent-skills/skills.json: degree 89
- .agent-skills/skills.toon: degree 89
- README.ko.md: degree 89
- README.md: degree 89
- setup-all-skills-prompt.md: degree 89
- debugging: degree 25
- code-review: degree 24
- performance-optimization: degree 24
- task-planning: degree 24
- plannotator: degree 22
- system-environment-setup: degree 22
- vibe-kanban: degree 22

## Duplicate / consolidation notes
- `research-paper-writing` now reads as a specialized manuscript + rebuttal workflow instead of a generic academic-writing skill, which reduces pressure to add another paper-review or submission wrapper.
- No new duplicate skill was introduced in the documentation cluster; this run was a support-and-boundary ratchet on an existing skill.
- README / setup surfaces now reflect the stronger rebuttal / camera-ready positioning, so discovery copy is aligned with the skill boundary.

## Recommended maintenance direction
- Keep upgrading remaining legacy skills that still lack `references/` or `evals/` before adding new overlapping skills.
- Re-run catalog/runtime sync validation whenever a skill description or manifest entry changes materially.
- Treat manuscript-writing skills as boundary-sensitive: preserve the split between academic paper packages, general docs, decks, and marketing surfaces.
