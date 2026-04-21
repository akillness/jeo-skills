# Solution Landscape: Steam marketing skill boundary

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| `steam-store-launch-ops` | Workflow-specific Steam audit/checklist skill | Uses Steam-native language, clear blocker taxonomy, references + evals already present | Limited to Steam/game-launch contexts | Strong niche fit for store page, wishlist, demo, and fest-readiness prompts |
| `marketing-automation` | Canonical broad marketing orchestrator | Already tells users to prefer more specific niche skills such as Steam launch ops | Still broad by design; not ideal for Steam-native audits | Good home for SaaS/web/product marketing requests |
| `marketing-skills-collection` | Legacy/platform-specific marketing catalog variant | Rich internal structure and 23 sub-skill map | Current description is too generic, no evals, missing references section, overlap risk with newer niche skills | Best candidate for boundary tightening instead of another net-new skill |
| Steamworks docs | Primary workflow documentation | High-authority source for store page, marketing tools, and Next Fest operations | Not an agent-ready skill; requires synthesis | Best grounding for Steam workflow reality |
| presskit.gg Steam guides | Secondary practical indie-marketing guidance | Concrete Steam-specific language around wishlist conversion and page optimization | Still external guidance, not a reusable repo skill by itself | Useful for examples and terminology |
| Agent Skills optimization docs | Skill-trigger guidance | Directly addresses reliable triggering and description quality | Abstract; not domain-specific | Useful for improving the legacy skill boundary |

## Categories
- **Niche workflow skill**: `steam-store-launch-ops`
- **General marketing orchestrator**: `marketing-automation`
- **Legacy/compatibility catalog variant**: `marketing-skills-collection`
- **Primary source docs**: Steamworks store page / marketing / Next Fest docs
- **Secondary practice guides**: presskit.gg Steam optimization guide
- **Trigger-quality guidance**: Agent Skills description optimization docs

## What People Actually Use
Within this repo, the practical pattern is already emerging: keep a broad marketing orchestrator for generic CRO/SEO/copy/lifecycle work, and create domain-specific skills when the workflow has its own nouns, artifacts, and failure modes. Steam launch work clearly fits that second bucket because it depends on page structure, capsules, screenshots, trailer hooks, tag fit, demo polish, festival timing, and creator-ready materials. The remaining friction is not a missing Steam skill; it is a broad legacy skill whose trigger boundary was never tightened after the niche Steam skill appeared.

## Frequency Ranking
1. **Steam-specific docs/guides repeatedly emphasize store page, wishlists, tags, screenshots, trailers, demos, and Next Fest as a distinct operating surface.**
2. **The repo now contains one strong Steam-native skill (`steam-store-launch-ops`) and one strong generic marketing orchestrator (`marketing-automation`).**
3. **The most visible catalog weakness is the leftover broad description on `marketing-skills-collection`, not lack of coverage.**

## Key Gaps
- `marketing-skills-collection` still advertises itself too broadly for a repo that now has better-specificity alternatives.
- No evals currently protect the legacy skill's intended trigger boundary.
- The legacy skill lacks a references section even though the validator already warns about it.

## Contradictions
- **Catalog reality**: the repo already recognizes that Steam launch ops is a distinct workflow.
- **Legacy skill wording**: `marketing-skills-collection` still reads like a catch-all marketing trigger.
- **Result**: the repo says “prefer more specific skills” in one place, but leaves another overlapping marketing skill too broad to reliably defer.

## Key Insight
The highest-value improvement this run is not another new marketing skill. It is tightening the legacy `marketing-skills-collection` boundary so that broad marketing requests still have coverage, but Steam-native requests cleanly fall to `steam-store-launch-ops` and other future niche skills. That is a transferable catalog-quality improvement: better routing, less overlap, and less shallow advice.

## Source Notes
- Repo observations came from `.agent-skills/marketing-skills-collection/SKILL.md`, `.agent-skills/marketing-automation/SKILL.md`, `.agent-skills/steam-store-launch-ops/SKILL.md`, and validator output from `.agent-skills/skill-standardization/scripts/validate_skill.sh`.
- External evidence came from direct page retrieval of [Steamworks store page docs](https://partner.steamgames.com/doc/store/page), [Steamworks marketing tools](https://partner.steamgames.com/doc/marketing/tools), [Steam Next Fest docs](https://partner.steamgames.com/doc/marketing/upcoming_events/nextfest), [presskit.gg Steam Page Optimization Guide [2026]](https://presskit.gg/field-guides/steam-page-optimization-guide), and [Agent Skills: Optimizing skill descriptions](https://agentskills.io/skill-creation/optimizing-descriptions).
