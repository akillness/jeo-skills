---
title: Sprint Retrospective Structural Hardening
created: 2026-04-18
updated: 2026-04-18
type: query
tags: [skills, survey, trigger-design, skill-quality, project-management]
sources: [.survey/sprint-retrospective-structural-hardening-20260418/context.md, .survey/sprint-retrospective-structural-hardening-20260418/solutions.md, graphify-out/GRAPH_REPORT.md]
---

# Sprint Retrospective Structural Hardening

## Decision
Keep `sprint-retrospective` as the PM-cluster reflection anchor and harden it in place instead of adding another ceremony or postmortem wrapper.

## Why this won
The cross-domain opportunity scan still pointed to the PM cluster as the best bounded improvement area once the previous `code-review` PR was merged. Repo-local graph evidence showed `sprint-retrospective` remained on the oversized watchlist at 304 lines, while the wiki already documented a clean role split between planning, estimation, standups, and retros.

External workflow evidence reinforced the same shape:
- Atlassian, Scrum.org, Miro, Parabol, and TeamRetro all frame retrospectives around reflection plus action, but they tend to package the solution as guides or template catalogs.
- Indexed community titles still center on remote participation and how/where to track retro action items, which means the real workflow problem is mode selection and follow-through, not a missing format library.

That made a routing-first hardening pass more valuable than another PM skill.

## Accepted changes
- Shrink `sprint-retrospective/SKILL.md` from 304 lines to 263 lines while keeping the same core job-to-be-done
- Add `references/action-review-and-packet-shapes.md` so slower-changing packet guidance no longer crowds the front door
- Expand `evals/evals.json` with a planning-route near miss to keep the PM-cluster boundary honest
- Refresh `SKILL.toon`, `.agent-skills/skills.json`, `.agent-skills/skills.toon`, `README.md`, `README.ko.md`, and `setup-all-skills-prompt.md`
- Refresh `graphify-out/` so the watchlist and maintenance notes reflect the hardening pass

## Rejected changes
- Adding a separate remote-retro, postmortem, or action-items-only skill
- Expanding `sprint-retrospective` into planning, sizing, or daily-sync redesign
- Treating more retro templates as the main fix for dead action items

## Durable takeaway
In the PM cluster, the next wins still come from shrinking dense front doors and making route-outs more truthful. `sprint-retrospective` should keep owning reflection, mode choice, and follow-through after completed work—not planning, sizing, or daily coordination.

## Related pages
- [[project-management-cluster]]
- [[skill-support-coverage]]
- [[sprint-retrospective-modernization-2026-04-12]]
- [[task-planning-structural-hardening-2026-04-18]]
