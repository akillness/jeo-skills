# GRAPH_REPORT

## Scope
- Path analyzed: `.agent-skills/` plus repository discovery docs
- Method: custom graphify-style structural graph over skill metadata, support folders, cross-skill mentions, and documentation indexing
- Total skills: 89
- Skills with references/: 35
- Skills with evals/: 34
- Graph nodes: 184
- Graph edges: 408

## Strongest structural findings
1. `system-environment-setup` is now the canonical broader environment-setup anchor: it owns runnable repos, toolchains, Docker/devcontainers, onboarding, local-service parity, and setup-drift diagnosis.
2. `environment-setup` is now a narrower app-config compatibility skill: it owns `.env` layout, env precedence, validation, secret handoff, and framework-specific config rules while routing broader machine setup outward.
3. Documentation surfaces (`README.md`, `README.ko.md`, `setup-all-skills-prompt.md`) remain high-degree discovery hubs, so canonical-vs-alias wording there materially changes how agents discover overlapping skills.
4. Support coverage improved again in the infrastructure cluster: both environment skills now have `references/` and `evals/`, which raises the floor for a previously weak duplicate pair.

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
- unknown
- utilities

## Highest-degree nodes
- README.ko.md: degree 87
- README.md: degree 87
- setup-all-skills-prompt.md: degree 83
- task-planning: degree 14
- bmad-gds: degree 12
- game-demo-feedback-triage: degree 12
- system-environment-setup: degree 12
- environment-setup: degree 10
- omx: degree 10
- sprint-retrospective: degree 10

## Duplicate / consolidation notes
- `environment-setup` and `system-environment-setup` now form a canonical-plus-alias pair.
- `environment-setup` should stay narrow: app config, `.env` structure, validation, secret handoff, and drift cleanup.
- `system-environment-setup` should stay broad: runnable local environments, containers, toolchains, onboarding, and setup diagnosis.
- The canonical-vs-alias pattern continues to match prior repo cleanups (`react-best-practices` / `vercel-react-best-practices`, `design-system` / `frontend-design-system`, `marketing-automation` / `marketing-skills-collection`).

## Recommended maintenance direction
- Keep strengthening old, high-utility anchors with support files before adding new infrastructure overlap.
- Re-check README/setup/manifest wording any time the environment/setup boundary shifts again.
- If future work adds secret-manager or Nix-specific depth, keep that as a sub-pattern under the canonical environment anchor rather than a new vague peer skill.
