# Procedures: performance and release

Agent procedures with full code. Python runs on the agent side through `scripts/rbx_perf.py` and the
lead toolkit (`rbx_env`, `rbx_run`, `rbx_play`). Luau chunks run in Studio through
`rbx_perf.run(studio, code, dm, kit=[...])`, which inlines this skill's AgentKit modules before the
chunk. Every result line names its test in `run_live.py` of the skill's test suite.

The lab place is a simulator-style scene built to be slow: 2,000 coins, 30 simulated players,
per-frame loops, a leaking effect and a 1,200-cell HUD. Workspace attributes switch each slow path
on or off (`LabUnanchored`, `LabSpin`, `LabScan`, `LabLeak`, `LabUI`), so one playtest changes one
thing.

Studio caveat for every number here: Studio runs the playtest Server and Client in one process on a
desktop. Absolute values are Studio values; the before and after deltas are the evidence. Phone
checks are in P9.

## P1. Static audit before any playtest

Goal: find the costly patterns and counts without running the game.

```python
import rbx_env, rbx_perf

offline = rbx_perf.audit_place("game.rbxl")      # Lune, no Studio; exit 1 from the CLI on a warn
s = rbx_env.open_place("game.rbxl")
live = rbx_perf.run(s, "return PerfAudit.all(game)", "Edit", kit=["PerfAudit"])
```

```lua
local r = PerfAudit.all(game)
return { counts = r.counts, byRule = r.byRule, tally = r.tally, settings = r.settings }
```

- Script rules: `server-tween`, `server-per-frame-cframe`, `per-frame-scan`, `preload-everything`,
  `no-profile-labels`.
- Count rules: `instances-budget`, `unanchored-many`, `tags-attributes-replicate`,
  `replicated-heavy`, `sounds-resident`, `emitters`, `partial-transparency`, `small-shadow-casters`,
  `npc-humanoids`, `mesh-duplicate-ids`, `render-fidelity-precise`, `collision-fidelity-decor`.
- Settings: Workspace streaming settings read as "unreadable" from Studio's `execute_luau` (see P8).
  Read them in the Properties panel or the Rojo project file.
- Assets, memory composition and rigs: `PerfAudit.assets(game)`, or
  `rbx_perf.audit_place(path, assets=True)` offline ([memory-and-crowds.md](memory-and-crowds.md)).

Result (E1): run in Studio 0.743 on 2026-10-19: pass. The Edit audit and the Lune audit of the saved
file agree on the lab: `per-frame-scan` 2, `server-per-frame-cframe` 1. Streaming settings read
"unreadable" from `execute_luau`; `ClientAnimatorThrottling` read Default.

## P2. Measure one change per playtest

Goal: a before and after number on the side that hurts, at the same time offset, with nothing else
changed.

```python
import json, rbx_env, rbx_perf
from rbx_play import Playtest

s = rbx_env.open_place("game.rbxl")

def run_variant(attrs: dict) -> dict:
    rbx_perf.set_attributes(s, "Workspace", attrs)         # feature flags read by the game at start
    with Playtest(s, settle=1, timeout=150) as pt:
        pt.wait_for("return workspace:GetAttribute('Ready') == true", "Server", timeout=60)
        return rbx_perf.measure(pt, seconds=6)               # PerfProbe.window on Server, then Client

before = run_variant({"SpinMode": "server"})
after = run_variant({"SpinMode": "client"})
print(json.dumps(rbx_perf.compare(before, after), indent=1))  # per metric: delta, pct, better/worse/same
```

The window chunk that `measure` sends, also usable alone with the lead `Stats`:

```lua
local snap = Stats.snapshot()
local frames
task.spawn(function()
	frames = Stats.frames(6)
end)
local win = PerfProbe.window(6, 1000 / 60)
while not frames do
	task.wait()
end
return { snapshot = snap, frames = frames, window = win, gate = win.gate }
```

- Wait until the same server `time()` before each window: a leak or a spawner makes later windows
  heavier.
- Gate frames with the lead rule: p95 at most 1.2 times the budget and worst at most 2 times
  (`win.gate`). Heartbeat steps jitter around the vsync interval: healthy places read p95 17.2 to
  17.4 ms at 60 fps (idle Edit here: 17.3 ms), so a bare 16.7 ms gate fails them.
- Read the metric the fix touches. `Stats.HeartbeatTime` (jobsMs) swung from 8 to 100 ms p95 between
  identical Server runs; Client `DataReceiveKbps` read 0 and Client `FrameTime` read 323 ms in a
  playtest. Do not gate on those three in Studio.
- `Stats.diff(before.snapshot, after.snapshot)` gives memory per tag, instances, physics and network
  deltas.

Result (V0 to V7, C1 to C8): run in Studio 0.743 on 2026-10-19: pass, in two full runs (01:15 and
01:31). Every check passed on the metric its fix touches. The final frame gate did not pass on the
Server in either run: single hitches of 171 and 433 ms while other agents' playtests shared the
machine. In run 1 the Client passed it (p95 17.5 ms, 60 fps), but by then its 3D viewport had
stopped drawing (R0).

Run 2, one playtest per row. Server script time is the Script Profiler total per Heartbeat.

| Variant | Change             | Server dt p95 (ms) | Server physics p95 (ms), contacts | Server sends (KB/s) | Server script (ms per frame) | Client dt p95 (ms) | Client Gui (MB), instances |
| ------- | ------------------ | ------------------ | --------------------------------- | ------------------- | ---------------------------- | ------------------ | -------------------------- |
| V0      | baseline           | 37.9               | 17.6, 16,314                      | 6,526               | 12.0                         | 46.4               | 48.4, 57,054               |
| V1      | anchor the coins   | 29.3               | 0.06, 0                           | 11,255              | 11.4                         | 27.4               | 50.6, 57,053               |
| V2      | one BulkMoveTo     | 29.2               | 0.06, 0                           | 11,375              | 8.7                          | 25.6               | 51.7, 57,054               |
| V3      | spin on clients    | 19.2               | 0.06, 0                           | 12                  | 6.5                          | 19.3               | 48.9, 57,053               |
| V4      | grid scan at 10 Hz | 43.2               | 0.18, 0                           | 8.4                 | 0.46                         | 44.0               | 48.9, 57,051               |
| V5      | leak fixed         | 37.1               | 0.25, 0                           | 7.9                 | 0.22                         | 38.4               | 51.9, 57,053               |
| V6      | HUD on change      | 31.8               | 0.18, 0                           | 12                  | 0.31                         | 39.6               | 55.3, 57,054               |
| V7      | 60-cell HUD        | 26.1               | 0.43, 0                           | 10.7                | 0.36                         | 20.2               | 40.7, 51,354               |

- Frame times in run 2 moved with machine load: dt rose from V3 to V4 while server script time fell
  14 times. The 3D viewport was not drawing in run 2 (R0), so client dt there holds no 3D cost.
- Run 1, with the viewport drawing for V0 and V1: client dt p95 129.6 ms at baseline and 30.6 ms
  after anchoring alone, because Server and Client share one Studio process. From V2 on the viewport
  no longer drew; at V7, Server p95 18.6 ms and Client 17.5 ms.

## P3. Name the hot code: Script Profiler and MicroProfiler labels

Goal: the function or label that owns the time, before you change anything.

Script Profiler by code (`ScriptProfilerService` is PluginSecurity: Studio's `execute_luau` reaches
it, game scripts do not):

```python
top = rbx_perf.script_profile(s, "Server", seconds=3, frequency=1000, top=15)
# result: frames, msPerFrame, msPerSecond, top = [{fn, selfMs, selfMsPerFrame, totalMs, native}]
```

```lua
return ScriptProf.capture(3, 1000, 15)
```

- Engine calls show as `[C]` rows such as `BasePart.CFrame [C]` and `TextLabel.Text [C]`; your
  labels show as functions named after the label.
- Label every per-frame system so both profilers name it:

```lua
local RunService = game:GetService("RunService")
local function spinCoins(_dt: number) end

RunService.Heartbeat:Connect(function(dt)
	debug.profilebegin("Coins/Spin")
	spinCoins(dt)
	debug.profileend()
end)
```

MicroProfiler by code (LibMP, the module behind the MicroProfiler; `require("@rbx/LibMP")` resolves
only in `execute_luau` and the command bar):

```python
mp = rbx_perf.micro(s, "Edit", seconds=2, mask="Coins/*")                          # Edit: full frames
mp = rbx_perf.micro(s, "Client", seconds=3, mask="Coins/*", tries=4, min_frames=5)  # playtest
# result: frames {n, p50, p95, max}, timers = [{name, totalMs, msPerFrame, worstFrameMs, threads}]
```

```lua
return MicroProf.capture(3, { mask = "Coins/*", frames = 128, tries = 4, minFrames = 5 })
```

- Snapshot first (`CaptureToBufferSync`, then `Session.OpenFromBuffer`); the Studio MCP skill
  `rbx-perf-profiling` warns against reading live data from `execute_luau`.
- In a playtest, run it from the Client data model. The profiler is one per Studio process, so
  Server labels appear in the Client capture.
- Playtest snapshots are short: in the lab, 4 tries of 3 s held 0 frames at the heaviest variants
  and up to 128 frames once the scene was lighter. Without the overlay shown (`ui`), they held 0.
  Edit snapshots held 45 frames after 1 s and 128 after 3 s (idle p95 17.3 ms). For numbers in a
  playtest use the Script Profiler; use `MicroProf` in Edit, or the MicroProfiler by hand.
- Game scripts cannot reach these services: a game Script got "lacking capability Plugin" from
  `ScriptProfilerService:ServerStart` and `HeapProfilerService:ServerRequestDataAsync`. `Stats`
  reads and `SceneAnalysisService:GetScriptMemoryAsync` worked from the game Script (G1, run in
  Studio 0.743 on 2026-10-19: pass).

Result (C2, C4, C6 and the per-variant profiles): run in Studio 0.743 on 2026-10-19: pass. V0 Server
top rows per frame: `BasePart.CFrame [C]` 5.0 ms, `Lab/ScanFrame` 3.3 ms, `BasePart.Position [C]`
1.8 ms. C2: 2,000 `CFrame` writes cost 4.2 ms per frame against 2.0 ms for one `BulkMoveTo` (run 1:
3.6 against 2.1). C4b: `Lab/ScanFrame` 9.8 to 15.3 ms per frame against 0.01 ms for `Lab/ScanGrid`.
C6: Client `TextLabel.Text [C]` 0.48 to 0.18 ms per frame. C2b skipped: the playtest snapshots at V1
and V2 held 0 frames. In run 1, server script time per second rose from 350 to 508 ms between V0 and
V2 while each frame got cheaper, because fps rose from 34 to 51.

## P4. Fix patterns, each proven alone

Goal: remove server work players do not need, keeping behavior.

1. Anchor what does not need physics. Pickups, coins and props that only rotate or bob are anchored.
2. Spin cosmetic parts on each client, near the camera, with one `BulkMoveTo`. The server writes
   nothing, so nothing replicates:

```lua
--!strict
-- LocalScript: spin nearby coins on the client. The server writes nothing, so nothing replicates.
local RunService = game:GetService("RunService")

local coins = workspace:WaitForChild("Coins")
local nearby: { BasePart } = {}
local homes: { CFrame } = {}
local cframes: { CFrame } = {}

task.spawn(function()
	while true do
		table.clear(nearby)
		table.clear(homes)
		local at = workspace.CurrentCamera.CFrame.Position
		for _, coin in coins:GetChildren() do
			if coin:IsA("BasePart") and (coin.Position - at).Magnitude < 120 then
				table.insert(nearby, coin)
				table.insert(homes, CFrame.new(coin.Position))
			end
		end
		task.wait(0.5)
	end
end)

RunService.PreRender:Connect(function()
	debug.profilebegin("Coins/Spin")
	local t = os.clock()
	table.clear(cframes)
	for i, home in homes do
		cframes[i] = home * CFrame.Angles(0, t * 2 + i, 0)
	end
	if #nearby > 0 then
		workspace:BulkMoveTo(nearby, cframes, Enum.BulkMoveMode.FireCFrameChanged)
	end
	debug.profileend()
end)
```

3. Replace "every coin against every player every frame" with a grid built once and a 10 Hz check.
   Call `countNear` from one loop that waits 0.1 s, never from Heartbeat:

```lua
--!strict
-- Server: who is near which coin, from a 16-stud grid built once, checked at 10 Hz instead of every frame.
local CELL = 16
-- Vector2 keys match by reference, so every lookup missed: Vector3 keys match by value.
local grid: { [Vector3]: { Vector3 } } = {}

local function cellOf(v: Vector3): Vector3
	return Vector3.new(v.X // CELL, 0, v.Z // CELL)
end

local function addCoin(position: Vector3)
	local c = cellOf(position)
	local list = grid[c]
	if not list then
		list = {}
		grid[c] = list
	end
	table.insert(list, position)
end

-- radius must be at most CELL: only the 3 by 3 cells around p are read.
local function countNear(p: Vector3, radius: number): number
	debug.profilebegin("Coins/NearScan")
	local n = 0
	local c = cellOf(p)
	for dx = -1, 1 do
		for dz = -1, 1 do
			local list = grid[c + Vector3.new(dx, 0, dz)]
			if list then
				for _, coin in list do
					if (coin - p).Magnitude < radius then
						n += 1
					end
				end
			end
		end
	end
	debug.profileend()
	return n
end

return { addCoin = addCoin, countNear = countNear }
```

4. Write HUD text only when the value changes, at most a few times per second, and keep the HUD
   small. 1,200 cells cost 6,002 instances under the HUD (1,205 TextLabels, 1,200 UIGradients); 60
   cells cut Client Gui memory by 8.5 to 14.6 MB and Client instances by 5,700 (C7, two runs).

Result (C1, C3, C4, C6, C7, U1): run in Studio 0.743 on 2026-10-19: pass. C1: contacts 16,314 to 0
and server physics p95 17.6 to 0.06 ms; server sends rose from 6,526 to 11,255 KB/s, because the
server still spun the anchored coins. C3: server sends 11,375 to 12 KB/s, and moving parts 2,023
to 23. C4: server script 6.5 to 0.46 ms per frame. U1 ran the snippets above as written. Client spin
turned the nearest coin 46 degrees in 0.4 s on the Client and 0 degrees on the Server. The grid
matched brute force for 30 players (780 coins found) at 0.18 against 2.35 ms per scan. A first
version keyed by `Vector2` found 0 coins: a `Vector2` key is not found by an equal `Vector2`, a
`Vector3` key is (measured).

## P5. Leak hunt: soak, heap diff, unparented instances

Goal: memory that keeps rising, named by owner.

```lua
local a = HeapProf.summary(HeapProf.snapshot(), 12)
local unA = SceneScan.flatten(SceneScan.query("UnparentedInstances"), 6)
local soak = PerfProbe.soak(20, 1)
local b = HeapProf.summary(HeapProf.snapshot(), 12)
local unB = SceneScan.flatten(SceneScan.query("UnparentedInstances"), 6)
return {
	soak = soak,
	heapDiff = HeapProf.diff(a, b, 6),
	unparentedBefore = unA,
	unparentedAfter = unB,
}
```

- `PerfProbe.soak` reports a floor slope (per-window minima): a sawtooth keeps a flat floor, a leak
  raises it. It needs minutes: in a 20 s Studio soak, the Studio-wide tags did not separate the leak
  from the fix.
- `HeapProf.diff` lists growth per breakdown: `Report.MemcatBreakdown` (memory categories),
  `Report.UserdataBreakdown`, `Report.TagBreakdown` and the `Report.Graph` tree.
- Name long-lived threads so the heap shows the owner: `debug.setmemorycategory("Orbs")` at the top
  of the system's thread.
- `SceneScan` "UnparentedInstances" names the script that holds destroyed parts.
- The fix for the lab's leak, run as written in U1:

```lua
--!strict
-- Server: a short-lived effect whose per-frame connection and table entry die with the part.
local RunService = game:GetService("RunService")

local live: { [BasePart]: RBXScriptConnection } = {}

local function spawnOrb(at: Vector3, parent: Instance)
	local orb = Instance.new("Part")
	orb.Anchored = true
	orb.CanCollide = false
	orb.CanQuery = false
	orb.CanTouch = false
	orb.Size = Vector3.one
	orb.CFrame = CFrame.new(at)
	orb.Parent = parent
	local born = os.clock()
	live[orb] = RunService.Heartbeat:Connect(function()
		orb.CFrame = CFrame.new(at + Vector3.new(0, (os.clock() - born) * 6, 0))
	end)
	-- Destroy does not disconnect RunService connections: release both here.
	orb.Destroying:Once(function()
		local conn = live[orb]
		if conn then
			conn:Disconnect()
		end
		live[orb] = nil
	end)
	task.delay(0.5, orb.Destroy, orb)
end

return spawnOrb
```

Result (C5, U1): run in Studio 0.743 on 2026-10-19: pass (C5, two runs). Leak on: 710 to 780 orbs
tracked, unparented SimLab parts 430 to 708 during the 20 s soak, `LabOrbs` category +694 to +703
KB. Leak off: 5 to 8 tracked, 0 unparented, +14 to +32 KB. Studio-wide memory tags (LuaHeap about
768 MB) did not separate the two in 20 s, and `gcinfo()` in the chunk read about 0.9 MB. U1: 200
fixed orbs left 0 table entries; 200 orbs without the `Destroying` handler left 200.

## P6. Scene Analysis by code

Goal: the Scene Analysis window's numbers without the GUI.

```python
r = rbx_perf.scene(s, "Client")   # every query, top leaves per query
```

```lua
local all = SceneScan.all(6)
return {
	triangles = all.TriangleComposition,
	instances = all.InstanceComposition,
	scriptMemory = all.ScriptMemory,
	unparented = all.UnparentedInstances,
}
```

- Queries: TriangleComposition (draw calls and triangles by pass), InstanceComposition,
  ScriptMemory, UnparentedInstances, AudioMemory, AnimationMemory.
- `SceneAnalysisService` answered in Edit, on the playtest Server and on the Client.

Result (E3, V0 and V7 scene extras): run in Studio 0.743 on 2026-10-19: pass. Client at V0:
InstanceComposition UI 6,069 (1,227 Frames, 1,205 TextLabels, 1,200 UIGradients); at V7: UI 369.
ScriptMemory named the HUD script at 431 KB. On the Server, UnparentedInstances named
`ServerScriptService.SimLab / Part` at 708 with the leak on (C5). TriangleComposition reads the same
counters as `Stats`, so it froze with them when the viewport stopped drawing (R0). In Edit (E3), all
six queries answered.

## P7. Draw calls: what batches

Goal: know what a repeated prop costs before you place hundreds.

Run it on the playtest Client. It places 400 parts per layout in front of a scriptable camera, waits
1 s, and averages the render counters over 30 frames. Layouts: one size and color, many colors, many
sizes, many materials, transparent, and shadows off. First check that the counters move at all: in a
Studio window that is not drawing, every layout reads the same.

```lua
-- Client only: parts built locally in front of a fixed camera, draw calls read per layout.
local RunService = game:GetService("RunService")
local S = game:GetService("Stats")
local cam = workspace.CurrentCamera
cam.CameraType = Enum.CameraType.Scriptable
cam.CFrame = CFrame.lookAt(Vector3.new(0, 40, 90), Vector3.new(0, 10, 0))
local function sample(frames)
	local n, d, sh, tri = 0, 0, 0, 0
	for _ = 1, frames do
		RunService.PreRender:Wait()
		n += 1
		d += S.SceneDrawcallCount
		sh += S.ShadowsDrawcallCount
		tri += S.SceneTriangleCount
	end
	return { draws = math.round(d / n), shadowDraws = math.round(sh / n), triangles = math.round(tri / n) }
end
local MATERIALS = { Enum.Material.SmoothPlastic, Enum.Material.Wood, Enum.Material.Brick, Enum.Material.Metal,
	Enum.Material.Concrete, Enum.Material.Grass, Enum.Material.Marble, Enum.Material.Slate }
local function build(n, style)
	local f = Instance.new("Folder")
	f.Name = "BatchProbe"
	local side = math.ceil(math.sqrt(n))
	for i = 1, n do
		local p = Instance.new("Part")
		p.Anchored = true
		p.Size = Vector3.new(2, 2, 2)
		p.CFrame = CFrame.new(((i - 1) % side) * 3 - side * 1.5, 4 + ((i - 1) // side) * 3, 0)
		p.Material = Enum.Material.SmoothPlastic
		p.Color = Color3.fromRGB(200, 200, 200)
		if style == "colors" then
			p.Color = Color3.fromHSV((i % 97) / 97, 0.7, 0.9)
		elseif style == "materials" then
			p.Material = MATERIALS[(i % #MATERIALS) + 1]
		elseif style == "transparent" then
			p.Transparency = 0.5
		elseif style == "noShadow" then
			p.CastShadow = false
		elseif style == "sizes" then
			p.Size = Vector3.new(1 + (i % 5), 1 + (i % 3), 2)
		end
		p.Parent = f
	end
	f.Parent = workspace
	return f
end
local out = { n = 400 }
task.wait(1)
out.empty = sample(30)
for _, style in { "same", "colors", "sizes", "materials", "transparent", "noShadow" } do
	local f = build(400, style)
	task.wait(1)
	out[style] = sample(30)
	f:Destroy()
	task.wait(0.5)
end
cam.CameraType = Enum.CameraType.Custom
return out
```

Result (D1): live run pending. From V2 on, the 3D viewport of the test window stopped drawing while
other Studio place windows covered it: `SceneDrawcallCount` and `SceneTriangleCount` stayed fixed (9
and 74,254, later 11 and 34,769) with 100 to 400 new parts in view, Scene Analysis read the same,
and the UI still drew (R0, R1). The probe now skips in that state instead of reporting a false "no
change". Rerun: `run_live.py --only R0,D1` while the window draws. Until then, use McNeill's tier
list in [expert-notes.md](expert-notes.md): Color3, CFrame and Size changes batch; transparency took
a group from 2 to 16 draws in his demo.

## P8. Streaming

Goal: the client holds what is near, and the join stays short.

- `workspace.StreamingEnabled` reads and writes from `execute_luau` in Edit.
  `StreamingTargetRadius`, `StreamingMinRadius`, `ModelStreamingBehavior`, `StreamingIntegrityMode`
  and `PlayerCharacterDestroyBehavior` fail there with "is not a valid member of Workspace".
- Set the radii in the Properties panel or in the Rojo project file
  (`"StreamingTargetRadius": 512`), and keep Min below Target (Roblox Learn).

Compare the Client with streaming off and on, one playtest each:

```python
for on in (False, True):
    rbx_perf.run(s, f"workspace.StreamingEnabled = {str(on).lower()}\nreturn workspace.StreamingEnabled", "Edit")
    with Playtest(s, settle=2, timeout=150) as pt:
        print(on, rbx_perf.run(s, CLIENT_PROBE, "Client", timeout=60)["result"])
```

`CLIENT_PROBE`, with the game's own folder name in place of `Coins`:

```lua
local t0 = os.clock()
while not workspace:FindFirstChild("Coins") and os.clock() - t0 < 20 do task.wait(0.2) end
task.wait(3)
local S = game:GetService("Stats")
local coins = workspace:FindFirstChild("Coins")
return {
	streaming = workspace.StreamingEnabled,
	instances = S.InstanceCount,
	coinsVisible = if coins then #coins:GetChildren() else 0,
	totalMemoryMb = math.round(S:GetTotalMemoryUsageMb()),
	instancesMb = math.round(S:GetMemoryUsageMbForTag(Enum.DeveloperMemoryTag.Instances) * 10) / 10,
	partsMb = math.round(S:GetMemoryUsageMbForTag(Enum.DeveloperMemoryTag.BaseParts) * 10) / 10,
}
```

Result (S1): run in Studio 0.743 on 2026-10-19: pass. 4,000 coins spread 40 studs apart, default
radii. Streaming off: 4,000 coins and 53,044 instances on the Client. Streaming on: 1,484 to 1,537
coins and about 50,550 instances (two runs). Client memory totals did not drop (3,807 to 3,926 MB
either way): Studio totals include Studio itself.

## P9. What needs a phone or the live game (not yet run here)

These cannot run in this setup: no phone is attached, and the test place is never published.

- Client memory under 1.3 GB on a 2 GB phone: Developer Console > Memory on the device (McNeill).
  Studio memory is not a phone number.
- CPU on a phone: about 4 times slower than a desktop (McNeill). Read the MicroProfiler on the
  device at `<device IP>:1338`.
- A thermal run: 10 to 15 minutes of active play on the phone (docs).
- Crash rate, frame rate by device and server memory by age: Creator Hub Performance dashboard,
  after 100 daily active users.
- Server MicroProfiler and live Script Profiler on a real server: Developer Console Server tabs in
  the live game.
- A crowd at max players in the hub: the verdict on frame rate and `updateInvalidatedFastClusters`
  (M4 in [memory-and-crowds.md](memory-and-crowds.md)).

GUI paths are in [gui-paths.md](gui-paths.md). The owner reports the numbers; the agent compares
them with [critique.md](critique.md).

## P10. Release: restart plan and rollback

Goal: an update that players survive, and a way back.

The restart handler, run as written in U1:

```lua
--!strict
-- Server Script: warn players and save before an update restart.
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local notice = Instance.new("RemoteEvent")
notice.Name = "RestartNotice"
notice.Parent = ReplicatedStorage

game.ServerRestartScheduled:Connect(function(restartTime: DateTime, source: Enum.CloseReason, attributes: { [string]: any })
	local seconds = math.max(0, restartTime.UnixTimestamp - DateTime.now().UnixTimestamp)
	notice:FireAllClients(seconds, source.Name, attributes.message)
	for _, player in Players:GetPlayers() do
		-- Save through your data layer here (scenario-roblox-data owns the save code).
		player:SetAttribute("SavePending", true)
	end
end)
```

- Save code belongs to scenario-roblox-data (`BindToClose` has a 30 s budget). Publishing and
  `:restartServers` automation belong to scenario-roblox-tooling, as dry runs.
- Order for a live update: the owner publishes; restart only outdated servers with a 1 to 60 minute
  delay when the data format changed; watch the crash rate for a jump above 2 to 3 percent.
- Roll back: restore the version in Version History, publish it, then restart servers. Restoring
  alone publishes nothing (docs).

Result (U1 restart): run in Studio 0.743 on 2026-10-19: pass. On the playtest Server the handler
connected to `game.ServerRestartScheduled` and created `RestartNotice`. The event itself fires only
on a live server restart, so its firing is not yet run. Publishing, restarts and the dashboard: not
yet run, because the test place is never published.
