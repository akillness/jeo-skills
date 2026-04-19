# Solution Landscape: steam-store-launch-ops

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Steamworks docs + native surfaces | Authoritative Steam-native guidance and controls | Source-of-truth for Coming Soon, visibility, demos, Next Fest, release | Fragmented across many pages and controls | Every other solution wraps or supplements this |
| presskit.gg | Guides, calculators, asset helpers, templates | Fast page and launch checklist help | Can stay advisory and shallow without evidence | Strong for page audit and launch packets |
| PitchWall | Steam page analyzer | Concrete capsule/screenshots/tags/descriptions review | Does not solve traffic acquisition | Best as page-promise evidence aid |
| Wishlist Pulse | Self-hosted wishlist alerting | Reduces manual Steamworks refreshing; useful for beat monitoring | Bounded by Steam update cadence; self-hosted friction | Evidence support, not a diagnosis itself |
| GAMEDATA.wtf | Public wishlist analytics / tracking | Competitive and trend visibility | Public estimates cannot replace private ground truth | Useful for contextual signal only |
| IMPRESS | Next Fest and launch marketing tooling | Bundles checklists, creator/press helpers, calculators | Can bias toward toolkit usage over readiness truth | Strong adjacent route-out for outreach ops |
| GameOutreach | Festival calendar / reminders | Helps with event timing and deadline planning | Calendar help cannot judge demo quality | Good for timing-workback support |
| PressKitHub / Lurkit / PressEngine / GamesPress | Press kit, creator discovery, key distribution, coverage workflows | Useful adjacent creator/outreach ops surfaces | Still require fit, vetting, and human follow-through | Better as route-outs than core skill ownership |

## Categories
- Steam-native source-of-truth: Steamworks docs, wishlist reporting, Next Fest registration, release process
- Page-promise optimization: page guides, analyzers, capsule/tag helpers
- Wishlist signal tooling: alerting, analytics, scenario calculators
- Event timing and Next Fest planning: readiness checklists, calendars, leaderboards
- Launch checklist packets: workbacks, ownership checklists, fact-sheet helpers
- Creator / press operations: hosted press kits, creator discovery, keys, coverage tracking

## What People Actually Use
In practice, teams combine Steam-native docs and manual Steamworks flows with external page analyzers, wishlist trackers, checklists, calendars, and creator outreach stacks. No single tool owns the full workflow; operators stitch together page review, demo timing, event planning, and outreach manually.

## Frequency Ranking
1. Creator / press / outreach ops
2. Checklist / Next Fest planning
3. Steam page optimization / audit
4. Wishlist tracking / forecasting
5. Managed service overlays

## Key Gaps
- No common solution cleanly separates weak wishlist complaints into traffic, promise, proof, timing, or ops before prescribing action.
- External tools are good at one surface each but poor at cross-surface timing judgment.
- Creator/outreach stacks solve packaging and contact flow, not whether the Steam beat itself is well chosen.
- Wishlist tools encourage monitoring, but not necessarily diagnosis.

## Contradictions
- Many teams treat wishlists like a universal algorithmic visibility input, while Steam explicitly says they only affect limited surfaces directly and are often overinterpreted outside those cases. (<https://partner.steamgames.com/doc/marketing/visibility>)
- Festival and demo folklore often recommends shadow-dropping demos or launching right after Next Fest for “momentum,” while community analysis argues those are unreliable defaults. (<https://howtomarketagame.com/2026/04/13/making-sense-of-the-february-2026-steam-next-fest/>, <https://howtomarketagame.com/2026/02/18/the-counterintuitive-advantage-of-launching-during-steams-busiest-event/>)

## Key Insight
The market does not point to a missing new Steam-marketing category; it points to a missing diagnostic router between fragmented tools. The best repo move is to keep `steam-store-launch-ops` as the single Steam-specific front door, but tighten it into clearer packet selection and route-outs instead of letting it behave like a broad checklist or generic marketing wrapper.
