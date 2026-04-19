# Platform Map: steam-store-launch-ops

## Settings
| Concern | Steam-facing reality | Common Layer |
|---------|----------------------|--------------|
| Evidence packet | Page URL/screenshots, trailer, tags, demo status, timing context, traffic or wishlist signal | Intake packet |
| Current hook | Coming Soon, weak wishlist complaint, demo publish/update, Next Fest, launch window | Hook selection |
| Confidence | High / medium / low depending on evidence completeness | Evidence-quality gate |

## Rules
| Concern | Steam / game lane | Common Layer |
|---------|-------------------|--------------|
| One primary bottleneck | Choose one of visibility, promise, proof, timing, or ops | Single-primary diagnosis |
| One primary output | Return one next artifact, not a giant GTM plan | Packet-first delivery |
| Wishlist ambiguity | Separate traffic weakness from conversion weakness before page rewrites | Diagnostic discipline |
| Demo and event timing | Treat demos and Next Fest as readiness gates with one-shot/limited timing consequences | Readiness-gate rule |
| Neighboring work | Route broad marketing to `marketing-automation`, player-feedback triage to `game-demo-feedback-triage`, one red build to `game-build-log-triage`, and perf work to `game-performance-profiler` | Route-out policy |

## Hooks
| Lifecycle | Steam-facing trigger | Common Layer |
|-----------|----------------------|--------------|
| Coming Soon page goes live | Page is about to launch or has just launched | `page-promise-audit` |
| Weak wishlist complaint | Some signal exists but the bottleneck is unclear | `wishlist-signal-check` |
| Demo ship / update decision | Team must decide whether the demo helps or hurts the current beat | `demo-readiness-gate` |
| Steam Next Fest / showcase pressure | Team needs event-fit and readiness judgment | `event-timing-workback` |
| Final launch window | Assets, keys, creators, review timing, and ownership are scattered | `launch-ops-runbook` |

## Platform Gaps
- The current skill already has the right boundary, but the front door can be shorter and more explicit about packet choice.
- Creator/outreach work is adjacent and important, yet belongs mostly in route-outs rather than inside the Steam skill body.
- Wishlist calculators and dashboards are useful evidence aids, but should not become direct recommendations without diagnosis.
- Demo and Next Fest timing constraints deserve more prominent warnings because they create irreversible or one-shot choices.
