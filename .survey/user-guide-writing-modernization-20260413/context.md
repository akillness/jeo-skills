# Context: user-guide-writing modernization

## Workflow Context
User-facing guides show up at recurring seams in product work: onboarding, first-success activation, help-center support deflection, release-driven UI changes, and recurring "how do I do this?" moments. The strongest direct patterns from this run's source recovery are:
- Diátaxis explicitly separates tutorials, how-to guides, and explanation/reference modes instead of treating all docs as one blob: https://diataxis.fr/
- GitLab's documentation workflow shows user docs living inside issue/MR review loops with explicit reviewer and documentation process discipline rather than being magically generated from product work: https://docs.gitlab.com/development/documentation/
- Document360's analytics guidance centers on search, content performance, and finding gaps in the knowledge base after publishing, which reinforces that maintenance is part of the job: https://document360.com/blog/knowledge-base-analytics/
- Zendesk's help-center product positioning shows how strongly user guides are tied to self-service support, even when the actual writing and upkeep stay manual: https://www.zendesk.com/service/help-center/

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Technical writer / docs owner | Structure guides, tutorials, FAQs, and help-center content | Medium to high |
| Product manager / product education owner | Supply context, launch timing, and learning goals | Medium |
| Support / customer success | Convert repeated questions into reusable public docs | Medium |
| SME (engineer / designer / ops lead) | Verify workflow accuracy, constraints, and edge cases | Medium to high |
| End users / admins | Follow the guide to complete a real task | Mixed |

## Current Workarounds
1. Support teams turn repeated tickets and macros into ad-hoc articles after the pain is already obvious.
2. Product or SME notes get dumped into Google Docs / Notion / issue comments, then a docs owner cleans them up later.
3. Teams lean on screenshots, Looms, Scribe/Tango captures, or tours when the written guide is weak, then still need a durable text version later.
4. Release notes and UI changes land before the matching help-center article is refreshed, so users hit stale steps and mismatched screenshots.
5. Search reports and analytics reveal missing docs, but someone still has to manually synthesize the signal into a rewrite backlog.

## Adjacent Problems
- Ownership ambiguity after launch: the product ships, but nobody clearly owns the doc refresh.
- Screenshot rot and UI drift after even small navigation or labeling changes.
- Plan / role / permission differences that make one set of steps invalid for part of the audience.
- Search and information-architecture issues that hide otherwise good content.
- Cross-surface drift between tutorials, FAQs, release updates, and support macros.
- Review bottlenecks when SMEs must verify product accuracy before publishing.

## User Voices
Direct community quotes were thin in this run because the standard web search/extract tools returned 401 errors and the direct-fetch fallback was used instead. Even so, the consistent complaint pattern across documentation/help-center practice is clear:
- users hit guides that no longer match the UI
- prerequisites and role assumptions are buried too late
- tutorials try to do onboarding, reference, troubleshooting, and release notes all at once
- support answers live privately while public docs lag behind

## Sources
- Diátaxis: https://diataxis.fr/
- GitLab documentation workflow: https://docs.gitlab.com/development/documentation/
- Document360 knowledge-base analytics: https://document360.com/blog/knowledge-base-analytics/
- Zendesk help-center product surface: https://www.zendesk.com/service/help-center/
- Pendo on customer education / adoption context: https://www.pendo.io/pendo-blog/customer-education-is-a-product-growth-strategy/
- Intercom on education/product-learning context: https://www.intercom.com/blog/announcing-education-series/
