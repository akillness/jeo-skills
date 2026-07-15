# Abyssal Game Studio quality gates

## Release-blocking conditions

Each condition is a hard gate. A missing condition is `FAIL` or `STOP-SHIP`.

1. Before a trend decision, a preserved `.survey/<slug>/` package has provenance and at least six comparables.
2. Every decision is traceable from research claim through product/systems, rule, engineering, QA, and operations.
3. Every core strength has player-executable counterplay plus simulator and QA evidence.
4. Progression measures both p50 and p90, and quantifies source/sink, accumulation, and inflation prevention.
5. P2W, paid random rewards, deceptive pricing, unclear direct pricing, hidden odds or acquisition conditions, and loss-targeted or loss-induced offers are prohibited; every sale has a visible direct price and contents before purchase.
6. Twenty QA iterations, change-impact regression, and narrative/rule/visual-immersion checks are complete.
7. QA `PASS` and operations `ready` are both required; QA and operations independently hold stop-ship vetoes.

## Player archetypes

| ID | Archetype | Primary lens |
|---|---|---|
| A1 | New or returning strategist | learning, visibility, recovery |
| A2 | Precision micro competitor | input, reaction, command conflict |
| A3 | Macro-economy optimizer | source/sink, inflation, progression |
| A4 | Unlimited-growth experimenter | risk/reward, exploit, counterplay |
| A5 | Accessibility-first player | color, photosensitivity, captions, remapping |
| A6 | Fairness-watch competitor | P2W, prices, odds, loss targeting |
| A7 | Immersion-focused narrative player | world, rules, VFX readability |

## Mandatory 20-case adversarial QA

Each row is an independent execution. Missing or non-reproducible evidence is `INCONCLUSIVE`, which is release-equivalent to `FAIL`.

Every replay, repeat, fuzz, replan, or long-running row must declare a finite iteration count, simulated-tick count, replan count, or defined resource-state coverage budget; a watchdog; and a terminal outcome. The listed figures are absolute upper bounds. The run's rule or performance contract must name the same unit and may set a stricter lower bound; the row records the configured budget and observed consumption with its evidence.

Watchdog-budget exhaustion ends the row immediately with a reproducible defect ID and `FAIL`; lack of reproducibility is `INCONCLUSIVE`. Neither result may retry the same stimulus implicitly.

| # | Archetype | Attack family | Stimulus | Required evidence | Pass condition |
|---:|---|---|---|---|---|
| 01 | A2 | Deterministic replay divergence | Replay identical seed and command stream 100 times | 100 state hashes, first divergent tick, rule/build version | All intermediate and final hashes match |
| 02 | A2 | Command flood and concurrent input | Inject select/move/attack/skill/cancel repeatedly in one second | input timeline, queue length, lost/duplicate command log | Only intended priority executes; no loss |
| 03 | A2 | Chokepoint pathing deadlock | Collide factions, summons, and retreat commands on a narrow bridge under the QA-03 watchdog | path graph, replans, watchdog exit, deadlock video/log | Path resolves before its watchdog; no infinite replan, clipping, or isolation |
| 04 | A1 | Core-command recovery without tutorial | Recover after first-fight bad target, camera, or selection | capture, inputs, help/feedback signal | Recovery signal exists within three steps |
| 05 | A3 | Early hero growth spike | Compare minimum and maximum efficiency economy routes at same battle point | growth curve, resource ledger, win-rate/TTK simulation | No out-of-range power spike |
| 06 | A4 | Unlimited-growth accumulation exploit | Repeat low-risk farming, duplication, or loop across the QA-06 adversarial horizon | repeat count, growth/cost curve, watchdog exit, saved state | Cost/exposure/diminishing return or counterplay works before its watchdog |
| 07 | A4 | Counterplay closure | Apply each matchup response to highest-growth configuration | response sets, outcomes, replay | At least one accessible response exists |
| 08 | A3 | Source/sink circulation collapse | Simulate 30/60/90 minute economy and extreme saving | faucet/sink ledger, distribution, inflation trend | No infinite accumulation or required-resource starvation |
| 09 | A1 | p50 progression friction | Measure target-entry time with representative mid-skill input distribution | p50 sample definition, distribution, time/failure causes | Declared p50 window holds |
| 10 | A3 | p90 progression and grind pressure | Measure top-decile optimized route and long sessions | p90 distribution, session length, repeated-action ratio | p90 does not collapse economy or content |
| 11 | A6 | P2W functional-impact intrusion | Map every catalog SKU to combat/economy state | SKU table, functional diff, policy ID | Zero competitive advantage or resource acceleration sales |
| 12 | A6 | Deceptive or unclear direct-price transparency | Inspect pre-purchase screens across region/platform/discount entry | captures, contents, tax/region disclosure | Price and contents match before purchase |
| 13 | A6 | Paid-random-reward or hidden acquisition-condition bypass | Search shop, bundle, season, reward paths for odds/key/draw or undisclosed acquisition conditions | all sales/reward flow map, odds/acquisition conditions, payment conditions | Zero paid random acquisition paths or hidden odds/acquisition conditions |
| 14 | A6 | Loss-targeted or loss-induced offer | Capture UI after repeated/narrow losses, scarcity, or loss-induced recovery prompts | event timeline, offer conditions, video | Zero loss-state-targeted or loss-induced offers |
| 15 | A7 | VFX/animation combat readability | Test similar colors, multiple ultimates, crowded fight | frames, signal list, observer reading | Threat, range, and outcome distinguishable |
| 16 | A5 | Accessibility breakage | Use color filters, photosensitivity, captions, remap, no-audio | settings, before/after captures, keyboard/controller log | Equivalent core signals and control remain |
| 17 | A7 | Narrative-rule contradiction | Cross-check world claims against hero and growth rules | narrative-rule trace, conflict IDs, scene evidence | Zero unexplained contradiction |
| 18 | A2 | Peak combat performance and memory | Repeat max units/projectiles/VFX/path requests under the QA-18 watchdog | p50/p95 frame, memory/allocations, input latency, watchdog exit, environment | Within budget before its watchdog; no cumulative leak |
| 19 | A3 | Live economy and telemetry manipulation | Simulate duplicate event reward, offline reconnect, version mix | event IDs, idempotency logs, metric partition results | No double grant, polluted aggregate, or fairness drift |
| 20 | A1 | Rollback and feedback safety | Rehearse release stop, rollback, feedback classification after Critical signal | stop-ship record, rollback timeline, data retention, feedback link | QA/ops veto works and recovery path verified |

## Loop watchdog budgets

- QA-03 bounded watchdog: replan count limit 500 and simulated-tick budget 18000; capture the first unresolved route and fail at either limit.
- QA-06 bounded watchdog: iteration count limit 10000 and defined resource-state coverage limit 12; capture the first unbounded accumulation state and fail at either limit.
- QA-18 bounded watchdog: iteration count limit 300 and simulated-tick budget 900; capture frame, allocation, input, and pathing evidence and fail at either limit.

## Change-impact regression

For every defect, map affected rule IDs, inputs, performance, monetization, narrative, and visual signals. Rerun its row with new evidence plus 01 deterministic replay, 07 counterplay, 11–14 fairness, 15–17 immersion/accessibility, and 18 performance. Add 08–10 or 19–20 when economy or operations are affected. A prior `PASS` is not evidence for changed behavior; record old and new paths in `regression-matrix.md`.

## Severity and veto

| Severity | Examples | Result |
|---|---|---|
| Critical | P2W, paid random rewards, data/economy duplication, determinism collapse, ignored QA/ops veto | Immediate `FAIL` and `STOP-SHIP` |
| High | missing counterplay, p90 economic collapse, lost accessibility core signal, reproducible pathing deadlock | `FAIL`; no re-entry to next phase before repair/regression |
| Medium | clear readability/feedback friction, non-core performance budget breach | milestone risk; director scopes repair |
| Low | reproducible defect without core-loop, trust, or accessibility impact | register and prioritize |

QA `FAIL` and operations `STOP-SHIP` cannot be overridden by any role.
