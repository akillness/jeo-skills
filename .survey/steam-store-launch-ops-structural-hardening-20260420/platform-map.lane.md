# Lane D — Alternatives / Packet Map for `steam-store-launch-ops`

## Bottom line

The strongest bounded next move is **not** another Steam marketing wrapper. The recurring substitutes cluster around five packet types that the existing skill can route cleanly:

1. `page-promise-audit`
2. `wishlist-signal-check`
3. `demo-readiness-gate`
4. `event-timing-workback`
5. `launch-ops-runbook`

These packet types are more reusable than vendor names and align with both the current repo structure and the external solution landscape.

## JTBD alternatives people actually reach for

### 1) Generic marketing router + page audit tools
People often start with broad growth/marketing help, then narrow into Steam-specific page fixes using page analyzers, capsule tools, or tag guidance.

- Substitute surface: generic marketing strategy docs, page-audit tools, or broad launch consultants
- Why it exists: users initially describe the pain as “help my launch” or “wishlists are weak,” not as a Steam-bounded routing problem
- Why `steam-store-launch-ops` should stay separate: external evidence and the repo’s own routing both show Steam page, wishlist, demo, and Next Fest logic are a domain-specific exception rather than just another marketing lane
- Sources:
  - https://presskit.gg/field-guides/steam-page-optimization-guide
  - https://pitchwall.co/product/steam-page-analyzer
  - `/Users/jang_jennie/projects/oh-my-skills/.agent-skills/marketing-automation/SKILL.md`

### 2) Checklist / PM / calendar substitutes
Teams routinely fall back to Notion checklists, docs, spreadsheets, festival calendars, and workback plans.

- Substitute surface: launch checklists, festival calendars, internal runbooks
- Why it exists: Steam’s own controls are fragmented across Coming Soon, demo setup, review/release, and Next Fest pages
- Why `steam-store-launch-ops` should stay separate: the higher-value job is diagnosing which checklist/workback packet matters now, not dumping one giant PM board
- Sources:
  - https://partner.steamgames.com/doc/store/releasing
  - https://partner.steamgames.com/doc/marketing/upcoming_events/nextfest
  - https://gameoutreach.co/steam-festivals-calendar/

### 3) Wishlist dashboards and forecasting tools
When teams say “wishlists are weak,” they often reach for dashboards, alerts, and calculators first.

- Substitute surface: Steamworks reporting, Wishlist Pulse, GAMEDATA.wtf, wishlist calculators
- Why it exists: wishlist movement is the easiest leading signal to watch
- Risk: these tools can encourage false precision or hide the traffic-vs-conversion distinction
- Structural implication: the skill should treat these tools as evidence aids inside a `wishlist-signal-check` packet, not as the answer itself
- Sources:
  - https://partner.steamgames.com/doc/marketing/visibility
  - https://blog.hortopan.com/i-built-a-tool-so-i-could-stop-refreshing-steamworks-steam-wishlist-pulse/
  - https://gamedata.wtf/

### 4) Creator / press / outreach stacks
When Steam-native discovery feels insufficient, teams switch to hosted press kits, creator discovery, key distribution, and outreach platforms.

- Substitute surface: presskit.gg, PressKitHub, IMPRESS, Lurkit, PressEngine, GamesPress
- Why it exists: creator/press ops are adjacent to nearly every Steam beat, especially demo launches and Next Fest
- Structural implication: this is a route-out, not a reason to broaden the Steam skill into a generic PR stack
- Sources:
  - https://presskithub.io/
  - https://impress.games/steam-next-fest-game-marketing-ready
  - https://www.lurkit.gg/
  - https://pressengine.net/
  - https://www.gamespress.com/

### 5) Game feedback / build triage substitutes
When the real problem is a rough demo build or player confusion inside the build, teams drift into feedback triage or build debugging instead of Steam launch ops.

- Substitute surface: player-feedback triage, build-log debugging, performance profiling
- Why it exists: the user often asks a Steam-facing question, but the real blocker lives in the build or the feedback packet
- Structural implication: the Steam skill needs sharper route-outs rather than broader ownership
- Repo-native sources:
  - `/Users/jang_jennie/projects/oh-my-skills/.agent-skills/game-demo-feedback-triage/SKILL.md`
  - `/Users/jang_jennie/projects/oh-my-skills/.agent-skills/game-build-log-triage/SKILL.md`
  - `/Users/jang_jennie/projects/oh-my-skills/.agent-skills/game-performance-profiler/SKILL.md`

## Normalized packet map

### Settings
| Concern | Current truth | Common layer |
|---|---|---|
| Evidence level | Page URL/screenshots, trailer, tags, demo status, timing context, traffic/wishlist signal | Intake packet |
| Timing context | Coming Soon, traffic spike, demo publish/update, Next Fest, launch window | Hook selection |
| Confidence | High / medium / low based on evidence completeness | Evidence-quality gate |

### Rules
| Concern | Rule | Why |
|---|---|---|
| One primary bottleneck | Choose one of visibility, promise, proof, timing, ops | Prevents generic marketing sprawl |
| One next artifact | Return one bounded packet, not a giant GTM plan | Matches repo-wide packet-first pattern |
| Wishlist ambiguity | Separate traffic weakness from conversion weakness before changing the page | Steam docs explicitly warn wishlists are overinterpreted outside some surfaces |
| Demo/event caution | Treat demo exposure and Next Fest as readiness gates, not free exposure | One-shot or limited timing consequences matter |
| Route-out discipline | Redirect creator CRM, playtest triage, build-debugging, and generic marketing work to sibling skills | Keeps this skill Steam-specific and trustworthy |

### Hooks
| Lifecycle | Steam-specific trigger | Packet |
|---|---|---|
| Coming Soon creation / refresh | Page is about to go live or just launched | `page-promise-audit` |
| Weak wishlist complaint | Some signal exists but the bottleneck is unclear | `wishlist-signal-check` |
| Demo publish/update pressure | Team is deciding whether a demo strengthens or weakens the current beat | `demo-readiness-gate` |
| Next Fest / public event pressure | Team must decide whether to spend a visibility beat now | `event-timing-workback` |
| Final launch window | Assets, keys, creators, release timing, and ownership feel scattered | `launch-ops-runbook` |

## Platform / packet gaps

1. **The current skill still blends packet choice with output details.** A packet-first front door would let the main SKILL.md shrink while pushing Steam doc nuance and checklist depth into support references.
2. **Creator/press workflow is adjacent but not yet expressed as a route-out packet.** The skill should likely say when to hand off to a creator/outreach packet rather than absorb CRM work itself.
3. **Wishlist tools need a stricter role.** External dashboards and calculators are common, but they should appear only as supporting evidence inside `wishlist-signal-check`, not as direct recommendations.
4. **Demo/Next Fest constraints deserve a stronger one-shot warning.** Valve’s timing rules and public-demo requirements make this more than a generic launch checklist issue.
5. **Repo boundary clarity is already mostly good.** The remaining value is in sharpening the front door into packet selection and route-outs, not expanding the catalog.

## Recommended abstraction for the repo

Use this internal profile:

```yaml
steam_launch_router:
  packet_types:
    - page-promise-audit
    - wishlist-signal-check
    - demo-readiness-gate
    - event-timing-workback
    - launch-ops-runbook
  route_outs:
    - marketing-automation: broad non-game GTM / lifecycle / acquisition work
    - game-demo-feedback-triage: player/demo feedback prioritization
    - game-build-log-triage: one red build or packaging failure
    - game-performance-profiler: runtime/perf bottleneck diagnosis
  evidence_rules:
    - separate traffic from conversion before page rewrite
    - treat demo exposure as proof, not just awareness
    - treat Next Fest as a readiness gate
    - keep one next artifact only
```

## Conclusion

The substitute landscape is crowded, but the actual gap is narrow: teams need a **Steam-specific packet selector** that sits between broad marketing advice, raw PM checklists, creator tooling, and build/demo triage. That is exactly what `steam-store-launch-ops` can become more clearly without creating a new skill.

## Sources

- https://partner.steamgames.com/doc/marketing/visibility
- https://partner.steamgames.com/doc/store/releasing
- https://partner.steamgames.com/doc/marketing/upcoming_events/nextfest
- https://presskit.gg/field-guides/steam-page-optimization-guide
- https://pitchwall.co/product/steam-page-analyzer
- https://blog.hortopan.com/i-built-a-tool-so-i-could-stop-refreshing-steamworks-steam-wishlist-pulse/
- https://gamedata.wtf/
- https://gameoutreach.co/steam-festivals-calendar/
- https://presskithub.io/
- https://impress.games/steam-next-fest-game-marketing-ready
- https://www.lurkit.gg/
- https://pressengine.net/
- https://www.gamespress.com/
- /Users/jang_jennie/projects/oh-my-skills/.agent-skills/marketing-automation/SKILL.md
- /Users/jang_jennie/projects/oh-my-skills/.agent-skills/game-demo-feedback-triage/SKILL.md
- /Users/jang_jennie/projects/oh-my-skills/.agent-skills/game-build-log-triage/SKILL.md
- /Users/jang_jennie/projects/oh-my-skills/.agent-skills/game-performance-profiler/SKILL.md
