# Solution Landscape: Marketing skill canonicalization

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| HubSpot Marketing Hub | CRM-centered marketing suite | Strong lifecycle + campaign execution hub | Becomes suite gravity; broad but not specialist-deep everywhere | Direct retrieval: https://www.hubspot.com/products/marketing |
| Jasper | General AI marketing copilot | Fast drafts across copy, campaigns, and briefs | Generic output without context; weak measurement grounding | Direct retrieval: https://www.jasper.ai/ |
| Copy.ai | GTM / AI content workflow helper | Broad marketing/GTM entry surface | Tends toward broad-but-shallow orchestration | Direct retrieval: https://www.copy.ai/ |
| Asana / ClickUp / Airtable / CoSchedule | Work-management orchestration layer | Strong intake, coordination, and ownership | Process layer only; still needs specialist deliverables underneath | Direct retrieval: https://asana.com/teams/marketing ; https://clickup.com/teams/marketing ; https://www.airtable.com/solutions/marketing ; https://coschedule.com/marketing-suite |
| Notion / template libraries | Template-led marketing OS | Cheap, flexible, good for reusable briefs and prompt packs | Static unless disciplined; weak enforcement | Direct retrieval: https://www.notion.so/templates/category/marketing |
| Smartsheet request forms | Intake template layer | Forces minimum structure for ambiguous requests | Not a reusable strategy / routing brain on its own | Direct retrieval: https://www.smartsheet.com/content/marketing-request-form-templates |
| Braze / Iterable / Customer.io | Lifecycle execution suites | Strong downstream journey/channel execution | Not broad front-door planning tools | Direct retrieval: https://www.braze.com/ ; https://iterable.com/ ; https://customer.io/ |
| Repo pair: `marketing-automation` + `marketing-skills-collection` | Skill-catalog router for broad marketing asks | Already covers the right broad lane conceptually | Duplicate naming + no support coverage + noisy discovery | Local repo evidence |

## Categories
- **Broad AI copilots:** Jasper, Copy.ai, Writer-style helpers
- **Marketing work orchestration / operating systems:** Asana, ClickUp, Airtable, CoSchedule, Monday-like tools
- **Template-led systems:** Notion templates, Smartsheet forms, prompt libraries
- **Execution-layer suites:** HubSpot, Braze, Iterable, Customer.io
- **Repo-level routing layer:** `marketing-automation` as canonical candidate, `marketing-skills-collection` as legacy-compatible alias candidate

## What People Actually Use
The durable pattern is not one perfect all-in-one system. Teams usually combine:
- a work-management or template layer to structure intake,
- an AI drafting layer for first-pass output,
- specialist execution tools for lifecycle / CRM / analytics,
- and human review to preserve audience fit, proof, measurement, and brand voice.

That argues for a repo skill shaped as a **router + scaffold** rather than a vague mega-skill. The canonical skill should turn a broad marketing ask into one KPI, one sub-skill lane, one output packet, and one measurement / handoff checklist.

## Frequency Ranking
1. **Docs / template layer + human routing** — briefs, campaign docs, request forms, prompt libraries
2. **Work-management platform as intake/orchestration layer** — Asana, Airtable, ClickUp, CoSchedule
3. **AI marketing copilot for first drafts** — Jasper, Copy.ai, general LLM prompting
4. **Execution suites for downstream delivery** — HubSpot, Braze, Iterable, Customer.io
5. **Repo-local skill router** — valuable only if the entry point is singular and clearly bounded

## Key Gaps
- Broad helpers are common, but they often stop at generic advice instead of producing an implementation-ready packet.
- Template ecosystems show strong demand for structured intake, but weak enforcement of specialist routing and measurement.
- The repo currently mirrors that gap: it has the right broad category, but splits it across two near-duplicates without evals or reference docs.

## Contradictions
- Marketed claim: one tool can be the single source of truth for marketing.
- User reality: teams still split work across docs, sheets, work-management tools, CRM/lifecycle platforms, analytics, and AI prompts.
- Repo analogue: two skill names both claim the same general lane, which dilutes rather than clarifies the front door.

## Key Insight
The best reusable shape for this lane is not another expansive marketing mega-skill. It is a **canonical general marketing router** that accepts broad requests, normalizes them into a brief, picks one sub-skill lane, and leaves a measurement-aware handoff. That makes `marketing-automation` the best canonical anchor, while `marketing-skills-collection` should survive only as a low-noise compatibility alias for legacy references.

## Curated Sources
- https://asana.com/teams/marketing
- https://clickup.com/teams/marketing
- https://www.airtable.com/solutions/marketing
- https://coschedule.com/marketing-suite
- https://www.notion.so/templates/category/marketing
- https://www.smartsheet.com/content/marketing-request-form-templates
- https://www.hubspot.com/products/marketing
- https://www.jasper.ai/
- https://www.copy.ai/
- https://www.braze.com/
- https://iterable.com/
- https://customer.io/
