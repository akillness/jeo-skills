# GUI paths: monetization and live-ops

Dashboards and settings that only exist in Creator Hub or the Studio GUI. Paths are from the Creator
Docs (October 2026) unless marked [added]. None of these is testable by an agent through the
toolkit: an agent prepares the inputs (ids, prices to set, configs, briefs, art files) and a person,
or a computer-use agent signed in as the owner, applies them. Creator Hub is
create.roblox.com/dashboard/creations, then the experience.

## Products, passes, subscriptions

| Task                       | Path                                                                    | What to read or set                                                                                                | Scripted side                                                                |
| -------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| Create a developer product | Monetization > Developer Products > Create a Developer Product          | Name, description, icon (512x512 max, circle crop), price; copy the product id                                     | `Catalog` entry with that id; `catalog:verify` in a published test server    |
| Create a pass              | Monetization > Passes > Create a Pass; then Sales: Item for Sale, price | Name, description and icon (all three, for Home and Search recommendations); pass id from the URL or the pass menu | `Catalog.passes`, `Entitlements`                                             |
| Create a subscription      | Monetization > Subscriptions > Create Subscription                      | Id `EXP-...`, price tier, benefit text                                                                             | `Catalog.subscriptions`; status on the server only                           |
| Shop listing               | Monetization > Shop                                                     | Passes always listed; developer products Listed or Unlisted; flagged-product banner                                | Receipt handler must be correct or listed products drop from Home and Search |
| Managed pricing            | Monetization > Managed Pricing                                          | Enrollment of price optimization and regional pricing; test status, results, apply                                 | No literal prices: `MonAudit` rule `price-literal`                           |
| Dynamic Price Check        | Monetization > Managed Pricing > Dynamic Price Check                    | Up to 5 test accounts; Price pinned or Location pinned; join and look for prices that did not change               | Shop reads `GetProductInfoAsync` on the client (`PriceText`)                 |
| Creator Rewards            | Monetization > Creator Rewards                                          | Daily Active Spender and Audience Expansion payouts, 60-day hold                                                   | None                                                                         |

## Analytics

Creator Hub > the experience > Analytics. Each page unlocks once the matching events arrive from a
published game.

| Page                               | What to read                                                                                                                                |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Acquisition (Home recommendations) | Play-through rate, first-play bounce, play days, playtime per window (first play, D1, D2-7, D8-28), with benchmarks; start with the weakest |
| Funnel                             | Drop per step for up to 10 funnels; filters apply to first-step fields only                                                                 |
| Economy                            | Sources and sinks by currency and transaction type, wallet trend; "Other" means a limit was reached                                         |
| Monetization                       | Payer conversion, ARPPU, revenue by product                                                                                                 |
| Retention                          | D1, D7, D30 by cohort                                                                                                                       |
| Explore (custom events)            | Counts per custom event and custom field                                                                                                    |

## Configs and experiments

| Task                 | Path                                                                    | Notes                                                                                             |
| -------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Edit configs         | Creator Hub > Configs; in Studio, File > Open Configs                   | Staged values are visible in Studio playtests; publish takes 15 s to 1 min, sometimes over 15 min |
| Conditional values   | Configs > key > add condition (country, tenure, language, payer status) | Read with `GetConfigForPlayerAsync`                                                               |
| Create an experiment | Experiments > Create                                                    | Hypothesis, primary metric, control and up to 2 variants, 14 to 60 days, MDE shown before launch  |
| Read results         | Experiments > experiment                                                | Sample ratio mismatch banner, early harm alerts, Make decision (guided rollout)                   |

## Discovery assets

| Task                                                   | Path                                                                                           | Rules                                                                                         |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Thumbnails                                             | Configurations > Places > start place > Thumbnails (Home Page and Experience Detail Page tabs) | 16:9, ideally 1920x1080, under 3 MB, up to 10, moderated; personalization needs 2 to 5 active |
| Thumbnail performance                                  | Thumbnails > Home Page tab > Thumbnail Performance                                             | Per-thumbnail impressions and play-through; about 48 hours to show a winner                   |
| Icon                                                   | Configurations > Places > start place > Icon                                                   | Square, 512x512, check at 150x150, moderated                                                  |
| Name and description                                   | Configurations > Basic Info                                                                    | No giveaway or misleading text; genre tag is not a ranking signal                             |
| Content maturity (Maturity & Compliance Questionnaire) | Creator Dashboard > the game > Publish settings > Content rating > Start (or Restart)          | Required; unrated games have restricted playability (content-maturity.md)                     |

## Ads

| Task                                  | Path                                                                      | Notes                                                                                                                                                                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ads Manager campaign                  | create.roblox.com > Ads Manager > Create Campaign                         | Goals Plays, Earnings, Engagement; audiences All, New, Recent, Lapsed; up to 10 16:9 images per campaign; 1 to 2 weeks without targeting first                                                                         |
| Campaign results                      | Ads Manager > campaign                                                    | Earnings keep updating for 30 days; reports lag about 48 hours                                                                                                                                                         |
| Rewarded video serving                | Monetization > Ads > Settings > Rewarded Video > Serving: Serving enabled | Off by default; the toggle needs eligibility first                                                                                                                                                                     |
| Rewarded video eligibility            | Monetization > Ads > Eligibility                                          | Public and unrestricted game, no free-form creation, approved questionnaire, 2,000 average monthly unique visitors; owner 13+ with 2FA and verified ID. Resubmitting the questionnaire removes eligibility for a while |
| Rewarded video placements and results | Monetization > Ads > Placements; Monetization > Ads > Analytics           | Placement ids for `RegisterAdOpportunityAsync`; daily ad views per user, earnings                                                                                                                                      |

## Studio

| Task                            | Path                                                     | Scripted substitute                                                                                                  |
| ------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Purchase prompt in a playtest   | `PromptProductPurchase` from a LocalScript or the server | Never clicked by an agent here; call the receipt handler with synthetic receipts ([procedures.md](procedures.md) P3) |
| Output (analytics lines)        | View > Output                                            | `Playtest.console()` through the toolkit                                                                             |
| Hide the Roblox in-menu shop    | No GUI toggle [added]                                    | `StarterGui:SetCoreGuiEnabled(Enum.CoreGuiType.ExperienceShop, false)` in a LocalScript                              |
| Free camera for thumbnail shots | Left Shift + P in a playtest                             | `Playtest.capture()` from a scripted camera, then `rbx_monetization.thumb_from_capture`                              |

## Open Cloud routes (owner-issued API key)

Some dashboards now have an API. They need an API key created by the owner in Creator Hub (scopes
below), so this skill's tests do not call them: never sign in or create keys on the owner's behalf.
When the owner hands over a key for the session, prefer these over clicking.

| Task                                   | Endpoint family (Open Cloud guides)                                                | Scope                                                      |
| -------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Read DAU, revenue, retention, playtime | Analytics Query API, `POST /analytics-query-api/v1/universes/{universeId}/metrics` | `universe.analytics:read`                                  |
| Draft, publish and roll back configs   | Configs API, repository `InExperienceConfig`                                       | `universe:read`, `universe:write`                          |
| Create, start and complete experiments | Experimentation API, `/v1/experimentation/universes/{universeId}/experiments`      | `universe:read`, `universe:write`                          |
| Ads campaigns                          | Ads API                                                                            | `ad.campaign:read`, `ad.campaign:write`, `ad.billing:read` |
