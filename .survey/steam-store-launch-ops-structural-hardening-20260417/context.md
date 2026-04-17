# Context: steam-store-launch-ops structural hardening

## Workflow Context
Steam store-page / wishlist / Next Fest / launch-ops requests show up in four repeatable moments: when a team first publishes a Coming Soon page, when traffic arrives but wishlist conversion feels weak, when a demo/event beat like Steam Next Fest compresses readiness work into a short window, and when launch-adjacent operational steps become risky because nobody owns them end to end. Official Steamworks docs split these concerns across Coming Soon, Demos, Next Fest, trailer, wishlist, and release-process pages, but small teams experience them as one timeline rather than separate docs.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Solo developer | Owns Steam page, assets, demo timing, and launch checklist personally | Mixed |
| Small-studio founder or producer | Coordinates page readiness, demo/event timing, and launch operations across a tiny team | Intermediate |
| Founder-marketer / publishing helper | Watches wishlist conversion, page promise, trailer/capsule quality, and creator readiness | Intermediate |
| External consultant / contractor | Audits the Steam page and returns a concise action brief instead of generic marketing theory | Advanced |

## Current Workarounds
1. Manual page audits against successful peers in the same genre.
2. Wishlist trend watching as a rough diagnostic proxy, even though the number compresses traffic, promise, proof, and timing into one metric.
3. Ad hoc Next Fest and launch checklists in Google Sheets, Notion, or docs.
4. Festival/demo iteration as a substitute for a cleaner launch-readiness model.
5. Community or consultant feedback loops for capsules, screenshots, trailers, and tags.

## Adjacent Problems
- Positioning / marketability diagnosis rather than page operations.
- Trailer, capsule, screenshot, or copy production work.
- Demo UX/onboarding quality and playtest synthesis.
- Creator outreach / PR execution and traffic generation.
- Broader release-timing, pricing, and launch-strategy decisions.

## User Voices
- Teams treat the Coming Soon page and early wishlist growth as an early referendum on whether the game resonates at all.
- Steam Next Fest is experienced as a readiness test for the page, the demo, and the ops plan, not just a visibility gift.
- Small teams repeatedly ask some version of: "We have a page, maybe a demo, and some traffic — is the problem our assets, our positioning, our event readiness, or our launch process?"

## Sources
- Steamworks Documentation — Coming Soon: https://partner.steamgames.com/doc/store/coming_soon
- Steamworks Documentation — Steam Next Fest: https://partner.steamgames.com/doc/marketing/upcoming_events/nextfest
- Steamworks Documentation — Demos: https://partner.steamgames.com/doc/store/application/demos
- Direct page retrieval verified titles for the Steamworks sources in this run via Python `urllib` with browser-like User-Agent.
- Additional context links used as unverified-in-run references because the web search/extract API returned `401 INVALID_API_KEY`: https://howtomarketagame.com/ , https://newsletter.gamediscover.co/
