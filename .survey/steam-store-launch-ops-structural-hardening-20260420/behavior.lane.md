# Lane C — Actual Behavior for `steam-store-launch-ops`

## What People Actually Use

_All findings below are **direct verification** from the linked source text unless explicitly marked otherwise._

- **Steamworks’ built-in manual review/release flow is still the backbone.** Teams submit the store page for review, wait on Valve feedback, then separately mark the app/build ready and manually press the release button themselves. Valve’s docs say store presence review “typically takes **3-5 business days**” and should be submitted “at least **7 business days** before” going live; release also depends on completing two checklists and clicking **“Mark as ready for review”** and later **“Release App.”**
  - Behavioral implication: even small teams are still operating around explicit queue times and manual release gates, not an automated launch pipeline.

- **Indie teams treat the Coming Soon page as a launch event, not just a formality.** In Chris Zukowski’s write-up of Folk Emerging’s page launch, the solo dev used the page launch as a coordinated beat: networking with press/devs on Twitter, carefully posting to Reddit, workshopping store materials beforehand, and targeting niche sites plus genre communities.
  - Behavioral implication: page review is followed by a hand-run “announce the page” workflow across communities and press, often with ad hoc messaging iteration.

- **Demos are used as the main visibility unlock for wishlists and creator coverage.** Valve’s newer demo tooling lets teams give demos their own page and send a one-time notification blast to wishlisters/followers; Zukowski explicitly frames demos as the thing that unlocks creators, festivals, and word-of-mouth. He also notes teams are now treating the first playable demo date as strategically important because the visibility beat is effectively one-shot.
  - Behavioral implication: teams often postpone or stage demo publication around a festival, showcase, or major beat instead of shipping the demo whenever it is merely “ready enough.”

- **Next Fest prep is treated as a one-shot operational decision.** Steam’s docs verify that a game can participate in only **ONE** Next Fest, the base game page must already be public, and the game must have a **publicly playable demo** by fest start. Valve also notes some teams join early to learn while others choose the fest closest to launch to maximize pre-release momentum.
  - Behavioral implication: teams are making an explicit tradeoff between “learning event” and “sales-conversion event,” not just checking a festival box.

- **Creator outreach remains mixed: Steam-native where possible, manual everywhere else.** Valve’s Curator Connect is built for sending review copies to relevant Steam Curators “with no need to mess with e-mails or keys,” and Steam keys are still officially provided for “beta testers or press/influencers.” In practice, teams still stack off-platform outreach on top: Inevitable Studios says it used a pre-event press release, early-access demo Steam keys, a modest Lurkit campaign, aggressive social outreach, and a sponsored livestream during Next Fest.
  - Behavioral implication: Curator Connect reduces some curator friction, but it does not replace press lists, influencer outreach, key distribution, or paid/partnered creator pushes.

- **Launch prep is still checklist-heavy and manually coordinated.** Steam’s release docs are explicit that there are separate store/build checklists and that approved titles do not release automatically; someone with the right permissions must push the release control. In practice, this means small teams still rely on launch checklists/runbooks outside Steam to coordinate assets, timing, announcements, creators, and final QA.

## Common Workarounds

- **Holding an already-approved page until an external beat lands.** Zukowski’s June 2024 Next Fest postmortem says Strange Scaffold had its Steam page approved earlier, left it unpublished, then hit the page live button right before the PC Gamer Show trailer aired.
- **Stacking two beats close together to create artificial momentum.** The same case describes a “double jump” pattern: showcase announcement + immediate demo/page availability right before Next Fest to spike wishlist velocity and get trending placement.
- **Using demo publication as a manual visibility trigger.** With Steam’s one-time demo notify and possible New & Trending exposure, teams are timing demo release like a mini-launch instead of treating it as a passive test build.
- **Compensating for Steam discovery limits with off-platform hustle.** Inevitable Studios explicitly layered press release + early demo keys + Lurkit + social outreach + sponsored livestream because Steam’s event visibility alone was not enough.
- **Targeting niche communities manually instead of relying on broad platform reach.** The Folk Emerging page-launch case leaned on niche subreddits, genre-specific sites, and networking with adjacent devs rather than waiting for Steam to surface the page.
- **Maintaining external runbooks/checklists because Steam’s tooling is fragmented.** Steam handles review states, demos, keys, curators, broadcasts, and release buttons separately; teams commonly compensate with Notion/docs/spreadsheets/checklists outside Steam even when the official controls exist in Steamworks.

## Pain Points With Current Solutions

- **Scheduling risk around Valve review/manual gates.** The official 3-5 business day review window plus the recommendation to submit at least 7 business days early means page changes, asset fixes, and release timing still carry queue risk.
- **Next Fest is high stakes and irreversible.** Valve’s “ONE Next Fest” rule turns festival timing into a difficult judgment call; teams can either spend it early for learning or late for launch conversion, but not both.
- **Steam visibility during events is uneven and partially outside dev control.** Inevitable Studios reports that Next Fest page layout favored livestreams with high current viewer counts and says Steam broadcasting issues caused interrupted streams, missing live labels, absent “now broadcasting” placement, and reduced visibility for some teams.
- **Manual creator outreach remains labor-intensive.** Even with Curator Connect, teams still have to identify good-fit curators/creators, craft personalized messages, distribute demo access, and manage follow-up across multiple systems.
- **Community promotion is still fragile and moderation-sensitive.** The Folk Emerging case says careful Reddit promotion still led to a pulled post and temporary shadowban risk, showing how much launch-page outreach remains platform-by-platform and brittle.
- **Wishlist quality is inconsistent across channels.** GameDiscoverCo cites a Steam postmortem where “wishlists from ads were of worse quality [and] converted into sales less effectively,” reinforcing a common frustration: not all wishlist growth is equally valuable.
- **Steam-native tools reduce some friction but do not unify ops.** Curator Connect helps for Steam curators; keys help for press/influencers; demo pages add a notify beat; release controls handle launch. But teams still have to stitch these together manually into a single launch sequence.

## Sources

- **Direct verification:** Valve, **Review Process (Steamworks Documentation)** — review timing and store-page readiness workflow.  
  https://partner.steamgames.com/doc/store/review_process
- **Direct verification:** Valve, **Release Process (Steamworks Documentation)** — separate checklists, “Mark as ready for review,” and manual “Release App” controls.  
  https://partner.steamgames.com/doc/store/releasing
- **Direct verification:** Valve, **Steam Next Fest (Steamworks Documentation)** — public page + playable demo requirement, one-fest-only rule, and timing tradeoff.  
  https://partner.steamgames.com/doc/marketing/upcoming_events/nextfest
- **Direct verification:** Valve, **Curators and Curator Connect (Steamworks Documentation)** — curator filtering, personalized messages, and “No need to mess with e-mails or keys.”  
  https://partner.steamgames.com/doc/marketing/curators
- **Direct verification:** Valve, **Steam Keys (Steamworks Documentation)** — keys for beta testers / press / influencers.  
  https://partner.steamgames.com/doc/features/keys
- **Direct verification:** Chris Zukowski, **Launching a Steam Coming Soon Page the right way** — actual solo-dev page-launch workflow using Twitter networking, Reddit, material reviews, and niche press/community targeting.  
  https://howtomarketagame.com/2023/06/06/launching-a-steam-coming-soon-page-the-right-way/
- **Direct verification:** Chris Zukowski, **What Steam’s big demo update means for your marketing strategy** — demo pages, one-time demo notification, demos as creator/festival unlocks, and New & Trending visibility behavior.  
  https://howtomarketagame.com/2024/07/31/what-steams-big-demo-update-means-for-your-marketing-strategy/
- **Direct verification:** Chris Zukowski, **The double jump trick to Steam Next Fest** — case study of holding page publication for a showcase beat and stacking announcement + Next Fest momentum.  
  https://howtomarketagame.com/2024/06/18/the-double-jump-trick-to-steam-next-fest/
- **Direct verification:** Inevitable Studios, **Last Fest, A Next Fest Post-Mortem** — press release, early demo keys, Lurkit, social outreach, sponsored livestream, and frustrations with Steam broadcast/event visibility.  
  https://www.inevitablestudios.com/post/last-fest-a-next-fest-post-mortem
- **Direct verification:** GameDiscoverCo, **The state of Steam wishlist ‘conversions’: 2024-2025** — cites a Steam sales postmortem noting ad-driven wishlists converted worse than other sources.  
  https://newsletter.gamediscover.co/p/the-state-of-steam-wishlist-conversions
