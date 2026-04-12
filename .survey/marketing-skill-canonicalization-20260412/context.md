# Context: Marketing skill canonicalization

## Workflow Context
Broad product and growth marketing requests usually arrive as loosely scoped asks such as "help with the launch," "improve conversion," or "turn this product update into campaigns, copy, and measurement." In practice, teams use request forms, work-management systems, and template libraries to force those requests into a usable brief before choosing a narrower workflow. The repo's `marketing-automation` / `marketing-skills-collection` pair sits on that same intake surface, so duplicate positioning here creates discovery noise exactly where users expect one clear router.

Direct page retrieval this run confirmed that major workflow vendors position marketing work around centralized request intake and campaign coordination:
- Asana: "Marketing Management Software—Brand, Campaign, & Product Teams" — https://asana.com/teams/marketing
- Airtable: "Marketing Management Software that Aligns Teams & Scales Impact" — https://www.airtable.com/solutions/marketing
- CoSchedule: "a single source of truth for your marketing team" — https://coschedule.com/marketing-suite
- Smartsheet: marketing request form templates for projects/events — https://www.smartsheet.com/content/marketing-request-form-templates
- Notion marketing template catalog for campaign planning, content calendars, SEO tracking, and social management — https://www.notion.so/templates/category/marketing

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Growth / demand gen marketer | Turn broad growth asks into channels, experiments, and measurement | Mixed |
| Product marketer | Translate launches, positioning, and enablement into a concrete packet | Mixed |
| Lifecycle / CRM marketer | Route broad goals into journeys, trigger logic, and success metrics | Mixed |
| Marketing ops / RevOps | Normalize intake, tracking, naming, and reporting | Advanced |
| Founder / PM / sales requester | Initiates "we need marketing help" asks but usually lacks a finished brief | Mixed |
| Skill-catalog maintainer | Needs one canonical general marketing entry point with low-noise aliases | Advanced |

## Current Workarounds
1. Use one general brief or request form to capture KPI, audience, offer, channel, constraints, and deadline.
2. Route the request manually into narrower lanes such as CRO, SEO, lifecycle messaging, pricing, launch planning, or analytics.
3. Keep strategy in docs/Notion, tracking in Sheets/Airtable, approvals in Slack/comments, and execution in CRM / marketing-automation tools.
4. Maintain prompt packs and template libraries because broad AI helpers produce generic output without brand/context scaffolding.
5. Treat a work-management tool as the intake layer even though actual deliverables still require specialist tools and human review.

## Adjacent Problems
- Project intake / request triage
- Launch planning and campaign coordination
- Content and SEO brief production
- CRO / experimentation backlog design
- Analytics and attribution setup
- Cross-functional approvals across product, design, sales, and lifecycle teams
- Prompt/template governance for reusable AI-assisted marketing work

## User Voices
- Vendors repeatedly frame the pain as turning messy marketing requests into structured work packets rather than raw asset generation alone:
  - Asana emphasizes keeping brand, campaign, and product teams aligned on milestones — https://asana.com/teams/marketing
  - Airtable emphasizes balancing workloads and tracking progress from a single platform — https://www.airtable.com/solutions/marketing
  - CoSchedule positions itself as a "single source of truth" for marketing teams — https://coschedule.com/marketing-suite
- Template ecosystems also reflect the same need for structured intake before execution:
  - Smartsheet's request-form library centers marketing projects/events intake — https://www.smartsheet.com/content/marketing-request-form-templates
  - Notion's marketplace foregrounds campaign planning, content calendars, SEO tracking, and social management templates — https://www.notion.so/templates/category/marketing

## Repo-specific context
- `marketing-automation` and `marketing-skills-collection` currently advertise nearly the same 23-sub-skill coverage.
- README, README.ko, setup prompt, and `skills.json` all surface both names side by side with nearly identical descriptions.
- Neither skill currently carries support files (`references/`, `evals/`), so the highest-leverage fix is to make one skill the canonical router and narrow the other into a compatibility alias with explicit boundaries.
