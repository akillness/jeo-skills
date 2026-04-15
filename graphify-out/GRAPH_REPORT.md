# GRAPH_REPORT

## Scope
- Path analyzed: `.agent-skills/` plus repository discovery docs
- Method: custom graphify-style structural graph over skill metadata, support-file presence, compact-variant coverage, and documentation indexing
- Total skills: 89
- Manifest skills in `.agent-skills/skills.json`: 89
- Skills with references/: 84
- Skills with evals/: 84
- Skills with scripts/: 24
- Skills with compact variants (`SKILL.toon` or `SKILL.compact.md`): 89
- Skills missing compact variants: 0
- Graph nodes: 375
- Graph edges: 1069

## Strongest structural findings
1. The graph remains docs-first: README.md, README.ko.md, setup-all-skills-prompt.md, skills.json, and skills.toon still index every live skill and remain the highest-degree maintenance nodes.
2. `google-workspace` is no longer a support-gap outlier: the skill now has a dedicated `references/` bundle, refreshed evals, and synced compact/discovery copy.
3. The useful boundary for `google-workspace` is no longer “all Workspace APIs in one file”; it is deciding between Apps Script, direct REST APIs, and Admin SDK routes, then shaping auth and cross-service workflows.
4. Support-coverage leverage still comes from upgrading indexed legacy anchors instead of adding parallel wrappers for Zapier / Make / n8n style tooling.

## Highest-degree nodes
- .agent-skills/skills.json: degree 89
- .agent-skills/skills.toon: degree 89
- README.ko.md: degree 89
- README.md: degree 89
- setup-all-skills-prompt.md: degree 89
- debugging: degree 41
- performance-optimization: degree 26
- bmad: degree 25
- code-review: degree 25
- task-planning: degree 24
- plannotator: degree 23
- vibe-kanban: degree 23

## Duplicate / consolidation notes
- `google-workspace` should remain the single general Workspace automation skill instead of spawning separate generic wrappers for no-code automation vendors or one API family at a time.
- The stronger route is support-and-boundary hardening: Apps Script vs REST API vs Admin SDK, auth choice, and quota-aware workflow packets.
- README / setup surfaces now reflect the stronger routing boundary, so discovery copy is aligned with the skill body again.

## Recommended maintenance direction
- Keep upgrading remaining legacy skills that still lack `references/` or `evals/` before adding overlapping productivity or orchestration wrappers.
- Re-run catalog/runtime sync validation whenever discovery copy or manifest descriptions change materially.
- Treat Google Workspace work as workflow-sensitive: preserve the split between content operations, admin operations, and external no-code substitutes.
