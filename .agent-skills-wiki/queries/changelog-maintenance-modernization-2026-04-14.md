---
title: Changelog Maintenance Modernization 2026-04-14
created: 2026-04-14
updated: 2026-04-14
type: query
tags: [skills, survey, trigger-design, skill-quality, docs]
sources: [.survey/changelog-maintenance-modernization-20260414/triage.md, .survey/changelog-maintenance-modernization-20260414/context.md, .survey/changelog-maintenance-modernization-20260414/solutions.md, .survey/changelog-maintenance-modernization-20260414/loop-charter.md, graphify-out/GRAPH_REPORT.md]
---

# Changelog Maintenance Modernization 2026-04-14

## Question
What is the best bounded next documentation-cluster modernization target after internal docs, user guides, API docs, and auth-adjacent release/docs boundaries were already sharpened, given the need to avoid another overlapping release-note wrapper?

## Decision
Modernize `changelog-maintenance` into the release-history / release-notes anchor instead of adding another release-note, product-update, or launch-summary wrapper.

## Why this won
- Survey evidence showed the same recurring workflow across software, product, marketing, and game update lanes: one anchor must decide between durable changelog history, audience-facing release notes, migration/deprecation updates, and lightweight patch notes.
- The old skill was still a generic semver/example dump with weak trigger wording, no support files, and weak route-outs to `technical-writing`, `api-documentation`, `user-guide-writing`, `deployment-automation`, and `marketing-automation`.
- Graph refresh after the rewrite showed improved support coverage plus a cleaner duplicate note around release-history vs tutorial/spec/campaign work, which is more reusable than inventing another release wrapper.

## Accepted changes
- Rewrite `changelog-maintenance` as a mode-selecting release-history and release-communication skill.
- Add `references/` for mode boundaries, editorial quality checks, and automation/source-of-truth rules.
- Add `evals/evals.json` that test repo changelog updates, migration/deprecation updates, and Steam-style lightweight patch notes.
- Update README / README.ko / setup prompt / `skills.json` so discovery surfaces stop hiding the sharper role.
- Refresh graph outputs and wiki notes so future runs see the documentation cluster as a cleaner internal-docs / API-docs / user-help / release-history split.

## Rejected alternatives
- Adding another generic release-note or launch-summary wrapper.
- Leaving `changelog-maintenance` as a semver-only or Keep-a-Changelog-only template dump.
- Folding deployment execution into the same skill instead of routing that work to `deployment-automation`.
- Folding tutorials or customer help docs into the same skill instead of routing them to `user-guide-writing`.
- Treating patch notes as just a renamed changelog with no audience or channel difference.

## Durable takeaway
The documentation cluster improves when `changelog-maintenance` owns release-history and release-summary artifacts, while `technical-writing` owns internal specs/runbooks, `api-documentation` owns developer portal output, `user-guide-writing` owns task-oriented help, `deployment-automation` owns rollout mechanics, and `marketing-automation` owns broader launch messaging.

## Related pages
- [[documentation-cluster]]
- [[skill-support-coverage]]
- [[technical-writing-modernization-2026-04-13]]
- [[user-guide-writing-modernization-2026-04-13]]
- [[api-documentation-modernization-2026-04-13]]
