---
name: scenario-roblox-monetization
description: "Use when a Roblox game sells something or plans live ops: Developer Products, game passes, experience subscriptions, Roblox Plus perks, ProcessReceipt or BindReceiptHandler, \"bought it but didn't get it\", a purchase granted twice, shop UI prices, eggs, crates or loot boxes with odds (paid random items, PolicyService), rewarded video ads, AnalyticsService funnels, economy or custom events, ConfigService live config, A/B experiments, price optimization or regional pricing, game thumbnails and icons, play-through rate, Creator Rewards, Ads Manager campaigns, or a launch and update plan."
license: MIT
---

# Roblox Monetization and Live Ops

Target: Roblox Studio (October 2026 build) on macOS, driven through the scenario-roblox-expert
toolkit.

Expert level here means every Robux path ends in one server receipt handler that grants only what
the saved profile confirms, prices and odds come from one source the engine or a config owns, and
every live change ships behind a config with a metric that decides it. The agent builds and tests
the code in an unpublished place; product creation, dashboards and store art uploads stay with the
owner.

If a sibling skill named here is missing from your available skills, load it with `skill_get`
(Scenario MCP) or ask the user to install it (https://github.com/scenario-labs/skills#install);
unattended, proceed from tool schemas and flag the gap.

**REQUIRED BACKGROUND:** scenario-roblox-expert (channels, review loop, toolkit, current-Roblox
traps).

## Stance (the expert delta)

1. **Grant only in the receipt handler, and only after the save.** `PurchaseGranted` means the saved
   profile holds the `PurchaseId`; anything else answers `NotProcessedYet`. Prompt-finished events
   are not proof of payment (Creator Docs, developer products; Stewiepfing). The docs sample answers
   granted when the handler returns nil; the receipts suite reproduces that bug.
2. **One handler per server.** New code uses `BindReceiptHandler`; legacy code assigns
   `ProcessReceipt` once, in one Script (MarketplaceService reference). Live, a second catch-all
   bind errors, while a second `ProcessReceipt` assignment is accepted without a warning.
3. **Prices come from the engine, on the client.** Typed prices block price optimization and show
   Plus subscribers a price they do not pay (Creator Docs, managed pricing, Roblox Plus). The server
   never needs a price to grant.
4. **One odds table for the roll and the disclosure, gated per player.** Show every outcome with
   numerical odds before spend, and check `ArePaidRandomItemsRestricted` per player (Creator Docs,
   paid random items). Prompt random items from the server after that check [added].
5. **Monetize every intended mechanic at launch, cheaply.** Starter bundles at 25 to 99 Robux; many
   small spenders beat one high price; never gate basics such as movement (Roblox monetization leads
   and studio heads, RDC 2025). Adding payment later reads as pay to win.
6. **Every risky change ships behind a config, and data decides it.** Read experiment values on the
   player snapshot where the player meets the feature, check the minimum detectable effect first,
   and let guardrails such as disconnects outrank a modest gain (Creator Docs, experiments; Roblox
   experiments team and studios, RDC 2025).
7. **The click gates discovery.** Play-through rate and first-play bounce replaced QPTR; ranking
   learns only from organic Home traffic, and thumbnails must show the real game (Roblox discovery
   leads, RDC 2026 and RFY Q&A; studios, RDC 2025).
8. **Rewarded video pays a fixed developer product.** It is user-initiated, disclosed, never Robux,
   never random, never a progress gate (Creator Docs). Reward obsolete paid items so ads do not
   cannibalize spenders (RDC 2025).

## Establish first

- Published or not: analytics, configs, ads and product lookups need a published experience.
  Unpublished, test with synthetic receipts and record what Studio does.
- Product inventory: names, kinds (currency, bundle, pass, subscription), what each grants, and
  whether ids exist. Only the owner creates ids in Creator Hub
  ([gui-paths.md](references/gui-paths.md)).
- Data layer: which profile store, and its `getProfile` and `isPresent` functions for
  scenario-roblox-data `Receipts`.
- Audience: age range, regions with paid random restrictions, mobile share, DAU (experiments under
  about 1,000 DAU rarely reach significance).
- Ads: owner age-verified 13+ with 2FA and a public game, or no rewarded video.
- Defaults when unanswered: one catalog module, `BindReceiptHandler` through `Purchases`, prices via
  `PriceText`, a currency pack plus a starter bundle, no paid random items, telemetry and live
  config on from day one.

## Procedure

Full code and test results are in [procedures.md](references/procedures.md). Server modules
(`Catalog`, `Purchases`, `Entitlements`, `Telemetry`) go in `ServerScriptService.MonKit` beside the
data layer's `Receipts`; shared modules (`Odds`, `PriceText`, `LiveConfig`, `ShopRank`) in
`ReplicatedStorage.MonKit`. Status: 16 of 16 live tests pass in Studio 0.743 on an unpublished place
(2026-10-19); 61 suite tests pass in Lune and unchanged in Studio. Needs a published game, not yet
run: a real `RankProductsAsync` ranking (unpublished: HTTP 400, catalog order kept) and
`no-description` on your own items.

1. **Audit.** Goal: every purchase path, price literal and client-side analytics or config call
   found. How: `rbx_monetization.audit_place(place)` offline (Lune), then `MonAudit.run(game)`
   through `rbx_monetization.run` in Edit. GATE: zero errors, and the live tally equals the offline
   tally.
2. **Catalog.** Goal: products, passes and subscriptions in one server table, grants as data, no
   prices. How: `Catalog.new(def)`, `catalog:validate()`; in a published test server,
   `catalog:verify(fetch, game.CreatorId)`. GATE: no `duplicate-id`, `bad-grant`, `unknown-id` or
   `foreign-id` finding. A wrong pass id is not an error: live, pass id 1 resolved to another
   creator's pass.
3. **Receipts.** Goal: exactly one grant per `PurchaseId`. How:
   `Receipts.new{getProfile, isPresent, handlers = catalog:handlers()}` from scenario-roblox-data,
   then `Purchases.new{receipts, catalog, telemetry}` and `purchases:bind(MarketplaceService)`. Test
   with synthetic receipt tables, never a real prompt. GATE: a duplicate grants once, an absent
   player and a failed save answer `NotProcessedYet`, and the retry grants once.
4. **Perks.** Goal: passes, subscriptions and Plus as server-checked perks. How:
   `Entitlements.new{passes, subscriptions, owns, subStatus, onChanged}`,
   `ent:connect(MarketplaceService, Players)`; `Entitlements.giveTool` writes Backpack and
   StarterGear. GATE: a check that errors keeps the paid state; the tool survives respawn; the
   client shows "Owned" from the `perk_` attribute.
5. **Prices.** Goal: every displayed price is the player's price. How: `PriceText.fetch` and
   `PriceText.view` in a LocalScript when the shop opens. GATE: no `price-literal` finding; rows
   show "..." and stay unbuyable until the price loads.
6. **Paid random items.** Goal: disclosed odds, a path for restricted players. How: one
   `Odds.fromWeights` module required by the server roll and the client panel; `Odds.display` behind
   a "Details" button with the disclaimer; restricted players get `Odds.directPrice` or no offer.
   GATE: displayed odds sum to 100% or carry the disclaimer; a restricted player cannot reach the
   prompt.
7. **Rewarded video.** Goal: a disclosed, optional ad that pays a fixed product. How: client
   `GetAdAvailabilityNowAsync` when the menu opens; server `CreateAdRewardFromDevProductId` then
   `ShowRewardedVideoAdAsync` in `pcall`; the reward arrives as a receipt with channel `AdReward`.
   GATE: the ad row hides when unavailable; the reward path is the receipt path.
8. **Analytics.** Goal: onboarding, shop funnel and economy events that survive exploiters and the
   limits. How: `Telemetry` on the server only; clients send step numbers, the server accepts
   forward steps only; log economy events after the save. GATE: invalid steps dropped and counted;
   event names, currencies and fields within the limits table.
9. **Live config and experiments.** Goal: values change without a release. How:
   `LiveConfig.new{defaults}` with `UpdateAvailable` and `Refresh`, mirrored to `cfg_` player
   attributes plus a `cfgReady` marker; `forPlayer` for experiment keys. GATE: defaults apply when
   ConfigService fails (live: it fails after about 30 s unpublished); the client reads values only
   after `cfgReady`.
10. **Store art.** Goal: thumbnails, icon and item icons that pass the size rules and show the real
    game. How: capture a staged playtest view, `thumb_from_capture`, then Scenario art (see
    Handoffs); `check_art(path, kind)`. GATE: zero errors from `check_art`; a contact sheet
    reviewed; the owner uploads.
11. **Launch and live ops.** Goal: a plan with metrics that decide each step. How:
    `rbx_monetization.mde(enrolled, baseline)` for each test, rollout at 10, 50 then 100%, ads
    campaigns run 1 to 2 weeks without targeting for a baseline. GATE: each experiment has a primary
    metric, guardrails, an MDE under the expected effect and a stop date. Launch checklist and
    content pacing: [launch-liveops.md](references/launch-liveops.md).

## Numbers

| Value                                        | Relative to                                                   | Source                               |
| -------------------------------------------- | ------------------------------------------------------------- | ------------------------------------ |
| 25 to 99 Robux                               | Starter bundle price                                          | RDC 2025                             |
| 100 PurchaseIds                              | Receipt log kept in the profile                               | scenario-roblox-data default [added] |
| 60,000 transactions in 30 days               | Price optimization eligibility; about 3 weeks at a 98/2 split | Docs                                 |
| 4 places below the first non-zero digit      | Odds rounding, with the disclaimer                            | Docs                                 |
| 120 + 20 x CCU per minute                    | Analytics requests per server                                 | Docs                                 |
| 3 fields, 10 currencies, 20 types, 100 SKUs  | Analytics cardinality before "Other"                          | Docs                                 |
| 10 funnels, 100 steps, 100 event names       | Analytics per experience                                      | Docs                                 |
| 14 to 60 days, up to 2 variants              | Experiment length and arms                                    | Docs                                 |
| -10% playtime, -20% ARPU or payer conversion | Early harm stop, first 24 h, 10,000+ enrolled                 | Docs                                 |
| About 1,000 DAU                              | Below this, a useful MDE is hard to reach                     | Docs                                 |
| 10%, 50%, 100%                               | Rollout steps for risky features                              | RDC 2025 studios                     |
| Up to 4% of daily earnings                   | Ads reinvestment; ROAS read over 30 days                      | RDC 2026                             |
| 1920x1080, 16:9, under 3 MB                  | Thumbnail; bottom strip covered by the player count           | Docs                                 |
| 512x512, legible at 150x150                  | Experience icon                                               | Docs                                 |
| 512x512 max, circle crop                     | Pass and product icons                                        | Docs                                 |
| 5 Robux per Active Spender per day           | Creator Rewards, first three games of the day, 10+ minutes    | Docs                                 |

## Quality gates

Measurable:

- Audit: zero errors offline and live; warnings fixed or justified.
- Suites: `catalog`, `receipts`, `entitlements`, `pricetext`, `odds`, `telemetry`, `liveconfig` and
  `monaudit` pass in Lune and, unchanged, in Studio with the same count.
- Receipts in a playtest: a duplicate `PurchaseId` grants once; a failed save answers
  `NotProcessedYet` and the retry grants once.
- Console: server analytics lines read "AnalyticsService: <Method> event fired."; no "can only be
  executed on the game server" line.
- Telemetry trace: funnel steps forward only; economy events only after a saved grant.

Visual:

- A client capture of the shop with prices, the odds panel and the restricted view, checked with
  `rbx_review.image_checks`.
- Store art on a contact sheet at 1,600 px or less, opened and read.

Score the result with [critique.md](references/critique.md) before calling it done.

## Common mistakes

| Mistake                                   | Symptom                                              | Fix                                                 |
| ----------------------------------------- | ---------------------------------------------------- | --------------------------------------------------- |
| Grant, then save, then `PurchaseGranted`  | Paid but nothing after a crash                       | Save first; grant only on `LastSavedData`           |
| Grant on `PromptProductPurchaseFinished`  | Free items through a fired remote                    | Grants only in the receipt handler                  |
| `pcall(handler)` success taken as a grant | Granted while the handler returned nil               | Return true only after the save; nil is not granted |
| Two scripts set `ProcessReceipt`          | One product never grants                             | One `Purchases:bind` per server                     |
| Prices typed in UI code                   | Plus and regional prices wrong; optimization blocked | `PriceText` from `GetProductInfoAsync`              |
| Odds in two tables                        | Disclosed odds differ from rolls                     | One odds module for both                            |
| Paid egg prompted from the client         | Restricted players can still buy                     | Server prompt after the policy check                |
| Analytics or ConfigService on the client  | Silent no-ops; "only available in the game server"   | Server calls; client reads attributes               |
| Client-sent funnel steps trusted          | Funnel inflated by exploiters                        | Forward-only, validated on the server               |
| Experiment read at join for everyone      | Enrollment diluted by players who never see it       | `forPlayer` where the feature appears               |
| Stopping a test on an early peek          | Winner that does not hold                            | Fixed duration from the MDE                         |
| Thumbnail text or giveaway claims         | Rejected video or discovery penalty                  | Real gameplay, plain titles                         |

## Handoffs

- With scenario-roblox-data: delivers product ids and grant amounts; receives the `Receipts` handler
  table, which owns persistence (`PurchaseIds` log, `LastSavedData` confirmation). This skill owns
  the receipt contract and the catalog.
- From scenario-roblox-networking: the `purchase-signal` finding and validated remotes for shop
  steps and egg requests.
- To scenario-roblox-ui: price and odds text, `perk_` and `cfg_` attributes, the "Details" panel
  contents; layout and scaling stay with UI.
- To scenario-roblox-performance and scenario-roblox-tooling: telemetry send rates; CI for the
  offline audit and suites.
- Scenario art: thumbnails start from a staged gameplay capture, reframed to 16:9 at 1920x1080 with
  scenario-formats or edited with scenario-image; experience icons (512x512 square) and pass or
  product icons (transparent PNG, subject inside the circle) come from scenario-game-assets;
  scenario-quality-gate scores them. Files land in the project, `check_art` runs, and only the owner
  uploads. Keep text, prices and "free" claims out of all art; moderation applies to every upload.

## Current Roblox notes

- `BindReceiptHandler` (with `Enum.ReceiptDecision` and optional filters) is the current receipt
  API; `ProcessReceipt` still works.
- Cross-game product and pass sales ended on 2026-05-30; Robux transfers use their own receipt
  types.
- Roblox Plus replaced Premium for new subscribers: `HasRobloxSubscription`,
  `PromptRobloxSubscriptionPurchase`.
- Creator Rewards replaced Engagement-Based Payouts on 2025-07-24.
- Yielding calls carry `Async`: `GetProductInfoAsync`, `UserOwnsGamePassAsync`. Use
  `Enum.InfoType.GamePass`: the price-optimization page says `GamePasses`, which does not exist.
- Play-through rate and first-play bounce replaced QPTR; the thumbnails page still says "qualified
  play through rate".
- Open Cloud has Configs, Experimentation, Analytics Query and Ads APIs, all on owner-issued keys.
- Free trials for passes were announced at RDC 2026 for October 2026 and are not in the docs yet:
  verify before using.

## References

- [references/expert-notes.md](references/expert-notes.md): principles by source, with timestamps
  and live findings.
- [references/procedures.md](references/procedures.md): full code for stages P1 to P11, each with
  its tests and live result.
- [references/critique.md](references/critique.md): blocking and quality rubric with how to measure
  each item.
- [references/launch-liveops.md](references/launch-liveops.md): item metadata, rewarded video
  eligibility, shop order, content pacing and power creep, paid-item trading.
- [references/gui-paths.md](references/gui-paths.md): Creator Hub and Studio paths for what agents
  cannot do, plus Open Cloud routes.
- [references/sources.md](references/sources.md): every doc and video, with credentials and
  timestamps.
- [scripts/rbx_monetization.py](scripts/rbx_monetization.py): audit, kit loader, Studio probe, art
  checks, thumbnail crop, MDE.
- [scripts/agentkit/monetization/](scripts/agentkit/monetization/): `Catalog`, `Purchases`,
  `Entitlements`, `PriceText`, `ShopRank`, `Odds`, `Telemetry`, `LiveConfig`, `MonAudit`,
  `lune_mon_audit.luau`.
