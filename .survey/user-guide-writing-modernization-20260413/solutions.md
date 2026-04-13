# Solution Landscape: user-guide-writing modernization

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Diátaxis | Documentation-framework split for tutorial / how-to / reference / explanation | Strongest structure signal for keeping doc types separate | Framework only; still needs real product evidence | Best input for mode selection and boundary clarity |
| GitBook / Docusaurus / MkDocs / ReadMe | Docs-site / docs-as-code publishing | Navigation, versioning, reviewable Markdown workflows, search | Publishing platform does not solve user-task clarity by itself | Useful destination surfaces, not sufficient writing guidance |
| Zendesk / Intercom / Help Scout / Document360 / KnowledgeOwl | Help-center / knowledge-base platforms | Search, support deflection, article hosting, analytics | Content design, screenshot upkeep, and release sync remain manual | Strong evidence that support-led docs still need human workflow discipline |
| Scribe / Tango / Loom / Snagit | Capture and visual walkthrough tools | Fast screenshots and step capture | Auto-generated output still needs editing, pruning, and maintenance | Good supporting tactic, not a full writing method |
| Pendo / Appcues / Userpilot / WalkMe / Whatfix | In-app onboarding and product education | Contextual adoption help inside the product | Does not replace durable searchable written docs | Adjacent category, useful boundary reminder |
| Google / Microsoft style guides | Writing guidance and language consistency | Strong task-oriented phrasing and clarity rules | Not product/workflow-specific on their own | Good reference layer for wording and scannability |

## Categories
- **Frameworks for doc mode choice:** Diátaxis, style guides, docs-like-code process guidance
- **Publishing systems:** GitBook, ReadMe, Docusaurus, MkDocs, help-center suites
- **Support-centered knowledge bases:** Zendesk, Intercom, Help Scout, Document360, KnowledgeOwl
- **Capture tools:** Scribe, Tango, Loom, Snagit
- **In-app education alternatives:** Pendo, Appcues, Userpilot, WalkMe, Whatfix

## What People Actually Use
In practice, teams mix systems rather than relying on one tool:
- issue/MR review loops for documentation changes (GitLab)
- help-center analytics and search-term reports to discover missing content (Document360, KnowledgeOwl-style workflows)
- screenshot/video capture tools to accelerate guides, followed by manual cleanup
- release notes, support macros, and product notes as raw inputs that still need rewriting for end users

## Frequency Ranking
1. Help-center / KB suites for hosting and support deflection
2. Docs-site / docs-as-code platforms for durable publishing
3. Capture tools for screenshots and quick walkthroughs
4. In-app onboarding tools for contextual education
5. Writing frameworks/style guides for structure and wording

## Key Gaps
- Publishing platforms solve hosting and search, not the hard part of choosing the right doc mode or boundary.
- Auto-capture tools reduce screenshot labor but not task design, prerequisite handling, or maintenance.
- Release changes still drift away from help-center updates unless someone owns the sync loop.
- Teams need a reusable workflow for distinguishing tutorial vs how-to vs FAQ vs release-help update.

## Contradictions
- Vendors often imply that one docs/help-center surface can cover every documentation job, but the workflow evidence says internal technical docs, API portals, user help, and changelog work remain meaningfully different.
- Automation products market speed, yet the recurring pain is still manual review, screenshot refresh, and scope discipline.

## Key Insight
The best bounded improvement is not adding another docs wrapper. It is turning `user-guide-writing` into the explicit end-user-docs anchor with a small set of modes (`getting-started`, `tutorial`, `how-to`, `faq`, `release-help-update`), clear route-outs to neighboring skills, and maintenance guidance for stale help-center content.

## Sources
- Diátaxis: https://diataxis.fr/
- GitLab documentation workflow: https://docs.gitlab.com/development/documentation/
- Document360 knowledge-base analytics: https://document360.com/blog/knowledge-base-analytics/
- Zendesk help-center product surface: https://www.zendesk.com/service/help-center/
- Google developer documentation style guide: https://developers.google.com/style
- Microsoft Writing Style Guide: https://learn.microsoft.com/style-guide/welcome/
- Scribe: https://scribehow.com/
- Tango: https://www.tango.us/
