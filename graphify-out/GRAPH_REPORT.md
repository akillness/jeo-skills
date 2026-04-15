# GRAPH_REPORT

## Scope
- Path analyzed: `.agent-skills/` plus repository discovery docs
- Method: custom graphify-style structural graph over skill metadata, support-file presence, compact-variant coverage, and documentation indexing
- Total skills: 89
- Manifest skills in `.agent-skills/skills.json`: 89
- Skills with references/: 84
- Skills with evals/: 87
- Skills with scripts/: 24
- Skills with compact variants (`SKILL.toon` or `SKILL.compact.md`): 89
- Skills missing compact variants: 0
- Graph nodes: 378
- Graph edges: 1070

## Strongest structural findings
1. The graph remains docs-first: `README.md`, `README.ko.md`, `setup-all-skills-prompt.md`, `skills.json`, and `skills.toon` still index every live skill and remain the highest-degree maintenance nodes.
2. `skill-autoresearch` is now part of the supported modernized core instead of a support-gap holdout: it has a stronger repo-local ratcheting description, a charter template reference, and `evals/evals.json`.
3. The durable boundary is sharper: `skill-autoresearch` owns repo-local skill mutation loops, while hosted eval platforms and the ML-specific `autoresearch` skill stay outside its lane.
4. The highest-value remaining support gaps are now narrower and more intentional: alias/reference holdouts in the frontend/creative/marketing lanes and the two prose-only eval holdouts `autoresearch` and `ralph`.

## Highest-degree nodes
- .agent-skills/skills.json: degree 89
- README.md: degree 88
- README.ko.md: degree 88
- setup-all-skills-prompt.md: degree 88
- .agent-skills/skills.toon: degree 81
- debugging: degree 41
- performance-optimization: degree 27
- bmad: degree 26
- code-review: degree 25
- task-planning: degree 24
- plannotator: degree 23
- vibe-kanban: degree 23

## Duplicate / consolidation notes
- `skill-autoresearch` should stay distinct from `autoresearch`: one owns repo-local skill ratchets, the other owns GPU-backed ML experiment loops.
- No new overlapping wrapper is justified in the skill-optimization lane; strengthening the existing skill beat creating another eval/benchmark helper.
- Remaining weakly separated areas are still concentrated in known alias lanes rather than in this run's target.

## Recommended maintenance direction
- Keep upgrading remaining support-gap skills before adding overlapping wrappers.
- Remaining `references/` holdouts: frontend-design-system, marketing-skills-collection, react-best-practices, remotion-video-production, vercel-react-best-practices.
- Remaining `evals/` holdouts: autoresearch, ralph.
- Re-run catalog/runtime sync validation whenever manifest descriptions or docs/setup copy changes materially.
