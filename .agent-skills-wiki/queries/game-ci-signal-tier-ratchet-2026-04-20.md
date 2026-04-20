---
title: Game CI Signal Tier Ratchet 2026-04-20
created: 2026-04-20
updated: 2026-04-20
type: query
tags: [skills, survey, trigger-design, skill-quality, game-dev, docs]
sources: [.survey/game-ci-signal-tier-ratchet-20260420/triage.md, .survey/game-ci-signal-tier-ratchet-20260420/context.md, .survey/game-ci-signal-tier-ratchet-20260420/solutions.md, .survey/game-ci-signal-tier-ratchet-20260420/loop-charter.md, .survey/game-ci-signal-tier-ratchet-20260420/loop-results.md, graphify-out/GRAPH_REPORT.md]
---

# Game CI Signal Tier Ratchet 2026-04-20

## Question
What is the best bounded next improvement for `game-ci-cd-pipeline` after its packet-first hardening pass?

## Decision
Harden `game-ci-cd-pipeline` in place so it names **signal tier / promotion lane first** before choosing the packet.

The winning ratchet was not another game DevOps wrapper. The useful change was to classify one of three lanes up front:
- `branch-gate`
- `nightly-package-candidate`
- `release-certification-candidate`

Then the skill still chooses one packet (`pipeline-setup`, `stage-split`, `cache-policy`, `preflight-readiness`, `artifact-release`, `ci-signal-hardening`, or `route-to-log-triage`) inside that lane.

## Why this won
- Survey evidence showed official tools already separate fast validation from heavier candidate/release work: GameCI test/build/deploy flow, Unity Build Automation auto-build vs scheduled builds, GitHub Actions environments/approvals, and TeamCity build chains.
- Practitioner evidence still shows manual nightly candidate naming, self-hosted runner state, licensing friction, and packaging times too slow for every merge gate.
- The game cluster already has owners for build-log triage, production coordination, perf work, and Steam launch ops, so another wrapper would mostly blur boundaries.

## Accepted changes
- Added a signal-tier front door to `game-ci-cd-pipeline/SKILL.md` before packet routing.
- Added `references/signal-tiers-and-promotion-lanes.md` and expanded the intake reference with lane selection guidance.
- Expanded `evals/evals.json` with branch-gate, nightly candidate, and release-candidate cases.
- Synced `SKILL.toon`, `skills.json`, `README.md`, `README.ko.md`, and `setup-all-skills-prompt.md`.

## Rejected alternatives
- Adding a separate branch CI skill, nightly build skill, or release-candidate wrapper.
- Letting `game-ci-cd-pipeline` absorb pure release-gate policy selection that belongs to `testing-strategies`.
- Treating packaging-heavy candidate lanes as the default for every branch build.

## Durable finding
The reusable abstraction for this lane is **signal-tier truth before packet choice**. Game teams already behave as if branch validation, nightly QA/demo candidates, and release/certification candidates are different lanes; the skill should say that explicitly so artifact policy, approvals, and CI trust stop blurring together.

## Related pages
- [[game-development-cluster]]
- [[game-ci-cd-pipeline-structural-hardening-2026-04-19]]
- [[testing-strategies-gate-truth-ratchet-2026-04-20]]
