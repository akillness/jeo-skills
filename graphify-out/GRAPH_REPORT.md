# GRAPH_REPORT

## Scope
- Path analyzed: `.agent-skills/` plus repository discovery docs
- Method: custom graphify-style structural graph over skill metadata, support-file presence, cross-skill mentions, and documentation indexing
- Total skills: 89
- Skills with references/: 57
- Skills with evals/: 57
- Skills with scripts/: 23
- Graph nodes: 243
- Graph edges: 720

## Strongest structural findings
1. The creative-media lane is cleaner when `video-production` owns programmable / automated video workflows and `remotion-video-production` behaves as a compatibility alias for explicit Remotion naming.
2. Discovery docs (`README.md`, `README.ko.md`, `setup-all-skills-prompt.md`) remain high-degree nodes, so canonical-vs-alias wording still materially affects activation.
3. Support coverage improved again by adding both `references/` and `evals/` to a visible legacy anchor instead of introducing another overlapping media skill.
4. The repo still gains more from upgrading indexed legacy anchors with support bundles than from adding adjacent wrappers in already-covered clusters.
5. The creative-media cluster now reads more cleanly as canonical programmable-video anchor + explicit-stack alias rather than two equal Remotion peers.

## Community map
- agent-development
- backend
- code-quality
- core-orchestration
- creative-media
- documentation
- frontend
- infrastructure
- marketing
- planning-review
- project-management
- search-analysis
- uncategorized
- utilities

## Highest-degree nodes
- README.ko.md: degree 87
- README.md: degree 87
- setup-all-skills-prompt.md: degree 84
- debugging: degree 31
- performance-optimization: degree 22
- jeo: degree 20
- plannotator: degree 20
- web-accessibility: degree 20
- code-review: degree 19
- task-planning: degree 18

## Duplicate / consolidation notes
- `video-production` and `remotion-video-production` should stay separated by keeping one canonical programmable-video anchor and one explicit Remotion compatibility alias.
- `performance-optimization` and `debugging` should stay separated by keeping bottleneck measurement distinct from correctness-failure diagnosis.
- `deployment-automation` and `workflow-automation` should stay separated by keeping release execution distinct from recurring job automation.
- `authentication-setup` and `security-best-practices` should stay separated by keeping product-auth setup distinct from broad hardening work.

## Recommended maintenance direction
- Continue upgrading high-visibility legacy anchors that still lack both `references/` and `evals/`.
- Prefer canonical-plus-alias wording when two discovery entries point to the same workflow.
- Re-check README, README.ko, setup prompt, and `skills.json` whenever a skill changes role or trigger phrasing.
