---
title: Skill Support Coverage
created: 2026-04-12
updated: 2026-04-13
type: concept
tags: [skills, skill-quality, graphify]
sources: [graphify-out/GRAPH_REPORT.md]
---

# Skill Support Coverage

## Durable finding
Support coverage is uneven across the `.agent-skills` corpus.

Current structural snapshot from the graph-style scan:
- 90 total skills
- 51 skills with `references/`
- 50 skills with `evals/`

Recent ratchets:
- The React canonical/alias pair both include `evals/`, which raised support coverage in a high-visibility frontend lane without adding a new skill.
- The design-system canonical/alias pass added one new `references/` bundle and two new `evals/` bundles while reducing duplicate frontend metadata.
- The `bmad-gds` modernization pass added both `references/` and `evals/`, showing that cluster anchors can be upgraded without creating another overlapping game skill.
- The marketing canonical/alias pass added the first support bundle for the broad marketing lane while reducing duplicate discovery wording at the same time.
- The `survey` hardening pass added both `references/` and `evals/`, which matters because it upgrades the evidence-quality gate that every later maintenance run depends on.
- The `standup-meeting` modernization pass added both `references/` and `evals/`, which matters because the PM cluster now has stronger support for a high-frequency daily coordination ritual instead of only planning-oriented upgrades.
- The `sprint-retrospective` modernization pass added both `references/` and `evals/`, which matters because the PM cluster now has stronger support for reflection, async/hybrid facilitation, and action follow-through instead of relying on a template-only legacy skill.
- The `git-workflow` modernization pass added both `references/` and `evals/`, which matters because a high-frequency CLI/developer-workflow anchor now has durable guidance for local collaboration boundaries, push safety, and recovery instead of only a command dump.
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
