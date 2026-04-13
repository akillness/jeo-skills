# GRAPH_REPORT

## Scope
- Path analyzed: `.agent-skills/` plus repository discovery docs
- Method: custom graphify-style structural graph over skill metadata, support-file presence, cross-skill mentions, and documentation indexing
- Total skills: 90
- Skills with references/: 51
- Skills with evals/: 50
- Graph nodes: 194
- Graph edges: 497

## Strongest structural findings
1. `technical-writing` stays the internal technical-docs anchor for specs, architecture docs, ADRs, runbooks, migrations, and internal developer guides.
2. `user-guide-writing` is now the cleaner end-user-docs anchor for onboarding, tutorials, how-to guides, FAQs, and release-facing help updates.
3. The documentation cluster still benefits more from clearer route-outs than from merging API, user-help, and changelog work into one wrapper.
4. Discovery docs (`README.md`, `README.ko.md`, `setup-all-skills-prompt.md`) remain high-degree nodes, so one-line positioning still materially affects activation.
5. Support coverage keeps improving by modernizing legacy anchors with `references/` and `evals/` instead of adding more overlapping skills.

## Community map
- infrastructure
- utilities
- core-orchestration
- frontend
- search-analysis
- unknown
- planning-review
- backend

## Highest-degree nodes
- README.md: degree 88
- README.ko.md: degree 88
- setup-all-skills-prompt.md: degree 84
- task-planning: degree 17
- code-review: degree 16
- debugging: degree 16
- testing-strategies: degree 15
- web-accessibility: degree 15
- plannotator: degree 14
- responsive-design: degree 13

## Duplicate / consolidation notes
- `api-design` and `backend-testing` should stay separated by clearer route-outs rather than growing into one another.
- `backend-testing` and `testing-strategies` should stay separated by clearer route-outs rather than growing into one another.
- `bmad-gds` and `game-demo-feedback-triage` should stay separated by clearer route-outs rather than growing into one another.
- `code-review` and `debugging` should stay separated by clearer route-outs rather than growing into one another.
- `code-review` and `git-workflow` should stay separated by clearer route-outs rather than growing into one another.
- `code-review` and `testing-strategies` should stay separated by clearer route-outs rather than growing into one another.
- `debugging` and `log-analysis` should stay separated by clearer route-outs rather than growing into one another.
- `debugging` and `testing-strategies` should stay separated by clearer route-outs rather than growing into one another.
- `user-guide-writing` should stay focused on customer-facing task guidance instead of absorbing internal technical docs, API portal reference, or release-note hygiene.

## Recommended maintenance direction
- Continue upgrading remaining highly visible legacy anchors that still lack both `references/` and `evals/`.
- Prefer support bundles that sharpen boundaries and maintenance signals instead of adding overlapping wrappers.
- Re-check discovery docs whenever a documentation-cluster skill changes role or trigger phrasing.
