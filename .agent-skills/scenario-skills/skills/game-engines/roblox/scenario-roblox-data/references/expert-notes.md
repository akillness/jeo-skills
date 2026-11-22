# Expert notes: data and backend

Principles and judgment by source, with timestamps. URLs are in [sources.md](sources.md). Items
marked [added] are this skill's own additions. "Live" means run in Roblox Studio 0.743 on 2026-10-18
(see [procedures.md](procedures.md)). "Mock" means run against `MockDataStore` with the unmodified
ProfileStore, in Lune and in Studio.

## Corrections and findings from live tests

| Claim in the sources or notes                                                     | Test result                                                                                                                                                         | Use instead                                                     |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Server budget 60 + 10 x players, 6 s write cooldown per key (2023 videos)         | Docs 2026: 60 + 40 x players per server, experience-wide limits; no cooldown                                                                                        | the 2026 formulas in SKILL.md Numbers                           |
| Studio budgets show the production limits (agent assumption)                      | Live: Edit read and write budgets were 1,144, then 2,673 later in the same session; a one-player playtest Server showed 585 (formula: 100)                          | budget math from formulas, never from Studio                    |
| An unpublished place fails at `GetAsync` (agent assumption)                       | Live: `GetDataStore` itself throws "You must publish this place to the web to access DataStore."                                                                    | both calls inside one pcall                                     |
| MessagingService errors in an unpublished playtest (agent assumption)             | Live: Publish and Subscribe never answered within 10 s in the playtest Server                                                                                       | call it in `task.spawn` with a deadline                         |
| ProfileStore autosaves every 300 s (MonzterDEV, Rileybytes, to verify)            | Pinned source: `AUTO_SAVE_PERIOD = 300`                                                                                                                             | 300 s                                                           |
| ProfileStore releases a session through MessagingService (Rileybytes, MonzterDEV) | Source and mock: also through `ForceLoadSession`, read at the owner's next save                                                                                     | budget a handoff up to one autosave period if messages are lost |
| `JSONEncode` checks reveal bad data (ProfileStore docs)                           | Live: sparse `{[1]="a",[3]="c"}` and mixed `{"a", b=1}` both encode to `["a"]`, no error                                                                            | `DataCheck.value` before the save                               |
| NaN cannot be saved (common advice)                                               | Live: encodes as `{"m":null,"t":"numeric","v":"nan"}`                                                                                                               | still reject it: it survives as a tagged object, not a number   |
| `TeleportService` "does not run in Studio" (BrawlDev, Paul1Rb)                    | Live: `ReserveServerAsync` gave "HTTP 403 (Forbidden)", `TeleportAsync` "Request Context Failure: response code is not 200"                                         | logic tests against a fake service                              |
| ProfileStore needs a published place in Studio (videos)                           | Live: unpublished playtest printed "[ProfileStore]: Roblox API services unavailable - data will not be saved", `DataStoreState` "NoAccess", sessions work in memory | fine for logic, never for persistence                           |
| Sorted-map bounds apply to values (XTB7, EpF5oWNS-Pk)                             | Docs: bounds are tables with `key` and `sortKey`; sort key takes precedence                                                                                         | the docs                                                        |

## loleris (ProfileStore author, MAD STUDIO), ProfileStore docs and source

- One profile per player holds a session lock; no other server can load it until the owner releases
  or the lock expires.
- `Profile:IsActive()` holds only until the next yield. Trade by editing both profiles without
  yielding.
- That protects memory only: the two keys save separately, so a crash can still persist one side
  [added, proven in the mock].
- `OnLastSave` is for final changes; `OnSessionEnd` is not. Neither runs on a crash.
- Call `EndSession` at once when the player leaves, or the next server stalls.
- A profile load over 5 s is a bug to investigate.
- Studio with API access writes live keys. Use `ProfileStore.Mock` or a separate test experience.
- `MessageAsync` delivers critical messages to offline players; MessagingService is best effort.
- Debug saving errors by passing the data through `HttpService:JSONEncode`.
- Source constants at the pinned commit: autosave 300 s, steal after 40 s, assume dead after 630 s,
  first retry 5 s then every 10 s, start timeout 120 s.
- `ASSUME_DEAD` compares `os.time()` values written by different servers. Mock: a server 700 s ahead
  took a live session at once [added].
- Every ProfileStore save is one `UpdateAsync`, so it spends one read and one write (source).
- `OnLastSave` reasons: "Manual" (`EndSession`), "Shutdown", "External" (another server asked). It
  does not fire when another server steals the session (source; tested in the mock).
- `VersionQuery(key, sort_direction, min_date, max_date)` lists versions; `NextAsync()` returns
  read-only profiles; `Profile:SetAsync()` writes one back and clears the session lock. In mock mode
  `VersionQuery` returns nothing (source).

## Roblox Creator Docs (data stores, memory stores, messaging, teleport)

- A failed write may have succeeded. Read with `UseCache = false` before a refund or retry (best
  practices).
- Retries on one key must keep order, or an old retry overwrites newer data (player data and
  purchasing).
- Retry with exponential backoff and random jitter, capped (player data and purchasing).
- Never let fallback data overwrite real data later (player data and purchasing).
- Return `PurchaseGranted` only after the purchase is saved; record every purchase, even consumables
  (player data and purchasing).
- `UpdateAsync` spends a read and a write. Throughput counts whole KB per request (errors and
  limits).
- A queue of 30 requests per type; beyond it, errors 301 to 306 mean the request was dropped (errors
  and limits).
- Open Cloud shares the experience budget with game servers (errors and limits).
- `GetAsync` caches 4 s per data store instance; two instances can disagree (versioning, listing and
  caching).
- The first write to a key in each UTC hour creates a version; later writes in that hour overwrite
  it for good. A version expires 30 days after being overwritten; the latest never expires
  (versioning).
- Restore by reading the closest older version and writing it back; the doc sample uses
  `ListVersionsAsync` descending with a max date, then `GetVersionAsync` (versioning).
- Take a snapshot through Open Cloud before publishing a change to data logic (versioning).
- Storage limit 500 MB plus 1 MB per lifetime user, measured compressed. Do not pre-compress (errors
  and limits).
- RTBF templates match static key patterns with the exact `{UserId}` token, up to 100 templates
  (right to be forgotten).
- The token is case-sensitive; a blank scope means "global"; the user id must sit in the store name,
  key or scope (right to be forgotten).
- Data that templates cannot match needs the right-to-erasure webhook and a custom deletion process
  (best practices).
- `IsPaidItemTradingAllowed` false: block trading of items the player purchased with in-experience
  currency or Robux (paid random items; PolicyService reference).
- `GetPolicyInfoForPlayerAsync` yields and errors; it fails with "called too many times" past 100
  pending calls (PolicyService reference).
- Sorted maps and queues live on one partition; hot keys need sharding (memory stores best
  practices).
- Subscribe to a MessagingService topic once per server, not per player [added; the doc sample
  subscribes per player].
- Teleport data is visible to the client. `TeleportInitFailed` catches failures after
  `TeleportAsync` returned (teleport).
- Restart outdated servers when the data format changes; otherwise old and new versions run side by
  side (update games).

## Suphi Kaner (author of Suphi's DataStore Module)

His comparison promotes his own module; the reasoning below holds regardless.

- `UpdateAsync` is safer than `SetAsync` only when the transform uses the old value (00:04:09,
  00:04:43).
- DataStore2's ordered backups are obsolete: built-in versions keep 30 days and the 6 s limit is
  gone (00:10:48).
- Session locking is the feature that matters: one server owns the key, so stale caches cannot
  overwrite newer data (00:15:36).
- Lock expiry must not depend on `os.time`, which differs between servers (00:23:51).
- A 30-minute stale-lock timeout locks players out for up to 30 minutes after an outage (00:25:30).
  ProfileStore now uses 630 s.
- His lock lives in MemoryStore with a renewed expiry; lowest settings he would use: 3 attempts at
  30 s (00:38:33, 00:45:48).
- Deciding condition: choose ProfileStore unless a measured budget problem needs MemoryStore locks
  [added].

## Rileybytes (ProfileStore setup and Developer Products)

- `ProcessReceipt` may yield. Return `PurchaseGranted` only when the id is in `LastSavedData`, after
  `Save()` and `OnAfterSave` (8FIj3gmP5Ls 00:14:23, 00:29:08 to 00:34:31).
- Return a decision on every branch; default `NotProcessedYet` (8FIj3gmP5Ls 00:16:24).
- Wait for the profile at receipt time: the callback fires right when the player joins (8FIj3gmP5Ls
  00:16:55).
- Keep a capped purchase-id log (100) in `profile.Data` and grant only when the id is absent
  (8FIj3gmP5Ls 00:25:08).
- Retry every 10 s while `profile:IsActive()` (8FIj3gmP5Ls 00:29:08 to 00:34:31).
- Handlers must not yield; this skill runs them on a copy and refuses a yield, since a resumed
  handler would grant after `NotProcessedYet` [added, proven in the mock].
- Use a separate store name in Studio ("Test") so playtests cannot touch live data (m2SP_TLeWHI
  00:05:39).
- `Cancel` stops load retries for a player who left (m2SP_TLeWHI 00:08:04).
- `AddUserId` and `Reconcile` after every load (m2SP_TLeWHI 00:09:09).
- `OnSessionEnd` must clear the profile entry and kick (m2SP_TLeWHI 00:13:43).
- Load players who joined before the script ran, in `task.spawn` (m2SP_TLeWHI 00:18:53).
- `Reconcile` before migration copies the template's `SchemaVersion` and skips the migration [added,
  proven with the real ProfileStore].

## MonzterDEV and Possible Panda (ProfileStore services)

- Changing the store-name constant resets data reversibly (MonzterDEV, evBhoqeYegQ 00:07:17).
- `Cancel = function() return player.Parent ~= Players end` (MonzterDEV, 00:10:13).
- Kick when the profile fails to load (Possible Panda, 0rmh0FpHBYM 00:06:38).
- `AddUserId` ties the profile to deletion requests; `Reconcile` fills new keys (Possible Panda,
  00:07:27).
- If the player left during the load, end the session at once (Possible Panda, 00:09:25).
- Check that a Creator Store copy of ProfileStore comes from loleris or MAD STUDIO (MonzterDEV,
  00:01:52). This skill fetches it from GitHub at a pinned commit with a hash [added].

## BrawlDev, Paul1Rb and TextChanged (teleports, leaderboards)

- `TeleportAsync` takes a table of players, even for one (BrawlDev, vNsAGifGCvA 00:10:40).
- Use teleport data for session config only; trusted or persistent data goes in DataStores
  (BrawlDev, 00:26:40).
- Set exactly one of `ReservedServerAccessCode`, `ServerInstanceId`, `ShouldReserveServer` (Paul1Rb,
  ytuwR-toxBc 00:03:46).
- `TeleportAsync` does not return another server's JobId; pass it through a store or a message
  (Paul1Rb, 00:06:00).
- Studio multi-client tests cannot teleport two accounts; the second hit error 773 (TextChanged,
  NUbjcGDlSLM 00:17:04).
- `GetSortedAsync(ascending, pageSize)` with `pageSize` at most 100 (BrawlDev, GfKYmecLVn4
  00:07:47).
- Retrying with `ShouldReserveServer` reserves a new server, so a party splits; reserve once and
  reuse the code [added, proven against a fake service].
- Cap `TeleportInitFailed` retries; the doc sample retries without a cap [added].

## CJ_Oyer (Connect 2023, Open Cloud workflows)

- Publish every place of a multi-place game together: an old server reading newer data errors
  (gapG2tH-etI 00:27:33).
- Refuse a higher `SchemaVersion`, release untouched and kick, so an old server never saves newer
  data [added, proven in the mock].

## This skill's own findings [added]

- Without escrow, a crash between the two saves of a trade left 3 Shields and 0 Swords (mock).
- With 30% of writes failing after they landed, naive retries stored 39 for 30 operations; an op id
  in the value stored 30 (mock).
- A single trade-log record written with `UpdateAsync(old or outcome)` decides for both sides; the
  first writer wins (mock).
- A server that falls back to a memory store on any error loses data during an outage. Fall back
  only on "must publish" or 403 [added].
- Policy checks fail closed: an error or a missing field blocks the trade, as
  scenario-roblox-monetization does for paid random items [added].
- Restore to before the start of the hour that holds the bad write: that hour's version contains it
  [added].
- An `OnLastSave` edit made after a yield missed the final save (mock) [added].
- A trade-log key is a trade id, so RTBF templates never match it; keep it free of personal data
  (outcome only) [added].
