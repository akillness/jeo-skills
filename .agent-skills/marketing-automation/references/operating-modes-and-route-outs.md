# Operating Modes and Route-Outs

Use this page when `marketing-automation` has already activated and you need the smallest next decision.

## Mode picker

| User situation | Choose this mode | Default primary lane | Default packet |
|---|---|---|---|
| Broad launch / GTM / pricing / rollout sequencing across multiple surfaces | `launch-orchestration` | `Strategy & growth` | `launch/growth brief` |
| Landing page, pricing page, signup flow, paywall, or onboarding conversion friction | `conversion-surface` | `CRO` or `Copy & messaging` | `measurement + experiment packet` |
| Activation, onboarding, retention, re-engagement, churn, or lifecycle email motion | `lifecycle-retention` | `Strategy & growth` or `Copy & messaging` | `channel-ready brief` |
| SEO, content strategy, comparison pages, organic acquisition, or search-facing demand capture | `acquisition-content` | `SEO & content` | `channel-ready brief` |
| KPI cleanup, instrumentation, attribution, paid-readout, or experiment design backlog | `measurement-experiment` | `Ads & analytics` | `measurement + experiment packet` |

## Tie-break rules
1. If the ask names a **surface** but not a KPI, bias toward `conversion-surface`.
2. If the ask names a **KPI or reporting gap** but not the surface, bias toward `measurement-experiment`.
3. If the ask spans many surfaces and the team mostly needs sequencing, bias toward `launch-orchestration`.
4. If the ask is about user behavior after signup or activation, bias toward `lifecycle-retention`.
5. If the ask is search/discovery-first, bias toward `acquisition-content`.

## Route-outs

| If the request is really about... | Route to... | Why |
|---|---|---|
| Steam wishlists, capsules, Next Fest timing, store visibility, or game-demo launch ops | `steam-store-launch-ops` | Game-store launch work has a stronger specialist surface and different metrics |
| Backlog slicing, milestone planning, or cross-functional execution sequencing | `task-planning` | The bottleneck is planning structure, not marketing lane choice |
| A fully specified narrow workflow with a stronger specialist execution skill | That specialist workflow | `marketing-automation` should not absorb every adjacent lane |

## Minimal response shape
A strong front-door answer usually fits this outline:
1. `Mode:` the one mode you chose
2. `Lane:` the one primary lane you chose
3. `Packet:` the single packet to hand off next
4. `Measurement:` KPI + leading signal + owner
5. `Route-out:` only if the task is really adjacent or specialist
