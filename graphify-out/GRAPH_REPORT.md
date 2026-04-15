# GRAPH_REPORT

## Scope
- Path analyzed: `.agent-skills/` plus repository discovery docs
- Method: custom graphify-style structural graph over skill metadata, support-file presence, compact-variant coverage, and documentation indexing
- Total skills: 89
- Manifest skills in `.agent-skills/skills.json`: 89
- Skills with references/: 85
- Skills with evals/: 88
- Skills with scripts/: 24
- Skills with compact variants (`SKILL.toon` or `SKILL.compact.md`): 89
- Skills missing compact variants: 0
- Graph nodes: 380
- Graph edges: 1073

## Strongest structural findings
1. The graph remains docs-first: `README.md`, `README.ko.md`, `setup-all-skills-prompt.md`, `skills.json`, and `skills.toon` still index every live skill and remain the highest-degree maintenance nodes.
2. `react-best-practices` is no longer a support-gap holdout: it now has a focused `references/` bundle that matches the repo's modernized frontend packaging pattern while keeping `vercel-react-best-practices` as a compatibility alias.
3. The durable frontend boundary is sharper: `react-best-practices` now owns measurement-led React/Next.js performance triage, while state ownership, accessibility remediation, responsive adaptation, and cross-stack bottlenecks stay routed outward.
4. The highest-value remaining support gaps are narrower and more intentional: alias holdouts in the frontend/creative/marketing lanes plus the prose-only eval holdout `ralph`.

## Highest-degree nodes
- .agent-skills/skills.json: degree 89
- README.md: degree 88
- README.ko.md: degree 88
- setup-all-skills-prompt.md: degree 88
- .agent-skills/skills.toon: degree 81
- debugging: degree 41
- performance-optimization: degree 27
- bmad: degree 25
- code-review: degree 25
- task-planning: degree 24
- plannotator: degree 23
- vibe-kanban: degree 23


## Duplicate / consolidation notes
- `react-best-practices` should stay distinct from `vercel-react-best-practices`: one is the canonical React/Next.js performance anchor, the other is a compatibility alias for exact-name workflows.
- The current bounded win was support hardening, not another frontend split; no new overlapping React perf wrapper is justified.
- Remaining weakly separated areas are still concentrated in known alias lanes rather than this run's canonical React target.

## Recommended maintenance direction
- Keep upgrading remaining support-gap skills before adding overlapping wrappers.
- Remaining `references/` holdouts: frontend-design-system, marketing-skills-collection, remotion-video-production, vercel-react-best-practices.
- Remaining `evals/` holdouts: ralph.
- Re-run catalog/runtime sync validation whenever manifest descriptions or docs/setup copy changes materially.
