---
title: Marketing Automation Structural Hardening 2026-04-18
created: 2026-04-18
updated: 2026-04-18
type: query
tags: [skills, consolidation, trigger-design, skill-quality, survey, docs]
sources:
  - .survey/marketing-automation-structural-hardening-20260418/triage.md
  - .survey/marketing-automation-structural-hardening-20260418/context.md
  - .survey/marketing-automation-structural-hardening-20260418/solutions.md
  - .agent-skills/marketing-automation/SKILL.md
  - graphify-out/GRAPH_REPORT.md
---

# Marketing Automation Structural Hardening

## Summary
The best bounded improvement was to harden `marketing-automation` in place rather than add a new broad marketing wrapper. Survey evidence showed that real operators still split work across launch trackers, template libraries, execution suites, dashboards, and spreadsheets. The missing surface was upstream: deciding which kind of marketing packet should come next.

## Accepted
- Reframed `marketing-automation` around five operating modes: `launch-orchestration`, `conversion-surface`, `lifecycle-retention`, `acquisition-content`, and `measurement-experiment`.
- Kept one-primary-lane and one-packet discipline explicit.
- Added `references/operating-modes-and-route-outs.md`.
- Expanded eval coverage to include lifecycle/retention and specialist game-launch route-out behavior.
- Synced discovery surfaces (`SKILL.toon`, `skills.json`, `skills.toon`, `README.md`, `README.ko.md`, `setup-all-skills-prompt.md`).

## Rejected
- Adding another broad marketing wrapper.
- Letting `marketing-automation` absorb Steam/store launch work already owned by `steam-store-launch-ops`.
- Letting the skill drift into backlog or milestone planning already better owned by `task-planning`.

## Durable Notes
- Template libraries solve packet shape, not packet choice.
- Marketing suites solve execution and reporting, not front-door narrowing.
- Manual spreadsheet/tracker behavior is still a reliable sign that mixed marketing asks need mode selection before channel detail.
- The marketing cluster stays cleaner when the canonical skill owns mode + packet choice and the alias stays lightweight.

## Related Pages
- [[marketing-cluster]]
- [[marketing-skill-canonicalization-2026-04-12]]
- [[marketing-skills-collection-support-hardening-2026-04-16]]
