# Expert notes: monetization and live-ops

Principles and judgment calls, grouped by source, with timestamps. Full source list:
[sources.md](sources.md). Lines marked [added] are this skill's own synthesis. Lines marked "Live"
were measured in Studio 0.743 in an unpublished place (see [procedures.md](procedures.md)).

## Roblox Creator Docs (monetization, analytics, configs, discovery)

Developer products and receipts (developer-products page, MarketplaceService reference):

- Grants happen only in the receipt callback. `PromptProductPurchaseFinished` is not proof of
  payment.
- `ProcessReceipt` is set once, in one server Script. Roblox calls it on purchase, on a new prompt
  and when the buyer joins a server.
- There is no time-based retry: a receipt answered `NotProcessedYet` comes back only when the player
  buys again or rejoins.
- There is no timeout on yields inside the callback, and it can run on two servers at once.
- With no callback set, receipts are auto-acknowledged and nothing is granted.
- Receipt fields: `PurchaseId`, `PlayerId`, `ProductId`, `PlaceIdWherePurchased`, `CurrencySpent`,
  `CurrencyType`, `ProductPurchaseChannel` (`InExperience`, `ExperienceDetailsPage`, `AdReward`,
  `CommerceProduct`).
- `BindReceiptHandler(receiptType, handler, filter?)` returns a connection and answers
  `Enum.ReceiptDecision`. A bound handler takes precedence and falls through to `ProcessReceipt`.
- The page's own sample answers `PurchaseGranted` whenever the handler does not error, even when it
  returns nil because the buyer has no character. The same page says handlers must return true [the
  sample contradicts its own rule; reproduced in the receipts suite].
- Listed products with a faulty receipt handler vanish from Home, Search and the post-purchase page,
  and still sell in game.
- Cross-game product and pass sales ended on 2026-05-30. Robux transfers
  (`PromptRobuxTransferAsync`, receipt types `RobuxTransferSender` and `RobuxTransferReceiver`)
  replace them.
- `RankProductsAsync` has a strict rate limit: call it once at join (the reference: client throttle
  10 requests per minute, up to 50 items, answers `ProductIdentifier` and `ProductInfo` per item).
  `RecommendTopProductsAsync` needs a sale in the last 28 days; run it in `task.spawn`.

Passes and subscriptions (passes, subscriptions, Roblox Plus pages; MarketplaceService reference):

- `UserOwnsGamePassAsync` is cached; the cache updates when `PromptGamePassPurchaseFinished` fires.
  A pass bought outside the game mid-session can take minutes to show.
- On the server, `wasPurchased` of `PromptGamePassPurchaseFinished` is final. Values seen by the
  client are not proof.
- Tool passes need a copy in `StarterGear`, or the tool is lost at respawn.
- Pass and product icons: at most 512x512, details inside the circular crop, `.jpg`, `.png` or
  `.bmp`.
- Experience subscriptions: ids like `EXP-...`, single tier, status read on the server with
  `GetUserSubscriptionStatusAsync(player, id)`; `Players.UserSubscriptionStatusChanged` reports
  changes.
- Roblox Plus replaces Premium for new subscribers (version deltas row 11). Check
  `Player.HasRobloxSubscription`; prompt with `PromptRobloxSubscriptionPurchase`.
- Plus discounts are funded by Roblox; a price typed in code shows the full price while the
  subscriber pays less. `GetProductInfoAsync` returns `PriceDiscountDetails` and
  `UserBasePriceInRobux` for that case.

Pricing and shop (managed-pricing, price-optimization, shop pages):

- Managed pricing combines price optimization and regional pricing. New games and items are enrolled
  by default.
- Price optimization needs about 60,000 transactions in 30 days, runs about 3 weeks with a 98/2
  review split, reruns at least every 90 days, and applies only when revenue rises.
- Hard-coded prices block price optimization. Dynamic Price Check pins test prices on up to 5
  accounts to find literals.
- `GetUsersPriceLevelsAsync` returns a price level per user; call it at join and do not cache it
  across sessions.
- Display prices on the client, where each player's price is known; grant on the server.
- Hide the in-menu shop with `StarterGui:SetCoreGuiEnabled(Enum.CoreGuiType.ExperienceShop, false)`.

Paid random items (paid-random-items page, PolicyService reference):

- Every outcome and its numerical odds before spend; the percentages sum to exactly 100%.
- Long decimals may be rounded to four or more places below the first non-zero digit, with the
  disclaimer "Probabilities are rounded; total of displayed individual probabilities may not equal
  100%."
- A long list can sit behind a clickable "Info" or "Details" pop-up; a bare (i) icon is not enough.
- Boosters show their numerical effect and the odds update while active. Unique outcomes recompute
  the remaining odds. Purchases with currency bought for Robux count.
- `ArePaidRandomItemsRestricted` per player: offer a free path, a disclosed fixed order, direct
  purchase at expected value (10 Robux at 5% is 200 Robux), hide, block with a message, or move the
  player.

Rewarded video (rewarded-video-ads page, AdService reference):

- The reward is a developer product, never Robux and never random. The button is user-initiated,
  disclosed, and never a progress gate.
- `GetAdAvailabilityNowAsync` runs on the client, when the menu that offers the ad opens.
  `ShowRewardedVideoAdAsync` runs on the server.
- The reward arrives as a receipt with channel `AdReward`.
- Eligibility: the game is public and unrestricted, offers no free-form user creation, has a
  Maturity and Compliance Questionnaire approved by Roblox, and averages at least 2,000 unique
  visitors per month; the publisher is 13+, in good standing, with 2FA and a verified ID.
  Resubmitting the questionnaire temporarily removes eligibility, so rewarded video is not a
  launch-day feature ([launch-liveops.md](launch-liveops.md)).

Analytics (analytics event pages):

- Events are server-only and recorded from published games only.
- Limits: 120 + 20 x CCU requests per minute, 3 custom fields, 10 currencies, 100 item SKUs, 20
  transaction types, 10 funnels, 100 steps per funnel, 100 custom event names. Excess values group
  into "Other".
- Funnels: the first step must be sent, repeats are ignored but count toward the rate limit, skipped
  steps auto-complete, filters apply to the first step only.
- Log economy events after the change is saved. Validate client-reported steps on the server.

Configs and experiments (configs and experiments pages, ConfigService reference):

- `ConfigService` is server-only. `GetConfigAsync` ignores experiments; `GetConfigForPlayerAsync`
  applies them.
- Snapshots do not update themselves: connect `UpdateAvailable` and call `Refresh`.
- Enrollment happens at the first `GetValue` of a key on a player snapshot, so read it where the
  player meets the feature.
- Experiments run 14 to 60 days with a control and up to 2 variants. Early harm stops: playtime
  -10%, ARPU -20%, payer conversion -20% in the first 24 hours with at least 10,000 enrolled.
- Games under about 1,000 DAU struggle to reach a useful minimum detectable effect.

Discovery (recommendation and thumbnail pages):

- Two stages, retrieval then ranking. Top signals: play-through rate, first-play bounce, play days,
  playtime (capped at 60 minutes per user per day).
- Ranking uses only users who found the game organically on Home. Genre tags and description
  hashtags are not signals.
- Giveaway titles and metadata that misrepresent the game are penalized.
- Thumbnails: 16:9, ideally 1920x1080, under 3 MB; keep the bottom free of key content (player count
  overlay). Up to 10 images and videos, moderated.
- Experience icon: square, 512x512, shown down to 150x150.

Creator Rewards (creator-rewards page; version deltas row 31):

- Engagement-Based Payouts ended on 2025-07-24.
- 5 Robux per Active Spender per day when the experience is among their first three of the day and
  they play 10+ minutes.
- Audience Expansion: 35% of the first $100 a new or returning user spends in 60 days, when they
  arrived through a share link, direct link or name search and the experience averages 100+ DAU.

## Mastering Monetization, RDC 2025 (MJ-zYfL10Ew)

- Monetize every intended mechanic at launch; adding it later reads as pay to win. Never gate basics
  like movement (00:23:15, 00:24:54, 00:31:24).
- Starter bundles at 25 to 99 Robux, then step up with prior purchases; a $100 product turns
  newcomers away (00:21:36, 00:23:47).
- Many small spenders beat one high price for discovery (Adopt Me team, 00:22:43).
- Reward obsolete paid items as rewarded video milestones so ads do not cannibalize spenders
  (00:16:47).
- Price optimization is "80% there" for items; relationships between coin packs are not modeled
  (00:33:00).

## Mastering Monetization, RDC 2026 (hoMbv_R8AMU)

- The personalized shop opt-in correlates with 6x Robux spend; opt in unless it clashes with
  controls (00:05:00).
- Item title, description and image decide eligibility for Home and Search placement (00:03:52).
- Free trials for passes lift Robux spend and spenders by 4% or more; announced for October 2026
  [not yet in the docs; verify before citing] (00:06:35).
- Plus subscribers play 2x longer and spend up to 7x (00:07:09).
- Reinvest up to 4% of daily earnings in ads; ROAS accrues over 30 days, so read estimated ROAS
  (00:15:54, 00:16:59).
- 27% of games with rewarded video earn 10%+ of earnings from it (00:08:48).

## Studios, analytics and experiments, RDC 2025 (j6OPA95-1O0)

- Feature-flag every risky release; flip it off without a hotfix (00:02:03).
- Roll out by risk: 10%, 50%, then 100% (00:14:19).
- Segment before concluding: bots and alts distorted a trade-delay test (00:18:21).
- An upsell on gated items lifted ARPD 10% and payer conversion 18% with no playtime change; test
  the obvious (00:26:13).
- A guaranteed-rarity starter egg lifted new-user ARPU 6%; it needed over a month to reach
  significance (00:29:12).
- Guardrails outrank modest gains: a variant with +14% playtime lost on +40% disconnects (00:23:12).
- Thumbnails show the real game; the best tested thumbnail did 1.7x the average (00:33:40).

## Configs and experiments tutorial (-CdXP025MvU)

- Listen to `UpdateAvailable` and refresh; send values to the client as Player attributes with a
  readiness marker (00:03:23, 00:06:10).
- Check the MDE before launching; avoid tiny steps; start with three spread values, then narrow
  (00:13:05, 00:17:13).
- Monetization metrics are noisier than playtime: an ARPU interval of +10% to -15% against -4% to
  +2% (00:17:13).
- Do not stop on an early peek (00:14:23).

## Discovery, RDC 2026 (bkRZeTZAvLw) and RFY Q&A (B3R1ybI3yzs)

- Windows are first play, D1, D2-7 and D8-28; a new game is not made to wait 28 days (bkRZeTZAvLw
  00:05:00; B3R1ybI3yzs 00:11:40, 00:37:16).
- The click gates everything: top retention with a weak play-through rate earns no impressions
  (bkRZeTZAvLw 00:13:09).
- About 10% of a top role-play game's revenue comes from players in their first 30 days (bkRZeTZAvLw
  00:24:33).
- 25% of top-100 recommended games are under 90 days old (bkRZeTZAvLw 00:08:13).
- Play-through rate and first-play bounce replaced QPTR (B3R1ybI3yzs 00:05:44 to 00:09:36).
- Ads, Discord or TikTok traffic seeds retrieval; only organic Home traffic trains ranking
  (B3R1ybI3yzs 00:24:39, 00:26:16).
- No penalty for a bad launch: retests follow updates (B3R1ybI3yzs 00:17:34).

## Ads Manager webinar (D_YmdVZxIZw) and Science of Discovery, RDC 2025 (cUxgt4asjFU)

- Run campaigns 1 to 2 weeks with a daily budget and no targeting for a baseline (D_YmdVZxIZw
  00:12:35, 00:38:12).
- Ads Manager is the source of truth for campaign earnings, which keep updating for 30 days
  (D_YmdVZxIZw 00:47:55).
- Ads did not hurt organic discovery across 370 experiences (cUxgt4asjFU 00:25:48).
- Spend gradually, fix weak stats, scale, then switch ads off to see if the game holds (cUxgt4asjFU
  00:34:06).

## Funnels (NFLP-FVv834, u_8p65Bsm2Y) and retention (YgyfcMfxQcI, vumAuOqSmNA)

- Economy dashboard: sources and sinks near the zero line; wallet spikes mean too few sinks
  (NFLP-FVv834 00:04:10, 00:19:50).
- A funnel drop is not always a bug: a hard room loses players on purpose (NFLP-FVv834 00:17:11).
- Launch slightly unfinished and save content for updates (YgyfcMfxQcI 00:12:35).
- Pace content: hold back items and release them weekly; capacity does not set cadence (YgyfcMfxQcI
  00:14:14, 00:14:47).
- New items fun, not stronger: a Season 3 gun with the starter guns' damage keeps veterans using it
  and new players level (YgyfcMfxQcI 00:32:13).
- Fix misuse in the first 48 hours; test with fresh players, not veterans (YgyfcMfxQcI 00:20:36,
  00:31:08).
- Older players: red-carpet onboarding, no tiny fonts, 60% of minutes on mobile (vumAuOqSmNA
  00:18:41 to 00:25:59).

## Tutorials (n29WMYNTZHs, nh7MYYL5CGE, xaBW50Xz7Vs)

- A handler table keyed by product id with a PurchaseId record is the right shape (n29WMYNTZHs
  00:19:55); its grant-before-record order is not.
- StarterGear for tool passes (nh7MYYL5CGE 00:20:33). Granting from `PromptGamePassPurchaseFinished`
  on the client is not safe (current reference).
- Client-fired purchase signals are the exploit surface; grants belong in the receipt callback
  (xaBW50Xz7Vs 00:01:09).

## Live findings (Studio 0.743, unpublished place)

- `BindReceiptHandler` exists. A second catch-all bind errors "a catch-all handler is already
  registered for this ReceiptType"; a second `ProcessReceipt` assignment is silently accepted.
- `MarketplaceService.ProcessReceipt` cannot be read back, so tests call the handler object, not the
  property.
- `GetProductInfoAsync(1, Enum.InfoType.GamePass)` returned another creator's real pass. A typo in a
  pass id is not an error.
- `GetProductInfoAsync` for an unknown developer product errors "Item not found in batch response.";
  `GetDeveloperProductsAsync` errors HTTP 404 before publishing.
- `GetUserSubscriptionStatusAsync` answered `IsSubscribed = false` for the unknown ids `EXP-1` and
  `EXP-0000000001`, but `IsSubscribed = true` and `IsRenewing = true` for `EXP-0`; a malformed id
  errors "Invalid SubscriptionId". Never treat a Studio answer as proof of a subscription.
  `UserOwnsGamePassAsync` with an unknown id returns false.
- `ConfigService:GetConfigAsync` fails after about 30 s with "ConfigService: Failed to load config",
  even after `SetTestingValue`. On the client it errors "ConfigService is only available in the game
  server."
- Analytics calls on the server print "AnalyticsService: <Method> event fired." in the Studio
  output. On the client they print "AnalyticsService can only be executed on the game server." and
  do not throw.
- `RankProductsAsync` on the server errors "Cannot be called from the Server."; on the client of an
  unpublished place it errors with HTTP 400.
- `ShowRewardedVideoAdAsync` returns `InternalError` with "Rewarded video ads are not enabled for
  this universe"; client availability returns `InternalError`.
- Attribute names accept periods, hyphens and slashes, reject spaces, and stop at 100 characters, as
  the SetAttribute reference says.
- `GetUsersPriceLevelsAsync` returned price level 1000 for the test account;
  `GetPlayerSegmentsAsync` returned `HasData = false`.
- A client `PromptProductPurchase` with an id that does not exist returns without error; 3 s later
  the client capture shows no purchase dialog and the console has no purchase line.
- In a ScreenGui made with `Instance.new`, a pop-up frame with a high `ZIndex` hid its own text
  until the script set `ZIndexBehavior = Sibling` (seen in a capture). Set it explicitly.
- `PolicyService` answered `ArePaidRandomItemsRestricted = false` for the test account, so
  restricted branches are tested by setting the policy result in the test.
