---
title: bmad packet ratchet 2026-04-20
created: 2026-04-20
updated: 2026-04-20
type: query
tags: [skills, survey, trigger-design, skill-quality, graphify, docs]
sources: [.survey/bmad-packet-ratchet-20260420/triage.md, .survey/bmad-packet-ratchet-20260420/context.md, .survey/bmad-packet-ratchet-20260420/solutions.md, .survey/bmad-packet-ratchet-20260420/platform-map.md, .agent-skills/bmad/SKILL.md, graphify-out/GRAPH_REPORT.md]
---

# bmad packet ratchet 2026-04-20

## Question
What is the best bounded next improvement for `bmad` after the earlier modernization pass?

## Answer
Tighten `bmad` into a **packet-first BMAD front door**. Instead of presenting mostly as a phase router, it should start from the packet already in hand—idea notes, product brief, PRD, architecture draft, review feedback, existing repo state, or milestone pressure—then choose one next artifact or gate and route runtime/review/task/game detail outward sooner.

## Accepted changes
- Rewrote `.agent-skills/bmad/SKILL.md` around one-primary-packet intake, brownfield-resume handling, one-next-artifact selection, and earlier route-outs.
- Added `references/intake-packets-and-route-outs.md` and updated `references/core-routing.md` so the packet-first contract is explicit.
- Expanded `evals/evals.json` with packet-aware assertions and a brownfield mixed-state boundary case.
- Synced discovery surfaces: `SKILL.toon`, `.agent-skills/skills.json`, `.agent-skills/skills.toon`, `README.md`, `README.ko.md`, `setup-all-skills-prompt.md`, and `docs/bmad/README.md`.
- Fixed a live residue bug in `.agent-skills/jeo/scripts/install.sh` so BMAD setup now points at `.agent-skills/bmad/SKILL.md` instead of the stale `bmad-orchestrator` path.
- Refreshed `graphify-out/` to capture the packet-first boundary and note the remaining legacy naming residue as a later bounded cleanup.

## Rejected changes
- Adding another BMAD-adjacent wrapper skill.
- Re-expanding `bmad` into a command catalog or runtime setup guide.
- Pulling `bmad-idea`, `plannotator`, `task-planning`, runtime overlays, or `bmad-gds` back into the common BMAD layer.
- Turning this run into a repo-wide `bmad-orchestrator` documentation migration.

## Why this should stick
The surrounding cluster already moved toward packet-first front doors (`bmad-idea`, `task-planning`, `bmad-gds`, `jeo`). Upstream BMAD evidence also showed that real users often arrive from brownfield repo state, review feedback, or mixed artifacts rather than clean phase language. This ratchet matches the durable repo pattern: keep the front door small, truthful, and transferable; push slow-changing detail into references and neighboring specialists.

## Links
- [[bmad-modernization-2026-04-15]]
- [[core-orchestration-platform-cluster]]
- [[task-planning-packet-ratchet-2026-04-20]]
- [[skill-support-coverage]]
