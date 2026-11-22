# Procedures

Agent procedures with full code. Each one names its test and its last result.

- Studio: 0.743.0.7431133 on macOS, Studio MCP server, toolkit from scenario-roblox-expert. Live run
  on 2026-10-18: 17 of 17 pass.
- Offline: luau 0.743, Lune 0.11, luau-lsp 1.70 (Roblox definitions), Rojo 7.7.
- Live tests: `tests/code/scenario-roblox-luau/run_live.py` (exit 3 means no Studio over MCP).
  Chunks: `tests/code/scenario-roblox-luau/live/*.luau`.
- Offline: `tests/code/scenario-roblox-luau/run_offline.sh` (type gates, unit tests, Rojo build,
  audits).
- Evidence: `tests/live_evidence/scenario-roblox-luau/results.json`, `run_live_2.log`,
  `playtest.png`.
- Lab place: `tests/places/scenario-roblox-luau/` (Rojo project; Workspace SignalBehavior Deferred).

## Running a chunk with this skill's AgentKit

`rbx_luau.run` inlines this skill's modules (`scripts/agentkit/luau/<Name>.luau`) and the lead's
modules before the chunk; error line numbers point into the chunk. The first line of each chunk
below names its data model and kit.

```python
import sys
sys.path.insert(0, "<skills>/scenario-roblox-luau/scripts")  # also puts the lead toolkit on the path
import rbx_env, rbx_luau
from rbx_play import Playtest

with rbx_env.place_slot():
    s = rbx_env.open_place("tests/places/scenario-roblox-luau/scenario-roblox-luau.rbxl")  # keep it open
    r = rbx_luau.run(s, open("edit_audit.luau").read(), dm="Edit", kit=["LuauAudit"])
    with Playtest(s) as pt:
        r = rbx_luau.run(s, open("play_scheduler.luau").read(), dm="Server", kit=["Probe"])
        r["ok"], r["result"], r["error"]
```

Never close the place window from a script, and never quit Studio. Open one place per agent and keep
it for the whole run.

## P1. Type gate on both solvers

Goal: zero type errors on the old and the new solver, because Studio's editor may use either
(`Workspace.UseNewLuauTypeSolver` is NotScriptable and defaults to the engine rollout).

```python
import rbx_luau
sm = rbx_luau.sourcemap("my-rojo-project")       # rojo sourcemap, so script.Parent.X paths type-check
r = rbx_luau.typecheck(["my-rojo-project/src"], sourcemap=sm)
r["ok"], len(r["old"]["errors"]), len(r["new"]["errors"]), r["only_old"], r["only_new"]
```

CLI: `rbx_luau.py typecheck <file|dir> [--sourcemap sourcemap.json] [--json]`. A missing path raises
instead of reporting zero errors.

What the gate catches (fixtures in `tests/code/scenario-roblox-luau/offline/types/`, test
`offline/test_types.py`, 7 of 7 pass on 2026-10-18):

| Fixture                                                                   | Old solver                              | New solver                                                    |
| ------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------- |
| `local y = 5; y = "hello"`                                                | error                                   | no error (widens the type)                                    |
| Dot-typed method `function C.step(self: C, dt: number)` with a field typo | typo caught                             | typo caught                                                   |
| Colon method `function C:fire()` with a field typo                        | typo missed ("Unknown type ... 'self'") | typo missed (confusing read-only errors at the call)          |
| Composition (Knight holds a Health)                                       | clean                                   | clean                                                         |
| Typed metatable inheritance (Child inherits Base)                         | 2 false errors on valid calls           | 9 false errors                                                |
| `(model :: any).Humanoid.Healthh = 5`                                     | missed                                  | missed                                                        |
| `local a: { Vector3 } = table.create(n)`                                  | clean                                   | error (`{unknown}`); `table.create(n, Vector3.zero)` is clean |

Result: AgentKit (8 files) and the lab place sources (7 files) at 0 errors on both solvers; live
chunks at 0 errors (`check_chunks.py`).

## P2. Luau audit (offline and in Studio)

Goal: find scheduler, yield, deferred, parallel, native and leak mistakes in source text before a
playtest. Heuristic; handlers passed by name are not followed.

```python
r = rbx_luau.audit("place.rbxl", "warn")      # Lune, no Studio: .rbxl, .rbxlx or a Rojo source directory
r["counts"], r["findings"], r["exit"]          # exit 1 when any error-level finding exists
```

In Studio (Edit data model), same rules over the open place:

```lua
-- dm: Edit
-- kit: LuauAudit
local r = LuauAudit.tree(game)
local rules: { [string]: number } = {}
for _, f in r.findings do
	local rule: string = f.rule
	rules[rule] = (rules[rule] or 0) + 1
end
return { counts = r.counts, rules = rules, total = #r.findings }
```

Rules: `yield-in-frame-handler`, `yield-in-metamethod` (also `table.sort` comparators and `gsub`
callbacks), `removal-handler-reads-parent`, `superseded-runservice`, `env-deopt`,
`require-in-parallel`, `parallel-unsafe-write`, `parallel-without-actor` (skipped when the script
checks `script:GetActor()`), `while-true-no-yield`, `native-untyped`, `player-table-no-cleanup`,
`module-not-strict`, `any-cast`, `colon-method-strict`, `index-function`, `signal-behavior`.

Tests: `offline/test_audit.luau` 13 of 13 in luau and Lune; `run_offline.sh` place audit finds
exactly the 7 seeded fixtures; live `audit_studio_vs_lune`: run in Studio 0.743 on 2026-10-18: pass,
same counts as Lune for every rule (13 scripts, 278 lines). In Studio, `Workspace.SignalBehavior`
reads as unreadable, so the `signal-behavior` rule only fires offline.

## P3. Scheduler and deferred-event probe

Goal: know what the place's scheduler and signal mode do before reasoning about order.

```lua
-- dm: Server
-- kit: Probe
local out = Probe.scheduler()
out.timing = Probe.delayTiming()
return out
```

```lua
-- dm: Server
-- kit: Probe
return Probe.signals()
```

Result (live `scheduler`, `signals_deferred_server`, `signals_deferred_client`): run in Studio 0.743
on 2026-10-18: pass.

- Order: `spawn:body, caller:afterSpawn, caller:end, defer:1, defer:2, spawn:afterWait, delay0`.
- `task.delay(0)` scheduled from PreSimulation resumed 0.07 ms later (same frame); from Heartbeat,
  16.42 ms later (next frame).
- Deferred, on the Server (the Client matched on the three checks it ran: no run before the yield,
  A, B, C, `Parent` nil): handler not run before the firing thread yields; nested fires run A, B, C;
  a handler connected inside another handler missed a fire made in the same step (0 calls);
  `Destroying` handler saw `Parent` nil; `Disconnect` inside the handler dropped the 2 queued calls
  (1 run); `:Once()` ran once for 3 fires; `Destroy` on a BindableEvent still ran both queued calls
  (2); 3 property sets gave 3 changed calls; a handler re-firing its own event reached depth 50 (the
  probe cap) with no error.
- `Workspace.SignalBehavior` is not readable from scripts (NotScriptable).

## P4. Yield placement and handler pile-up

Goal: prove which places cannot yield, and what a yielding per-frame handler costs.

```lua
-- dm: Server
-- kit: Probe
local out = Probe.yields()
out.pileup = Probe.pileup(1)
return out
```

Result (live `yields_and_pileup`): run in Studio 0.743 on 2026-10-18: pass. `coroutine.yield` failed
with "attempt to yield across metamethod/C-call boundary" inside `__index`, a `table.sort`
comparator and a `gsub` callback; it worked inside `pcall`. A Heartbeat handler with
`task.wait(0.25)` peaked at 16 concurrent threads in 1 s; the busy-flag version ran 4 times. Offline
(`offline/test_codec_leak.luau`, luau and Lune): same boundary results.

Hazard: probe boundaries with `coroutine.yield` in a private coroutine only. In the first live run a
`task.wait()` inside `__index` and inside a sort comparator, caught by `pcall`, left the thread
registered: the next `task.wait` in that thread raised "Cannot call task.wait on a thread that is
already 'waiting' in the task library". The place process crashed seconds later (HardAssert "Tasks:
Promise setValue() called multiple times"); the cause was not isolated (see P8).

## P5. Which Luau VM sees which module state

Goal: avoid trusting module state read through `execute_luau` or the Command Bar.

```lua
-- dm: Server
local ServerStorage = game:GetService("ServerStorage")
local Counter = require(game:GetService("ReplicatedStorage").LuauLab.Counter) :: any
local hook = ServerStorage:WaitForChild("LuauLabHook", 10) :: BindableFunction
return { chunkSees = Counter.n, gameScriptSees = hook:Invoke("counter") }
```

```lua
-- dm: Edit
-- First call and second call run as two separate execute_luau chunks.
local Counter = require(game:GetService("ReplicatedStorage").LuauLab.Counter) :: any
Counter.n += 1
local fresh = require(game:GetService("ReplicatedStorage").LuauLab.Counter:Clone()) :: any
return { n = Counter.n, freshN = fresh.n }
```

Result: run in Studio 0.743 on 2026-10-18: pass. In a playtest the game Script saw `Counter.n = 41`;
the `execute_luau` chunk on the Server saw 0 (its own module cache). In the Edit data model the
cache persisted across calls (1, then 2), and `require(module:Clone())` returned a fresh copy (0).
Read game state through attributes or a BindableFunction hook, as the boot script does:

```lua
--!strict
-- Game-script side of the lab: sets module state that execute_luau chunks then read,
-- and runs the native A/B inside a real server Script (not an injected chunk).
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerStorage = game:GetService("ServerStorage")

local lab = ReplicatedStorage:WaitForChild("LuauLab")
local Counter = require(lab:WaitForChild("Counter")) :: { n: number }
Counter.n = 41

type Numeric = {
	numbers: (n: number) -> number,
	vectors: (points: { Vector3 }, offset: Vector3) -> number,
}

local function median(t: { number }): number
	table.sort(t)
	return t[(#t + 1) // 2]
end

local function bench(n: number, rounds: number): { [string]: any }
	local mods: { [string]: Numeric } = {}
	for _, name in { "NumericPlain", "NumericNative", "NumericNativeUntyped" } do
		mods[name] = require(lab:WaitForChild(name)) :: any
	end
	local points: { Vector3 } = table.create(n, Vector3.zero)
	for i = 1, n do
		points[i] = Vector3.new(i, i * 0.5, -i)
	end
	local offset = Vector3.new(1, 2, 3)
	local times: { [string]: { number } } = {}
	for _ = 1, rounds do
		for name, m in mods do
			local t0 = os.clock()
			m.numbers(n)
			local t1 = os.clock()
			m.vectors(points, offset)
			local t2 = os.clock()
			times[name .. ".numbers"] = times[name .. ".numbers"] or {}
			times[name .. ".vectors"] = times[name .. ".vectors"] or {}
			table.insert(times[name .. ".numbers"], (t1 - t0) * 1000)
			table.insert(times[name .. ".vectors"], (t2 - t1) * 1000)
		end
		task.wait()
	end
	local out: { [string]: any } = {}
	for k, v in times do
		out[k] = math.floor(median(v) * 1000) / 1000
	end
	return out
end

local hook = Instance.new("BindableFunction")
hook.Name = "LuauLabHook"
hook.OnInvoke = function(cmd: string, a: any, b: any): any
	if cmd == "counter" then
		return Counter.n
	elseif cmd == "bench" then
		return bench(a or 200000, b or 7)
	end
	return nil
end
hook.Parent = ServerStorage
workspace:SetAttribute("LuauLabBoot", Counter.n)
```

## P6. Typed class with an idempotent Destroy

Goal: a class whose fields are checked by both solvers and that releases everything it creates.

```lua
--!strict
-- Typed class template. Methods use `function Class.name(self: Class, ...)`: the colon form
-- leaves `self` untyped (old solver) or loosely inferred (new solver) and lets field typos through.
-- Callers still write obj:name(). Everything the object creates is released by Destroy.
local RunService = game:GetService("RunService")

local Spinner = {}
Spinner.__index = Spinner

type Fields = {
	part: BasePart,
	speed: number,
	_connections: { RBXScriptConnection },
	_destroyed: boolean,
}
export type Spinner = typeof(setmetatable({} :: Fields, Spinner))

function Spinner.new(part: BasePart, speed: number): Spinner
	local self = setmetatable({
		part = part,
		speed = speed,
		_connections = {},
		_destroyed = false,
	}, Spinner)
	table.insert(self._connections, RunService.PreSimulation:Connect(function(dt: number)
		self:step(dt)
	end))
	table.insert(self._connections, part.Destroying:Connect(function()
		self:Destroy()
	end))
	return self
end

function Spinner.step(self: Spinner, dt: number)
	self.part.CFrame *= CFrame.Angles(0, self.speed * dt, 0)
end

function Spinner.Destroy(self: Spinner)
	if self._destroyed then
		return
	end
	self._destroyed = true
	for _, c in self._connections do
		c:Disconnect()
	end
	table.clear(self._connections)
end

return Spinner
```

```lua
-- dm: Server
-- kit: templates/Class
local part = (workspace:WaitForChild("LuauLabPart") :: BasePart):Clone()
part.Name = "SpinnerProbe"
part.Parent = workspace
local before = part.CFrame
local spinner = Class.new(part, math.pi)
for _ = 1, 30 do
	task.wait()
end
local turned = math.deg(math.acos(math.clamp(before.LookVector:Dot(part.CFrame.LookVector), -1, 1)))
part:Destroy()
task.wait()
return {
	turnedDegrees = math.floor(turned),
	destroyedFlag = spinner._destroyed,
	connectionsLeft = #spinner._connections,
}
```

Result (live `class_template_destroy`): run in Studio 0.743 on 2026-10-18: pass. The part turned 90
degrees in 30 frames at pi rad/s; destroying the part ran `Destroy` through `Destroying`; 0
connections left. Type gate: 0 errors on both solvers.

## P7. Leak proof without the Luau Heap GUI

Goal: show that released objects are collected, and that the fix works.

```lua
-- dm: Server
-- kit: Leak
local registry = {}
local leaky = Leak.retained(function(i)
	local o = { id = i, payload = table.create(100, i) }
	registry[o] = true
	return o
end, function() end, 200)
local fixed = Leak.retained(function(i)
	local o = { id = i, payload = table.create(100, i) }
	registry[o] = true
	return o
end, function(objects)
	for _, o in objects do
		registry[o] = nil
	end
end, 200)
local listeners = {}
local conns = {}
local connLeak = Leak.retained(function()
	local p = Instance.new("Part")
	table.insert(conns, workspace.ChildAdded:Connect(function()
		p.Name = "x"
	end))
	return p
end, function(parts)
	for _, p in parts do
		p:Destroy()
	end
end, 100)
for _, c in conns do
	c:Disconnect()
end
table.clear(conns)
local connFixed = Leak.retained(function()
	local p = Instance.new("Part")
	table.insert(conns, workspace.ChildAdded:Connect(function()
		p.Name = "x"
	end))
	return p
end, function(parts)
	for _, c in conns do
		c:Disconnect()
	end
	table.clear(conns)
	for _, p in parts do
		p:Destroy()
	end
end, 100)
table.clear(listeners)
return {
	leakyAlive = leaky.alive,
	fixedAlive = fixed.alive,
	gcMode = fixed.gc,
	destroyedButConnectedAlive = connLeak.alive,
	disconnectedAndDestroyedAlive = connFixed.alive,
	heapKb = Leak.heapKb(),
}
```

```lua
-- dm: Server
local Players = game:GetService("Players")
local player = Players:GetPlayers()[1]
if not player then
	return { error = "no player" }
end
local function respawn(): (Model, RBXScriptConnection)
	local old = player.Character or player.CharacterAdded:Wait()
	local conn = old:GetPropertyChangedSignal("Name"):Connect(function() end)
	player:LoadCharacterAsync()
	for _ = 1, 30 do
		task.wait()
	end
	return old, conn
end
local out = {}
local old, conn = respawn()
out.defaultOldParent = if old.Parent then old.Parent:GetFullName() else "nil"
out.defaultConnStillConnected = conn.Connected
local fix = player.CharacterRemoving:Connect(function(character)
	task.defer(character.Destroy, character)
end)
local old2, conn2 = respawn()
out.fixedOldParent = if old2.Parent then old2.Parent:GetFullName() else "nil"
out.fixedConnStillConnected = conn2.Connected
fix:Disconnect()
return out
```

Result: run in Studio 0.743 on 2026-10-18: pass.

- `leak_retention`: with GC pressure (Roblox scripts cannot force a collection), 200 of 200 tables
  stayed alive while a module-level registry held them, 0 after the registry was cleared; 100 of 100
  destroyed Parts stayed alive while an undisconnected `workspace.ChildAdded` connection captured
  them, 0 after `Disconnect`.
- `character_destroy`: with `PlayerCharacterDestroyBehavior` at Default, the old character was
  unparented after `LoadCharacterAsync` but not destroyed (a connection on it stayed connected).
  With `CharacterRemoving` plus `task.defer(character.Destroy, character)`, the connection was
  disconnected.

## P8. Parallel Luau workers

Goal: compute across Actors, keep writes serial, measure the gain.

The worker template (`scripts/agentkit/luau/templates/ParallelWorker.server.luau`) runs in
ServerStorage as a template, is cloned under each Actor, requires its work module once (serial),
then answers `SendMessage("work", ...)` in parallel. The work module used by the tests:

```lua
--!strict
-- Work module for the Parallel probes: required once per Actor in the serial phase,
-- `run` is called from BindToMessageParallel (parallel phase).
local Counter = require(script.Parent.Counter)

local LabWork = { calls = 0 }

local function compute(iterations: number): number
	local acc = 0
	for i = 1, iterations do
		acc += math.sqrt(i) * math.sin(i)
	end
	return acc
end

function LabWork.run(jobId: number, payload: any, results: SharedTable)
	LabWork.calls += 1
	local kind = payload.kind
	if kind == "compute" then
		results[jobId] = compute(payload.iterations)
	elseif kind == "probe" then
		results["counter" .. jobId] = Counter.n
		results["calls" .. jobId] = LabWork.calls
	elseif kind == "race" then
		for _ = 1, payload.n do
			results.plain += 1
			SharedTable.increment(results, "atomic", 1)
		end
	elseif kind == "require" then
		local ok, err = pcall(require, script.Parent.Counter)
		results["msg" .. jobId] = if ok then "ok" else tostring(err)
	elseif kind == "write" then
		-- No task.synchronize here: run() executes under the worker's pcall (see SyncWriter for the pattern).
		local part = payload.target :: BasePart
		local okRead = pcall(function()
			return part.Transparency
		end)
		local okWrite, errWrite = pcall(function()
			part.Transparency = 0.5
		end)
		local okAttr, errAttr = pcall(function()
			part:SetAttribute("Touched", jobId)
		end)
		results["read" .. jobId] = okRead
		results["write" .. jobId] = if okWrite then "ok" else tostring(errWrite)
		results["attr" .. jobId] = if okAttr then "ok" else tostring(errAttr)
	end
end

return LabWork
```

```lua
-- dm: Server
-- kit: Parallel
local ServerScriptService = game:GetService("ServerScriptService")
local lab = game:GetService("ReplicatedStorage").LuauLab
local template = game:GetService("ServerStorage").LuauLab.ParallelWorker :: Script
local part = workspace:WaitForChild("LuauLabPart")
local out = {}
local four = Parallel.workers(template, 4, ServerScriptService, lab.LabWork)
local jobs = {}
for i = 1, 8 do
	jobs[i] = { kind = "probe" }
end
local probe = Parallel.run(four, jobs)
local counters, maxCalls = {}, 0
for i = 1, 8 do
	counters[tostring(probe.results["counter" .. i])] = true
	maxCalls = math.max(maxCalls, probe.results["calls" .. i])
end
out.actorCounterValues = counters
out.maxCallsInOneActor = maxCalls
local rules = Parallel.run(four, { { kind = "require" }, { kind = "write", target = part } })
out.requireInParallel = rules.results.msg1
out.readInParallel = rules.results.read2
out.writeInParallel = rules.results.write2
out.setAttributeInParallel = rules.results.attr2
out.errors = { rules.results.error1, rules.results.error2 }
Parallel.cleanup(four)
return out
```

```lua
-- dm: Server
-- kit: Parallel
local lab = game:GetService("ReplicatedStorage").LuauLab
local template = game:GetService("ServerStorage").LuauLab.ParallelWorker :: Script
local eight = Parallel.workers(template, 8, game:GetService("ServerScriptService"), lab.LabWork)
local race = {}
for i = 1, 8 do
	race[i] = { kind = "race", n = 20000 }
end
local r = Parallel.run(eight, race, 30, { plain = 0, atomic = 0 })
Parallel.cleanup(eight)
return { atomic = r.results.atomic, plain = r.results.plain, lost = r.results.atomic - r.results.plain, ms = r.elapsedMs }
```

```lua
-- dm: Server
-- kit: Parallel
local lab = game:GetService("ReplicatedStorage").LuauLab
local template = game:GetService("ServerStorage").LuauLab.ParallelWorker :: Script
local parent = game:GetService("ServerScriptService")
local compute = {}
for i = 1, 32 do
	compute[i] = { kind = "compute", iterations = 400000 }
end
local eight = Parallel.workers(template, 8, parent, lab.LabWork)
local one = Parallel.workers(template, 1, parent, lab.LabWork)
Parallel.run(eight, compute) -- warm-up
local t1 = Parallel.run(one, compute)
local t8 = Parallel.run(eight, compute)
Parallel.cleanup(one)
Parallel.cleanup(eight)
return { oneActorMs = t1.elapsedMs, eightActorsMs = t8.elapsedMs, speedup = math.floor(t1.elapsedMs / t8.elapsedMs * 100) / 100 }
```

The canonical serial, parallel, serial pattern, with no `pcall` around the phase switch:

```lua
--!strict
-- Serial, parallel, serial: compute in the parallel phase, write after task.synchronize().
-- Cloned under an Actor with an ObjectValue "Target"; it does not run in ServerStorage.
local actor = script:GetActor()
if actor == nil then
	return
end
local RunService = game:GetService("RunService")
local part = (actor:WaitForChild("Target") :: ObjectValue).Value :: BasePart

local started = false
local conn: RBXScriptConnection
conn = RunService.Heartbeat:ConnectParallel(function()
	if started then
		return
	end
	started = true
	local acc = 0
	for i = 1, 100000 do
		acc += math.sqrt(i)
	end
	local okEarly = pcall(function()
		part:SetAttribute("EarlyWrite", acc)
	end)
	task.synchronize()
	part:SetAttribute("EarlyWriteAllowed", okEarly)
	part:SetAttribute("SyncedWrite", math.floor(acc))
	conn:Disconnect()
end)
```

```lua
-- dm: Server
local part = workspace:WaitForChild("LuauLabPart") :: BasePart
local actor = Instance.new("Actor")
local target = Instance.new("ObjectValue")
target.Name = "Target"
target.Value = part
target.Parent = actor
local writer = (game:GetService("ServerStorage").LuauLab.SyncWriter :: Script):Clone()
writer.Parent = actor
actor.Parent = game:GetService("ServerScriptService")
local deadline = os.clock() + 10
while part:GetAttribute("SyncedWrite") == nil and os.clock() < deadline do
	task.wait()
end
local out = { syncedWrite = part:GetAttribute("SyncedWrite"), earlyWriteAllowed = part:GetAttribute("EarlyWriteAllowed") }
actor:Destroy()
return out
```

Result: run in Studio 0.743 on 2026-10-18 (Apple M5 Max, 18 cores): pass.

- Isolation: every Actor saw `Counter.n = 0` while the main VM had 41.
- Errors: "require can not be used during the parallel phase"; "Property BasePart.Transparency is
  not safe to write in parallel"; "Function Instance.SetAttribute is not safe to call in parallel";
  reads worked.
- Race: 8 Actors x 20,000 increments: `SharedTable.increment` gave 160,000; plain
  `results.plain += 1` kept 32,893 (127,107 lost updates).
- Speedup: 32 jobs of 400,000 iterations: 144.5 ms on 1 Actor, 19.0 ms on 8 Actors (7.6x).
- Sync write: the write before `task.synchronize()` failed, the write after it landed.

Hazard: the first live run crashed the place process while a work function called
`task.synchronize()` inside the worker's `pcall` (it may also have been the stale yield of P4). Keep
phase switches out of `pcall`.

## P9. Native code A/B

Goal: keep `--!native` only where it measurably wins.

```lua
--!native
--!strict
local Numeric = {}

function Numeric.numbers(n: number): number
	local acc = 0
	for i = 1, n do
		local x = i * 0.001
		acc += x * x - acc * 0.5 + (i % 7)
	end
	return acc
end

function Numeric.vectors(points: { Vector3 }, offset: Vector3): number
	local acc = 0
	for _, p in points do
		local d = p - offset
		acc += d.X * d.X + d.Y * d.Y + d.Z * d.Z
	end
	return acc
end

return Numeric
```

```lua
-- dm: Server
-- kit: Bench
local lab = game:GetService("ReplicatedStorage").LuauLab
local Plain = require(lab.NumericPlain) :: any
local Native = require(lab.NumericNative) :: any
local Untyped = require(lab.NumericNativeUntyped) :: any
local n = 200000
local points = table.create(n, Vector3.zero)
for i = 1, n do
	points[i] = Vector3.new(i, i * 0.5, -i)
end
local offset = Vector3.new(1, 2, 3)
local r = Bench.run({
	plainNumbers = function()
		Plain.numbers(n)
	end,
	nativeNumbers = function()
		Native.numbers(n)
	end,
	untypedNumbers = function()
		Untyped.numbers(n)
	end,
	plainVectors = function()
		Plain.vectors(points, offset)
	end,
	nativeVectors = function()
		Native.vectors(points, offset)
	end,
	untypedVectors = function()
		Untyped.vectors(points, offset)
	end,
}, 7)
local hook = game:GetService("ServerStorage"):WaitForChild("LuauLabHook", 10) :: BindableFunction
local okDump, errDump = pcall(function()
	return (debug :: any).dumpcodesize()
end)
return {
	chunk = r,
	numbersSpeedup = Bench.ratio(r, "plainNumbers", "nativeNumbers"),
	vectorsSpeedup = Bench.ratio(r, "plainVectors", "nativeVectors"),
	untypedVectorsSpeedup = Bench.ratio(r, "plainVectors", "untypedVectors"),
	gameScript = hook:Invoke("bench", n, 7),
	dumpcodesize = if okDump then "ok" else tostring(errDump),
}
```

Result (live `native_ab`): run in Studio 0.743 on 2026-10-18: pass. Median of 7 rounds, n = 200,000,
Server playtest:

| Kernel                                   | Plain ms | Native typed ms | Native untyped ms     |
| ---------------------------------------- | -------- | --------------- | --------------------- |
| numbers (`n: number` loop)               | 3.10     | 0.94 (3.3x)     | 0.93                  |
| vectors (`{ Vector3 }`, `Vector3` param) | 5.23     | 1.06 (4.9x)     | 5.42 (0.96x, no gain) |

The same kernels timed inside a game Script gave the same ratios. `debug.dumpcodesize()` from
`execute_luau` errors with "dumpcodesize can only be called from CommandBar".

## P10. Buffer codec with range checks

Goal: pack fixed records into a buffer without the silent wrap of `buffer.write*`.

```lua
--!strict
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local BufferCodec = require(ReplicatedStorage.Shared.BufferCodec) -- a copy of scripts/agentkit/luau/BufferCodec.luau

local Enemy = BufferCodec.schema({ { "id", "u16" }, { "hp", "f32" }, { "pos", "vec3f32" } })
local b = Enemy:encode({ id = 513, hp = 92.5, pos = vector.create(1.5, -2, 3) }) -- 18 bytes
local rec = Enemy:decode(b)
local packed = Enemy:encodeList({ rec, rec }) -- u16 count prefix
local back = Enemy:decodeList(packed)
print(buffer.len(b), rec.id, #back)
```

Types: u8, i8, u16, i16, u32, i32, f32, f64, bool, unorm8, str8 (255 bytes max), vec3f32. `encode`
errors on out-of-range or fractional integers and non-finite floats.

```lua
-- dm: Server
-- kit: BufferCodec
local HttpService = game:GetService("HttpService")
local Enemy = BufferCodec.schema({ { "id", "u16" }, { "hp", "f32" }, { "pos", "vec3f32" } })
local b = Enemy:encode({ id = 513, hp = 92.5, pos = vector.create(1.5, -2, 3) })
local back = Enemy:decode(b)
local raw = buffer.create(1)
buffer.writeu8(raw, 0, 300)
local ev = Instance.new("BindableEvent")
local received
ev.Event:Connect(function(x)
	received = x
end)
ev:Fire(b)
task.wait()
local okJson, json = pcall(function()
	return HttpService:JSONEncode({ data = buffer.fromstring("hi") })
end)
local refused = not pcall(function()
	Enemy:encode({ id = 70000, hp = 1, pos = vector.create(0, 0, 0) })
end)
return {
	size = Enemy.size,
	len = buffer.len(b),
	id = back.id,
	hp = back.hp,
	posType = typeof(back.pos),
	vectorCreateType = typeof(vector.create(1, 2, 3)),
	u8Of300 = buffer.readu8(raw, 0),
	codecRefused70000 = refused,
	bindableSameBuffer = received == b,
	bindableBytesEqual = received ~= nil and buffer.tostring(received) == buffer.tostring(b),
	jsonEncode = if okJson then json else "error: " .. tostring(json),
}
```

Result: offline `test_codec_leak.luau` 9 of 9 (luau and Lune); live `buffer_codec_studio`: run in
Studio 0.743 on 2026-10-18: pass. `buffer.writeu8(b, 0, 300)` stored 44; `writeu16(70000)` stored
4464; `writeu8(3.7)` stored 3; `vector.create` returned a `Vector3` in Roblox; a buffer sent through
a BindableEvent arrived as a copy (not the same object, same bytes); `HttpService:JSONEncode` wrote
`{"m":null,"t":"buffer","base64":"aGk="}`.
