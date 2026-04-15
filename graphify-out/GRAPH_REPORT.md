# GRAPH_REPORT

## Scope
- Path analyzed: `.agent-skills/` plus repository discovery docs and durable wiki notes
- Method: custom graphify-style structural graph over skill metadata, support-file presence, cross-skill mentions, and documentation indexing
- Total skills: 89
- Manifest skills in `.agent-skills/skills.json`: 89
- Skills with references/: 77
- Skills with evals/: 78
- Skills with scripts/: 23
- Graph nodes: 278
- Graph edges: 939

## Strongest structural findings
1. `genkit` is stronger as the Firebase/fullstack lane's backend AI workflow anchor than as a generic example dump.
2. The Firebase AI lane is cleaner when `firebase-ai-logic` owns direct app/client SDK integration, `genkit` owns reusable server-owned workflows, and `firebase-cli` owns Firebase platform operations.
3. Support coverage improved without adding a duplicate Firebase AI skill: `genkit` now has an eval harness and workflow-first references for routing, deployment/runtime choice, and evaluation/observability.
4. README.md, README.ko.md, setup-all-skills-prompt.md, `.agent-skills/skills.json`, and `.agent-skills/skills.toon` remain dominant discovery nodes, so wording drift still matters.
5. The repo still benefits more from modernizing high-visibility anchors with clearer route-outs than from adding another overlapping Firebase AI wrapper.

## Highest-degree nodes
- .agent-skills/skills.json: degree 89
- README.ko.md: degree 88
- README.md: degree 88
- setup-all-skills-prompt.md: degree 88
- .agent-skills/skills.toon: degree 80
- .agent-skills-wiki/concepts/skill-support-coverage.md: degree 53
- debugging: degree 25
- code-review: degree 24
- task-planning: degree 24
- performance-optimization: degree 23
- vibe-kanban: degree 23
- plannotator: degree 22

## Duplicate / consolidation notes
- `genkit` should remain separate from `firebase-ai-logic`: the former owns server-side flows, tool calling, retrieval, evaluation, observability, and deployment; the latter owns direct Firebase app/client SDK integration.
- `firebase-ai-logic` should remain separate from `firebase-cli`: model-feature integration is not the same as Firebase project/bootstrap/deploy operations.
- README.md, README.ko.md, setup-all-skills-prompt.md, `.agent-skills/skills.json`, and `.agent-skills/skills.toon` remain dominant discovery nodes, so wording drift still matters.
- The repo still benefits more from modernizing under-specified anchors like `genkit` than from adding another overlapping Firebase AI wrapper.

## Recommended maintenance direction
- Keep modernizing weak high-visibility skills that still read like setup dumps instead of decision-first routers.
- Prefer eval/support-file ratchets on fullstack AI and workflow anchors before adding new wrappers.
- Re-check adjacent Firebase skills whenever `genkit`, `firebase-ai-logic`, or `firebase-cli` changes meaning.
