# GRAPH_REPORT

## Scope
- Path analyzed: `.agent-skills/` plus repository discovery docs
- Method: custom graphify-style structural graph over skill metadata, support-file presence, compact-variant coverage, and documentation indexing
- Total skills: 89
- Manifest skills in `.agent-skills/skills.json`: 89
- Skills with references/: 81
- Skills with evals/: 82
- Skills with scripts/: 23
- Skills with compact variants (`SKILL.toon` or `SKILL.compact.md`): 89
- Skills missing compact variants: 0
- Graph nodes: 369
- Graph edges: 1061

## Strongest structural findings
1. The graph remains docs-first: README.md, README.ko.md, setup-all-skills-prompt.md, skills.json, and skills.toon still touch every live skill and remain the highest-degree maintenance nodes.
2. prompt-repetition is no longer a support-gap outlier: this run added both references/ and evals/, so it now matches the modernized pattern used by other bounded decision-first skills.
3. The meaningful change was content tightening, not cluster splitting: prompt-repetition stayed in agent-development and gained clearer route-outs to retrieval/context work instead of spawning another prompt-hacks sibling.
4. The next leverage point in the agent-development lane is still not adding another prompt trick, but modernizing remaining weak-support or weak-boundary skills with the same decision-first pattern.

## Highest-degree nodes
- README.md: degree 89
- README.ko.md: degree 89
- setup-all-skills-prompt.md: degree 89
- .agent-skills/skills.json: degree 89
- .agent-skills/skills.toon: degree 89
- debugging: degree 41
- code-review: degree 26
- performance-optimization: degree 26
- bmad: degree 25
- task-planning: degree 24
- plannotator: degree 23
- vibe-kanban: degree 23

## Duplicate / consolidation notes
- `prompt-repetition` now reads as a bounded routing skill instead of a generic prompt-hacks bucket, which reduces pressure to add a separate long-context or lightweight-model wrapper.
- No new duplicate cluster was created in planning-review or agent-development; this was a consolidation-through-modernization pass.
- Documentation and manifest surfaces were updated alongside the skill, so discovery drift did not reopen.

## Recommended maintenance direction
- Keep using bounded modernization passes on remaining legacy skills with weak support coverage or vague trigger boundaries.
- Re-run catalog/runtime sync validation whenever a skill description or compact variant changes materially.
- Treat route-out clarity as a structural maintenance lever: it prevents catalog growth through overlapping new skills.
