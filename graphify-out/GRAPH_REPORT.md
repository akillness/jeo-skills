# GRAPH_REPORT

## Scope
- Path analyzed: `.agent-skills/` plus repository discovery docs
- Method: custom graphify-style structural graph over skill metadata, support-file presence, compact-variant coverage, and documentation indexing
- Total skills: 89
- Manifest skills in `.agent-skills/skills.json`: 89
- Skills with references/: 88
- Skills with evals/: 88
- Skills with scripts/: 24
- Skills with compact variants (`SKILL.toon` or `SKILL.compact.md`): 89
- Skills missing compact variants: 0
- Graph nodes: 383
- Graph edges: 1649

## Strongest structural findings
1. The graph remains docs-first: `README.md`, `README.ko.md`, `setup-all-skills-prompt.md`, `skills.json`, and `skills.toon` still index every live skill and remain the highest-degree maintenance nodes.
2. The frontend alias lane is now support-complete: both `frontend-design-system` and `vercel-react-best-practices` ship alias-side `references/` packets and compact wording that matches `skills.json` instead of sounding like peer canonical skills.
3. The durable frontend boundary is sharper: `design-system` stays the canonical UI-system anchor and `react-best-practices` stays the canonical measurement-led React/Next.js performance anchor, while both legacy aliases remain exact-name compatibility shells.
4. The remaining structural support gaps are now narrower: `remotion-video-production` is the only remaining `references/` holdout and `ralph` remains the only `evals/` holdout.

## Highest-degree nodes
- .agent-skills/skills.json: degree 89
- README.md: degree 88
- README.ko.md: degree 88
- setup-all-skills-prompt.md: degree 88
- .agent-skills/skills.toon: degree 81
- debugging: degree 75
- testing-strategies: degree 62
- code-review: degree 58
- api-documentation: degree 55
- performance-optimization: degree 55
- web-accessibility: degree 54
- system-environment-setup: degree 54


## Duplicate / consolidation notes
- `frontend-design-system` should stay distinct from `design-system`: one is a compatibility alias, the other is the canonical UI-system anchor.
- `vercel-react-best-practices` should stay distinct from `react-best-practices`: one is a compatibility alias, the other is the canonical measurement-led React/Next.js performance anchor.
- The current bounded win was alias support hardening and compact-sync repair, not another frontend split.

## Recommended maintenance direction
- Keep upgrading the last intentional support holdouts before adding overlapping wrappers.
- Remaining `references/` holdouts: remotion-video-production.
- Remaining `evals/` holdouts: ralph.
- Re-run catalog/runtime sync validation whenever compact or manifest wording changes materially.
