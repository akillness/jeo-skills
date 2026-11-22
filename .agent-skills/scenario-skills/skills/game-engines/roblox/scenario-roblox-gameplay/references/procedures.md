# Procedures: gameplay systems

Full code for each stage of the playbook. Every procedure has a live test in
`tests/code/scenario-roblox-gameplay/run_live.py` (test ids in brackets) that runs it in Studio
through the scenario-roblox-expert toolkit and asserts on the result. Offline checks:
`tests/code/scenario-roblox-gameplay/run_offline.sh` (O1 to O6). Every Luau block below type-checks
with zero errors on both Luau solvers (O6) and runs in the playtest Server (S1).

The modules live in [scripts/agentkit/gameplay/](../scripts/agentkit/gameplay/):

| Module                                       | Side           | Job                                                                                       |
| -------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------- |
| `StateMachine`                               | any            | states, tests and transitions as data                                                     |
| `NpcBrain`                                   | any            | Patrol, Chase, Attack on StateMachine (pure)                                              |
| `NpcService`                                 | server         | scheduler for many NPCs: buckets, path budget, line of sight, melee                       |
| `Combo`                                      | any            | server-clock rules for an N-hit chain, stun and cancel (pure)                             |
| `Hitbox`                                     | server         | box queries deduped by character, sphere and ray casters, debug draw                      |
| `Projectile`                                 | any            | swept trapezoid stepping with an injected cast (pure)                                     |
| `Car`                                        | both           | constraint car: build, server ownership, client controller                                |
| `GameplayAudit`                              | Edit, Lune     | static findings: constraints, movers, casts, pathfinding, combat                          |
| `PathGuard`                                  | any            | path failure rules: compute gate, legs, Blocked index rule, MoveTo retry then snap (pure) |
| `DebugDraw`                                  | server         | boxes, segments and waypoints as HandleAdornments for captures                            |
| `GameplayInputs`                             | Edit, server   | Input Action System tree with a touch button per action                                   |
| `CarSafety`                                  | server         | exit safety: highest exit point, motors released, one owner for loose parts               |
| `NpcPool`                                    | server         | reuse NPC models across waves                                                             |
| `boot/GameplayServer`, `boot/GameplayClient` | server, client | wiring used by the tests                                                                  |

They require each other with `require("./Name")`, so keep them siblings in one folder
(`ServerScriptService.GameplayKit`; a copy of `Car` goes to ReplicatedStorage for the client).

## Setup shared by the Python snippets

```python
import sys
from pathlib import Path
SKILLS = Path("skills")  # the folder that holds the installed skills
sys.path[:0] = [str(SKILLS / "scenario-roblox-expert" / "scripts"), str(SKILLS / "scenario-roblox-gameplay" / "scripts")]
import rbx_env, rbx_gameplay as G
from rbx_play import Playtest
from rbx_run import run

with rbx_env.place_slot():
    s = rbx_env.open_place("places/arena/arena.rbxl")  # opened once, reused, never closed by the agent
```

## P1. Install the kit and the fixtures [E0]

Goal: the modules, two boot scripts, the Input Action System instances and test fixtures in the open
place, without rebuilding the file. How: `G.install(s)` writes each `Source` into the Edit data
model (idempotent); `G.build_fixtures(s)` adds a `Map` folder (static geometry for line of sight),
an NPC template in ServerStorage, three dummies and a car. Nothing is saved.

```python
print(G.install(s))          # {changed, made, ias}
print(G.build_fixtures(s))   # {rig = "R15" | "R6", templateParts, carParts}
```

- `GameplayClient` is a Script with `RunContext` Client in ReplicatedStorage: it runs once per
  client. A LocalScript there never runs, and a Client Script in StarterPlayerScripts runs twice
  (toolkit finding, scenario-roblox-architecture).
- The NPC template comes from `Players:CreateHumanoidModelFromDescriptionAsync` with a default
  `HumanoidDescription`; the fallback is a hand-built R6 rig. Animate and Health scripts are removed
  so the bench measures AI, not animation.

The five modules added after the first live run (`PathGuard`, `DebugDraw`, `GameplayInputs`,
`CarSafety`, `NpcPool`) install the same way; their Lune specs pass and their Studio results are in
P5, P7, P12, P13 and P14.

Result: run in Studio 0.743 on 2026-10-19: pass. R15 template built in Edit (16 parts), car 23
parts, bindings F, MouseLeftButton and ButtonX; a second install with unchanged sources rewrote
nothing (0.08 s). The Edit-side `require` cache keeps the old module after a `Source` edit, so
`install` replaces a changed ModuleScript with a fresh `Clone`.

## P2. Cast and query facts before you design a hit [E1]

Goal: know what each query returns in this build. How: one Edit chunk with anchored parts at y 500.

```lua
local folder = Instance.new("Folder")
folder.Parent = workspace
local params = RaycastParams.new()
params.IncludeInstances = { folder }
local inside = Instance.new("Part")
inside.Anchored = true
inside.Size = Vector3.new(4, 4, 4)
inside.CFrame = CFrame.new(0, 500, 0)
inside.Parent = folder
-- Spherecast skips the part it starts in; the overlap query finds it.
local swept = workspace:Spherecast(Vector3.new(0, 500, 0), 1, Vector3.new(0, 0, -100), params)
local op = OverlapParams.new()
op.IncludeInstances = { folder }
local overlapping = workspace:GetPartBoundsInRadius(Vector3.new(0, 500, 0), 1, op)
print(swept, #overlapping)
folder:Destroy()
```

The test also checks: `Shapecast` distance is the swept part's travel (final position is
`start + direction.Unit * Distance`); one rig in a box returns many parts but one model;
`BindToSimulation` in Edit; collision groups registered on `workspace`; whether
`RaycastParams.Margin` and `SizeGradient` can be set.

Result: run in Studio 0.743 on 2026-10-19: pass. Spherecast from inside the part returned the far
part, the overlap query found the one it started in (1); Shapecast distance 28.5 for 28.5 expected;
one R15 rig in a box: 16 parts, 1 model; `BindToSimulation` in Edit ok; collision groups on
`workspace` ok. Setting `Margin` raised "Margin is not enabled yet!" and `SizeGradient`
"SizeGradient is not enabled yet!": both are in the reference but off in this build, so a thick ray
is still a `Spherecast`.

## P3. Audit a place for gameplay mistakes [E2, O2, O5]

Goal: catch the static mistakes before a playtest. How: `GameplayAudit.run(root)` in Edit or in Lune
on a place file.

```python
print(G.audit_place("arena.rbxl"))   # offline, Lune: {findings, tally}
src = (G.KIT / "GameplayAudit.luau").read_text()
live = run(s, f"local GameplayAudit = (function()\n{src}\nend)()\nreturn GameplayAudit.run(game)", "Edit")
```

Rules: `legacy-mover`, `constraint-no-attachment` (error), `mover-zero-limit`,
`suspension-no-limits`, `suspension-upper`, `debug-queryable`, `filter-descendants`, `filter-type`,
`moveto-wait`, `velocity-write`, `client-damage`, `tick`, `region3`, `seat-int`, `legacy-path`,
`computeasync-unprotected`, `touched-damage`; at runtime `GameplayAudit.runtime(folder)` adds
`npc-client-owned`. Run the lead's `Audit` too: it owns deprecated APIs such as `PhysicsService` and
`FindPartOnRay`.

Result: offline O2 pass (3 of 3: every planted rule fires, the clean module raises nothing, the
upper limit rule toggles); O5 pass (0 findings on the empty place). Live E2, run in Studio 0.743 on
2026-10-19: pass, 0 findings on the place with the kit, fixtures and car installed (80 ms).

## P4. Write the NPC brain as data, test it in Lune [O1]

Goal: a brain you can read and test without Studio. How: `StateMachine` definitions (context, states
with `onEnter`, `onStay`, `onExit`, transitions with several sources) and `NpcBrain` on top.

```lua
local Kit = game:GetService("ServerScriptService"):WaitForChild("GameplayKit")
local NpcBrain = require(Kit:WaitForChild("NpcBrain")) :: any
local brain = NpcBrain.new({
	detectRange = 60, attackRange = 5, leaveAttackRange = 6.5, -- hysteresis: no Attack/Chase flicker
	loseAfter = 4, attackCooldown = 1.2, firstAttackDelay = 0.2,
})
local state, swingNow = NpcBrain.step(brain, { hasTarget = true, targetDist = 4, hasSight = true }, time(), 1 / 10)
print(state, swingNow)
```

Transitions, in priority order: Patrol to Chase on sight inside `detectRange`; Chase or Attack to
Patrol after `loseAfter` seconds without sight; Chase to Attack at `attackRange`; Attack to Chase
above `leaveAttackRange`. The caller perceives and moves; the brain only decides.

Result: offline O1 pass, 20 of 20 Lune specs (validation, onExit before onEnter, multi-source
transitions, hysteresis, swing cadence at 0.3 s then every 1.2 s, lose after 4 s, the three-hit
combo, spam, cancel, projectile tests in P8, and the P5, P7, P12 to P14 modules). Pure brain step:
0.23 microseconds (100 brains, 600 ticks, Lune).

## P5. Run many NPCs from one scheduler and measure them [A1, A2, A3]

Goal: a known server cost at the target count. How: `NpcService` connects one Heartbeat. Each frame
one bucket of NPCs thinks (6 buckets = 10 thinks per NPC per second at 60 fps). Perception is a
squared-distance scan, then one raycast against `Map` (`IncludeInstances`). Paths come from one
worker at 30 computations per second. Roots are pinned with `SetNetworkOwner(nil)` after parenting.

```lua
local Kit = game:GetService("ServerScriptService"):WaitForChild("GameplayKit")
local NpcService = require(Kit:WaitForChild("NpcService")) :: any
local template = game:GetService("ServerStorage"):WaitForChild("NpcTemplate") :: Model
NpcService.configure({ map = workspace:FindFirstChild("Map"), buckets = 6, pathsPerSecond = 30 })
NpcService.start()
for i = 0, 99 do
	NpcService.spawn(template, CFrame.new((i % 10) * 6, 3, -150 - (i // 10) * 6))
end
task.wait(5)
print(NpcService.stats()) -- count, states, clientOwnedRoots, aiMsMean/P95/Max, paths, pathMsMean
```

Measure in the playtest Server with the lead's `Stats` (frames over 5 s, heartbeat and physics step,
memory tags) at 0, 25, 50 and 100 patrolling NPCs, then 100 chasing one anchored player:

```python
r = run(pt.s, 'local f = Stats.frames(5) local snap = Stats.snapshot() return {f = f, snap = snap}',
        "Server", 40, kit=["Stats"])
```

The control test [A3] spawns one NPC without `NpcService` next to the player and reads
`GetNetworkOwner()` before and after pinning.

Humanoid cost levers. A Humanoid runs a state machine and physics every frame, so the count of
Humanoids, not the brain, sets the bill (the bench below: physics step 1.8 ms against 0.14 ms of
AI).

- Disable the states an NPC never uses: `NpcService.spawn` turns off Climbing, Swimming,
  FallingDown, Ragdoll, Flying and Seated (`trimStates`; Crusherfire, YWyJHwynM1M 00:26:38; Improve
  performance doc, Humanoids). The bench ran with it.
- `BreakJointsOnDeath = false` (set by `spawn`): a dying R15 otherwise splits into loose parts that
  the server simulates until the corpse is removed.
- Static NPCs (shopkeepers, guards that never walk): `EvaluateStateMachine = false`, or an
  `AnimationController` instead of a Humanoid (YWyJHwynM1M 00:27:11); scenario-roblox-performance
  owns the full pass.
- Pool models across waves with `NpcPool` [added]: one R15 NPC was about 214 instances here. A
  Humanoid that enters Dead stays dead, so a pooled NPC disables Dead and ends in code (Suphi Kaner,
  hr_8svt1n1E 00:05:10, where the same switch stops a client from killing an NPC it owns).

```lua
local ServerStorage = game:GetService("ServerStorage")
local Kit = game:GetService("ServerScriptService"):WaitForChild("GameplayKit")
local NpcPool = require(Kit:WaitForChild("NpcPool")) :: any
local template = ServerStorage:WaitForChild("NpcTemplate") :: Model
local parked = Instance.new("Folder")
parked.Name = "NpcPool"
parked.Parent = ServerStorage
local pool = NpcPool.new(template, parked, 120)
local npc = NpcPool.acquire(pool) -- then PivotTo, parent to Workspace, SetNetworkOwner(nil)
local humanoid = npc:FindFirstChildOfClass("Humanoid") :: Humanoid
humanoid:SetStateEnabled(Enum.HumanoidStateType.Dead, false) -- end it in code at Health 0
humanoid.BreakJointsOnDeath = false
NpcPool.release(pool, npc) -- parked in storage, health and attributes reset
print(pool.created, #pool.free)
```

`NpcPool`: Lune pass (reuse, reset, cap, dead models destroyed). In Studio 0.743 the snippet above
runs in the playtest Server [S1]; a wave benchmark with pooling is not yet run.

Result: run in Studio 0.743 on 2026-10-19: pass. R15 NPCs, Animate and Health removed, one Server
and one Client, 5 s of frames per row:

| NPCs           | Server fps | Frame p95 | Worst frame | Heartbeat | Physics step | AI per frame (mean, p95) | Data sent |
| -------------- | ---------- | --------- | ----------- | --------- | ------------ | ------------------------ | --------- |
| 0              | 60         | 17.36 ms  | 17.64 ms    | 0.05 ms   | 0.16 ms      | 0.010, 0.014 ms          | 0.5 kbps  |
| 25 patrolling  | 60         | 17.30 ms  | 17.85 ms    | 0.09 ms   | 0.63 ms      | 0.047, 0.058 ms          | 5.8 kbps  |
| 50 patrolling  | 60         | 17.52 ms  | 17.89 ms    | 0.18 ms   | 1.16 ms      | 0.094, 0.130 ms          | 10.9 kbps |
| 100 patrolling | 60         | 17.57 ms  | 21.81 ms    | 0.27 ms   | 1.82 ms      | 0.141, 0.178 ms          | 21.5 kbps |
| 100 chasing    | 60         | 17.34 ms  | 17.89 ms    | 0.54 ms   | 1.26 ms      | 0.259, 0.345 ms          | 25.0 kbps |

Thinks: 997 per s at 100 (6 buckets). Client roots: 0 of 100 in every row; client 60 fps, p95 17.4
ms. Moving primitives 64 to 1,616, instances 46,994 to 68,395. Chasing: 100 of 100 reached Attack
around the anchored player, 9 paths in 5 s, 0 failed, 65 ms mean `ComputeAsync` wall time (it
yields; the worker keeps it off the Heartbeat). Ownership control [A3]: an unpinned NPC 6 studs from
the player belonged to the player (`GetNetworkOwnershipAuto` true); after `SetNetworkOwner(nil)`,
the server. This is one Studio session on a desktop: a live server with many players costs more, so
budget with scenario-roblox-performance.

## P6. Hunt: detect, chase around a wall, hit [A4]

Goal: prove perception, pathfinding and melee together, driven by a walking player. How: one NPC
(`loseAfter` 30 s, damage 5) at (150, 3, 0) and a 40-stud wall across z 40. The player starts at
(80, 3, 20), out of range, and walks with `character_navigation` (`Playtest.walk_to`) into sight,
then behind the wall. The first stop is 40 studs short of the NPC so the NPC never blocks the walk.
A server sampler records the NPC path every 0.25 s.

```python
pt.walk_to([110, 3, 20])                    # in sight: Chase
pt.wait_for("return workspace.NPCs:GetChildren()[1]:GetAttribute('State') ~= 'Patrol'", "Server", 15)
pt.walk_to([150, 3, 62])                    # behind the wall: no sight, path chase
```

`walk_to` can time out without an answer while the character keeps walking; read the root position
before you retry.

Pass when the NPC ends behind the wall within 7 studs of the player in Attack, its path went around
the wall end (x offset of at least 19 studs while beside the wall), at least one path was computed
and one hit landed.

- `ComputeAsync` runs inside `pcall` and success also needs `Status == Success` (BrawlDev,
  ckA4fVkAjIA 00:15:48).
- The `Blocked` handler recomputes only when the blocked index is at or after the next waypoint
  (Pathfinding doc).
- `MoveTo` is re-issued every think: it gives up after 8 s (Humanoid reference).

Result: run in Studio 0.743 on 2026-10-19: pass. The NPC switched to Chase 2.15 s after the walk
began (first walk 2.08 s); the second walk took 4.01 s and the NPC stood behind the wall 4.65 s
after it began, 4.4 studs from the player, in Attack. Its path swung 24.2 studs sideways to pass the
wall end; 3 paths computed, 0 failed; 6 swings, 5 hits, player health 84 (regeneration included).

## P7. Melee combo: intent from the client, hits from the server clock [B1, B2, B3]

Goal: a three-hit chain that holds against spam and stun. How:

1. Input: `ReplicatedStorage.GameplayInputs.Combat` (InputContext) with `Attack` (InputAction, Bool)
   and bindings F, MouseLeftButton, ButtonX and Touch. Phones are the most common device and IAS
   draws no buttons, so `GameplayInputs.build` makes a 72-pixel button in `StarterGui.GameplayTouch`
   and sets it as the Touch binding's `UIButton` (IAS walkthrough, Fg-Ksoa7b-s 00:03:27; one context
   for every device, qx7T7EDPqPA 00:04:23). The client shows that ScreenGui only while
   `UserInputService.PreferredInput` is Touch, and fires `Attack:FireServer()` with no arguments on
   `Pressed`. Lune: pass (tree, idempotent rebuild). In Studio 0.743 [A0]: the Touch binding points
   at the button in PlayerGui, and the ScreenGui stays hidden with PreferredInput KeyboardAndMouse.
   Not yet run on a touch device; the button layout per device is scenario-roblox-ui's layout
   matrix.
2. Server: `Combo.request(state, time())` picks the step, enforces `minGap` with a 0.8 tolerance,
   the chain window (0.9 s) and the finisher cooldown (0.6 s).
3. After the step's `hitDelay`, if `Combo.alive(state, requestedAt)`, query a box in front of the
   root and damage each character once.
4. A hit player gets `Combo.cancel(victimState, time(), 0.35)`: the victim's pending swing is
   dropped and new requests are refused while stunned (ArTheDev, Aoc9HkGHu_8 00:02:57).

```lua
local Kit = game:GetService("ServerScriptService"):WaitForChild("GameplayKit")
local Hitbox = require(Kit:WaitForChild("Hitbox")) :: any
local function swing(character: Model, damage: number)
	local root = character:FindFirstChild("HumanoidRootPart") :: BasePart
	local hits = Hitbox.box(Hitbox.inFront(root, 3.5), Vector3.new(5, 5, 5), { exclude = { character } })
	for _, humanoid in hits do -- one entry per character, never per limb
		humanoid:TakeDamage(damage)
	end
end
print(swing)
```

The full handler is `boot/GameplayServer.server.luau` (`onAttack`). Remote validation and rate
limits for production belong to scenario-roblox-networking.

Knockback on the finisher is `Hitbox.knockback(root, velocity, 0.2)`: a `LinearVelocity` held for
0.2 s. One `ApplyImpulse` of the same speed moved a standing dummy 1.2 studs, because the Humanoid
cancels it.

Test: two dummies in front, one behind; `user_keyboard_input` sends F, wait 350 ms, F, wait 350 ms,
F in one call. Then 10 presses with 50 ms waits in one call. Then a server-side stun right after a
request.

Input-test limit: `user_keyboard_input` delivered presses 0.13 to 0.20 s apart (about 6 per s)
whatever the waits, so a key test proves the combo gate under human-speed spam, never a flood. To
test a flood, fire the remote from a client script, 10 times 50 ms apart [B10]: the requests arrived
0.05 to 0.067 s apart (server frames) and the server accepted 2 or 3 of 10 across runs (the pure
`Combo` rule accepts 2 with exact 50 ms spacing in Lune).

Input you did not send can reach a key test: a playtest window with keyboard focus takes real
typing. In one regression run, a W-only drive turned 67 degrees, the driver left the seat 0.5 s
before the scripted Space and one extra Attack request arrived; reruns with the same code passed.
Record every `InputBegan` on the client during a key test, compare it with the keys you sent, and
rerun when they differ (the suite's input guard does this).

Result: run in Studio 0.743 on 2026-10-19: pass. Combo: steps 1, 2, 3; each front dummy hit once per
swing (3 hits, health 58), knocked back 10.5 studs; the dummy behind untouched (health 100). Presses
reached the server 0.47 s apart: the keyboard tool adds about 0.12 s per press. Spam: the 10 presses
arrived 0.13 to 0.20 s apart (6.1 per s, not 20), 4 accepted (gaps 0.33, 0.33, 0.66 s with the
finisher lock), 6 refused "too-soon". Stun: the pending swing was canceled (0 hits), a request
during the stun was refused "stunned", the next swing after it hit 2.

## P8. Projectiles that never tunnel [E4, O1]

Goal: a fast projectile stops at a thin wall at any frame rate. How: `Projectile.step` sweeps the
whole step's displacement with an injected cast before it moves. Displacement is the trapezoid
`(v0 + v1) / 2 * dt`. Before the first step, check the start overlap: casts skip what they start in.

```lua
local Kit = game:GetService("ServerScriptService"):WaitForChild("GameplayKit")
local Projectile = require(Kit:WaitForChild("Projectile")) :: any
local Hitbox = require(Kit:WaitForChild("Hitbox")) :: any
local params = RaycastParams.new()
params.ExcludeInstances = {} -- add the shooter's character here, per shot
local origin = Vector3.new(0, 10, 0)
local blocked = #Hitbox.overlapsAt(origin, 0.25) > 0
local shot = Projectile.new(origin, Vector3.new(0, 0, -3000), { gravity = Vector3.new(0, -50, 0), maxDistance = 1000 })
local hit = if blocked then nil else Projectile.run(shot, 1 / 60, Hitbox.sphereCaster(0.25, params))
print(hit and hit.instance, shot.position, shot.reason)
```

- Spherecast, Blockcast and Shapecast reach 1,024 studs per call; Raycast 15,000 (WorldRoot
  reference).
- Per-shot exclude lists: a module-level list that grows each shot leaks (BrawlDev, u6I17z6ggUg
  00:28:41).
- Cosmetic bullets: muzzle `Attachment.WorldPosition`, then half a segment of offset (B Ricey,
  mJZWY3G7wa4 00:08:54, 00:19:51). VFX on hit: `result.Normal`, 0.125 studs off the surface
  (veraktt, GtqFcyFgIXQ 00:24:07).

Result: offline O1 pass (30, 60 and 240 Hz end within 0.001 studs after 1 s; semi-implicit Euler
drifts 0.5 studs or more; a wall at z -50 stops a 0.5-radius sphere at z -49.5 at 100, 1,000 and
5,000 studs/s, 15 and 60 Hz). Live E4, run in Studio 0.743 on 2026-10-19: pass. A 0.25-stud sphere
stopped at z -99.65 (wall face minus radius) on a 0.2-stud wall at 300, 3,000 and 20,000 studs/s, 30
and 60 Hz (1 to 20 steps); a sphere started inside the wall missed it while the overlap query found
it. Cost of one 50-stud cast against a few-part include list: Spherecast 0.46 microseconds, Raycast
0.30.

## P9. A constraint car you can drive [B4, B5, B6]

Goal: a car that drives, steers the right way and stays upright. How: `Car.build(cf, options)` per
Suphi Kaner (FVOowr2DXbM): per wheel one `CylindricalConstraint` (slide axis up, `InclinationAngle`
90, limits -1 and -2, rear motor) and one `SpringConstraint` on the same attachments (Stiffness
3500, Damping 200, FreeLength 2.8). Body and wheels sit in non-colliding groups. `Car.serve(car)`
gives the driver network ownership on `Occupant` change and calls `SetNetworkOwnershipAuto` on exit.
Its speed check takes ownership back above 1.5 times `MaxSpeed`. `Car.controller(car)` runs on the
client: each Heartbeat it maps `ThrottleFloat` and `SteerFloat` to the motors and front attachments.

```lua
local Kit = game:GetService("ServerScriptService"):WaitForChild("GameplayKit")
local Car = require(Kit:WaitForChild("Car")) :: any
local at = Vector3.new(0, 3.4, 200)
local car = Car.build(CFrame.lookAt(at, at + Vector3.new(0, 0, -1)), { maxSpeed = 50, torque = 5000 })
Car.serve(car, function(player: Player, why: string)
	warn(player.Name, why) -- hand to the networking skill's suspicion score
end)
```

- Drive: rear `AngularVelocity = driveSign * sign(throttle) * MaxSpeed / radius`; `MotorMaxTorque`
  is `abs(throttle) * Torque`, or 2,000 idle torque as an engine brake (FVOowr2DXbM 00:44:30).
- Steer: rotate the front body attachments about their up axis, rate-limited to 30 degrees per 0.4
  s.
- Test: `seat:Sit(humanoid)` on the server, then `user_keyboard_input` holds W for 3 s, then W and D
  for 2.5 s; a server sampler records position, heading, speed and `UpVector.Y` every 0.1 s.
- Check the steer sign in a playtest. This kit first used `-steer * maxAngle` and W plus D turned
  the car 110 degrees left; with `steer * maxAngle` it turns right.
- Keep the center of mass low: it is the main anti-flip lever (Suphi Kaner, FVOowr2DXbM 00:21:37,
  00:54:05). Make the chassis a low, dense slab and the body above it light (low density in
  `CustomPhysicalProperties`, or `Massless` on cosmetic parts), and put the seat low and central.
  The kit's chassis is a 1-stud slab at axle height with the seat on top; widen the track before you
  stiffen the springs if a car rolls in turns.

Result: run in Studio 0.743 on 2026-10-19: pass. Seated: the player owned the chassis and a wheel,
spring lengths 1.50 to 1.65, wheel axles aligned (dot 1.0), `UpVector.Y` 0.9999. W for 3 s: 177.9
studs forward, top speed 51.0 studs/s (`MaxSpeed` 50), heading change -0.1 degrees, lowest
`UpVector.Y` 0.997. W plus D for 2.5 s: turned 112.4 degrees right, lowest `UpVector.Y` 0.994; the
seat's `ThrottleFloat` and `SteerFloat` reached 1 on the server. Exit: `Occupant` nil, ownership
back to automatic.

## P10. Pick the mover by its job [B8]

Goal: the right mover for constant speed, thrust or a one-shot push. How: three 2-stud blocks on the
baseplate, sampled at 0.25, 0.5, 1 and 2 s.

```lua
local block = Instance.new("Part")
block.Size = Vector3.new(2, 2, 2)
block.Position = Vector3.new(0, 1.1, 230)
block.Parent = workspace
local a = Instance.new("Attachment")
a.Parent = block
local lv = Instance.new("LinearVelocity")
lv.Attachment0 = a -- without it the constraint does nothing, silently
lv.VelocityConstraintMode = Enum.VelocityConstraintMode.Line
lv.LineDirection = Vector3.new(0, 0, -1)
lv.LineVelocity = 20
lv.MaxForce = 1e6
lv.Parent = block
```

The other two: a `VectorForce` of 150 times `AssemblyMass` (world space, at the center of mass) and
`ApplyImpulse` of 40 times `AssemblyMass`.

Result: run in Studio 0.743 on 2026-10-19: pass (block mass 5.6, gravity 196.2). Speed in studs/s at
0.25, 0.5, 1 and 2 s: `LinearVelocity` 19.9 at every sample; `VectorForce` 37.7, 59.4, 101.6, 186.3
(still accelerating); impulse 23.7, 4.5, 0, 0 (friction ate it within 1 s).

## P11. Fixed-step logic: BindToSimulation [E1, B7]

Goal: know whether `RunService:BindToSimulation` is available before writing authority-ready code.
The RunService reference says it runs only when `Workspace.UseFixedSimulation` is enabled. In 0.743
it ran on a place that never set the property, and scripts cannot read the property from the Studio
MCP context ("is not a valid member of Workspace"). Set it explicitly in the Rojo project
(`"Workspace": {"$properties": {"UseFixedSimulation": "Enabled"}}`) so the place does not depend on
a default; scenario-roblox-networking owns the full Server Authority settings.

```lua
local RunService = game:GetService("RunService")
local ok, err = pcall(function()
	local conn = RunService:BindToSimulation(function(dt: number)
		-- read and write only synchronized state here: attributes, physics, CFrames
	end, Enum.StepFrequency.Hz60)
	if conn then
		conn:Disconnect()
	end
end)
print(ok, err)
```

Result: run in Studio 0.743 on 2026-10-19: pass. Edit: bound and disconnected without error. Play,
Server, 2 s per rate: no frequency argument gave 30.5 calls per s (dt 33.33 ms), `Hz60` 60 per s
(16.67 ms), `Hz10` 10 per s (100 ms). Default to an explicit `StepFrequency`.

## P12. Path failures and route pricing [O1]

Goal: paths that do not fail silently and routes priced by the level, not by code. How: a `Costs`
table that prices materials, `PathfindingModifier` labels and `PathfindingLink` labels, and
`PathGuard` for the failure rules.

```lua
local PathfindingService = game:GetService("PathfindingService")
local Kit = game:GetService("ServerScriptService"):WaitForChild("GameplayKit")
local PathGuard = require(Kit:WaitForChild("PathGuard")) :: any

-- A danger region and a boat link, priced in the same Costs table as materials.
local zone = Instance.new("Part")
zone.Anchored = true
zone.CanCollide = false
zone.Transparency = 1
zone.Size = Vector3.new(20, 6, 20)
zone.Position = Vector3.new(60, 3, 0)
zone.Parent = workspace
local modifier = Instance.new("PathfindingModifier")
modifier.Label = "DangerZone"
modifier.Parent = zone
local a0, a1 = Instance.new("Attachment"), Instance.new("Attachment")
a0.Position, a1.Position = Vector3.new(-10, -3, 0), Vector3.new(10, -3, 0)
a0.Parent, a1.Parent = zone, zone
local link = Instance.new("PathfindingLink")
link.Attachment0, link.Attachment1, link.Label = a0, a1, "UseBoat"
link.Parent = zone
local path = PathfindingService:CreatePath({
	AgentRadius = 2, AgentHeight = 5, AgentCanJump = true,
	Costs = { DangerZone = 100, Water = 20, UseBoat = 2 }, -- finite = last resort; math.huge = never
})

local function walkTo(humanoid: Humanoid, goal: Vector3, worldReady: boolean): RBXScriptConnection?
	local rootPart = humanoid.RootPart
	if not rootPart then
		return nil
	end
	local root: BasePart = rootPart
	local allowed, why = PathGuard.canCompute({
		airborne = humanoid.FloorMaterial == Enum.Material.Air, loaded = worldReady,
		from = root.Position, to = goal,
	})
	if not allowed then
		warn("path deferred:", why) -- retry on a later think; PathGuard.legs splits long trips
		return nil
	end
	local computed = pcall(path.ComputeAsync, path, root.Position, goal)
	if not computed or path.Status ~= Enum.PathStatus.Success then
		return nil
	end
	local waypoints = path:GetWaypoints()
	local index, fails = 2, 0
	local function step()
		local wp = waypoints[index]
		if not wp then
			return
		end
		if wp.Action == Enum.PathWaypointAction.Jump then
			humanoid.Jump = true
		end
		humanoid:MoveTo(wp.Position) -- gives up after 8 s and fires MoveToFinished(false)
	end
	local conn = humanoid.MoveToFinished:Connect(function(reached: boolean)
		local action = PathGuard.onMoveFinished(reached, fails)
		if action == "retry" then
			fails += 1
		else
			if action == "snap" then -- to THIS waypoint, never to the goal
				root.CFrame = CFrame.new(waypoints[index].Position + Vector3.new(0, 3, 0))
			end
			index += 1
			fails = 0
		end
		step()
	end)
	step()
	return conn -- on Blocked: if PathGuard.shouldRecompute(i, index), disconnect and walk again
end
print(walkTo)
zone:Destroy()
```

- Price, do not script: the cheapest path wins over the shortest (BrawlDev, ckA4fVkAjIA 00:18:21,
  00:24:01). `math.huge` makes a label impassable; 100 or 1,000 make it a last resort (Pathfinding
  doc, Modifiers; the video's "1000 blocks it" is wrong). `PassThrough = true` on a modifier routes
  through a closed door. A link's label must cost less than the alternative (UseBoat 2 against
  Water 20) or it is never taken; your code performs the action when `waypoint.Label == "UseBoat"`.
- Compute on the ground: wait until `Humanoid.FloorMaterial` is not Air (Pathfinding doc).
- Compute in a loaded world: a map cloned per round, generated terrain or streamed areas must exist
  around both ends. Gate NPC placement and paths on a load check (Suphi Kaner, JyMxrcqEzu8
  00:46:46); clients path only to persistent models after `Workspace.PersistentLoaded`, or ask the
  server (Pathfinding doc, Streaming).
- Limits: 3,000 studs start to goal and 20,000 nodes; both fail as a bad `Status`, not an error.
  Split long trips into legs (`PathGuard.legs`) or authored waypoints.
- A failed move is normal: `MoveTo` stops after 8 s. Re-issue it once, then snap to that waypoint
  (Suphi Kaner, JyMxrcqEzu8 00:38:26). `NpcService` re-issues `MoveTo` on every think instead.
- `Blocked(index)`: recompute only when `index >= nextIndex` (Pathfinding doc, Blocked paths).
- Agent parameters that cannot fit (a jump with `AgentCanJump` false, `AgentHeight` above every
  passage) also fail silently as a bad `Status`.

Result: `PathGuard` Lune pass (gate reasons, legs for 7,000 studs, Blocked rule, retry then snap).
In Studio 0.743 the snippet runs in the playtest Server [S1]: the path with `Costs`, the modifier
and the link are created without error. Walking a route through the modifier and link is not yet
run. `NpcService` (live-tested in P5 and P6) applies the Blocked rule and re-issues `MoveTo`; it
does not yet wait for the ground.

## P13. Debug views and drawings for captures [A5]

Goal: see what the engine and the server decided, in a capture. How: Studio's views for engine
state, `DebugDraw` adornments for your own queries.

- Visualization Options (upper right of the viewport): Navigation mesh (walkable areas, arrows for
  jumps), Pathfinding modifiers and links, Network owners (green: this client simulates; red: buffer
  zone; white or gray: someone else; black: no physics), Constraint details (Pathfinding doc;
  Network ownership doc, Visualizing). Menu paths: [gui-paths.md](gui-paths.md).
- Draw waypoints, hitboxes and casts before tuning (BrawlDev, u6I17z6ggUg 00:08:18; waypoint balls,
  ckA4fVkAjIA 00:07:51). `DebugDraw` uses `BoxHandleAdornment`, `SphereHandleAdornment` and
  `LineHandleAdornment` on `Workspace.Terrain` (world space). They are not parts, so they never
  collide or block a query; a debug Part needs `CanQuery` false (Crusherfire, EIOwGMZYidw 00:10:42).
  Server-made adornments replicate to the client. Keep `AlwaysOnTop` false for drawings you want in
  a capture: in Studio 0.743, AlwaysOnTop adornments were missing from screen captures while
  depth-tested ones in the same frame showed. `DebugDraw` is depth-tested by default; `onTop = true`
  sets AlwaysOnTop (drawn over geometry on screen, absent from captures).

```lua
local PathfindingService = game:GetService("PathfindingService")
local Kit = game:GetService("ServerScriptService"):WaitForChild("GameplayKit")
local DebugDraw = require(Kit:WaitForChild("DebugDraw")) :: any
local path = PathfindingService:CreatePath({ AgentRadius = 2, AgentHeight = 5 })
local ok = pcall(path.ComputeAsync, path, Vector3.new(0, 3, 0), Vector3.new(0, 3, -40))
if ok and path.Status == Enum.PathStatus.Success then
	DebugDraw.path(path:GetWaypoints(), { seconds = 10 }) -- spheres, jumps in yellow, segments
end
DebugDraw.box(CFrame.new(0, 3, -3.5), Vector3.new(5, 5, 5), { seconds = 10 }) -- a melee query box
```

Result: `DebugDraw` Lune pass (world-space boxes, segment length and direction, 3 waypoints give 5
adornments, jump colored, depth-tested unless `onTop`, clear). In Studio 0.743 [A5]: a path around
the hunt wall (22 waypoints, up to 22.3 studs off the straight line) and a query box, 44 adornments,
all seen by the client; the capture shows the path and the box once they are depth-tested.

## P14. Leaving a car safely [B9]

Goal: the driver leaves, the car stops, ownership settles and the player lands above ground. How:
`CarSafety.watch(car)` next to `Car.serve(car)` (the boot script does both).

- Exit through the highest of several exit points by world height: a car on its side would put a
  fixed side exit under the map (Suphi Kaner, FVOowr2DXbM 01:02:23, 01:04:02).
- Release the motors on exit: each machine simulates with its own copy of the motor values, so the
  next owner must see the idle brake, not the last throttle. The kit's client controller zeroes its
  copy when its player leaves the seat; `CarSafety.release` zeroes the server's.
- Loose parts on a vehicle (cargo, a door on its own assembly) get the driver as owner too; the
  chassis call covers only its mechanism (Network ownership doc, Setting ownership).
- Test: hold W, press Space to leave the seat, keep W held; the chassis speed must fall under 3
  studs/s and the owner must stay the same for the last second.

```lua
local Kit = game:GetService("ServerScriptService"):WaitForChild("GameplayKit")
local CarSafety = require(Kit:WaitForChild("CarSafety")) :: any
local seat = CFrame.new(0, 3, 0) * CFrame.Angles(0, 0, math.rad(90)) -- a car on its side
print(CarSafety.exitPoint(seat)) -- the exit on the upper side, 5 studs above the seat
```

Result: `CarSafety.exitPoint` and `release` Lune pass (upright: a side exit 1 stud up; on its side:
the upper exit 5 studs up; drive motors to the idle torque, steering centered). `watch` and the
throttle-held exit in Studio 0.743 [B9]: the car was doing 50.1 to 50.3 studs/s when the driver left
(1.6 s after W, three runs), then stayed under 0.05 studs/s in the last second with one owner and
automatic ownership; the car stayed upright (`UpVector.Y` 0.997 or more).
