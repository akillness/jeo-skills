# Context: Steam marketing skill boundary

## Workflow Context
A recurring catalog-maintenance problem in `.agent-skills` is not just missing skills; it is overlap between old broad skills and newer workflow-specific ones. In this repo, `marketing-skills-collection` still presents itself as a generic 23-sub-skill marketing surface, while `steam-store-launch-ops` now covers Steam-native launch workflows such as store-page audits, wishlist triage, capsule/trailer/tag review, and Next Fest/demo readiness. Primary-source Steam documentation and current Steam-focused guidance both emphasize that Steam launch work is its own operational workflow rather than generic launch copywriting.

Evidence gathered this run:
- `steam-store-launch-ops` already contains Steam-native scopes such as `store-page-audit`, `wishlist-funnel-triage`, `demo-fest-readiness`, and `launch-checklist`.
- `marketing-skills-collection` still uses a broad legacy description (`Generate marketing deliverables across CRO, copywriting, SEO, analytics, and growth...`) and currently has no evals.
- Repo validator baseline for `marketing-skills-collection` returned 0 errors but 2 warnings: imperative phrasing is weak and `## References` is missing.
- Direct page retrieval from Steamworks surfaced official pages specifically for Store Page editing, Marketing tools, and Steam Next Fest.
- Direct page retrieval from presskit.gg surfaced a dedicated 2026 Steam page optimization guide focused on converting browsers into wishlists and buyers.
- Direct page retrieval from Agent Skills surfaced guidance that descriptions should be optimized so a skill triggers reliably on relevant prompts.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Repo maintainer | Keep the catalog coherent and low-noise | Advanced |
| General-purpose coding agent | Pick the right skill from overlapping marketing entries | Intermediate |
| Indie developer / small studio helper | Ask for Steam page, wishlist, demo, or launch help in natural language | Mixed |
| Product/growth operator | Ask for generic SaaS/web marketing outputs without game-specific baggage | Intermediate |

## Current Workarounds
1. Keep both broad and niche skills, but rely on human intuition to pick the right one.
   - Limitation: activation collisions stay hidden until a vague request lands on the wrong skill.
2. Put a note inside the generic skill saying a more specific skill is preferred.
   - Limitation: if the frontmatter description is still broad, trigger quality can still be noisy.
3. Add more niche skills without tightening the older generic ones.
   - Limitation: catalog coverage improves, but routing quality degrades.
4. Solve the problem socially during maintenance runs instead of encoding clearer boundaries.
   - Limitation: the same ambiguity returns next run.

## Adjacent Problems
- Duplicate or legacy skills can keep broad descriptions long after a more specific skill exists.
- Missing evals make it harder to freeze a trigger-quality baseline for future maintenance loops.
- Platform-specific variants can drift from the canonical general skill and become accidental collision magnets.
- Game-marketing requests often contain domain nouns (`Steam page`, `wishlists`, `Next Fest`, `capsule`) that deserve explicit routing rather than being flattened into general launch marketing.

## User Voices
- “Everything you need to know about optimizing your Steam store page to convert browsers into wishlists and buyers.” — [presskit.gg, Steam Page Optimization Guide [2026]](https://presskit.gg/field-guides/steam-page-optimization-guide)
- “How to improve your skill's description so it triggers reliably on relevant prompts.” — [Agent Skills, Optimizing skill descriptions](https://agentskills.io/skill-creation/optimizing-descriptions)
- Official workflow surfaces recovered directly this run: [Store Page, Building and Editing](https://partner.steamgames.com/doc/store/page), [Features And Tools, Marketing](https://partner.steamgames.com/doc/marketing/tools), and [Steam Next Fest](https://partner.steamgames.com/doc/marketing/upcoming_events/nextfest).

## Source Notes
- Web search API returned `401 Invalid API key`, so this survey used direct page retrieval with a browser-like User-Agent and repo inspection.
- Evidence confidence: high for repo-state observations and retrieved page titles/snippets; medium for broader market-frequency claims because no community/forum lane was live-verified this run.
