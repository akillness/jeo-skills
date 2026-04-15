---
title: Fabric modernization 2026-04-15
created: 2026-04-15
updated: 2026-04-15
type: query
tags: [skills, survey, trigger-design, skill-quality, docs]
sources: [.survey/fabric-modernization-20260415/context.md, .survey/fabric-modernization-20260415/solutions.md, graphify-out/GRAPH_REPORT.md, .agent-skills/fabric/SKILL.md]
---

# Fabric modernization 2026-04-15

## Decision
The best bounded improvement in the utilities / developer-workflow lane was to modernize `fabric` into the **pattern-first CLI transform anchor** instead of leaving it as a broad feature-tour skill or adding another adjacent AI CLI wrapper.

## Why this cleared the bar
- The old skill was README-visible but under-supported: no `references/`, no `evals/`, and weak trigger boundaries.
- Survey evidence showed Fabric's durable value is not generic terminal chat; it is reusable named transforms over stdin/files/transcripts/notes/logs plus custom-pattern maintenance.
- Upstream issue traffic also showed real operator friction around provider config, custom pattern resolution, and CLI surface sprawl, which made a routing-first rewrite more useful than adding more commands.

## Accepted changes
- Rewrote `fabric/SKILL.md` around six explicit modes: `quick-transform`, `pattern-selection`, `custom-pattern`, `shell-pipeline`, `serve-api`, and `migration-review`.
- Added `references/` docs for routing, install/provider setup, and workflow recipes.
- Added `evals/evals.json` covering transcript transforms, custom-pattern creation, and boundary comparison against general LLM CLIs / coding assistants.
- Updated discovery surfaces (`README.md`, `README.ko.md`, `setup-all-skills-prompt.md`, `.agent-skills/skills.json`, `.agent-skills/skills.toon`) so the stronger trigger boundary is visible outside the skill body.
- Refreshed `graphify-out/` so support coverage and structural notes reflect the upgrade.

## Rejected alternatives
- Adding another Fabric-adjacent prompt/pattern wrapper in the utilities lane.
- Positioning Fabric as a general coding assistant or repo-editing agent.
- Treating upstream fetch/scrape/transcript cleanup as if Fabric owned those jobs.

## Durable boundary
- `fabric` owns **reusable pattern-driven transforms** on external text/content.
- Coding assistants own repo-aware implementation work.
- General LLM CLIs own ad hoc prompting where no stable pattern library or repeated workflow is needed.
- Scripts / workflow automation own deterministic multi-step automation where Fabric is only one stage.

## Related pages
- [[developer-workflow-cluster]]
- [[skill-support-coverage]]
