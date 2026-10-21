# Pattern Index

<!-- last_updated: 2026-10-21 -->

Lookup table for all pattern files in this directory. Check here before starting any task — if a pattern exists, follow it.

<!-- This file is populated during setup (Pass 2) and updated whenever patterns are added.
     Each row maps a pattern file (or section, using a #task- anchor for multi-section
     files) to its trigger — when should the agent load it? Keep sorted alphabetically.
     One row per task (not per file). If you create a new pattern, add it here. If you
     delete one, remove it. -->

| Pattern | Use when |
|---------|----------|
| [catalog-metadata-changes.md#task-add-a-new-skill](catalog-metadata-changes.md#task-add-a-new-skill) | Adding a new skill to `.agent-skills/` and registering it in `skills.json` |
| [catalog-metadata-changes.md#task-add-offline-repository-operator-support](catalog-metadata-changes.md#task-add-offline-repository-operator-support) | Standardizing a repository operator into a portable router, pinned reference and safe offline preflight with CI regressions |
| [catalog-metadata-changes.md#task-import-an-upstream-family](catalog-metadata-changes.md#task-import-an-upstream-family) | Vendoring a whole upstream skill family (pinned commit, license, provenance, setup-prompt boundary, changelog) |
| [catalog-metadata-changes.md#task-merge-a-duplicate-skill](catalog-metadata-changes.md#task-merge-a-duplicate-skill) | Two skills do the same job: absorb one into the canonical skill, retire the name, repoint route-outs |
| [catalog-metadata-changes.md#task-update-an-existing-skills-metadata](catalog-metadata-changes.md#task-update-an-existing-skills-metadata) | Changing an existing skill's category, subcategory, description, or retiring it |
| [context-layer-lifecycle.md](context-layer-lifecycle.md) | Operating, verifying, or extending the `ctx` tool that refreshes/GCs the mex, zvec-grep, llm-wiki and graphify context layers on hooks and pre-push |
| [debug-catalog-ci-failures.md](debug-catalog-ci-failures.md) | Diagnosing a `.github/workflows/ci.yml` failure (manifest/README/TOON/frontmatter/flatten checks) |
| [headroom-code-policy-install.md](headroom-code-policy-install.md) | Installing or repairing Headroom routing with Graphify preflights and the Claude Code source-mutation policy |
| [jeo-skill-install-flow.md](jeo-skill-install-flow.md) | Understanding or debugging how `jeo-skill install` resolves a selection and delegates to `npx skills add` |
| [jev-control-plane.md](jev-control-plane.md) | Operating, extending, or debugging the Jev harness: backend kinds, per-operation routing/fallback, attestation tiers, cap-aware selection, `model_policies` routing, and the self-test/regression/smoke evidence gates |
| [performance-resource-audit.md](performance-resource-audit.md) | Measuring and optimizing repository executable speed, allocation and resource lifecycles without changing outputs or weakening safety checks |
| [readme-visual-refresh.md](readme-visual-refresh.md) | Refreshing localized README prose, generated release windows and Codex image/SVG assets with scoped consumer-command and browser verification |
| [skill-usage-lifecycle.md](skill-usage-lifecycle.md) | Tracking skill usage, quarantining/restoring never-used installed skills, Jev review/relevance gates, the Jev usage ledger, or retiring never-used catalog skills |
