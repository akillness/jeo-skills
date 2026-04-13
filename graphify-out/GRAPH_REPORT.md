# GRAPH_REPORT

## Scope
- Path analyzed: `.agent-skills/` plus repository discovery docs
- Method: custom graphify-style structural graph over skill metadata, support-file presence, cross-skill mentions, and documentation indexing
- Total skills: 89
- Skills with references/: 47
- Skills with evals/: 46
- Graph nodes: 208
- Graph edges: 565

## Strongest structural findings
1. `workflow-automation` is now a stronger utilities/developer-workflow anchor: it owns repo-scoped task runners, bootstrap entrypoints, local-CI parity, hook guardrails, and maintenance routines instead of a generic command dump.
2. The utilities/developer-workflow boundary is cleaner: `workflow-automation` handles recurring repo glue, `git-workflow` handles local collaboration and recovery, `system-environment-setup` handles broader runnable-environment design, and `deployment-automation` stays the hosted rollout lane.
3. Documentation surfaces (`README.md`, `README.ko.md`, `setup-all-skills-prompt.md`) remain high-degree discovery hubs, so one-line positioning changes still matter for activation.
4. The maintenance pattern still holds: upgrading an indexed legacy anchor with references and evals creates more durable value than adding another overlapping wrapper skill.

## Community map
- skill
- frontend
- infrastructure
- code-quality
- project-management
- game-development
- backend

## Highest-degree nodes
- README.md: degree 87
- README.ko.md: degree 87
- setup-all-skills-prompt.md: degree 83
- debugging: degree 27
- web-accessibility: degree 19
- code-review: degree 18
- jeo: degree 18
- design-system: degree 17
- ui-component-patterns: degree 17
- responsive-design: degree 15

## Duplicate / consolidation notes
- `workflow-automation` should stay focused on repo-scoped recurring workflow glue rather than absorbing environment provisioning already covered by `system-environment-setup`.
- `workflow-automation` should keep hosted deployment and cloud rollout routed to `deployment-automation`.
- `workflow-automation` should not absorb local Git history work already owned by `git-workflow`.
- Recent canonical-vs-alias cleanups in React, design-system, marketing, and environment lanes remain intact.

## Recommended maintenance direction
- Continue upgrading remaining legacy anchors that are widely indexed in docs but still lack both `references/` and `evals/`.
- Prefer support bundles that sharpen boundary decisions and verification heuristics instead of adding overlapping wrapper skills.
- Keep re-checking discovery docs whenever a skill boundary changes in a user-visible way.
