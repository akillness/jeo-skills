# GRAPH_REPORT

## Scope
- Path analyzed: `.agent-skills/` plus repository discovery docs
- Method: custom graphify-style structural graph over skill metadata, support-file presence, cross-skill mentions, and documentation indexing
- Total skills: 89
- Manifest skills in `.agent-skills/skills.json`: 89
- Skills with references/: 78
- Skills with evals/: 79
- Skills with scripts/: 23
- Graph nodes: 274
- Graph edges: 879

## Strongest structural findings
1. The Firebase AI lane is cleaner when `firebase-ai-logic` owns direct app/client SDK integration and `genkit` owns server-side flows, tool calling, retrieval, evaluation, observability, and deployment/runtime choices.
2. The new `firebase-ai-logic` support bundle closes an asymmetry: the backend side of the lane was already modernized in PR #66, but the client-side half previously had no `references/` or `evals/` to preserve the boundary.
3. `firebase-cli` should remain a route-out for project/deploy/operator work instead of drifting back into the same bucket as app integration or AI workflow design.
4. README.md, README.ko.md, setup-all-skills-prompt.md, `.agent-skills/skills.json`, and `.agent-skills/skills.toon` remain dominant discovery nodes, so wording drift still matters even for support-file-only ratchets.
5. The repo still benefits more from modernizing adjacent high-visibility anchors and adding support coverage than from creating another overlapping Firebase AI wrapper.

## Highest-degree nodes
- skills.json: degree 89
- README.md: degree 88
- README.ko.md: degree 88
- setup-all-skills-prompt.md: degree 88
- skills.toon: degree 80
- debugging: degree 24
- task-planning: degree 23
- code-review: degree 23
- performance-optimization: degree 22
- plannotator: degree 21
- system-environment-setup: degree 21
- vibe-kanban: degree 21

## Duplicate / consolidation notes
- `firebase-ai-logic` should remain separate from `genkit`: app/client SDK integration is not the same as server-owned orchestration.
- `firebase-ai-logic` should remain separate from `firebase-cli`: feature integration is not the same as project/deploy/operator work.
- The lane does not justify another Firebase AI wrapper right now; the clearer move is support/eval ratcheting on the two existing complementary skills.
- Discovery docs remain high-degree nodes, so README / README.ko / setup prompt / manifest sync still matters after boundary changes.

## Recommended maintenance direction
- Keep upgrading high-visibility legacy skills that still lack `references/` or `evals/` before inventing new wrappers.
- Re-check adjacent lanes whenever a client-side integration skill is modernized beside a backend orchestration skill.
- Prefer bounded follow-ups on documented cluster boundaries over speculative new-skill growth.
