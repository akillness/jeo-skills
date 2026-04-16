---
title: Skill Support Coverage
created: 2026-04-12
updated: 2026-04-16
type: concept
tags: [skills, skill-quality, graphify]
sources: [graphify-out/GRAPH_REPORT.md, .survey/marketing-skills-collection-support-hardening-20260416/context.md, .survey/marketing-skills-collection-support-hardening-20260416/solutions.md, .survey/frontend-alias-support-hardening-20260416/context.md, .survey/frontend-alias-support-hardening-20260416/solutions.md, .survey/remotion-video-production-support-hardening-20260416/context.md, .survey/remotion-video-production-support-hardening-20260416/solutions.md, .survey/ralph-support-hardening-20260416/context.md, .survey/ralph-support-hardening-20260416/solutions.md, .survey/jeo-structural-hardening-20260416/context.md, .survey/jeo-structural-hardening-20260416/solutions.md]
---

# Skill Support Coverage

## Durable finding
Baseline support coverage is now complete across the live `.agent-skills` corpus, so the next structural wins come from high-visibility trigger, boundary, and maintenance-shape improvements rather than missing `references/` or `evals/` folders.

Current structural snapshot from the graph-style scan:
- 89 filesystem skills with `SKILL.md`
- 89 live manifest-indexed skills in `.agent-skills/skills.json` categories
- 89 live skills with `references/`
- 89 live skills with `evals/`
- 24 live skills with `scripts/`
- 89 live skills with a compact discovery variant

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
- The `opencontext` modernization pass added three `references/` docs and `evals/evals.json`, which matters because another high-utility utility skill now clearly owns active project/repo memory, manifests, stable links, and cross-agent handoff instead of remaining a generic persistent-memory command catalog that blurred into wiki or graph layers.
- The `agentation` modernization pass added three `references/` docs and `evals/evals.json`, which matters because a flagship planning-review/browser-adjacent skill now clearly owns exact rendered-UI feedback plus annotation-loop setup instead of remaining a giant mixed install/config/API catalog that blurred into `agent-browser`, `playwriter`, and `plannotator`.
- The `agent-browser` modernization pass added `references/modes-and-routing.md` and `evals/evals.json`, which matters because the browser-review lane now has an explicit clean-session verification anchor instead of a generic browser CLI guide with weak boundary enforcement and no ratcheting harness.
- The `presentation-builder` modernization pass added three `references/` docs, `evals/evals.json`, and `SKILL.toon`, which matters because the documentation/publishing lane now has a stronger deck-artifact anchor for investor / roadmap / launch / architecture-demo / workshop / game-pitch workflows instead of a short slides-grab command note with weak routing.
- The `vibe-kanban` modernization pass added three workflow-first `references/` docs plus `evals/evals.json`, which matters because a high-visibility orchestration skill now owns coding-task board/workspace control, review queues, retries, cleanup, and route-outs instead of remaining a setup-heavy kanban command catalog.
- The `genkit` modernization pass added three `references/` docs and `evals/evals.json`, which matters because a previously weak Firebase/fullstack AI skill now clearly owns server-side flows, tool calling, retrieval, evaluation, observability, and deployment boundaries instead of remaining a long example dump that overlapped with direct app-side Firebase AI integration.
- The `firebase-ai-logic` follow-up hardening pass added three `references/` docs, `evals/evals.json`, and a refreshed `SKILL.toon`, which matters because the client-side half of the Firebase AI lane now preserves app-integration, production-control, and route-out guidance instead of relying on a stale snippet dump next to a much stronger `genkit` skill.
- The `looker-studio-bigquery` modernization pass added three `references/` docs, `evals/evals.json`, and refreshed discovery surfaces, which matters because a README-visible dashboard/reporting anchor now has a clear boundary between BigQuery-backed stakeholder dashboards, KPI interpretation, anomaly hunting, and telemetry observability instead of a stale feature-tour skill.
- The `fabric` modernization pass added three `references/` docs, `evals/evals.json`, and refreshed discovery surfaces, which matters because a README-visible utility skill now clearly owns reusable pattern-driven stdin/file/transcript transforms plus custom-pattern maintenance instead of a broad AI-CLI feature tour with no support coverage.
- The `game-performance-profiler` hardening pass added three focused `references/` docs, a stronger `evals/evals.json`, and `SKILL.toon`, which matters because the game-performance lane now reflects quick triage packets, benchmark routes, device-review context, and escalation logic instead of relying on one generic profiling reference.
- The `prompt-repetition` modernization pass added two `references/` docs, `evals/evals.json`, and refreshed compact/discovery wording, which matters because a legacy prompt-engineering skill now behaves like a bounded decision-first router instead of a universal auto-apply hack with no support coverage.
- The `lmstudio-cli` modernization pass added three `references/` docs, `evals/evals.json`, and a lightweight endpoint-check helper script, which matters because a lingering developer-workflow support-gap skill now owns LM Studio-specific verification and wiring instead of remaining a thin command list.
- The `research-paper-writing` hardening pass added three `references/` docs and `evals/evals.json`, which matters because the documentation cluster now has a stronger manuscript-package anchor for claim/evidence mapping, figure-table support, rebuttal planning, and camera-ready revision instead of a prose-only paper helper.
- The `google-workspace` modernization pass added three `references/` docs and refreshed `evals/evals.json`, which matters because a broad ops/productivity skill now behaves like a routing anchor for Apps Script vs REST API vs Admin SDK plus auth and cross-service workflow choice instead of a 745-line single-file API encyclopedia.
- The `langsmith` hardening pass added `references/modes-and-routing.md` plus `evals/evals.json`, which matters because a high-utility AI-ops/search-analysis skill now behaves like a mode-selecting trace/eval/review anchor instead of a feature-tour reference with no ratcheting harness.
- The `ralphmode` hardening pass added `evals/evals.json` and sharper settings / rules / hooks discovery wording, which matters because a high-visibility orchestration-platform skill now has frozen trigger and route-boundary coverage instead of prose-only permission guidance.
- The `skill-autoresearch` hardening pass added `references/loop-charter-template.md`, `evals/evals.json`, and sharper repo-local ratcheting language, which matters because the maintenance loop now has a dedicated search-analysis anchor for frozen evaluators, one-change iterations, and append-only keep/revert history instead of relying on prose-only memory.
- The `autoresearch` hardening pass added `evals/evals.json` and corrected stale support docs around the immutable harness, which matters because a README-visible search-analysis anchor now distinguishes real GPU-bound ML search from repo-local skill eval loops and no longer relies on outdated `constants.py` assumptions.
- The `react-best-practices` support-hardening pass added three focused `references/` docs and refreshed discovery wording, which matters because a canonical frontend performance anchor now matches the repo’s lighter support-packet pattern instead of relying on one giant `AGENTS.md` plus a thin surface skill.
- The `marketing-skills-collection` support-hardening pass added a small alias-side `references/` packet, expanded route-out eval coverage, and refreshed the marketing compact surfaces so the repo no longer advertises the obsolete 23-sub-skill worldview in that lane.
- The frontend alias support-hardening pass added alias-side `references/` packets to both `frontend-design-system` and `vercel-react-best-practices`, plus compact-surface sync in `SKILL.toon` and `.agent-skills/skills.toon`, which matters because the frontend lane no longer relies on wiki memory to explain that those folders are compatibility shells rather than peer default skills.
- The `remotion-video-production` support-hardening pass added the last missing alias-side `references/` packet in the creative-media lane, refreshed the compact wording, and added an eval that explicitly routes spreadsheet/API-style bulk generation back to broader `video-production` modes instead of forcing a Remotion codebase.
- The `ralph` support-hardening pass added `evals/evals.json`, fixed stale live self-path examples that still pointed at `.agent-skills/ralph-ooo/...`, and closed the last remaining live eval holdout in the graph snapshot without broadening the core-orchestration lane.
- The `jeo` structural-hardening pass shrank a high-degree orchestration anchor under the 500-line guideline, moved platform/state/troubleshooting detail into packaged references, and refreshed compact/discovery wording so the next maintenance loop can optimize boundary quality instead of re-reading one giant front-door file.
- The `react-grab` structural-hardening pass applied the same pattern to a high-visibility frontend/browser skill: shrink the front door, add focused install/workflow/troubleshooting references, refresh compact metadata, and ratchet stale helper-script prerequisites back to the current upstream Node.js >=22 requirement.

- The compact-variant completion pass closed the last 8 missing `SKILL.toon` gaps (`clawteam`, `game-build-log-triage`, `game-ci-cd-pipeline`, `game-demo-feedback-triage`, `lmstudio-cli`, `obsidian-plugin`, `research-paper-writing`, `steam-store-launch-ops`), which matters because the repo docs and runtime guidance can once again treat the compact layer as a fully shipped surface instead of an aspirational one.

## Why it matters
- Missing references weaken reuse and make trigger boundaries harder to maintain.
- Missing evals make ratcheting and regression checks harder for future improvement loops, so closing the last live eval holdout materially improves future maintenance runs.
- Generic legacy skills should usually be upgraded with support files before adding new overlapping skills.

## Operational rule
When a legacy skill is materially upgraded, prefer adding at least one of:
- `references/` for durable heuristics
- `evals/evals.json` for dry-run validation
- `SKILL.toon` / `SKILL.compact.md` when the repo ships compact discovery surfaces for that lane

## Related pages
- [[project-management-cluster]]
- [[game-development-cluster]]
- [[marketing-cluster]]
- [[frontend-skill-canonicalization]]
- [[task-planning-modernization-2026-04-12]]
- [[design-system-canonicalization-2026-04-12]]
- [[bmad-gds-modernization-2026-04-12]]
- [[marketing-skill-canonicalization-2026-04-12]]
- [[marketing-skills-collection-support-hardening-2026-04-16]]
- [[frontend-alias-support-hardening-2026-04-16]]
- [[remotion-video-production-support-hardening-2026-04-16]]
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
- [[browser-review-cluster]]
- [[ohmg-modernization-2026-04-15]]
- [[playwriter-modernization-2026-04-15]]
- [[agentation-modernization-2026-04-15]]
- [[agent-browser-modernization-2026-04-15]]
- [[presentation-builder-modernization-2026-04-15]]
- [[game-performance-profiler-modernization-2026-04-15]]
- [[skill-autoresearch-hardening-2026-04-16]]
- [[ralph-support-hardening-2026-04-16]]
- [[compact-variant-gap-2026-04-15]]
