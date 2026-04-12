---
title: Sprint Retrospective Modernization
created: 2026-04-12
updated: 2026-04-12
type: query
tags: [skills, survey, trigger-design, skill-quality]
sources: [.survey/sprint-retrospective-modernization-20260412/context.md, .survey/sprint-retrospective-modernization-20260412/solutions.md, graphify-out/GRAPH_REPORT.md]
---

# Sprint Retrospective Modernization

## Decision
Upgrade `sprint-retrospective` instead of adding another overlapping project-management skill.

## Why this won
The survey showed that the modern retrospective problem is not missing template variety. It is a **mode-selection plus follow-through problem**:
- teams now switch between live, async, hybrid, and milestone/postmortem-style retros
- the real workflow starts by reviewing previous actions, not by inventing a fresh board format every time
- the highest-leverage boundary is between **reflection and improvement commitments** versus adjacent planning, sizing, and daily coordination work

That makes `sprint-retrospective` a stronger candidate for modernization than creating a new PM skill.

## Accepted changes
- Rewrite `sprint-retrospective/SKILL.md` around intake classification, mode selection, previous-action review, and compact Retrospective Brief output
- Add `references/facilitation-modes.md`
- Add `evals/evals.json`
- Update discovery wording in `README.md`, `README.ko.md`, and `.agent-skills/skills.json`
- Refresh graph outputs so support coverage and PM-cluster structure reflect the upgrade

## Rejected changes
- Adding a separate async-retro skill
- Expanding `sprint-retrospective` into backlog planning, sizing, or standup redesign
- Leaving the skill as a generic retrospective-template bundle

## Durable takeaway
In the PM cluster, the next high-leverage upgrades are still **role clarification plus support coverage**, not more ceremony skills. `sprint-retrospective` now owns reflection, action follow-through, and milestone/postmortem adaptation while routing planning, estimation, and daily coordination outward.

## Related pages
- [[project-management-cluster]]
- [[skill-support-coverage]]
- [[task-planning-modernization-2026-04-12]]
- [[standup-meeting-modernization-2026-04-12]]
