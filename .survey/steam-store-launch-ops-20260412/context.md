# Context: steam-store-launch-ops

## Workflow Context
Steam launch prep is not just "write better marketing copy." It is an operational workflow that combines store-page conversion, asset packaging, demo quality, festival timing, creator outreach, and launch sequencing. Direct page retrieval from Steamworks and current field guides shows the recurring surfaces: store-page assets and copy, tags, trailers, demo setup, wishlist reporting, festival readiness, and creator/press prep.

Primary evidence:
- Steamworks docs on [Store Page, Building and Editing](https://partner.steamgames.com/doc/store/page) and [Marketing tools](https://partner.steamgames.com/doc/marketing/tools) mention store pages, trailers, demos, tags, wishlist reporting, visibility rounds, and UTM analytics.
- presskit.gg's [Steam Page Optimization Guide](https://presskit.gg/field-guides/steam-page-optimization-guide) explicitly frames the goal as converting browsers into wishlists and buyers.
- presskit.gg's [Steam Next Fest Complete Guide](https://presskit.gg/field-guides/steam-next-fest-guide) describes a week-by-week prep timeline with demo strategy, store-page optimization, creator outreach, and livestream prep.
- IMPRESS's [Steam Next Fest Marketing Checklist & Tools](https://impress.games/steam-next-fest-game-marketing-ready) emphasizes last-mile ops such as updating screenshots/trailers/copy, checking links, localizing the page, and setting up broadcast/livestream materials.
- How To Market A Game's [10 Step Plan](https://howtomarketagame.com/2021/07/12/how-to-market-your-indie-game-a-10-step-plan/) treats wishlists as the center of the funnel and ties them to festivals, press, streamers, and social distribution.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Solo indie dev | Build the game and also manage page copy, assets, demo timing, and launch sequencing | Beginner to intermediate |
| Small studio founder | Coordinate page quality, festival deadlines, and launch readiness across a tiny team | Intermediate |
| Publisher / marketing contractor | Audit a game's Steam page, wishlist funnel, and fest readiness before spend or outreach | Intermediate to advanced |
| Community / bizops helper | Track creator outreach, wishlist momentum, and external links/checklists around launch windows | Beginner to intermediate |

## Current Workarounds
1. Piece together advice from Steamworks docs, Chris Zukowski / How To Market A Game posts, Next Fest guides, and agency/blog checklists.
   - Limitation: high-information but fragmented; hard to turn into a single reusable workflow.
2. Use general marketing or launch-plan skills.
   - Limitation: these usually target SaaS/web funnels, not Steam-specific concerns like tags, capsule hierarchy, demo timing, or Next Fest requirements.
3. Rely on tool-specific point solutions.
   - Limitation: capsule graders, press-kit tools, and analytics helpers solve one slice, not the whole operating checklist.
4. Ask Reddit/Discord communities for page feedback.
   - Limitation: useful but unstructured; feedback quality depends on audience and often lacks a repeatable audit scaffold.

## Adjacent Problems
- Trailer and capsule quality are tightly coupled to store-page conversion.
- Tag choice affects algorithm placement and "More Like This" adjacency, not just metadata hygiene.
- Demo quality and timing influence whether Next Fest helps or hurts.
- Creator/press outreach is often treated as a separate workflow even though it depends on page readiness.
- Wishlist counts are used as a planning signal, but teams still need a launch-prep checklist that translates signals into actions.

## User Voices
> "Steam Fest is NOT for proving early builds. It's for impressing your players with the quality & depth of your game. You can only do it once."  
Source: PullPush API submission recovery for Reddit post [Steam Next Fest Checklist: 10 things to plan ahead](https://www.reddit.com/r/gamedev/comments/10pzxky/steam_next_fest_checklist_10_things_to_plan_ahead/) (`high` confidence for title + post text recovery).

> "I had no idea how to do a proper launch back then. Result? 50..."  
Source: PullPush API submission recovery for Reddit post [How My Indie Game Hit 10k Wishlists: The Power of Demos, Festivals, and YouTube – A Postmortem](https://www.reddit.com/r/gamedev/comments/1g2orgj/how_my_indie_game_hit_10k_wishlists_the_power_of/) (`high` confidence for title + post text recovery).

> "...considering only organic traffic and without promoting it to anyone, i've garnered only 20 wishlists..."  
Source: PullPush API submission recovery for Reddit post [A discussion about Steam wishlists and marketing for your indie game](https://www.reddit.com/r/gamedev/comments/16sy4z7/a_discussion_about_steam_wishlists_and_marketing/) (`high` confidence for title + post text recovery).

> "Everything I know now, I learned while developing my game and doing the Steam page."  
Source: PullPush API submission recovery for Reddit post [How I Reached 5,000 Wishlists for My First Game on Steam in 6 Months](https://www.reddit.com/r/gamedev/comments/1dlj3w5/how_i_reached_5000_wishlists_for_my_first_game_on/) (`high` confidence for title + post text recovery).
