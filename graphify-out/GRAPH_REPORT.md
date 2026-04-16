# GRAPH_REPORT

## Scope
- Path analyzed: `.agent-skills/` plus repository discovery docs
- Method: custom graphify-style structural graph over skill metadata, support-file presence, compact-variant coverage, and documentation indexing
- Total skills: 89
- Manifest skills in `.agent-skills/skills.json`: 88
- Skills with references/: 89
- Skills with evals/: 88
- Skills with scripts/: 24
- Skills with compact variants (`SKILL.toon` or `SKILL.compact.md`): 89
- Skills missing compact variants: 0
- Graph nodes: 384
- Graph edges: 1067

## Strongest structural findings
1. The graph remains docs-first: `README.md`, `README.ko.md`, `setup-all-skills-prompt.md`, `skills.json`, and `skills.toon` still behave like highest-degree maintenance nodes because they index the live catalog.
2. The creative-media alias lane is now support-complete: `remotion-video-production` has an alias-side `references/` packet and refreshed compact wording, so the repo no longer relies on wiki memory to explain that it is a compatibility shell for `video-production`.
3. The durable creative-media boundary is sharper: `video-production` stays the canonical programmable-video / automated-video owner while the Remotion alias now explicitly preserves code-first stack intent without hiding template/API or repurposing route-outs.
4. The remaining structural support gap is now singular: `ralph` is the only live skill still missing `evals/evals.json`.

## Highest-degree nodes
- .agent-skills/skills.json: degree 88
- README.ko.md: degree 88
- README.md: degree 88
- setup-all-skills-prompt.md: degree 88
- .agent-skills/skills.toon: degree 81
- debugging: degree 40
- performance-optimization: degree 27
- code-review: degree 25
- task-planning: degree 24
- bmad: degree 23
- plannotator: degree 23
- jeo: degree 22

## Duplicate / consolidation notes
- `remotion-video-production` should stay distinct from `video-production`: one is a compatibility alias for explicit Remotion naming, the other is the canonical programmable-video / automated-video anchor.
- The bounded win was alias support hardening, not a new media split or a return to duplicate peer skills.
- No new broad wrapper is justified in the creative-media lane while the canonical/alias boundary remains stable.

## Recommended maintenance direction
- Keep improving the last intentional support holdouts before adding overlapping wrappers.
- Remaining `references/` holdouts: none.
- Remaining `evals/` holdouts: ralph.
- Re-run catalog/runtime sync validation whenever compact or manifest wording changes materially.
