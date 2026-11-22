# Critique rubric: data and backend

Use it on your own output before calling a data task done. Blockers first: any blocker means the
work is not done. Then score each line 0 to 2 and fix every 0.

## Blockers

- Player data saved with `SetAsync` or a hand-rolled loop with no session lock.
- A key built from `player.Name` or `DisplayName`.
- `PurchaseGranted` returned before the purchase id is in the saved copy (`LastSavedData`).
- `ProcessReceipt` assigned in two scripts (DataAudit `receipt-multiple`).
- `Reconcile` called before the migration (`reconcile-before-migrate`).
- A server that can save data with a higher `SchemaVersion` than it knows.
- A trade that edits two profiles and saves them with no escrow or log.
- A trade path that never checks `IsPaidItemTradingAllowed` for both players, or treats a
  PolicyService error as allowed.
- A fallback to default or mock data that a later save can write over real data.
- Any DataAudit error finding outside test fixtures.
- A claim of "tested" with no `results.json` entry, suite output or console line behind it.
- A claim that data "saves" based only on an unpublished playtest.

## Scored items (0, 1, 2)

**Sessions**

- `StartSessionAsync` with `Cancel`; a nil profile kicks the player.
- `AddUserId`, migration, then `Reconcile`, in that order.
- `OnSessionEnd` clears the entry and kicks; `PlayerRemoving` ends the session.
- Players who joined before the script ran are loaded.
- A player who left during the load gets `EndSession` at once.

**Schema**

- `SchemaVersion` field; one migration step per version; one frozen fixture per old version.
- Steps work on a copy and fail without changing the profile.
- `DataCheck.report` of a maxed profile: zero errors, under 25% of the size limit.
- No NaN, infinity, sparse arrays, mixed keys or userdata in saved data.

**Writes and budgets**

- Every raw DataStore call sits in a pcall with bounded, ordered retries (`KeyQueue`).
- Writes that may repeat carry an op id; a failed write is checked with `UseCache = false`.
- `rbx_data.budget` at peak CCU shows headroom; autosave plus purchases fit the per-key rate.
- No per-player store names; one store per kind of data, prefixes over scopes.

**Purchases**

- One handler per product id, on the server only; handlers never yield.
- Purchase-id log capped (100) inside the profile.
- Every path that cannot confirm the save returns `NotProcessedYet`.

**Trades and shared state**

- Escrow on both profiles, both saved, one log record decides.
- Recovery runs on every load and before release (`beforeEnd`); spending is blocked while a trade is
  pending.
- No refund decided in `OnLastSave`; final edits there happen before any yield.
- Leaderboards in an `OrderedDataStore` keyed by UserId, `pageSize` at most 100.
- MemoryStore items carry an expiry; a MessagingService topic is subscribed once per server.

**Teleports**

- `TeleportAsync` with a players table, in a pcall loop with a `TeleportInitFailed` handler.
- Parties use one reserved access code for every retry.
- No currency, unlocks or secrets in teleport data.

**Operations**

- Studio tests use the mock or a separate test experience, never live keys.
- An Open Cloud snapshot is planned before a data-logic release.
- Rollback plan states the restore points (one per key per UTC hour, 30 days) and restores to before
  the bad hour.
- RTBF templates (`{UserId}`, case-sensitive) cover every key with personal data; `rtbf_uncovered`
  lists only keys with none.
- Storage stays inside 500 MB plus 1 MB per lifetime user.
- Outdated servers restart when the data format changes; every place publishes together.

## Evidence to attach

- Offline: the Lune suite counts and the rbx_check result (`run_offline.sh`).
- Live: `results.json` entries for the suites in Edit and the playtest checks.
- The list of what still needs a published place.
