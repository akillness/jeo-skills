# GRAPH_REPORT

## Scope
- Path analyzed: `.agent-skills/` plus repository discovery docs
- Method: custom graphify-style structural graph over skill metadata, support-file presence, cross-skill mentions, and documentation indexing
- Total skills: 89
- Skills with references/: 51
- Skills with evals/: 50
- Graph nodes: 193
- Graph edges: 499

## Strongest structural findings
1. `technical-writing` stays the internal technical-docs anchor for specs, architecture docs, ADRs, runbooks, migrations, and internal developer guides.
2. `user-guide-writing` stays the end-user-docs anchor for onboarding, tutorials, how-to guides, FAQs, and help-center updates.
3. `api-documentation` is now the developer-facing API-docs anchor for reference portals, quickstarts, SDK/webhook guides, truthful examples, and auth/error guidance.
4. The documentation cluster still benefits more from sharper route-outs than from merging contract design, internal docs, API portals, customer help, and release-note hygiene into one wrapper.
5. Discovery docs (`README.md`, `README.ko.md`, `setup-all-skills-prompt.md`) remain high-degree nodes, so one-line positioning still materially affects activation.
6. Support coverage keeps improving by modernizing legacy anchors with `references/` and `evals/` instead of adding more overlapping skills.

## Community map
- infrastructure
- utilities
- core-orchestration
- frontend
- search-analysis
- planning-review
- backend
- documentation

## Highest-degree nodes
- README.ko.md: degree 87
- README.md: degree 87
- setup-all-skills-prompt.md: degree 83
- task-planning: degree 17
- code-review: degree 16
- debugging: degree 16
- testing-strategies: degree 15
- web-accessibility: degree 15
- api-documentation: degree 14
- plannotator: degree 14

## Duplicate / consolidation notes
- `api-design` and `backend-testing` should stay separated by clearer route-outs rather than growing into one another.
- `backend-testing` and `testing-strategies` should stay separated by clearer route-outs rather than growing into one another.
- `bmad-gds` and `game-demo-feedback-triage` should stay separated by clearer route-outs rather than growing into one another.
- `code-review` and `debugging` should stay separated by clearer route-outs rather than growing into one another.
- `code-review` and `git-workflow` should stay separated by clearer route-outs rather than growing into one another.
- `code-review` and `testing-strategies` should stay separated by clearer route-outs rather than growing into one another.
- `debugging` and `log-analysis` should stay separated by clearer route-outs rather than growing into one another.
- `debugging` and `testing-strategies` should stay separated by clearer route-outs rather than growing into one another.
- `api-documentation` should stay focused on developer-facing API portals, reference docs, examples, and migration callouts instead of absorbing contract design, internal technical docs, or customer help content.

## Recommended maintenance direction
- Continue upgrading remaining highly visible legacy anchors that still lack both `references/` and `evals/`.
- Prefer support bundles that sharpen boundaries and maintenance signals instead of adding overlapping wrappers.
- Re-check discovery docs whenever a documentation-cluster or backend-cluster skill changes role or trigger phrasing.
