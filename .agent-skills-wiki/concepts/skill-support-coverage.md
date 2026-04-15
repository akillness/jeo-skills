---
title: Skill Support Coverage
created: 2026-04-12
updated: 2026-04-15
type: concept
tags: [skills, skill-quality, graphify]
sources: [graphify-out/GRAPH_REPORT.md]
---

# Skill Support Coverage

## Durable finding
Support coverage is uneven across the `.agent-skills` corpus.

Current structural snapshot from the graph-style scan:
- 89 filesystem skills with `SKILL.md`
- 89 manifest entries in `.agent-skills/skills.json`
- 73 skills with `references/`
- 72 skills with `evals/`
- 23 skills with `scripts/`

Recent ratchets:
- The React canonical/alias pair both include `evals/`, which raised support coverage in a high-visibility frontend lane without adding a new skill.
- The design-system canonical/alias pass added one new `references/` bundle and two new `evals/` bundles while reducing duplicate frontend metadata.
- The `bmad-gds` modernization pass added both `references/` and `evals/`, showing that cluster anchors can be upgraded without creating another overlapping game skill.
- The marketing canonical/alias pass added the first support bundle for the broad marketing lane while reducing duplicate discovery wording at the same time.
- The `survey` hardening pass added both `references/` and `evals/`, which matters because it upgrades the evidence-quality gate that every later maintenance run depends on.
- The `standup-meeting` modernization pass added both `references/` and `evals/`, which matters because the PM cluster now has stronger support for a high-frequency daily coordination ritual instead of only planning-oriented upgrades.
- The `sprint-retrospective` modernization pass added both `references/` and `evals/`, which matters because the PM cluster now has stronger support for reflection, async/hybrid facilitation, and action follow-through instead of relying on a template-only legacy skill.
- The `git-workflow` modernization pass added both `references/` and `evals/`, which matters because a high-frequency CLI/developer-workflow anchor now has durable guidance for local collaboration boundaries, push safety, and recovery instead of only a command dump.
- The `npm-git-install` modernization pass added both `references/` and `evals/`, which matters because another high-utility developer-workflow skill now owns Git-based package delivery choice across npm / pnpm / Yarn / Bun instead of remaining a stale npm-only command dump with no auth, lifecycle, or exit-strategy guidance.
- The environment canonicalization pass added both `references/` and `evals/` to the infrastructure setup pair, which matters because a previously weak duplicate lane now has a clear broader anchor and a narrower config alias.
- The `task-estimation` modernization pass added both `references/` and `evals/`, which matters because the PM cluster now has a stronger sizing and forecast-language lane instead of routing into a legacy generic estimation skill.
- The `api-design` modernization pass added both `references/` and `evals/`, which matters because the backend cluster now has a sharper contract-first anchor instead of a broad legacy skill that overlapped with `api-documentation`.
- The `log-analysis` modernization pass added both `references/` and `evals/`, which matters because a cross-domain legacy skill now has a cleaner triage role across app, infra, browser, and CI logs without absorbing Unity/Unreal-specific build-log work.
- The `debugging` modernization pass added both `references/` and `evals/`, which matters because a high-frequency code-quality anchor now owns the reproduce → isolate → verify loop instead of remaining a generic legacy troubleshooting guide.
- The `code-review` modernization pass added both `references/` and `evals/`, which matters because a second high-frequency code-quality anchor now owns workflow-aware diff / PR judgment, missing-evidence checks, and route-outs instead of relying on a generic static checklist.
- The `testing-strategies` modernization pass added both `references/` and `evals/`, which matters because the code-quality lane now has a dedicated policy/orchestration anchor for risk-based validation depth, gate selection, and flaky-suite rules instead of a generic test-pyramid skill.
- The `web-accessibility` modernization pass added both `references/` and `evals/`, which matters because a high-traffic frontend skill now owns accessibility remediation plus manual-vs-automated verification instead of remaining a generic WCAG/example dump.
- The `state-management` modernization pass added both `references/` and `evals/`, which matters because a legacy frontend skill now owns state-boundary decisions across local, shared, URL/form, server, and long-lived client workflow state instead of remaining a generic library tour.
- The `ui-component-patterns` modernization pass added both `references/` and `evals/`, which matters because another legacy frontend anchor now owns reusable primitive / variant / slot API design instead of remaining a long example dump with weak route-outs.
- The `workflow-automation` modernization pass added both `references/` and `evals/`, which matters because the utilities/developer-workflow lane now has a sharper repo-scoped automation anchor instead of a legacy generic command dump that overlapped with environment setup and deployment concerns.
- The `responsive-design` modernization pass added both `references/` and `evals/`, which matters because the remaining legacy frontend layout anchor now owns mobile-first, container-aware adaptation plus overflow/reflow verification instead of remaining a generic CSS/example dump.
- The `plannotator` modernization pass added both `references/` and `evals/`, which matters because a highly indexed planning-review anchor now behaves like a clear visual approval gate with explicit route-outs instead of a 600-line mixed install/setup/review dump.
- The `technical-writing` modernization pass added both `references/` and `evals/`, which matters because the documentation cluster now has a sharper internal-docs anchor for specs, ADRs, architecture docs, runbooks, and migration guides instead of a catch-all skill that overlapped with API docs, user guides, and changelog hygiene.
- The `user-guide-writing` modernization pass added both `references/` and `evals/`, which matters because the documentation cluster now has a sharper end-user-docs anchor for onboarding guides, tutorials, help-center articles, FAQs, and release-facing help updates instead of a legacy example dump with weak trigger boundaries.
- The `api-documentation` modernization pass added both `references/` and `evals/`, which matters because the documentation/backend boundary now has a sharper developer-facing API-docs anchor for reference portals, quickstarts, SDK/webhook guidance, truthful examples, and auth/error guidance instead of a legacy OpenAPI-heavy example dump.
- The `deployment-automation` modernization pass added both `references/` and `evals/`, which matters because the infrastructure lane now has a sharper release-execution anchor for preview/staging/prod promotion, rollout strategy, post-deploy verification, and rollback planning instead of a legacy CI/CD + Docker/Kubernetes command dump.
- The `authentication-setup` modernization pass added both `references/` and `evals/`, which matters because the backend lane now has a sharper product-auth setup router for hosted/framework-native/platform-native choices, session boundaries, org data ownership, and enterprise SSO handoff instead of a 600-line JWT/OAuth catch-all.
- The `changelog-maintenance` modernization pass added both `references/` and `evals/`, which matters because the documentation cluster now has a sharper release-history / release-notes anchor for changelogs, migration updates, and lightweight patch notes instead of a generic semver/example dump.
- The `code-refactoring` modernization pass added both `references/` and `evals/`, which matters because the code-quality cluster now has a sharper structural-cleanup anchor for decomposition, behavior-preserving cleanup, and codemod planning instead of a generic pattern catalog.
- The `video-production` canonicalization pass added support bundles and narrowed `remotion-video-production` into a compatibility alias, which matters because the creative-media lane now has a clearer programmable-video anchor instead of two equal Remotion clones with duplicate discovery wording.
- The `performance-optimization` modernization pass added both `references/` and `evals/`, which matters because the code-quality cluster now has a sharper measurement-led tuning anchor for frontend, API, DB, capacity, memory, and runtime bottlenecks instead of a generic React/database optimization dump.
- The `codebase-search` modernization pass added both `references/` and `evals/`, which matters because the search-analysis lane now has a sharper repo-navigation / impact-mapping anchor instead of a giant command catalog that blurred the boundary with debugging, refactoring, and graph-based architecture analysis.
- The `data-analysis` modernization pass added both `references/` and `evals/`, which matters because another high-utility search-analysis anchor now owns decision-first dataset reasoning across exports, experiments, telemetry, and KPI explanation instead of a generic pandas/SQL snippet dump.
- The `pattern-detection` modernization pass added both `references/` and `evals/`, which matters because the search-analysis lane now has a clearer repeatable rule/anomaly-hunting anchor with mode selection, confidence notes, and explicit route-outs instead of a regex-heavy catch-all.
- The `database-schema-design` modernization pass added both `references/` and `evals/`, which matters because the backend cluster now has a sharper storage-model and staged-migration anchor instead of a generic SQL/NoSQL example dump.
- The `monitoring-observability` modernization pass added both `references/` and `evals/`, which matters because the infrastructure lane now has a sharper telemetry design/review anchor for service reliability, data/pipeline observability, and game live-ops visibility instead of a generic Prometheus/logging snippet dump.
- The `security-best-practices` modernization pass added both `references/` and `evals/`, which matters because a high-traffic web/app hardening anchor now owns layered security classification and honest route-outs instead of a stale Express-only OWASP snippet dump.
- The `web-design-guidelines` modernization pass added three `references/` docs and `evals/evals.json`, which matters because the last weak high-visibility frontend review anchor now owns a broad interface-audit packet instead of a thin vendor-rules fetcher.
- The `vercel-deploy` modernization pass added three `references/` docs and `evals/evals.json`, which matters because a stale provider-specific deployment skill now owns preview/prod promotion, alias/domain, env-sync, and rollback operations instead of a legacy claimable-preview shortcut.
- The `ohmg` modernization pass added `references/` and `evals/`, which matters because a fast-moving platform anchor now explains `oh-my-agent` / `oma`, `.agents` as the source of truth, Gemini-vs-Antigravity capability differences, and route-outs to `omc` / `omx` instead of a stale Gemini-only wrapper.
- The `bmad-idea` modernization pass added both `references/` and `evals/`, which matters because a high-visibility pre-planning anchor now owns concept framing and downstream handoff choice instead of remaining a stale command/persona catalog with no reusable artifact model.
- The catalog-sync hardening pass added a new `references/` doc and `scripts/validate_catalog_sync.py` to `skill-standardization`, which matters because the repo now validates discovery-surface drift explicitly instead of only linting individual `SKILL.md` files.
- The compact-variant sync follow-up ratcheted `skill-standardization` again so the same maintenance loop now treats `SKILL.toon` / `SKILL.compact.md` as derived discovery artifacts that must stay aligned with material `SKILL.md` rewrites, instead of leaving that duty to per-run memory.
- The `playwriter` modernization pass added both `references/` and `evals/`, which matters because a high-visibility browser skill now clearly owns running-browser / authenticated-session reuse instead of remaining a generic Playwright/MCP command dump that blurred the boundary with `agent-browser`.
- The `git-submodule` modernization pass added both `references/` and `evals/`, which matters because another high-utility developer-workflow anchor now owns submodule-vs-subtree choice, recursive bootstrap, pointer updates, detached-HEAD handling, and CI checkout/auth instead of remaining a long command catalog with weak boundaries.
- The `file-organization` modernization pass added three `references/` docs and `evals/evals.json`, which matters because a highly visible legacy utility skill now owns structure-choice and migration guidance across frontend, backend, monorepo, docs/ops, and game-development repos instead of remaining a static scaffold dump with no durable support files.

## Why it matters
- Missing references weaken reuse and make trigger boundaries harder to maintain.
- Missing evals make ratcheting and regression checks harder for future improvement loops.
- Generic legacy skills should usually be upgraded with support files before adding new overlapping skills.

## Operational rule
When a legacy skill is materially upgraded, prefer adding at least one of:
- `references/` for durable heuristics
- `evals/evals.json` for dry-run validation

## Related pages
- [[project-management-cluster]]
- [[game-development-cluster]]
- [[marketing-cluster]]
- [[frontend-skill-canonicalization]]
- [[task-planning-modernization-2026-04-12]]
- [[design-system-canonicalization-2026-04-12]]
- [[bmad-gds-modernization-2026-04-12]]
- [[marketing-skill-canonicalization-2026-04-12]]
- [[log-analysis-modernization-2026-04-13]]
- [[debugging-modernization-2026-04-13]]
- [[code-review-modernization-2026-04-13]]
- [[state-management-modernization-2026-04-13]]
- [[ui-component-patterns-modernization-2026-04-13]]
- [[workflow-automation-modernization-2026-04-13]]
- [[responsive-design-modernization-2026-04-13]]
- [[plannotator-modernization-2026-04-13]]
- [[documentation-cluster]]
- [[technical-writing-modernization-2026-04-13]]
- [[user-guide-writing-modernization-2026-04-13]]
- [[api-documentation-modernization-2026-04-13]]
- [[deployment-automation-modernization-2026-04-13]]
- [[changelog-maintenance-modernization-2026-04-14]]
- [[code-refactoring-modernization-2026-04-14]]
- [[performance-optimization-modernization-2026-04-14]]
- [[pattern-detection-modernization-2026-04-14]]
- [[web-design-guidelines-modernization-2026-04-14]]
- [[vercel-deploy-modernization-2026-04-15]]
- [[core-orchestration-platform-cluster]]
- [[ohmg-modernization-2026-04-15]]
- [[playwriter-modernization-2026-04-15]]
