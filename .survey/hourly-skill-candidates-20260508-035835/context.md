# Context: hourly skill candidate survey

## Workflow Context
The run follows open-PR-first policy, then lane discovery with stage-1 and recovery stage-2 queries when needed (provenance: feed recovery).

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Maintainer | merge/release survey guardrails | advanced |
| Contributor | review artifacts and candidate fit | intermediate |

## Current Workarounds
1. Manual lane checks in ad-hoc shell commands (provenance: thin evidence).
2. Repeated PR reruns when checks are missing.

## Adjacent Problems
- Metadata shape drift for license payloads can create false degraded results.
- Lane intent overlap can be too broad without negation guards.

## User Voices
- "Create beautiful slides on the web using Claude's frontend skills" — https://github.com/zarazhangrui/frontend-slides (provenance: indexed snippet)
- "🚀 100 Days of Web Development challenge using HTML, CSS & JavaScript. Daily learning, practice, and real-world projects " — https://github.com/Shubham-cyber-prog/100-Days-Of-Web-Development-ECWoC26 (provenance: indexed snippet)
- "Editable HTML presentation skill for Codex/Claude Code with drag-resize editing, slide reordering, local save/export, an" — https://github.com/archlizheng/frontend-slides-editable (provenance: indexed snippet)
- "Award-winning web design skill for Claude Code. 48 patterns from 38 top websites. Stop generating generic AI frontends." — https://github.com/MickeyAlton33/web-designer-plugin (provenance: indexed snippet)
- "better-web-ui is a web frontend design skill library for AI coding agents." — https://github.com/aladicf/better-web-ui (provenance: indexed snippet)
