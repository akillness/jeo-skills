# Critique rubric: monetization and live ops

Score your own output before calling it done. Each line is pass or fail; a fail names the fix. The
measurable lines come from `rbx_monetization.audit_place`, `MonAudit.run`, the suites and the live
tests in [procedures.md](procedures.md). Rules from the Creator Docs unless marked [added].

## Blocking (any fail means not done)

| Check                   | Pass when                                                                                                    | How to measure                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| One receipt entry point | Exactly one `BindReceiptHandler` catch-all or one `ProcessReceipt` assignment per server, in a server Script | Audit: no `receipt-missing`, `receipt-multiple`, `receipt-client`                                      |
| Saved before granted    | `PurchaseGranted` (or `Processed`) only when the saved profile holds the `PurchaseId`                        | `receipts` suite: save failure and crash cases answer `NotProcessedYet`; retry grants once             |
| Idempotent              | The same `PurchaseId` never grants twice, across retries, rejoins and two servers                            | `receipts` suite duplicate and concurrency cases; live L6 duplicate leaves the balance unchanged       |
| Absent buyer            | A receipt for a player not in the server answers `NotProcessedYet`                                           | `receipts` suite; live L6 with an absent user id                                                       |
| No client grants        | Nothing grants on prompt-finished events, remotes or client values                                           | Audit: no `purchase-signal`, `pass-finished-client`                                                    |
| No typed prices         | Every displayed price comes from `GetProductInfoAsync` on the client                                         | Audit: no `price-literal`; `pricetext` suite; rows unbuyable until loaded                              |
| Odds disclosed          | Every paid random outcome and its odds shown before spend; sum is 100% or the rounding disclaimer shows      | `odds` suite (`Odds.validate`); live L10 Details panel text                                            |
| Restricted players      | `ArePaidRandomItemsRestricted` checked per player before any paid random prompt                              | Audit: no `random-no-policy`; live L11 restricted view has no prompt path                              |
| Ad rewards              | Rewarded video pays a fixed developer product through the receipt path                                       | Audit: no `ad-reward-not-product`, `ad-show-client`; receipt channel `AdReward` granted once (L6)      |
| Server-only services    | No `AnalyticsService` or `ConfigService` call from client code                                               | Audit: no `analytics-client`, `config-client`; console has no "only available in the game server" line |
| Script health           | No server error from the shop, receipts or telemetry during the playtest                                     | Console slice has no `ServerScriptService.<script>:<line>` error                                       |

## Quality (fix before shipping a live game)

| Check          | Pass when                                                                                                                                                                                                |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Catalog        | One table with products, passes and subscriptions; `validate()` clean; `verify()` run in a published test server shows no `unknown-id` or `foreign-id`                                                   |
| Perks          | Pass and subscription checks on the server; an erroring check keeps the paid state; tool passes also go to StarterGear                                                                                   |
| Plus           | `HasRobloxSubscription` used for Plus perks; no `MembershipType` Premium checks                                                                                                                          |
| Launch offer   | Every intended mechanic has its offer at launch; a starter bundle between 25 and 99 Robux; nothing basic is gated (RDC 2025)                                                                             |
| Item metadata  | Every pass and product has a name, a description and a thumbnail; `verify()` shows no `no-description`; thumbnails checked in Creator Hub (RDC 2026)                                                     |
| Shop order     | `RankProductsAsync` called once per session on the client through `ShopRank`, catalog order on failure                                                                                                   |
| Ads at launch  | Rewarded video planned only after eligibility (2,000 average monthly unique visitors, approved questionnaire); no ad revenue in the launch forecast                                                      |
| Content pacing | A dated release plan with a backlog; each new paid item compared with the best existing item of its slot; first-48-hour watch and fresh-player tests per update ([launch-liveops.md](launch-liveops.md)) |
| Telemetry      | Onboarding funnel, shop funnel per visit, economy source and sink per currency; client steps validated forward-only; limits respected (`telemetry` suite)                                                |
| Live config    | Defaults in code, `UpdateAvailable` plus `Refresh`, `cfg_` attributes and `cfgReady`; experiment keys read with `forPlayer` where the feature appears (`liveconfig` suite, L8)                           |
| Experiments    | Hypothesis, primary metric, guardrails, MDE from `rbx_monetization.mde` below the expected effect, 14 to 60 days, stop date written before launch                                                        |
| Rollout        | Risky features behind a flag and rolled out 10, 50, 100% (RDC 2025 studios)                                                                                                                              |
| Store art      | `check_art` zero errors for thumbnails, icon and item icons; contact sheet read; no text claims, prices or giveaway wording                                                                              |
| Ads Manager    | First campaign 1 to 2 weeks without targeting; spend at most 4% of daily earnings; ROAS read over 30 days (RDC 2026, Ads webinar)                                                                        |
| Current APIs   | `Async` names, `Enum.InfoType.GamePass`, no `GamePassService`, `ShowVideoAd` or `FireInGameEconomyEvent` (audit `api:` rules)                                                                            |

## Judgment questions

- If the server crashes right after the grant, what does the player own after rejoining, and did
  they pay once?
- Which number on screen could differ from what this player pays (Plus, regional price, price test)?
  Where does it come from?
- Could a player in a restricted country reach a paid random roll through any button, remote or
  bundle?
- Does each offer still make sense for a player who never pays? Would adding it after launch read as
  pay to win?
- Which metric decides the next update, and how many days and players does it need before the answer
  is real?
- Does the thumbnail show what a new player sees in the first minute?
