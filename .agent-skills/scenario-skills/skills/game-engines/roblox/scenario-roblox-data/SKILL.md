---
name: scenario-roblox-data
description: "Use when a Roblox game saves or loads player data, or when players report data not saving, lost progress, rollbacks, duplicated items or a purchase granted twice. Triggers: DataStoreService, UpdateAsync, SetAsync, BindToClose, ProfileStore, ProfileService, DataStore2, session locking, data schema or migration, Developer Product ProcessReceipt, player trading, OrderedDataStore leaderboards, MemoryStore, MessagingService, TeleportService and reserved servers, DataStore budgets and throttling (errors 301 to 306), 'You must publish this place to the web to access DataStore', and testing data code in an unpublished place."
license: MIT
---

# Roblox Data and Backend

Roblox Studio (October 2026 build) on macOS, driven through the scenario-roblox-expert toolkit.

Expert level here means the data layer stays correct when a server crashes, a write fails after it
landed, or two servers want the same player. Prove those cases against a simulated multi-server
backend before any published test, because an unpublished place cannot reach DataStores at all.

If a sibling skill named here is missing from your available skills, load it with `skill_get`
(Scenario MCP) or ask the user to install it (https://github.com/scenario-labs/skills#install);
unattended, proceed from tool schemas and flag the gap.

**REQUIRED BACKGROUND:** scenario-roblox-expert (channels, review loop, toolkit, current-Roblox
traps).

## Stance (the expert delta)

1. **Session locks stop duplication, UpdateAsync alone does not.** One ProfileStore profile per
   player holds the lock (loleris, ProfileStore docs). `UpdateAsync` is safer than `SetAsync` only
   when the transform reads the old value (Suphi Kaner, 00:04:43).
2. **A failed write may have landed.** Read with `UseCache = false` before redoing it (Roblox best
   practices). Put an operation id inside the value so a repeat is a no-op [added]. With 30% of
   writes failing after they landed, naive retries stored 39 for 30 operations in the mock run.
3. **Retries on one key stay in order.** A late retry of an old value overwrites newer data (Roblox
   best practices). `KeyQueue` serializes per key.
4. **A purchase is granted once and confirmed saved.** Log each `PurchaseId` in the profile. Return
   `PurchaseGranted` only when `LastSavedData` holds it (Rileybytes, 00:29:08; Roblox purchasing
   doc). Every other path returns `NotProcessedYet`.
5. **Migrate before `Reconcile`.** `Reconcile` copies the template's `SchemaVersion` into old data,
   and the migration is skipped [added, proven against the real ProfileStore].
6. **Old servers never save newer data.** During an update, old and new servers run side by side.
   Refuse a higher `SchemaVersion`, release the lock untouched, and kick [added]. Publish every
   place of a multi-place game together (CJ_Oyer, 00:27:33).
7. **Two profiles never save atomically.** Editing both without a yield protects memory only
   (loleris). Escrow both sides, then let one trade-log record decide [added]. Without escrow a
   crash between the two saves duplicated a Shield and lost a Sword.
8. **Test against an injected store.** Write the data code so `DataStoreService` can be swapped for
   `MockDataStore` and run several simulated servers with the unmodified ProfileStore [added].

## Establish first

- **Published, and Studio API access on?** Unpublished: every DataStore call throws, so test with
  mocks. Published with access on: Studio writes live keys, so use a separate test experience
  (Roblox docs) or `ProfileStore.Mock`.
- **What persists where.** Player state goes in one profile. Leaderboards use an `OrderedDataStore`.
  Matchmaking and short-lived shared state use MemoryStore. Announcements use MessagingService.
- **Trading, Developer Products, multi-place?** Each adds a stage below.
- **Peak CCU, players per server, profile size.** Feed `rbx_data.budget`.
- **Data already live?** Then keys and store names are frozen; every change becomes a migration
  step.

Defaults: ProfileStore at the pinned commit, store `PlayerData`, key `Player_<UserId>`, a
`SchemaVersion` field, a 100-entry `PurchaseIds` log.

## Procedure

Modules live in `scripts/agentkit/data/` and have no requires. Inline them with
`rbx_data.run(studio, code, dm, data=[...])`, or build them into a place with
`rbx_data.build_place(dir)`. Full code and results: [procedures.md](references/procedures.md).

1. **Probe the environment.** Goal: know which services answer here. How:
   `rbx_data.probe_services(studio, "Edit")`, then `"Server"` in a playtest. GATE: the error texts
   are recorded, and the store choice (real or mock) follows from them.
2. **Design the schema.** Goal: a profile that saves as-is and grows safely. How:
   `DataCheck.report(template)` and a maxed sample, `DataCheck.key(key, {userId})`. GATE: zero error
   findings, size under 25% of 4,194,304 characters, and a JSON round trip equal to the input.
3. **Plan the budget.** Goal: no throttling at peak. How:
   `rbx_data.budget(players, ccu, kb, saves_per_min)`. GATE: `ok` is true at peak CCU, and the
   per-key writes per minute cover autosave plus purchases.
4. **Wire sessions.** Goal: one owner per profile. How: `PlayerData` runs `StartSessionAsync` with
   `Cancel`, kicks on nil, then `AddUserId`, migrate, `Reconcile`, a kick on `OnSessionEnd`, and
   `EndSession` on leave. GATE: the `sessions` suite passes, and a playtest shows the profile loaded
   with `DataStoreState` "NoAccess".

```lua
local Players = game:GetService("Players")
local ServerStorage = game:GetService("ServerStorage")
local ProfileStore = require(ServerStorage.Packages.ProfileStore)
local PlayerData = require(ServerStorage.DataKit.PlayerData)
local Migrate = require(ServerStorage.DataKit.Migrate)

local data = PlayerData.new({
	ProfileStore = ProfileStore,
	Players = Players,
	storeName = "PlayerData",
	template = { SchemaVersion = 2, Coins = 0, Inventory = {}, PurchaseIds = {} },
	migrate = Migrate.new({
		latest = 2,
		steps = {
			-- v1 kept owned items as an array of names; v2 counts them by id.
			[2] = function(d: any)
				d.Inventory = d.Inventory or {}
				for _, item in ipairs(d.Items or {}) do
					d.Inventory[item] = (d.Inventory[item] or 0) + 1
				end
				d.Items = nil
			end,
		},
	}),
})
data:Start()
```

5. **Version the schema.** Goal: old data upgrades once. How: `Migrate.new{latest, steps}`, one
   fixture per old version. GATE: the `schema` suite passes, including the Reconcile trap and the
   "newer" refusal.
6. **Grant purchases.** Goal: exactly one grant per `PurchaseId`. How:
   `Receipts.new{getProfile, isPresent, handlers}`; assign `ProcessReceipt` in one script. GATE: the
   `receipts` suite passes with ghost writes, crashes and server changes.
7. **Raw stores.** Goal: leaderboards, counters and logs that survive retries. How:
   `KeyQueue.new(store)` with an op id in the value and a `verify` function. GATE: the `keyqueue`
   suite passes.
8. **Trades.** Goal: no item created or lost by a crash. How: `Trade.paidTradingAllowed` for both
   players (PolicyService `IsPaidItemTradingAllowed`, fail closed),
   `Trade.new{log = KeyQueue.new(tradeLogStore)}`, `trade:Recover(profile)` in `onLoaded`. GATE: the
   `trade` suite passes at every crash stage.
9. **Teleports.** Goal: parties arrive together. How: `SafeTeleport.new{TeleportService}`,
   `TeleportParty` for groups. GATE: the `teleport` suite passes against the fake service; a real
   teleport needs a published experience.
10. **Audit.** Goal: no known mistake left in the code. How: `DataAudit.place(game)` in Edit, or
    `rbx_data.py audit place.rbxl` offline. GATE: zero error findings outside test fixtures.
11. **Operate.** Rollbacks with `PlayerData:Restore` (ProfileStore `VersionQuery`), final edits in
    `OnLastSave`, RTBF templates with `rbx_data.rtbf_config`: procedures 13 to 15.
12. **Prove and report.** Run the offline suites, then the same suites in Studio Edit through
    `rbx_run`, then the playtest checks. List what still needs a published place.

## Numbers

| Value                                                                | Relative to                                                    |
| -------------------------------------------------------------------- | -------------------------------------------------------------- |
| Server read or write: 60 + 40 x players per minute                   | Per server, default, tunable                                   |
| Experience read 300 + 40 x CCU, write 300 + 20 x CCU per minute      | Whole experience, shared with Open Cloud                       |
| `UpdateAsync`, so every ProfileStore save, spends 1 read and 1 write | Both budgets                                                   |
| Per key: write 4 MB per minute, read 25 MB per minute                | Rounded up to whole KB per request                             |
| Value 4,194,304 characters; key, name, scope 50                      | Per key                                                        |
| Queue of 30 per request type, then errors 301 to 306                 | Per server                                                     |
| GetAsync cache 4 s                                                   | Per data store instance                                        |
| One version kept per key per UTC hour, 30 days after overwrite       | Per key                                                        |
| Storage 500 MB + 1 MB x lifetime users                               | Compressed latest versions                                     |
| ProfileStore autosave 300 s, steal 40 s, assume dead 630 s           | Pinned source; assume dead compares `os.time()` across servers |
| ProfileStore first retry 5 s, then every 10 s                        | While another server holds the lock                            |
| Profile load over 5 s                                                | Treat as a bug (loleris)                                       |
| BindToClose budget 30 s                                              | Per server shutdown                                            |
| MessagingService message 1 kB                                        | Per publish                                                    |

## Quality gates

- `run_offline.sh`: all Lune suites pass, rbx_check reports zero errors in kit, place and snippets.
- `run_live.py`: the same suites pass in Studio Edit, and the playtest checks pass.
- `DataAudit`: zero error findings outside fixtures.
- Console: one "[ProfileStore]: Roblox API services unavailable" line in an unpublished playtest,
  and no save errors.
- Published test experience (later): two real servers hand a player over in under 5 s.

## Common mistakes

| Mistake                                                          | Symptom                                       | Fix                                            |
| ---------------------------------------------------------------- | --------------------------------------------- | ---------------------------------------------- |
| `SetAsync` on `PlayerRemoving`, no lock                          | Rollbacks, duplicated items after server hops | ProfileStore through `PlayerData`              |
| Key from `player.Name`                                           | Data lost after a rename                      | `Player_<UserId>`                              |
| `Reconcile` before migration                                     | Old fields stranded, new fields empty         | Migrate first                                  |
| Retry by recalling the same write                                | Counters too high                             | Op id in the value, `KeyQueue`                 |
| `PurchaseGranted` before the save                                | Paid but not granted after a crash            | `Receipts`                                     |
| Handler that yields                                              | Grant applied twice                           | Handlers run on a copy and must not yield      |
| Two profile saves as a trade                                     | Items duplicated or lost                      | `Trade` with escrow                            |
| `GetDataStore` outside pcall                                     | Script errors at startup in Studio            | Probe inside pcall, then fall back to the mock |
| Awaiting MessagingService in an unpublished playtest             | Thread hangs                                  | Call it in `task.spawn`                        |
| Retrying a teleport with `ShouldReserveServer`                   | Party split across servers                    | Reserve once, reuse the access code            |
| Editing a ModuleScript's Source in Edit, then requiring it again | The old code keeps running                    | Replace the module with a Clone first          |

## Handoffs

- From scenario-roblox-architecture: where the data service lives and how systems read it.
- From scenario-roblox-monetization: product ids and amounts. Back: the `Receipts` handler table.
- From scenario-roblox-networking: validated trade and shop requests. Back: `Trade` and inventory
  calls.
- To scenario-roblox-ui and scenario-roblox-gameplay: values exposed as Attributes or signals, never
  raw profiles.
- To scenario-roblox-performance: shutdown timing and update publishing.
- To scenario-roblox-tooling: the Lune suites for CI.
- To scenario-roblox-luau: types for the template.

## Current Roblox notes

- DataStore limits became experience-wide on 2026-07-29; old answers quote 60 + 10 x players and a 6
  s cooldown, both gone.
- Storage limits are enforced from 2026-04-09.
- `HttpService:JSONEncode` encodes NaN and infinity as tagged objects since 2026-03-10, and drops
  sparse and mixed entries silently (live test).
- ProfileService is unsupported; use ProfileStore. DataStore2 is legacy.
- `ReserveServerAsync` replaces `ReserveServer`.
- Studio API access: File > Experience Settings > Security > Enable Studio Access to API Services,
  published games only.
- Studio budgets do not follow the server formulas: a one-player playtest read 585.

## References

- [references/expert-notes.md](references/expert-notes.md): principles by expert, with timestamps.
- [references/procedures.md](references/procedures.md): full procedures, test paths, results.
- [references/critique.md](references/critique.md): rubric for judging a data layer.
- [references/gui-paths.md](references/gui-paths.md): Studio and Creator Hub paths for the same
  work.
- [references/sources.md](references/sources.md): every source with links.
- [scripts/rbx_data.py](scripts/rbx_data.py): budget, ProfileStore fetch, place build, probe, audit.
- [scripts/agentkit/data/](scripts/agentkit/data/): MockDataStore, ServerSim, DataCheck, Migrate,
  KeyQueue, Receipts, Trade, PlayerData, SafeTeleport, DataAudit.
