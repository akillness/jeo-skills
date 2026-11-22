# Launch and live ops: what to settle before and after launch

Stage 11 of [SKILL.md](../SKILL.md) in detail. Most items are set in Creator Hub by the owner and
cannot be tested by an agent; paths are in [gui-paths.md](gui-paths.md). Lines marked [added] are
this skill's synthesis.

## Before launch

### Every item has a name, a description and a thumbnail

- Item names, descriptions and thumbnails decide whether passes and developer products are eligible
  for Home and Search recommendations: "no thumbnail would most likely mean we might have to not
  include them" (Roblox monetization lead, Mastering Monetization RDC 2026, hoMbv_R8AMU 00:03:52).
  RDC 2025 adds that Roblox reads the item image, title and description to personalize ranking
  (MJ-zYfL10Ew 00:03:52).
- Check the descriptions with `Catalog:verify` in a published test server: it warns `no-description`
  when `GetProductInfoAsync` returns a blank or nil `Description` (the reference documents nil for a
  blank description). Check thumbnails in Creator Hub: the product and pass info tables document no
  icon field for these types. Status: the check ran in Studio 0.743 on a real answer for another
  creator's pass (P2); on your own items it needs a published game, not yet run.
- Icons: at most 512x512, subject inside the circular crop ([SKILL.md](../SKILL.md) Numbers;
  `check_art(path, "pass")`).
- List developer products in the Shop and keep the receipt handler correct: listed products with a
  faulty handler drop from Home, Search and the post-purchase page (shop and developer-products
  pages).

### Rewarded video is not a launch-day revenue line

Eligibility (Creator Docs, rewarded video ads, "Eligibility requirements";
notes/monetization-liveops, rewarded video ads note):

| Who       | Requirement                                                                                                               |
| --------- | ------------------------------------------------------------------------------------------------------------------------- |
| Game      | Public and unrestricted; no free-form user creation                                                                       |
| Game      | Maturity and Compliance Questionnaire complete, reviewed and approved by Roblox; a re-review answer comes within 24 hours |
| Game      | An average of at least 2,000 unique visitors per month                                                                    |
| Publisher | 13+, account in good standing, two-step verification on, government ID verified                                           |
| Reward    | A developer product normally sold in the shop; granted on completion; no currency inflation                               |

- Resubmitting the questionnaire temporarily removes ads eligibility. Resubmit only when an update
  changes the answers (rewarded video ads page).
- Plan [added]: ship the client availability check and the server reward path at launch (P7 in
  [procedures.md](procedures.md)); the button stays hidden while `GetAdAvailabilityNowAsync` is not
  `IsAvailable`. Create the reward product, then turn on Monetization > Ads > Settings > Rewarded
  Video > Serving once Monetization > Ads > Eligibility shows every requirement met.
- Do not count ad revenue in a launch forecast until the 2,000 monthly unique visitors are reached
  [added].

### Order the shop per player

`MarketplaceService:RankProductsAsync` orders up to 50 passes and products for the current player.
It runs on the client only (live: the server errors "Cannot be called from the Server."), once at
join (developer-products page; client throttle 10 per minute, reference). Code, fallback and tests:
P5 in [procedures.md](procedures.md) (`ShopRank`). Status: module logic tested in Lune and Studio
with a faked answer; the real call in an unpublished Studio client answered HTTP 400 and the shop
kept its catalog order; a real ranked answer needs a published game, not yet run.

## After launch: content pacing and power creep

From the Retention Playbook panel (RDC 2025, YgyfcMfxQcI; Roblox creator feedback lead with four
top-game developers; notes/monetization-liveops):

- Launch slightly unfinished and save content for updates; one panelist launched just before
  Halloween, so Halloween and Thanksgiving gave the first updates (00:12:35).
- Keep a backlog: a team able to ship 10 guns in one week paced them over 10 weeks, because players
  do not notice 2 versus 10 guns in one week, and a weekly drop gives them something every week
  (00:14:14, 00:14:47). "Just because you're capable of doing it doesn't mean you necessarily
  should." (00:15:20)
- A season pass releases many items at once and unlocks them progressively (00:15:20).
- New items are fun, not stronger: the first Season 3 gun deals the same damage as the starter guns,
  so veterans still use it and new players are not behind (00:32:13).
- Watch the first 48 hours of each update for misuse, such as an unfair advantage, rather than for
  dislike (00:20:36).
- Test with fresh players: long-time testers are "set in their old ways" (00:30:35, 00:31:08).
- Keep the first-time experience intact; hide new complexity behind later gates (00:31:40,
  00:32:45).

How to apply it to paid items [added]:

- Before each release, put every new pass or product next to the best existing item of the same slot
  (damage, speed, yield, capacity). A higher number needs a written reason in the update notes;
  otherwise sell variety, looks or convenience.
- Keep the release plan as a dated table: item, slot, numbers against the current best, release
  week, config key that switches it on (`LiveConfig`, P9), so a late item ships without a new build.

## Paid-item trading

Trading of items bought with Robux or in-experience currency is gated by the data layer:
scenario-roblox-data blocks a trade when
`PolicyService:GetPolicyInfoForPlayerAsync(player).IsPaidItemTradingAllowed` is false for either
player (`Trade.paidTradingAllowed`, which fails closed). Use that gate; this skill does not repeat
it.
