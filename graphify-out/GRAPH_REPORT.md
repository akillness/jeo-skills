# GRAPH_REPORT

## Scope
- Path analyzed: `.agent-skills/` plus repository discovery docs
- Method: custom graphify-style structural graph over skill metadata, support-file presence, cross-skill mentions, and documentation indexing
- Filesystem skills with `SKILL.md`: 89
- Manifest skills in `.agent-skills/skills.json`: 85
- Manifest `skill_count`: 85
- Skills with references/: 58
- Skills with evals/: 58
- Skills with scripts/: 23
- Graph nodes: 231
- Graph edges: 637

## Strongest structural findings
1. codebase-search now reads as the search-analysis lane's evidence-first repo-navigation and impact-mapping anchor instead of a giant command catalog, which sharpens the boundary between discovery, diagnosis, refactoring, and graph-backed architecture work.
2. Discovery docs (`README.md`, `README.ko.md`, `setup-all-skills-prompt.md`) remain high-degree nodes, so one-line positioning still materially affects activation.
3. Support coverage improved again by modernizing a README-visible legacy anchor with both `references/` and `evals/` instead of adding another overlapping wrapper.
4. The search-analysis cluster is healthier when `codebase-search`, `log-analysis`, `data-analysis`, and `pattern-detection` stay separated by discovery mode rather than generic “analysis” wording.
5. Manifest drift is currently visible: filesystem skills=89 vs `.agent-skills/skills.json` entries=85; treat manifest-only structural summaries as incomplete until the mismatch is repaired.

## Community map
- agent-development: 2
- backend: 5
- code-quality: 5
- core-orchestration: 10
- creative-media: 2
- documentation: 5
- filesystem-only: 7
- frontend: 10
- infrastructure: 13
- marketing: 2
- planning-review: 5
- project-management: 4
- search-analysis: 7
- utilities: 12

## Highest-degree nodes
- README.md: degree 87
- README.ko.md: degree 87
- setup-all-skills-prompt.md: degree 84
- debugging: degree 27
- performance-optimization: degree 16
- jeo: degree 16
- code-review: degree 16
- plannotator: degree 15
- web-accessibility: degree 14
- task-planning: degree 14

## Duplicate / consolidation notes
- `codebase-search` and `log-analysis` should stay separated by keep repo navigation distinct from log-first symptom triage.
- `codebase-search` and `code-refactoring` should stay separated by keep discovery / impact mapping distinct from behavior-preserving structural cleanup.
- `codebase-search` and `graphify` should stay separated by keep ad hoc repo search distinct from persistent graph-backed architecture memory.
- `deployment-automation` and `workflow-automation` should stay separated by keep release execution distinct from recurring job automation.
- `authentication-setup` and `security-best-practices` should stay separated by keep product-auth setup distinct from broad hardening work.

## Recommended maintenance direction
- Continue upgrading remaining README-visible legacy anchors that still lack both `references/` and `evals/`.
- Treat `codebase-search` as the search-analysis anchor for repo discovery and impact mapping; route diagnosis, cleanup, and persistent graphing to the neighboring specialists.
- Repair manifest drift in a separate bounded pass: missing from manifest = bmad, clawteam, game-build-log-triage, game-ci-cd-pipeline, game-demo-feedback-triage, game-performance-profiler, steam-store-launch-ops; manifest-only extras = bmad-orchestrator, copilot-coding-agent, graphify.
