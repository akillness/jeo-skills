---
title: Standup Meeting Modernization
created: 2026-04-12
updated: 2026-04-12
type: query
tags: [skills, survey, trigger-design, skill-quality]
sources: [.survey/standup-meeting-modernization-20260412/context.md, .survey/standup-meeting-modernization-20260412/solutions.md, graphify-out/GRAPH_REPORT.md]
---

# Standup Meeting Modernization

## Decision
Upgrade `standup-meeting` instead of adding another overlapping project-management skill.

## Why this won
The survey showed that the modern daily-sync problem is not a missing ceremony template. It is a **mode-selection and anti-status-theater problem**:
- teams increasingly choose between board-walk, blocker-first, async, and hybrid standup patterns
- the useful boundary is between **daily coordination** and adjacent skills for planning, estimation, and retrospectives
- most market solutions automate prompts, but they do not teach when to switch modes or how to keep the ritual tied to real work movement

That makes `standup-meeting` a stronger candidate for modernization than creating a new PM skill.

## Accepted changes
- Rewrite `standup-meeting/SKILL.md` around mode selection, routing, and compact Daily Sync Brief output
- Add `references/facilitation-modes.md`
- Add `evals/evals.json`
- Update discovery wording in `README.md`, `README.ko.md`, and `.agent-skills/skills.json`
- Refresh graph outputs so support coverage and PM-cluster structure reflect the upgrade

## Rejected changes
- Adding a separate async-standup skill
- Expanding `standup-meeting` into backlog planning or retrospective territory
- Leaving the skill as a generic three-questions template bundle

## Durable takeaway
In the PM cluster, the next high-leverage upgrades are usually **role clarification plus support coverage**, not more ceremony skills. `standup-meeting` now fits that pattern: it owns daily coordination and routes everything else outward.

## Related pages
- [[project-management-cluster]]
- [[skill-support-coverage]]
- [[task-planning-modernization-2026-04-12]]
