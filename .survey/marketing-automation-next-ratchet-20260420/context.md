# Context: marketing-automation next ratchet

## Workflow Context
Broad marketing asks still arrive as mixed packets: launch sequencing, pricing/landing-page conversion, onboarding/lifecycle fixes, content/SEO planning, and measurement confusion often show up in the same request. Official tool pages reinforce this split: Asana frames launch work around milestones, partner coordination, dashboards, and templates rather than one universal marketing plan; Notion's marketplace exposes separate template categories such as Product Launch Plan, Marketing Strategy Doc, Campaign Brief, Content Calendar, and Social Media; HubSpot packages cross-channel execution and reporting once the operator already knows the motion to run.

This means the durable job for `marketing-automation` is still front-door routing: choose one operating mode, one primary lane, and one packet before execution sprawls into channel soup.

Sources:
- [Asana Product Launch](https://asana.com/uses/product-launch)
- [Notion Marketing Templates](https://www.notion.com/templates/category/marketing)
- [HubSpot Marketing Hub](https://www.hubspot.com/products/marketing)
- `.agent-skills/marketing-automation/SKILL.md`
- `.agent-skills-wiki/concepts/marketing-cluster.md`

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Founder / solo operator | Turn a messy GTM or launch ask into one next brief and KPI handoff | Mixed |
| PMM / growth lead | Choose whether the real bottleneck is launch sequencing, CRO, lifecycle, acquisition, or measurement | Intermediate to advanced |
| Lifecycle / CRM owner | Convert activation or retention pain into one journey or campaign packet | Intermediate |
| Cross-functional operator | Coordinate copy, design, product, analytics, and launch dependencies across multiple tools | Mixed |
| Repo maintainer / agent user | Keep the broad marketing skill honest about adjacent boundaries and realistic handoffs | Advanced |

## Current Workarounds
1. **Launch/project tracker first, specialist tools second.** Teams coordinate the launch in project tools, docs, or templates, then hand work to email, ad, analytics, or content systems later.
   - Limits: encourages status tracking before a clear primary lane or packet exists.
2. **Template-marketplace selection after the fact.** Operators pick a Product Launch Plan, Campaign Brief, or Content Calendar once the ask is already messy.
   - Limits: the template choice often substitutes for diagnosis.
3. **Execution suite as downstream owner.** HubSpot/Braze/Iterable/Customer.io are used after the team already knows the motion, audience, and channel.
   - Limits: these systems execute; they do not reliably decide whether the ask is really launch, lifecycle, SEO, CRO, or analytics.
4. **Spreadsheet / tracker / manual dashboard layer.** Even when suites exist, operators still rely on shared docs, launch sheets, KPI trackers, and weekly readouts.
   - Limits: manual coordination absorbs proof, approvals, and ownership drift.

## Adjacent Problems
- **Planning boundary:** if the bottleneck is backlog shaping, milestone slicing, or execution sequencing, the work belongs to `task-planning`, not broad marketing routing.
- **Game-launch boundary:** if the ask is about Steam wishlists, capsules, Next Fest, demos, Coming Soon timing, or release-process constraints, the work belongs to `steam-store-launch-ops`.
- **Execution-suite boundary:** lifecycle, CRM, and campaign tools still require a clear packet, owner, and KPI handoff; they do not remove the front-door routing job.
- **Measurement drift:** attribution, reporting, and KPI ownership are often attached late, which turns a routing problem into a dashboard scramble.

Sources:
- [Atlassian backlog refinement](https://www.atlassian.com/agile/scrum/backlog-refinement)
- [Atlassian sprint planning](https://www.atlassian.com/agile/scrum/sprint-planning)
- [GitHub Projects](https://docs.github.com/en/issues/planning-and-tracking-with-projects/learning-about-projects/about-projects)
- [Steamworks Sales & Marketing](https://partner.steamgames.com/doc/marketing)
- [Steamworks Coming Soon](https://partner.steamgames.com/doc/store/coming_soon)
- [Steamworks Demos](https://partner.steamgames.com/doc/store/application/demos)
- [Steamworks Next Fest](https://partner.steamgames.com/doc/marketing/upcoming_events/nextfest)
- `.agent-skills/task-planning/SKILL.md`
- `.agent-skills/steam-store-launch-ops/SKILL.md`

## User Voices
> “If you're developing a product, it's not the same as developing the advertising. We needed a tool that could adjust, and Asana was the perfect transformation from spreadsheets and all the work they had created.” — Parfums Christian Dior case study on Asana product launch page  
Source: [Asana Product Launch](https://asana.com/uses/product-launch)

> “Marketing templates … designed for campaign planning, content calendars, SEO tracking, and social media management.”  
Source: [Notion Marketing Templates](https://www.notion.com/templates/category/marketing)

> “AI-powered tools to help you attract, convert, and engage high-intent visitors.” / “launch cross-channel campaigns.”  
Source: [HubSpot Marketing Hub](https://www.hubspot.com/products/marketing)

> “Marketing Analytics: Fancy dashboards, but Excel rules?”  
Source: indexed practitioner evidence preserved in `.survey/marketing-automation-structural-hardening-20260418/context.md`

> “Any good templates for managing a marketing department …”  
Source: indexed practitioner evidence preserved in `.survey/marketing-automation-structural-hardening-20260418/context.md`

## Actual behavior summary
What people actually use is still a human-readable control packet plus tool-specific execution: brief/checklist/owner table in docs or work-management tools, execution in MAP/CRM/ad/CMS systems, and proof stitched together later in dashboards or spreadsheets. The next ratchet should preserve that reality instead of pretending the stack itself is the packet.
