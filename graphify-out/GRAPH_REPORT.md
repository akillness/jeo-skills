# GRAPH_REPORT

## Scope
- Path analyzed: `.agent-skills/` plus repository discovery docs
- Method: custom graphify-style structural graph over skill metadata, support-file presence, compact-variant coverage, documentation indexing, and cross-skill mentions
- Total skills: 89
- Manifest skills in `.agent-skills/skills.json`: 89
- Skills with references/: 89
- Skills with evals/: 89
- Skills with scripts/: 24
- Skills with compact variants (`SKILL.toon` or `SKILL.compact.md`): 89
- Skills missing compact variants: 0
- Graph nodes: 385
- Graph edges: 1100

## Strongest structural findings
1. Discovery docs remain the highest-degree maintenance nodes because README / setup / manifest surfaces still index almost the whole live catalog.
2. Support coverage is still complete across the live skill set, so the next structural wins continue to come from dense-anchor cleanup, truthful routing, and compact-surface synchronization rather than adding new folders.
3. `deployment-automation` was a good bounded target because the lane was already conceptually modernized, but the front door still carried too much packet/template material. The current pass shrinks it from 408 lines to 213 and moves more release detail into focused support packets.
4. The infrastructure lane remains cleaner when `deployment-automation` owns vendor-neutral release execution, `workflow-automation` owns CI authoring, `system-environment-setup` owns runnable-machine setup, `monitoring-observability` owns telemetry architecture, and `vercel-deploy` owns Vercel-specific operator work.

## Highest-degree nodes
- .agent-skills/skills.json: degree 89
- README.ko.md: degree 88
- README.md: degree 88
- setup-all-skills-prompt.md: degree 88
- .agent-skills/skills.toon: degree 81
- debugging: degree 43
- performance-optimization: degree 27
- bmad: degree 26
- code-review: degree 25
- plannotator: degree 24
- task-planning: degree 24
- design-system: degree 23

## Oversized front-door watchlist
- ralph: 499 lines in SKILL.md
- survey: 391 lines in SKILL.md
- file-organization: 357 lines in SKILL.md
- authentication-setup: 337 lines in SKILL.md
- api-documentation: 336 lines in SKILL.md
- autoresearch: 333 lines in SKILL.md
- clawteam: 329 lines in SKILL.md
- technical-writing: 320 lines in SKILL.md
- scrapling: 319 lines in SKILL.md
- skill-standardization: 315 lines in SKILL.md

## Duplicate / consolidation notes
- No new deployment wrapper is justified: the bounded win was hardening the existing canonical release-execution skill in place.
- Future duplicate pressure is more likely to come from dense anchors drifting into adjacent route-outs than from missing support directories.
- `deployment-automation` should stay distinct from `workflow-automation`, `system-environment-setup`, `monitoring-observability`, and `vercel-deploy`; each owns a different failure mode and operator surface.

## Recommended maintenance direction
- Keep targeting oversized or stale high-degree anchors after support coverage is already complete.
- Refresh compact discovery wording whenever a main `SKILL.md` is materially shortened or rerouted.
- Re-run catalog/runtime sync validation whenever `skills.json`, compact files, or discovery docs change materially.
