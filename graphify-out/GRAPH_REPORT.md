# GRAPH_REPORT

## Scope
- Path analyzed: `.agent-skills/` plus repository discovery docs
- Method: custom graphify-style structural graph over skill metadata, support-file presence, cross-skill mentions, and documentation indexing
- Total skills: 89
- Manifest skills in `.agent-skills/skills.json`: 89
- Skills with references/: 64
- Skills with evals/: 63
- Skills with scripts/: 23
- Graph nodes: 242
- Graph edges: 616

## Strongest structural findings
1. `security-best-practices` is now a stronger web/app hardening anchor because it selects between perimeter/browser policy, session-cookie/CSRF safety, abuse controls, validation risk, secrets/config, and review/verification instead of defaulting to Express-only snippets.
2. The web-security boundary is cleaner when `security-best-practices` routes auth-stack choice to `authentication-setup`, schema work to `database-schema-design`, API contracts to `api-design`, backend test layering to `backend-testing`, and specific code fixes to `debugging` / `code-review`.
3. Discovery docs (`README.md`, `README.ko.md`, `setup-all-skills-prompt.md`) remain high-degree nodes, so repositioning an existing security anchor still requires top-level wording changes.
4. Support coverage improved again without adding a new overlapping security skill: the better move was upgrading the legacy hardening anchor and adding reusable references/evals.
5. The repo still benefits more from modernizing weak anchors with explicit route-outs than from growing additional broad wrapper skills.

## Highest-degree nodes
- README.ko.md: degree 88
- README.md: degree 88
- setup-all-skills-prompt.md: degree 88
- debugging: degree 21
- code-review: degree 20
- performance-optimization: degree 19
- security-best-practices: degree 18
- api-documentation: degree 17
- task-planning: degree 17
- testing-strategies: degree 17

## Duplicate / consolidation notes
- `security-best-practices` should stay the general web/app hardening anchor rather than splitting into another OWASP-checklist-only, middleware-only, or auth-adjacent wrapper.
- `authentication-setup` remains the better home for auth-stack selection and hosted/framework-native choice.
- `database-schema-design` remains the better home for storage-model and migration-safe schema changes.
- `backend-testing` remains the better home for regression test layering and security/auth verification strategy.
- `code-review` / `debugging` remain the better homes for specific vulnerability fixes in code.

## Recommended maintenance direction
- Keep upgrading high-visibility legacy anchors that adjacent skills already route into.
- Re-check route-outs whenever `security-best-practices`, `authentication-setup`, `backend-testing`, or `database-schema-design` changes materially.
- Keep discovery surfaces synchronized when an existing skill is repositioned, not only when a new skill is added.
