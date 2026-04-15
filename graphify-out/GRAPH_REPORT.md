# GRAPH_REPORT

## Scope
- Path analyzed: `.agent-skills/` plus repository discovery docs
- Method: custom graphify-style structural graph over skill metadata, support-file presence, cross-skill mentions, and documentation indexing
- Total skills: 89
- Manifest skills in `.agent-skills/skills.json`: 89
- Skills with references/: 76
- Skills with evals/: 77
- Skills with scripts/: 23
- Graph nodes: 274
- Graph edges: 935

## Strongest structural findings
1. `vibe-kanban` is stronger as the coding-task board/workspace control plane than as a generic install-and-command catalog.
2. The planning-review lane is cleaner when `vibe-kanban` owns board/workspace/review/cleanup orchestration, while `plannotator` keeps plan approval, `agentation` keeps rendered-UI feedback, and `agent-browser` / `playwriter` keep browser execution lanes.
3. Support coverage improved without adding a duplicate orchestration skill: `vibe-kanban` now has an eval harness plus workflow-first references for routing, review, and cleanup.
4. README.md, README.ko.md, setup-all-skills-prompt.md, `.agent-skills/skills.json`, and `.agent-skills/skills.toon` remain dominant discovery nodes, so wording drift still matters.
5. The repo still benefits more from modernizing high-visibility anchors with clearer route-outs than from adding another agent-board wrapper.

## Highest-degree nodes
- .agent-skills/skills.json: degree 89
- README.md: degree 88
- README.ko.md: degree 88
- setup-all-skills-prompt.md: degree 88
- .agent-skills/skills.toon: degree 80
- debugging: degree 39
- bmad: degree 25
- code-review: degree 24
- performance-optimization: degree 24
- vibe-kanban: degree 23
- plannotator: degree 22
- task-planning: degree 22

## Duplicate / consolidation notes
- `vibe-kanban` should remain separate from `plannotator`: the former owns live board/workspace/review execution, while the latter owns plan/diff approval before or around execution.
- `vibe-kanban` should remain separate from `agentation`, `agent-browser`, and `playwriter`: board orchestration is not the same as exact rendered-UI review or browser execution.
- `vibe-kanban` should not absorb PM-only, marketing-only, or non-code game-production coordination, even though those domains also use boards.
- Discovery docs remain high-degree nodes, so README / README.ko / setup prompt sync is still required when positioning changes.

## Recommended maintenance direction
- Keep modernizing high-visibility skills that still read like setup dumps instead of decision-first routers.
- Prefer eval/support-file ratchets on long-lived orchestration skills before adding new wrappers.
- Re-check adjacent planning-review skills whenever `vibe-kanban`, `plannotator`, `agentation`, `agent-browser`, or `playwriter` changes meaning.
