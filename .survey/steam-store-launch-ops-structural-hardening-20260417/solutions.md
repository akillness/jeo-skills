# Solution Landscape: steam-store-launch-ops structural hardening

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Steamworks docs | Official platform guidance | Canonical rules for store pages, demos, events, reviews, and release steps | Fragmented, procedural, weak on prioritization | Baseline source every team uses |
| How To Market A Game | Expert guide / training / consulting ecosystem | Strong Steam-specific heuristics for wishlists, positioning, and Next Fest | Advice-heavy, genre-sensitive, not a reusable ops packet by itself | Common indie reference layer |
| GameDiscoverCo | Market-intel / newsletter analysis | Great for launch timing, market context, and genre/discoverability framing | More strategic than operational; some content paywalled | Useful context, not a workflow system |
| SteamDB | Competitive storefront reconnaissance | Fast metadata and competitor observation | Not a conversion or readiness auditor | Supports audits indirectly |
| VG Insights | Market analytics / comp research | Helpful for sizing genre demand and peer comparisons | Not a store-page conversion tool | Strategy support layer |
| Internal sheets / Notion checklists | Lightweight ops coordination | Cheap, flexible, good for ownership and timing | Drift-prone, inconsistent, weak strategic guidance | The most persistent real-world workaround |
| Consultants / agencies | Hands-on audits and launch plans | High-touch, fast judgment, tailored feedback | Expensive, variable quality, often not codified | Good for funded or high-pressure launches |
| Community feedback hubs | Reddit / Discord / peers | Fast anecdotal feedback on page assets and festivals | Noisy, contradictory, low institutional memory | Often the default free option |

## Categories
- Official platform guidance
- Expert guides and consulting ecosystems
- Market-intelligence and competitor-research tools
- Internal checklist / spreadsheet operations
- Community feedback loops

## What People Actually Use
Teams usually combine Steamworks for platform actions, one or more guide/consulting sources for heuristics, SteamDB/VG Insights for context, and homemade spreadsheets or docs for the real launch timeline. The workflow reality is multi-tool and manual.

## Frequency Ranking
1. Steamworks docs
2. Internal spreadsheets / checklists
3. How To Market A Game-style guidance
4. Community advice and peer review
5. SteamDB / competitor teardown workflows
6. GameDiscoverCo / market-intel context
7. Consultants / agencies
8. VG Insights / analytics add-ons

## Key Gaps
- No single surface joins store-page critique, wishlist diagnosis, demo proof, event timing, and launch-ops preflight into one bounded decision model.
- Teams still need a lightweight way to say "this is a visibility problem" vs "this is a proof/demo problem" vs "this is an ops/timing problem."
- Existing docs/checklists rarely tell the user which next artifact to produce first.

## Contradictions
- Vendor / guide language often frames Steam launch work as page optimization plus event participation, but real teams still rely on spreadsheets and manual annotation because the decisive context lives outside Steamworks.
- Wishlist advice sounds data-driven, yet the underlying diagnosis is frequently qualitative and event-dependent.

## Key Insight
The market does not need another broad indie-marketing wrapper here. It needs a tighter Steam-specific router that identifies the user’s real bottleneck — visibility, promise clarity, proof/demo readiness, event timing, or launch-ops readiness — and then emits one concrete next artifact rather than a generalized marketing sermon.

## Curated Sources
- Steamworks Documentation — Store Page / Coming Soon / Release / Demos / Next Fest
- SteamDB — https://steamdb.info/
- VG Insights — https://vginsights.com/
- How To Market A Game — https://howtomarketagame.com/
- GameDiscoverCo — https://newsletter.gamediscover.co/

## Research Notes
- Direct page retrieval was completed for the Steamworks docs in this run.
- External guide/community references are included as source links, but live search/extract verification was blocked because the web tool API key returned `401 INVALID_API_KEY`.
