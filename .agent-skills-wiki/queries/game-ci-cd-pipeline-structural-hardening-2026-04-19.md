---
title: Game CI/CD Pipeline Structural Hardening 2026-04-19
created: 2026-04-19
updated: 2026-04-19
type: query
tags: [skills, survey, trigger-design, skill-quality, game-dev, docs]
sources: [.survey/game-ci-cd-pipeline-structural-hardening-20260419/triage.md, .survey/game-ci-cd-pipeline-structural-hardening-20260419/context.md, .survey/game-ci-cd-pipeline-structural-hardening-20260419/solutions.md, .survey/game-ci-cd-pipeline-structural-hardening-20260419/loop-charter.md, .survey/game-ci-cd-pipeline-structural-hardening-20260419/loop-results.md, graphify-out/GRAPH_REPORT.md]
---

# Game CI/CD Pipeline Structural Hardening 2026-04-19

## Question
What is the best bounded next improvement for `game-ci-cd-pipeline` after the game cluster already has specialist build-log, performance, feedback, and Steam launch skills?

## Decision
Harden `game-ci-cd-pipeline` in place as a routing-first game pipeline front door.

The best ratchet was not another game DevOps wrapper. The useful change was to force the skill to choose **one pipeline packet** per run:
- `pipeline-setup`
- `stage-split`
- `cache-policy`
- `preflight-readiness`
- `artifact-release`
- `ci-signal-hardening`
- `route-to-log-triage`

That keeps the front door focused on repeated structural pipeline decisions and pushes one failing log back to `game-build-log-triage`.

## Why this won
- Graphify still showed `game-ci-cd-pipeline` as one of the larger unhardened game/developer-workflow front doors.
- Official Unity and Unreal docs continue to reinforce cache/build-failure, packaging, and logging as separate operational surfaces rather than one generic CI blob.
- Community indexed snippets still show teams comparing CI stacks, worrying about package-cache bloat, and asking how to speed automated Unreal pipelines, which means the market gap is still workflow-shape guidance rather than another tool list.
- The game cluster already has specialist owners for logs, performance, demo feedback, and launch ops, so another wrapper would mostly blur boundaries.

## Accepted changes
- Rewrote `game-ci-cd-pipeline/SKILL.md` around packet choice, blocker classification, boundary checks, and one next artifact.
- Added `references/intake-packets-and-route-outs.md`.
- Expanded `evals/evals.json` with a route-to-log-triage case.
- Synced `SKILL.toon`, `README.md`, `README.ko.md`, `setup-all-skills-prompt.md`, and `.agent-skills/skills.json`.
- Refreshed `graphify-out/` so the structural layer records the new routing-first shape.

## Rejected alternatives
- Adding a separate Unity CI wrapper or Unreal release wrapper.
- Letting this skill absorb first-pass log triage.
- Keeping the skill as a long checklist-heavy explainer after the repo has already converged on smaller routing-first front doors.

## Durable finding
The reusable abstraction for this lane is **packet-first game pipeline diagnosis**, not “all game CI/CD advice.” `game-ci-cd-pipeline` should stay focused on repeated structural decisions and explicit route-outs, especially the handoff to `game-build-log-triage` when the user really has one failing log rather than a pipeline-architecture problem.

## Related pages
- [[game-development-cluster]]
- [[developer-workflow-cluster]]
- [[skill-support-coverage]]
