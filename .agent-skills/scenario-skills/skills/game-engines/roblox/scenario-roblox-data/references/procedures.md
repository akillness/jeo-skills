# Procedures: data and backend

Each procedure gives the goal, the full code, the test that runs it, and the result. Modules come
from `scripts/agentkit/data/` (no requires between them). In a place they live in
`ServerStorage.DataKit`, built by `rbx_data.build_place(dir)`; ProfileStore lives in
`ServerStorage.Packages.ProfileStore` at the pinned commit (`rbx_data.fetch_profilestore`).

Blocks that start with `-- run: Edit` are chunks for `rbx_data.run(studio, code, "Edit")`: they
`return` a table whose `pass` field the live test asserts. The other Luau blocks are server Script
code, taken from the test place's `DataService` script, which runs in the playtest checks.

Test runners, from the project root of the skills repository:

- Offline: `tests/code/scenario-roblox-data/run_offline.sh` (Lune suites, then Python checks O1 to
  O5).
- Live: `python3 tests/code/scenario-roblox-data/run_live.py` (L01 to L06), results in
  `tests/live_evidence/scenario-roblox-data/results.json`.

Every Luau block below passes `rbx_check.check()` with zero errors (offline check O5).

## 1. Probe what the data services do here

Goal: record the exact behavior of DataStore, MemoryStore, MessagingService and TeleportService in
this place and data model, before choosing real or mock stores.

```python
import sys
from pathlib import Path
sys.path.insert(0, str(Path("skills/scenario-roblox-data/scripts").resolve()))
import rbx_data, rbx_env
from rbx_play import Playtest

with rbx_env.place_slot():
    studio = rbx_env.open_place("tests/places/data/data.rbxl")
    edit = rbx_data.probe_services(studio, "Edit")
    with Playtest(studio) as play:
        server = rbx_data.run(studio, rbx_data.PROBE, "Server", timeout=180)
```

Each call runs in its own thread with a 10 s deadline, so a call that never returns cannot hide the
others.

- Test: `run_live.py` L01 (Edit) and L05d (playtest Server).
- Result: run in Studio 0.743 on 2026-10-18: pass. In an unpublished place, Edit and playtest
  Server:
  - `GetDataStore` itself throws "You must publish this place to the web to access DataStore."
  - MemoryStore throws "You must publish this place to use MemoryStoreService."
  - MessagingService throws "can only be executed by game server" in Edit.
  - In a playtest Server, `PublishAsync` and `SubscribeAsync` gave no answer within 10 s.
  - `ReserveServerAsync` failed with "HTTP 403 (Forbidden)".
  - `TeleportAsync` failed with "Request Context Failure: response code is not 200".
  - StandardWrite budget read 585 with one player, where the server formula gives 100. Studio
    budgets say nothing about production.
  - `JSONEncode` turned NaN into `{"m":null,"t":"numeric","v":"nan"}` and `{[1]="a",[3]="c"}` into
    `["a"]`.

## 2. Choose the real store or the mock at startup

Goal: the same game code runs published (real DataStores) and unpublished (mock), and an outage
never silently switches a live game to memory.

```lua
local DataStoreService = game:GetService("DataStoreService")
local Players = game:GetService("Players")
local Mock = require(game:GetService("ServerStorage").DataKit.MockDataStore)

-- Mock only when this place cannot reach DataStores at all; an outage keeps the real store.
local function pickStore(name: string): (any, string)
	local real: any
	-- In an unpublished place GetDataStore itself throws.
	local ok, err = pcall(function()
		local store = DataStoreService:GetDataStore(name)
		real = store
		return store:GetAsync("__probe")
	end)
	local message = tostring(err)
	if ok or not (message:find("must publish", 1, true) or message:find("403", 1, true)) then
		return real or DataStoreService:GetDataStore(name), "real"
	end
	local backend = Mock.newBackend({ latency = { 0.01, 0.05 } })
	local server = backend:server({
		jobId = game.JobId,
		players = function()
			return #Players:GetPlayers()
		end,
	})
	return server.DataStoreService:GetDataStore(name), "mock: " .. message
end

local tradeStore, kind = pickStore("TradeLog")
print("TradeLog store:", kind, tradeStore ~= nil)
```

The mock keeps:

- the engine's method names and return shapes;
- a 4 s `GetAsync` cache per store instance;
- `UpdateAsync` transform re-runs on conflict;
- one version per key per UTC hour;
- budgets, the 30-request queue and per-key throughput;
- injected faults: `error`, `ghost` (applied, then failed) and `conflict`, plus `server:crash()`.

- Test: `suites/mock_semantics.luau` (14 tests) in Lune and in Studio Edit (L03); playtest L05a
  reads the store kind.
- Result: Lune 0.11: 14 of 14 pass. Run in Studio 0.743 on 2026-10-18: 14 of 14 pass; in the
  playtest the trade log reported "mock: You must publish this place to the web to access
  DataStore."

## 3. Check the schema and its size

Goal: a profile that the encoder keeps as-is, under a quarter of the value limit, with keys built
from UserId.

```lua
-- run: Edit
local DataCheck = require(game:GetService("ServerStorage").DataKit.DataCheck)

local maxed = { SchemaVersion = 2, Coins = 2 ^ 40, Inventory = {}, PurchaseIds = {}, Settings = { Music = 0.5 } }
for i = 1, 250 do
	maxed.Inventory["item_" .. i] = 999
end
for i = 1, 100 do
	maxed.PurchaseIds[i] = "0123456789abcdef0123456789abcdef"
end
local report = DataCheck.report(maxed)
local keyFindings = DataCheck.key("Player_123456", { userId = 123456 })
local broken = DataCheck.value({ owned = { [1] = "Sword", [5] = "Bow" }, ratio = 0 / 0 })
return {
	pass = report.ok and report.percent < 25 and #keyFindings == 0 and #broken == 2,
	kb = report.kb,
	percent = report.percent,
	writesPerMinute = report.writesPerMinute,
	broken = broken,
}
```

`DataCheck.value` flags NaN, infinity, invalid UTF-8, sparse arrays, mixed keys, non-string keys,
userdata, cycles and depth over 100. `DataCheck.roundTrip(v, encode, decode)` catches what an
encoder drops.

- Test: `suites/schema.luau` tests 1 to 4 (Lune and Studio Edit), and L06 runs this block.
- Result: Lune 0.11 (suite) and run in Studio 0.743 on 2026-10-18: pass. The maxed profile is 8 KB,
  0.17% of the limit, 512 writes per minute per key; the broken sample gives exactly the `sparse`
  and `nan` errors.

## 4. Plan the request budget

Goal: know the headroom at peak before launch.

```python
import rbx_data
plan = rbx_data.budget(players=20, ccu=20000, kb=40, saves_per_min=1)
# {'server_write_limit': 860, 'experience_write_limit': 400300, 'key_max_writes_per_min': 102, 'ok': True, ...}
```

Count one ProfileStore save as one read and one write. Count each player's join and leave as one
load and one release save.

- Test: `test_offline.py` O1.
- Result: offline check O1 on 2026-10-18: pass.
  - 20 players per server: 860 writes per minute per server.
  - 20,000 CCU: 400,300 writes per minute for the experience.
  - A 40 KB profile: 102 writes per minute per key.

## 5. Wire player sessions with ProfileStore

Goal: one server owns a profile; a second server waits, asks, or steals only when the owner is gone.

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
			[2] = function(d: any)
				d.Inventory = d.Inventory or {}
				for _, item in ipairs(d.Items or {}) do
					d.Inventory[item] = (d.Inventory[item] or 0) + 1
				end
				d.Items = nil
			end,
		},
	}),
	onLoaded = function(player: Player, profile: any)
		player:SetAttribute("Coins", profile.Data.Coins)
	end,
})
data:Start()
```

`PlayerData` does, in order:

1. `StartSessionAsync(key, {Cancel = player left})`; kick on nil.
2. `AddUserId`.
3. Migrate; on "newer" or a failed step, release untouched and kick.
4. `Reconcile`.
5. Kick and forget the profile on `OnSessionEnd`.
6. `EndSession` at once if the player left during the load.
7. `EndSession` on `PlayerRemoving`.

It runs the same load for players who joined before the script ran. ProfileStore saves every profile
on `BindToClose` by itself.

How ProfileStore hands a profile over (read from the pinned source, then tested): the new server
writes `ForceLoadSession` into the key and publishes a release request through MessagingService. The
owner releases on the message or at its next save, whichever comes first. The new server retries
after 5 s, then every 10 s, and steals after 40 s. A lock whose `LastUpdate` is older than 630 s is
taken at once; `LastUpdate` comes from the writing server's `os.time()`.

- Test: `suites/sessions.luau`, 11 tests with the unmodified ProfileStore on simulated servers
  (procedure 12). Cases: handoff, crash steal, assume dead, live release, lost message, lost message
  with no save, clock skew, Cancel, newer schema, left before loaded, shutdown. Playtest L05a uses
  the real engine.
- Result: Lune 0.11: 11 of 11 pass. Run in Studio 0.743 on 2026-10-18: 11 of 11 pass. Studio
  numbers:
  - Handoff 0.38 s.
  - Crash steal 3.67 s with `SESSION_STEAL` set to 3 s; the unsaved change was absent (no
    duplicate).
  - A server whose clock ran 700 s ahead took a live session in 0.03 s; the owner was kicked at its
    next save.
  - Shutdown saved and released 10 profiles in 0.07 s.
- Playtest: profile `Player_<UserId>` loaded with `DataStoreState` "NoAccess", data at
  `SchemaVersion` 2, UserIds holding the player.

## 6. Migrate saved data

Goal: every old profile reaches the latest schema once, failures change nothing, and newer data is
refused.

```lua
-- run: Edit
local Migrate = require(game:GetService("ServerStorage").DataKit.Migrate)

local schema = Migrate.new({
	latest = 3,
	steps = {
		[2] = function(d: any)
			d.Inventory = {}
			for _, item in ipairs(d.Items or {}) do
				d.Inventory[item] = (d.Inventory[item] or 0) + 1
			end
			d.Items = nil
		end,
		[3] = function(d: any)
			d.Coins = (d.Coins or 0) + (d.Gold or 0) * 10
			d.Gold = nil
		end,
	},
})

-- One frozen fixture per old version, plus data from a newer build.
local v1: any = { Coins = 5, Gold = 2, Items = { "Sword", "Sword", "Shield" } }
local v2: any = { SchemaVersion = 2, Coins = 1, Gold = 1, Inventory = { Bow = 1 } }
local v4: any = { SchemaVersion = 4, Gems = 3 }
local s1, from1 = schema:run(v1)
local s2 = schema:run(v2)
local s4 = schema:run(v4)
return {
	pass = s1 == "migrated" and from1 == 1 and v1.Coins == 25 and v1.Inventory.Sword == 2
		and s2 == "migrated" and v2.Coins == 11 and s4 == "newer" and v4.SchemaVersion == 4,
	v1 = v1,
	v2 = v2,
}
```

Run `schema:run(profile.Data)` before `profile:Reconcile()`. Steps edit a copy; the profile table
keeps its identity and changes only when every step succeeds.

- Test: `suites/schema.luau` tests 5 to 7, including the Reconcile trap with the real ProfileStore;
  L06 runs this block.
- Result: Lune 0.11 (suite) and run in Studio 0.743 on 2026-10-18: pass. This block: v1 reached
  `Coins` 25 and `Inventory.Sword` 2, v2 reached `Coins` 11, v4 returned "newer" untouched. Suite,
  Reconcile first: status "current", `Inventory.Sword` nil (items stranded). Migrate first:
  `Inventory.Sword` 2, `Coins` 10.

## 7. Grant Developer Products exactly once

Goal: one grant per `PurchaseId`, `PurchaseGranted` only when the saved copy holds the id.

```lua
local Players = game:GetService("Players")
local MarketplaceService = game:GetService("MarketplaceService")
local ServerStorage = game:GetService("ServerStorage")
local ProfileStore = require(ServerStorage.Packages.ProfileStore)
local PlayerData = require(ServerStorage.DataKit.PlayerData)
local Receipts = require(ServerStorage.DataKit.Receipts)

local PRODUCT_100_COINS = 1001 -- product ids stay on the server

local data = PlayerData.new({
	ProfileStore = ProfileStore,
	Players = Players,
	template = { SchemaVersion = 1, Coins = 0, PurchaseIds = {} },
})
data:Start()

local receipts = Receipts.new({
	getProfile = function(userId: number)
		local player = Players:GetPlayerByUserId(userId)
		return player and data.Profiles[player]
	end,
	isPresent = function(userId: number)
		return Players:GetPlayerByUserId(userId) ~= nil
	end,
	handlers = {
		-- Runs on a copy of Data, must not yield, returns true when granted.
		[PRODUCT_100_COINS] = function(d: any)
			d.Coins += 100
			return true
		end,
	},
})

-- Assign in exactly one script: only the last assignment runs.
MarketplaceService.ProcessReceipt = function(info)
	return receipts:Process(info)
end
```

`Receipts:Process` waits for the profile while the buyer is in the server (the callback fires right
at join), grants and logs the id in one step, saves, and waits for `OnAfterSave`. It retries every
10 s while the session is active. Every other path returns `NotProcessedYet`.

- Test: `suites/receipts.luau` (6 tests) with ProfileStore on simulated servers; playtest L05b
  through the place's `DataTestHook`.
- Result: Lune 0.11: 6 of 6 pass. Run in Studio 0.743 on 2026-10-18: 6 of 6 pass. Same id twice: one
  grant. Ghost writes on 30% of saves: 10 receipts, 10 grants, saved coins 1,000. Saves failing and
  the player leaving: `NotProcessedYet`, and redelivery on another server granted nothing new
  because the release save carried the grant. Crash before the save: redelivery on another server
  granted once. Yielding handler: refused, Coins unchanged. Playtest: first and second calls
  `PurchaseGranted`, Coins 100, the id in `LastSavedData`, absent buyer `NotProcessedYet`, the Coins
  attribute 100 on the client.

## 8. Write raw stores safely (leaderboards, counters, logs)

Goal: retries keep per-key order, and a write that failed after landing is not applied twice.

```lua
-- run: Edit
local DataKit = game:GetService("ServerStorage").DataKit
local Mock = require(DataKit.MockDataStore)
local KeyQueue = require(DataKit.KeyQueue)

-- In a game: KeyQueue.new(DataStoreService:GetDataStore("Counters")).
local backend = Mock.newBackend({ seed = 11, latency = { 0.001, 0.002 } })
backend:setFault("UpdateAsync", "ghost", 0.3)
local store = backend:server({ jobId = "A", players = 10 }).DataStoreService:GetDataStore("Counters")
local queue = KeyQueue.new(store, { base = 0.001, maxDelay = 0.01 })

local function addVisit(opId: string)
	return queue:UpdateAsync("visits", function(old: any)
		old = old or { n = 0, ops = {} }
		if table.find(old.ops, opId) then
			return nil -- already applied by a write that reported an error
		end
		old.n += 1
		table.insert(old.ops, opId)
		while #old.ops > 50 do
			table.remove(old.ops, 1)
		end
		return old
	end, function(stored: any)
		return stored ~= nil and table.find(stored.ops, opId) ~= nil
	end)
end

for i = 1, 30 do
	addVisit("visit-" .. i)
end
local stored: any = backend:peek("Counters", "visits")
return { pass = stored.n == 30, stored = stored.n, ghosts = backend.stats.injected.ghost }
```

`KeyQueue.classify` never retries 101 to 107, 403, 509 and 511 to 513 (bugs or settings) or "must
publish". It retries throttles (301 to 306) and 5xx with backoff 1, 2, 4 s plus jitter, capped at 32
s.

- Test: `suites/keyqueue.luau` (6 tests); L06 runs this block.
- Result: Lune 0.11 (suite, 6 of 6) and run in Studio 0.743 on 2026-10-18: pass. This block stored
  30 with 10 ghost writes. Suite: a naive per-call retry let the old value land after the new one;
  with 30% ghost writes, naive retries stored 39 for 30 operations (9 ghosts); the queue stored 30,
  and the no-cache read settled 10 writes.

## 9. Trade items between two players

Goal: a crash at any point neither creates nor destroys an item.

```lua
local DataStoreService = game:GetService("DataStoreService")
local HttpService = game:GetService("HttpService")
local PolicyService = game:GetService("PolicyService")
local DataKit = game:GetService("ServerStorage").DataKit
local Trade = require(DataKit.Trade)
local KeyQueue = require(DataKit.KeyQueue)

local trade = Trade.new({
	log = KeyQueue.new(DataStoreService:GetDataStore("TradeLog")),
	guid = function()
		return HttpService:GenerateGUID(false)
	end,
})

-- After both players confirmed the same offer (validated by the networking layer):
local function swap(playerA: Player, playerB: Player, profileA: any, profileB: any, offerA: { [string]: number }, offerB: { [string]: number })
	-- Paid-item trading is a per-player policy; a PolicyService error counts as not allowed.
	if not (Trade.paidTradingAllowed(PolicyService, playerA) and Trade.paidTradingAllowed(PolicyService, playerB)) then
		return "blocked", "paid item trading is not allowed for one of the players"
	end
	local status, reason = trade:Execute(profileA, profileB, offerA, offerB)
	-- "committed", "aborted", "pending" (escrow kept, resolved on next load) or "invalid"
	return status, reason
end

-- In PlayerData's onLoaded, after migration and Reconcile:
local function onLoaded(_player: Player, profile: any)
	trade:Recover(profile)
end

return { swap = swap, onLoaded = onLoaded, locked = Trade.locked }
```

Stages: escrow both offers into `Data.PendingTrade` (no yield), save both and wait for both
`LastSavedData`, write the trade-log record with `UpdateAsync(old or "committed")`, then apply the
stored outcome. Recovery writes `old or "aborted"`: the first writer of the record decides for both
sides. Block spending while `Trade.locked(data)`.

Policy gate before any trade:

- `PolicyService:GetPolicyInfoForPlayerAsync(player).IsPaidItemTradingAllowed` false means the
  player may not trade virtual items purchased with in-experience currency or Robux (PolicyService
  reference; paid random items doc).
- The call yields and can error; wrap it in pcall (PolicyService reference).
  `Trade.paidTradingAllowed` fails closed: an error or a missing field blocks the trade, the same
  safe failure scenario-roblox-monetization uses for paid random items.
- Check both players: the trade moves items in both directions [added].
- Deciding condition: when the game records each item's origin, a restricted player may still trade
  items obtained without a purchase (drops, quest rewards). Without that record, block every trade
  for that player [added].

- Test: `suites/trade.luau` (10 tests, including the policy gate against a fake PolicyService);
  playtest L05c.
- Result: Lune 0.11 on 2026-10-19: 10 of 10 pass; the gate returned true only for
  `IsPaidItemTradingAllowed = true`, and false for false, a missing field and an error. Run in
  Studio 0.743 on 2026-10-18: the 9 trade tests pass. The policy test and a real
  `GetPolicyInfoForPlayerAsync` call through `swap`: not yet run (needs Studio). Crash after escrow:
  untouched. After both saves: untouched. After the record: swapped. After resolve: swapped. One
  escrow saved: that side refunded. Without escrow, a crash between saves left 3 Shields and 0
  Swords. Playtest: committed between two ProfileStore profiles.

## 10. Teleport players and parties

Goal: teleports retry safely and a party lands in one server.

```lua
local TeleportService = game:GetService("TeleportService")
local SafeTeleport = require(game:GetService("ServerStorage").DataKit.SafeTeleport)

local teleports = SafeTeleport.new({ TeleportService = TeleportService })

local function startMatch(placeId: number, party: { Player })
	-- One reserved server for all; every retry reuses its access code.
	local ok, result = teleports:TeleportParty(placeId, party, { mode = "duel" })
	if not ok then
		warn("match teleport failed", result)
	end
	return ok
end

return startMatch
```

Teleport data is visible to the client: never put currency or unlocks in it.

- Test: `suites/teleport.luau` (5 tests) against a fake TeleportService; playtest L05e calls the
  real service.
- Result: Lune 0.11: 5 of 5 pass. Run in Studio 0.743 on 2026-10-18: 5 of 5 pass. With
  `ShouldReserveServer` the retried player got a different server; with `TeleportParty` the retry
  reused the same code. Real teleports: not yet run, they need a published experience with two
  places.

## 11. Audit the data code

Goal: find the known mistakes in every script of a place.

```lua
-- run: Edit
local DataAudit = require(game:GetService("ServerStorage").DataKit.DataAudit)

local report = DataAudit.place(game)
local errorsOutsideFixtures = 0
for _, f in report.findings do
	if f.severity == "error" and not string.find(f.path, "Fixtures", 1, true) then
		errorsOutsideFixtures += 1
	end
end
return { pass = errorsOutsideFixtures == 0, findings = #report.findings, scripts = report.scripts }
```

Offline: `python3 scripts/rbx_data.py audit place.rbxl` (Lune). Rules: `no-pcall`,
`setasync-player`, `key-name`, `transform-yields`, `receipt-no-log`, `receipt-no-retry`,
`receipt-setasync`, `receipt-multiple`, `session-no-cancel`, `session-no-userid`, `session-no-end`,
`session-no-release`, `session-no-kick`, `reconcile-before-migrate`, `no-bindtoclose`,
`no-session-lock`, `client-datastore`, `teleport-no-initfailed`, `replace-data`, `legacy-wrapper`.
Deprecated APIs are in AgentKit `Audit`.

- Test: `suites/audit.luau` (5 tests); L04 and L06 in Studio; O4 offline.
- Result: Lune 0.11 (suite, 5 of 5; O4 over the built place) and run in Studio 0.743 on 2026-10-18:
  pass. 19 findings over 15 rules, all in the two fixture scripts; none in the kit or the game
  script.

In Edit, `require` returns the cached result of a ModuleScript after its Source changes (measured:
the Source said 2, `require` still returned 1; a Clone returned 2). After editing a module from a
script, replace it with a Clone before requiring it again.

## 12. Simulate several servers with the unmodified ProfileStore

Goal: test session locking, crashes and handoffs without publishing.

```lua
-- run: Edit
local ServerStorage = game:GetService("ServerStorage")
local HttpService = game:GetService("HttpService")
local Mock = require(ServerStorage.DataKit.MockDataStore)
local ServerSim = require(ServerStorage.DataKit.ServerSim)

local function load(source: string, o: any)
	-- Each simulated server gets its own globals (game, os, task) and its own module state.
	local f = assert(loadstring(source, o.debugName))
	setfenv(f, o.environment)
	return f
end
local function encode(v: any): string
	return HttpService:JSONEncode(v)
end

local backend = Mock.newBackend({ latency = { 0.002, 0.008 } })
local source = ServerStorage.Packages.ProfileStore.Source
local A = ServerSim.new(backend, { jobId = "A", load = load, task = task, encode = encode })
local B = ServerSim.new(backend, { jobId = "B", load = load, task = task, encode = encode })
local storeA = A:require(source, "ProfileStore")
local storeB = B:require(source, "ProfileStore")
storeB.SetConstant("FIRST_LOAD_REPEAT", 0.3)
storeB.SetConstant("LOAD_REPEAT_PERIOD", 0.5)
storeB.SetConstant("SESSION_STEAL", 3)
local never = { Cancel = function()
	return false
end }

local profile = storeA.New("PlayerData", { Coins = 0 }):StartSessionAsync("Player_1", never)
profile.Data.Coins = 10
profile:Save()
local t0 = os.clock()
while not (profile.LastSavedData and profile.LastSavedData.Coins == 10) and os.clock() - t0 < 5 do
	task.wait(0.05)
end
profile.Data.Coins = 99 -- never saved
A:crash()
t0 = os.clock()
local again = storeB.New("PlayerData", { Coins = 0 }):StartSessionAsync("Player_1", never)
local waited = os.clock() - t0
local coins = again.Data.Coins
again:EndSession()
B:stop()
return { pass = coins == 10 and waited >= 2.5, coins = coins, waited = waited }
```

In Lune, pass `luau.load` from `@lune/luau` as `load` and `serde.encode("json", v)` as `encode` (see
the test harness). `sim.Players:join(userId)` and `:leave(player)` drive PlayerAdded and
PlayerRemoving; `sim:shutdown()` runs BindToClose; `sim.clockSkew` shifts `os.time()`;
`backend:advance(seconds)` moves the shared clock.

- Test: every ProfileStore case of procedures 5, 6, 7 and 9; L06 runs this block in Studio Edit.
- Result: run in Studio 0.743 on 2026-10-18: pass, coins 10, steal after 3.73 s (`loadstring` and
  `setfenv` work in the Edit data model through `execute_luau`). Lune 0.11 runs the same scenario in
  the `sessions` suite (steal 3.39 s).

## 13. Roll back a player's data (version history)

Goal: undo a bad write for one player, with a known restore point, without fighting the session
lock.

```lua
local Players = game:GetService("Players")
local ServerStorage = game:GetService("ServerStorage")
local ProfileStore = require(ServerStorage.Packages.ProfileStore)
local PlayerData = require(ServerStorage.DataKit.PlayerData)

local data = PlayerData.new({
	ProfileStore = ProfileStore,
	Players = Players,
	template = { SchemaVersion = 2, Coins = 0, Inventory = {}, PurchaseIds = {} },
})

-- `badHourStart`: the start of the UTC hour in which the bad write landed.
local function rollback(userId: number, badHourStart: DateTime, force: boolean?): (boolean, any)
	-- One second earlier picks the previous hour's version: the bad hour's version holds the bad write.
	return data:Restore("Player_" .. userId, badHourStart.UnixTimestamp - 1, { force = force })
end

return rollback
```

`PlayerData:Restore(key, before, opts)` reads the key with `GetAsync`, refuses it while a server
holds the session (unless `force`), takes the newest version at or before `before` with ProfileStore
`VersionQuery` (descending), and writes it back with `SetAsync`.

What a restore can reach:

- The first write to a key in each UTC hour creates a version; later writes in the same hour
  overwrite it for good (versioning doc). One restore point per key per hour remains: the hour's
  last write.
- ProfileStore autosaves every 300 s, so about 12 saves share one restore point per hour [added].
- A version expires 30 days after a newer write overwrites it; the latest version never expires
  (versioning doc).
- Restore to before the start of the hour that holds the bad write; any time inside that hour can
  select the bad hour's version [added].
- Take a snapshot through Open Cloud before publishing a change to data logic (versioning doc).

ProfileStore facts (pinned source):

- `VersionQuery(key, sort_direction, min_date, max_date)` returns a query; `NextAsync()` yields one
  read-only profile per version.
- `Profile:SetAsync()` works only on such read-only profiles; it overwrites the key and clears the
  session lock.
- In mock mode (an unpublished place) `VersionQuery` returns nothing and warns once.
- If a server holds the session during a forced restore, its next save finds no lock: its session
  ends (its player is kicked) and the restored data stays (tested).

- Test: `suites/operations.luau` tests 1 to 3, with the unmodified ProfileStore and `MockDataStore`
  versions (one per UTC hour, as documented).
- Result: Lune 0.11 on 2026-10-19: pass. Offline restore brought back Coins 10 over a later 99999,
  and the next session loaded in 0.01 s (lock cleared). Forced restore while online: refused first
  with "in use"; with `force`, the holder was kicked at its next save, and an edit made there after
  the restore never landed. Two saves in one hour left one version: no version held the earlier
  value. In Studio and against real versions: not yet run (needs Studio and a published place).

## 14. The final save, and a player who leaves mid-trade

Goal: last edits land in the final save, and no escrow is left waiting for the next server.

```lua
local Players = game:GetService("Players")
local DataStoreService = game:GetService("DataStoreService")
local HttpService = game:GetService("HttpService")
local ServerStorage = game:GetService("ServerStorage")
local ProfileStore = require(ServerStorage.Packages.ProfileStore)
local PlayerData = require(ServerStorage.DataKit.PlayerData)
local Trade = require(ServerStorage.DataKit.Trade)
local KeyQueue = require(ServerStorage.DataKit.KeyQueue)

local trade = Trade.new({
	log = KeyQueue.new(DataStoreService:GetDataStore("TradeLog")),
	guid = function()
		return HttpService:GenerateGUID(false)
	end,
})

local data = PlayerData.new({
	ProfileStore = ProfileStore,
	Players = Players,
	template = { SchemaVersion = 1, Inventory = {}, LastLogout = 0 },
	onLoaded = function(_player: Player, profile: any)
		trade:Recover(profile)
		profile.OnLastSave:Connect(function(_reason: string)
			-- Edits after a yield miss the final save.
			profile.Data.LastLogout = os.time()
		end)
	end,
	-- On PlayerRemoving, before EndSession; may yield.
	beforeEnd = function(_player: Player, profile: any)
		if Trade.locked(profile.Data) then
			trade:Recover(profile)
		end
	end,
})
data:Start()
```

Rules:

- `OnLastSave` fires right before the last save, with the reason "Manual" (`EndSession`), "Shutdown"
  or "External" (another server asked for the session) (ProfileStore source).
- Put final edits there, before the handler's first yield; `OnSessionEnd` is for cleanup and the
  kick (loleris, ProfileStore docs).
- `OnLastSave` does not fire when another server steals the session or the server crashes (source;
  tested).
- Never refund an escrowed trade in `OnLastSave`: deciding needs the trade-log write, which yields,
  and the other side may have committed already [added].
- Settle it in `beforeEnd` with `trade:Recover`, which writes "aborted" unless a "committed" record
  exists, then resolves. If the session moves before that, the next load runs the same recovery
  [added].

- Test: `suites/operations.luau` tests 4 to 6.
- Result: Lune 0.11 on 2026-10-19: pass. `OnLastSave` reason "Manual"; the edit made before
  `task.wait` was saved, the one after it was not. With messages lost and a steal, `OnSessionEnd`
  fired once and `OnLastSave` never. A trade left pending by a trade-log outage was aborted by
  `beforeEnd` when the player left: the released profile had its Sword back and no `PendingTrade`,
  and the other side recovered "aborted" from the same record. In Studio: not yet run (needs
  Studio).

## 15. Right to be forgotten and storage

Goal: an erasure request deletes every key that holds a player's data, and nothing personal hides
under other keys.

```python
import rbx_data
templates = [
    {"store": "PlayerData", "key": "Player_{UserId}"},     # profiles
    {"store": "Wins", "key": "{UserId}", "ordered": True},  # leaderboard
]
config, problems = rbx_data.rtbf_config(templates)          # {"user_data_templates": [...]}, []
left = rbx_data.rtbf_uncovered(templates, [
    {"store": "PlayerData", "key": "Player_123456"},
    {"store": "TradeLog", "key": "6f1c2d3e-0000-4000-a000-000000000001"},
])                                                          # only the TradeLog key is left
```

Template rules (RTBF doc):

- Up to 100 templates. Each names standard keys, ordered keys, or a whole standard data store.
- The user id sits in the data store name, the key or the scope, as a static pattern such as
  `Player_{UserId}`.
- The `{UserId}` token is case-sensitive: `{userId}` never matches. A blank scope means "global".
- Publish them in the Data Stores Manager (RTBF Deletion tab) or through the Open Cloud Configs API
  (`DataStoresConfig`, `user_data_templates`); the API needs the owner's key with `universe:read`
  and `universe:write`.
- Test on a test game with a dummy account, and confirm each request's deletion within 30 days.

Keys a template cannot reach:

- Trade-log keys are trade ids, so no template matches them [added].
- This skill's trade log stores only the outcome string ("committed" or "aborted"), and the items
  sit in each player's profile under `Player_{UserId}`: nothing personal is left behind [added].
- A trade history that names players goes inside each player's profile or under a per-player key
  such as `TradeHistory_{UserId}` [added].
- Data that cannot follow a static pattern needs the right-to-erasure webhook and a custom deletion
  process (best practices doc).
- Call `AddUserId` on every profile so its key carries the player's UserId (ProfileStore docs).

Storage: the limit is 500 MB plus 1 MB per lifetime user, measured on compressed latest versions; do
not pre-compress (errors and limits doc). The Data Stores Manager shows Total Size against the
Storage Limit.

- Test: `test_offline.py` O6.
- Result: offline check O6 on 2026-10-19: pass. Two templates gave a valid config with scope
  "global"; `{userId}` and a 101-template list were reported; the TradeLog key and a key in another
  scope were left uncovered. Publishing templates and a real erasure request: not yet run (needs a
  published game and an API key).

## What needs a published place

- Real DataStore and MemoryStore calls, real budgets and throttling, Observability Dashboard
  numbers.
- Two real servers handing a player over (expected under 5 s, loleris).
- Real teleports, reserved servers, `TeleportInitFailed`.
- Real Developer Product purchases (Robux).
- The pinned ProfileStore's MessagingService release path against the real service.
- Version history and `VersionQuery` against real DataStores (procedure 13).
- `PolicyService` answers for players in restricted regions (procedure 9).
- RTBF template publishing and a real erasure request (procedure 15).
