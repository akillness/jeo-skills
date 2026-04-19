---
title: Standup Meeting Structural Hardening 2026-04-19
created: 2026-04-19
updated: 2026-04-19
type: query
tags: [skills, survey, trigger-design, skill-quality, project-management]
sources: [.survey/standup-meeting-structural-hardening-20260419/triage.md, .survey/standup-meeting-structural-hardening-20260419/context.md, .survey/standup-meeting-structural-hardening-20260419/solutions.md, graphify-out/GRAPH_REPORT.md]
---

# Standup Meeting Structural Hardening 2026-04-19

## Question
What is the best bounded follow-up for `standup-meeting` now that the PM cluster already hardened planning, estimation, and retrospective work, and the standup skill still had a denser front door plus stale compact discovery wording?

## Answer
Harden `standup-meeting` in place as a **routing-first daily coordination anchor**.

The useful ratchet was not another PM ceremony skill and not a bigger standup explainer. The high-value move was to tighten the skill around three structural promises:
- choose **one primary daily-sync mode**
- ask for **one small coordination packet**
- define **one follow-up-huddle / route-out boundary**

That keeps `standup-meeting` focused on daily coordination while preserving adjacent owners for:
- backlog planning → `task-planning`
- sizing / confidence framing → `task-estimation`
- recurring ceremony/process repair → `sprint-retrospective`
- incident / launch command → debugging or launch-specific skills

## Why this beat the alternatives
- Survey evidence kept repeating the same gap: most standup guidance and async bots help with **format** or **status collection**, but not with **route boundaries**.
- Practitioner pain still clusters around overlong updates, status theater, stale boards, and blockers that need a smaller follow-up huddle rather than a longer main meeting.
- The PM cluster already had sharper structural passes for `task-planning`, `task-estimation`, and `sprint-retrospective`, so the best compounding move was to align `standup-meeting` with the same routing-first pattern.
- The biggest repo-local defect was no longer missing support coverage; it was stale discovery wording (`SKILL.toon`) and a still-dense front-door contract.

## Accepted changes
- Rewrote `standup-meeting/SKILL.md` around one mode, one evidence packet, and one follow-up-huddle boundary.
- Added `references/intake-packets-and-route-outs.md` to move packet detail and route-outs into support-owned guidance.
- Refreshed `evals/evals.json` with a stale-board / task-planning route-out case.
- Synced `SKILL.toon`, `.agent-skills/skills.json`, `.agent-skills/skills.toon`, `README.md`, `README.ko.md`, and `setup-all-skills-prompt.md`.
- Refreshed `graphify-out/` so the structural layer records the PM cluster’s now-consistent routing-first shape.

## Rejected changes
- Creating an async-standup wrapper or another standup-adjacent PM skill.
- Expanding `standup-meeting` into broader planning, estimation, or retrospective work.
- Solving stale-board and not-ready-work pain by making the standup longer instead of routing to planning and source-of-truth cleanup.

## Durable finding
For this lane, the reusable abstraction is **daily coordination mode selection with explicit follow-up routing**, not “daily standup tips.” Keep `standup-meeting` as the PM-cluster owner for small daily sync packets and let the neighboring skills own planning, sizing, and process repair.

## Related pages
- [[project-management-cluster]]
- [[skill-support-coverage]]
- [[standup-meeting-modernization-2026-04-12]]
- [[task-estimation-structural-hardening-2026-04-19]]
- [[sprint-retrospective-structural-hardening-2026-04-18]]
