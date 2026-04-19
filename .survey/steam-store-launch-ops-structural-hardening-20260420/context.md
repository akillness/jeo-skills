# Context: steam-store-launch-ops

## Workflow Context
Steam launch work behaves like one connected operator timeline rather than separate unrelated asks: publish or refresh the Coming Soon page, interpret weak wishlist signals, decide whether the demo is strong enough for public exposure, decide whether a festival beat like Next Fest is worth spending now, then execute launch timing and creator/store asset coordination. Steam’s own docs split these concerns across Coming Soon, Visibility, Demos, Next Fest, Trailers, and Release Process pages, so teams routinely need one diagnostic layer that reconnects them. The most common structural mistakes are traffic-vs-conversion confusion, wishlist folklore, demo timing misuse, and treating Next Fest as “free exposure” instead of a readiness gate.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Solo indie developer | Owns Steam page, demo, launch timing, and outreach alone | Mixed |
| Small studio producer / founder-marketer | Coordinates launch beats, asset readiness, and event choice | Intermediate |
| Publisher helper / marketing contractor | Diagnoses whether a weak outcome is traffic, page promise, proof, timing, or ops | Intermediate to advanced |
| Community / creator ops lead | Packages press/creator beats around demo, Next Fest, and launch | Intermediate |

## Current Workarounds
1. Publish the Coming Soon page once the promise is “stable enough,” then manually run an announcement beat across social, niche communities, and press.
2. Use wishlist dashboards, calculators, or alerting tools to watch spikes even when the real issue is still unclear.
3. Treat demo publication like a mini-launch or festival unlock, sometimes delaying it to line up with a showcase or Next Fest.
4. Maintain external checklists, calendars, spreadsheets, or docs because Steam-native controls are fragmented across separate surfaces.
5. Layer creator/press tooling on top of Steam-native flows because Curator Connect and keys do not cover the full outreach workflow.

## Adjacent Problems
- Traffic versus conversion gets conflated when teams only say “wishlists are weak.”
- Demo readiness versus demo availability gets conflated when the build itself may weaken trust.
- Capsule, screenshots, trailer, short description, and tags often drift out of sync.
- Manual review and release gates create queue and timing risk.
- Creator outreach, key distribution, and post-event follow-up still require off-platform execution.

## User Voices
- “Q: When can demo release notification emails be sent to wishlisters?” — Steam Next Fest FAQ, showing how often teams worry about burning the one-shot demo notify window too early. (<https://partner.steamgames.com/doc/marketing/upcoming_events/nextfest>)
- “If you're concerned about missing out on launch excitement if you release your demo early for the Press Preview...” — Steam Next Fest guidance, reflecting fear of spending attention on the wrong beat. (<https://partner.steamgames.com/doc/marketing/upcoming_events/nextfest>)
- “I just finished Steam Next Fest, so I have momentum! I should launch my game right after Steam Next Fest” — quoted by Chris Zukowski as a recurring but misleading belief. (<https://howtomarketagame.com/2026/02/18/the-counterintuitive-advantage-of-launching-during-steams-busiest-event/>)
- “The fear is that players will get to the end of the demo and there is nothing motivating them to buy the full game.” — recurring narrative-demo worry captured in community/consulting analysis. (<https://howtomarketagame.com/2026/02/02/should-you-keep-your-demo-up-post-launch/>)
