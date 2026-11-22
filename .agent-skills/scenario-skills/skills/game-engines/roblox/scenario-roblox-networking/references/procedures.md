# Procedures: networking and security

Full code for each stage of the playbook. Every procedure has a live test in
`tests/code/scenario-roblox-networking/run_live.py` (test id in brackets) that runs it in Studio
through the scenario-roblox-expert toolkit: hostile fires from the playtest Client data model,
assertions in the Server data model. Offline checks:
`tests/code/scenario-roblox-networking/run_offline.sh`. Every Luau block below passes `rbx_check`
with zero errors (offline test O7), and every block, kit module and place script passes
`luau-lsp analyze` on both solvers, old and `--flag:LuauSolverV2=true` (O8, `two_solvers.py`). The
new solver needs the sourcemap built with `rojo sourcemap --include-non-scripts`; without it,
`Remotes` and `workspace.Targets` are unknown keys. Classes use
`export type X = typeof(setmetatable({} :: XFields, X))`, so no constructor needs a `:: any` cast.

The modules live in [scripts/agentkit/networking/](../scripts/agentkit/networking/): `Guard`,
`RateLimit`, `Suspicion`, `Net`, `HitCheck`, `MoveGuard` go into the place as ModuleScripts under
one folder (here `ServerScriptService.NetKit`); `Exploit` and `NetAudit` stay in tests and audits.
The Python side is [scripts/rbx_net.py](../scripts/rbx_net.py).

## Setup shared by the Python snippets

```python
import sys
from pathlib import Path
SKILLS = Path("skills")  # the folder that holds the installed skills
sys.path[:0] = [str(SKILLS / "scenario-roblox-expert" / "scripts"), str(SKILLS / "scenario-roblox-networking" / "scripts")]
import rbx_env, rbx_net
from rbx_play import Playtest

# NetKit into a Rojo place: src = {"ServerScriptService": {"NetKit": rbx_net.kit_tree(place_dir)}}
# In a user's repository, copy it in instead: rbx_net.vendor_kit(repo, "src/server/NetKit")
with rbx_env.place_slot():
    s = rbx_env.open_place("places/arena/arena.rbxl")   # opened once, reused, never closed by the agent
```

## P1. Audit every client-triggerable surface [P1]

Goal: list remotes, handlers and interactive instances, and flag handlers with no validation, no
rate limit, NaN-unsafe comparisons, trusted client values, purchase signals, instant enforcement,
unanchored prompt parents and missing honeypots.

```python
report = rbx_net.audit_place("arena.rbxl")                 # offline, Lune: no Studio needed
print(report["tally"], report["serverAuthority"]["missing"])
for f in report["findings"]:
    print(f["severity"], f["rule"], f["path"], f["message"])
live = rbx_net.run(s, "return NetAudit.run(game, Audit)", kit=["NetAudit"], lead_kit=["Audit"])  # Edit data model
```

Rules (from `NetAudit.luau`): `handler-unvalidated`, `nan-unsafe`, `trusted-value`, `spatial-claim`,
`no-rate-limit`, `purchase-signal`, `instant-enforcement`, `interaction-unchecked`,
`touched-trusted`, `unanchored-interactive`, `per-frame-fire`, `legacy-clock`, `raycast-filter`,
`no-honeypot`, `remote-unreachable`, plus the lead Audit's remote rules (`InvokeClient`, remotes
with no handler).

Result: run in Studio 0.743 on 2026-10-18: pass.

- 11 remotes, 7 wrapped by `Net`; live tally 0 errors, 4 warnings, 1 info, equal to the offline Lune
  tally.
- The 4 warnings: the deliberately vulnerable VulnGrant handler (`nan-unsafe`, `trusted-value`,
  `no-rate-limit`) and the unanchored crate under a prompt (`unanchored-interactive`). The info:
  `remote-function` on Buy.
- Geometry check (P0b): Baseplate top at y 0, every part where the project file puts it.

## P2. Validate every argument, then fuzz from the Client [P2a, P2b]

Goal: every remote checks type, finiteness, range, size and instance ancestry before its handler
runs; prove it by firing hostile payloads from the Client data model.

```luau
--!strict
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerScriptService = game:GetService("ServerScriptService")

local Kit = ServerScriptService.NetKit
local Guard = require(Kit.Guard)
local Net = require(Kit.Net)

local Remotes = ReplicatedStorage.Remotes
local PRICES = { Sword = 50, Shield = 30 }

Net.init({
	enforce = function(player: Player, reasons: { [string]: number })
		player:Kick("Disconnected") -- or Players:BanAsync, see P7
	end,
})

-- Currency lives on the server; leaderstats only mirror it.
local function coinsOf(player: Player): IntValue?
	local ls = player:FindFirstChild("leaderstats")
	local c = ls and ls:FindFirstChild("Coins")
	return if c and c:IsA("IntValue") then c else nil
end

-- The client names an item; price and balance come from the server.
Net.bind(Remotes.Buy, {
	args = { Guard.oneOf(PRICES) },
	limit = { 4, 2 }, -- burst 4, refill 2 per second
	handler = function(player: Player, item: string): boolean
		local coins = coinsOf(player)
		local price = PRICES[item]
		if coins == nil or coins.Value < price then
			return false
		end
		coins.Value -= price
		return true
	end,
})

-- Pickup: the coin must still be inside the Coins folder; a destroyed or replayed one is not.
Net.bind(Remotes.Pickup, {
	args = { Guard.inst(workspace.Coins, "BasePart") },
	limit = { 5, 5 },
	handler = function(player: Player, coin: BasePart)
		local root = player.Character and player.Character:FindFirstChild("HumanoidRootPart") :: BasePart?
		if not root or (root.Position - coin.Position).Magnitude > 10 then
			Net.flag(player, 1, "pickup_distance")
			return
		end
		coin:Destroy()
	end,
})
```

Validators: `Guard.num(min, max)`, `Guard.int(min, max)`, `Guard.str(maxBytes, minBytes?)` (rejects
invalid UTF-8), `Guard.bool()`, `Guard.oneOf(set)`, `Guard.vec3(maxMagnitude?)` (finite components),
`Guard.unit(tolerance?)`, `Guard.inst(folder, className?)` (`typeof` plus `IsDescendantOf`),
`Guard.flatTable(maxKeys, validator)`, `Guard.optional(v)`. `Guard.check` also rejects extra
arguments.

Fuzz from the Client while the server counts verdicts in `ServerStorage.NetLog`:

```python
with Playtest(s) as pt:
    # gap above 1 / refill so each case reaches validation instead of the rate limiter
    rbx_net.fuzz(pt, "ReplicatedStorage.Remotes.Buy", instance_lua='game.ReplicatedStorage.Items.Sword',
                 valid_lua='{"Sword"}', gap=0.55)
    rbx_net.fuzz(pt, "ReplicatedStorage.Remotes.Shoot", prefix_lua="{Vector3.new(0, 5, 0), Vector3.new(0, 3, -6)}",
                 gap=0.25)
    log = rbx_net.net_log(pt)          # counters args_<Remote>, rate_<Remote>, ok_<Remote>; scores per UserId
```

Payloads (`Exploit.payloads`): nothing, nil, boolean, string, negative, zero, fraction, NaN,
infinity, negative infinity, 2^53, a 100,000-byte string, invalid UTF-8, empty table, a table
mimicking an Instance, a 10-level table, mixed keys, NaN, infinite and far Vector3, NaN CFrame, a
function, a real Instance from the wrong folder, an extra argument.

Negative control: a handler that checks only `typeof(amount) == "number"` and `amount <= 1000`.

Result: run in Studio 0.743 on 2026-10-18: pass.

- 187 hostile calls from the Client: 170 rejected by argument validation, 13 by the rate limiter, 1
  by the restrict level.
- 2 were dropped by the engine: 100,000-byte strings over the unreliable cap.
- 1 valid case reached a handler (ClaimReward with no arguments), and its cooldown refused it.
- Coins 110 before and after; every dummy at 100 health; the coin still in place; no server script
  error.
- The fuzzing player reached `enforce` (score 151.45).
- Negative control: 50 fires of 1,000 took coins from 100 to 50,100; the fuzz then left
  -9223372036854775808 (INT64_MIN).

## P3. Rate limits, cooldowns and floods [P3]

Goal: a per-UserId token bucket in front of validation, a server-clock cooldown inside the handler,
and a flood signal that never escalates an autoclicker.

```luau
--!strict
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerScriptService = game:GetService("ServerScriptService")
local Net = require(ServerScriptService.NetKit.Net)

local REWARD, COOLDOWN = 10, 10
local nextClaim: { [Player]: number } = {}

-- Currency lives on the server; leaderstats only mirror it.
local function coinsOf(player: Player): IntValue?
	local ls = player:FindFirstChild("leaderstats")
	local c = ls and ls:FindFirstChild("Coins")
	return if c and c:IsA("IntValue") then c else nil
end

Net.bind(ReplicatedStorage.Remotes.ClaimReward, {
	args = {}, -- any argument is rejected
	limit = { 3, 1 },
	handler = function(player: Player)
		local now = os.clock()
		if now < (nextClaim[player] or 0) then
			return -- idempotent: spam changes nothing
		end
		nextClaim[player] = now + COOLDOWN
		local coins = coinsOf(player)
		if coins then
			coins.Value += REWARD
		end
	end,
})
```

`Net.bind` drops calls over the bucket (`rate_<Remote>`), flags `flood_<Remote>` once per second
only when more than 50 calls were dropped in that second, and clears buckets on `PlayerRemoving`.

```python
with Playtest(s) as pt:
    rbx_net.run(pt.s, 'local R = game.ReplicatedStorage.Remotes for _ = 1, 1000 do R.ClaimReward:FireServer() end',
                "Client")
    log = rbx_net.net_log(pt)
```

Result: run in Studio 0.743 on 2026-10-18: pass.

- 1,000 ClaimReward and 200 Buy fired in 0.002 s; all arrived by the first 0.5 s sample (no engine
  throttle in Studio).
- Reward granted once; 997 calls dropped by the bucket.
- Buy passed the bucket 4 times and granted 3 (the balance ran out); coins 20.
- One flood flag; level `log` (score 1.99), far from `restrict`.

## P4. Hit validation with rewind [P4a, P4b]

Goal: melee and ranged claims checked against server-recorded positions over the window the attacker
could have seen.

```luau
--!strict
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local ServerScriptService = game:GetService("ServerScriptService")

local Kit = ServerScriptService.NetKit
local Guard = require(Kit.Guard)
local HitCheck = require(Kit.HitCheck)
local Net = require(Kit.Net)

local Targets = workspace.Targets
local histories: { [Model]: HitCheck.History } = {}

-- One second of positions per target, recorded every Heartbeat.
RunService.Heartbeat:Connect(function()
	local now = time()
	for _, m in Targets:GetChildren() do
		local root = m:FindFirstChild("HumanoidRootPart")
		if m:IsA("Model") and root and root:IsA("BasePart") then
			local h: HitCheck.History = histories[m] or HitCheck.History.new(1)
			histories[m] = h
			h:push(now, root.Position)
		end
	end
end)

Net.bind(ReplicatedStorage.Remotes.Swing, {
	args = { Guard.inst(Targets, "Model") },
	limit = { 6, 4 },
	handler = function(player: Player, target: Model)
		local me = player.Character and player.Character:FindFirstChild("HumanoidRootPart") :: BasePart?
		local hist = histories[target]
		local hum = target:FindFirstChildOfClass("Humanoid")
		if not (me and hist and hum) then
			return
		end
		-- Window [now - min(ping + 0.1, 0.4), now]: accepted if the target was in reach at any moment in it.
		local ok = HitCheck.melee({ attacker = me.Position, target = hist, now = time(),
			ping = player:GetNetworkPing(), reach = 7, slack = 1.5 })
		if not ok then
			Net.flag(player, 2, "reach")
			return
		end
		hum:TakeDamage(10)
	end,
})

-- Ranged: origin and hit point are claims. Obstruction uses static map geometry only.
local wallParams = RaycastParams.new()
wallParams.IncludeInstances = { workspace.Map }

Net.bind(ReplicatedStorage.Remotes.Shoot, {
	args = { Guard.vec3(1e4), Guard.vec3(1e4), Guard.inst(workspace, "BasePart") },
	limit = { 5, 5 },
	handler = function(player: Player, origin: Vector3, hit: Vector3, part: BasePart)
		local me = player.Character and player.Character:FindFirstChild("HumanoidRootPart") :: BasePart?
		local model = part:FindFirstAncestorOfClass("Model")
		local hist = model and histories[model]
		if not (me and model and hist) then
			return
		end
		local ping = player:GetNetworkPing()
		local ok, why = HitCheck.ranged({
			claimedOrigin = origin,
			serverOrigin = me.Position + Vector3.new(0, 1.5, 0),
			originTolerance = 4 + 16 * math.min(ping + 0.1, 0.4),
			claimedHit = hit,
			target = hist,
			hitTolerance = 4,
			now = time(),
			ping = ping,
			maxRange = 300,
			obstructed = function(a: Vector3, b: Vector3): boolean
				return workspace:Raycast(a, b - a, wallParams) ~= nil
			end,
		})
		if not ok then
			Net.flag(player, 1, "shot_" .. tostring(why))
		end
	end,
})

Players.PlayerRemoving:Connect(function(p)
	if p.Character then
		histories[p.Character] = nil
	end
end)
```

`HitCheck.ranged` verdicts, in order: `origin`, `range`, `cone` (only when `look` is passed; default
10 degrees), `hit`, `wall`, `ok`. Comparisons are written so a NaN input fails.

Result: run in Studio 0.743 on 2026-10-18: pass.

- Melee: FarDummy at 80 studs rejected (`reach`); NearDummy at 6.1 studs hit.
- A same-frame burst of 20 swings: 1 hit, 5 cooldown rejections, 14 rate drops (NearDummy at 80
  health).
- Ranged: an origin claimed 40 studs away (`origin`), a shot through the wall (`wall`) and a hit
  point 8 studs off (`hit`) rejected.
- The valid shot hit (NearDummy 90, WallDummy 100).

## P5. Movement in places with client-owned characters [P5]

Goal: speed and teleport checks on the server for `AuthorityMode` Automatic, with rubber-banding
instead of kicks. In a Server Authority place, skip this: the server simulates characters.

```luau
--!strict
local ServerScriptService = game:GetService("ServerScriptService")
local Kit = ServerScriptService.NetKit
local MoveGuard = require(Kit.MoveGuard)
local Net = require(Kit.Net)

MoveGuard.start({
	interval = 0.25,
	enforce = true, -- PivotTo the last trusted position
	onFlag = function(player: Player, verdict: string, distance: number)
		Net.flag(player, 1, "move_" .. verdict)
	end,
})

-- Every server-side teleport, knockback or launch pad opens a grace window first.
local function teleport(player: Player, cf: CFrame)
	MoveGuard.grace(player, 1)
	if player.Character then
		player.Character:PivotTo(cf)
	end
end
```

Defaults: allowed speed is the server's `Humanoid.WalkSpeed` plus a margin of 5 studs/s, measured on
XZ only, with a leaky bucket of 6 studs (leak 0.5 per second) and a rise cap of 60 studs/s; sampling
every 0.25 s; dead and seated characters are skipped.

`enforce = false` logs without moving the character, and the next sample is measured from where it
stands, so one teleport flags once (offline Lune test).

Result: run in Studio 0.743 on 2026-10-18: pass.

- Honest 30-stud walk: 0 flags.
- Client teleport of +100 studs: flagged; the server position stayed at z 29.2.
- Local WalkSpeed 80 for 2.5 s: 5 flags, server WalkSpeed still 16, net server progress 12.6 studs
  (200 unchecked).
- Server teleport with grace: 0 flags.

## P6. Network ownership and interactive surfaces [P6a, P6b]

Goal: no client-owned part decides a gameplay outcome; prompts and detectors re-check distance,
state and rate on the server.

```luau
--!strict
local ServerScriptService = game:GetService("ServerScriptService")
local Net = require(ServerScriptService.NetKit.Net)

-- Pickups, NPC roots, prompt parents: pin ownership right after parenting (unanchored only).
local crate = workspace.LooseCrate
crate:SetNetworkOwner(nil)

Net.prompt(workspace.Shop.ShopPrompt, {
	maxDistance = 12, -- server-side, from the server's position of the prompt parent
	limit = { 2, 1 },
	handler = function(player: Player)
		print("open shop for", player.Name)
	end,
})
```

Rules for the rest of the surface:

- ClickDetector: the server runs no checks; check distance and state in `MouseClick`.
- DragDetector: only `Enabled` and `PermissionPolicy` apply; validate drag results on the server.
- `Touched` pickups: the client's physics reports the touch. Use `Net.touch` (below).

Result: run in Studio 0.743 on 2026-10-18: pass.

- A resting crate 5 studs from the character stayed server-owned; after a server velocity nudge it
  went to the nearby client within 1.5 s.
- While client-owned, a client CFrame write of +30 studs moved it 30 studs on the server.
- After `SetNetworkOwner(nil)`, the same write moved it 0 studs on the server.
- Prompt from 44.7 studs with `MaxActivationDistance` raised to 1,000 on the client: nothing reached
  the server (engine distance check on `Triggered`).
- Prompt from 7 studs: the shop opened once.

### Loose unanchored parts

The server hands unanchored parts to nearby clients by default, and the owner has full authority
over their physics (Creator Docs, network ownership). Suphi moved a pickup that way with a distance
check in place [SFAwwmb8G6o 00:15:24]; GnomeCode dragged zombies and coins until he pinned them
[2jvahdJnQRI 00:06:20, 00:06:52].

- Which parts: pickups, crates, debris, NPC roots, prompt and detector parents. A dropped Tool's
  `Handle` is one too [added].
- Fix: anchor what never moves. Otherwise call `SetNetworkOwner(nil)` right after parenting
  [2jvahdJnQRI 00:06:52]. It errors on anchored parts; `CanSetNetworkOwnership()` says why.
- Live: a resting crate stayed server-owned, then went to the nearby client 1.5 s after a nudge. So
  a check at spawn time is not enough; check after something moves the part.

How a playtest checks it: the client writes a CFrame, the server measures. This is the ownership
test condensed (same client chunk):

```python
MOVE_CRATE = """
local crate = workspace:WaitForChild("LooseCrate") :: BasePart
local before = crate.Position
crate.CFrame = crate.CFrame + Vector3.new(0, 0, 30)
crate.AssemblyLinearVelocity = Vector3.zero
task.wait(1)
local after = crate.Position
return { before = { before.X, before.Y, before.Z }, after = { after.X, after.Y, after.Z } }"""

with Playtest(s) as pt:
    pt.server("workspace.LooseCrate:SetNetworkOwner(nil) return true")
    z0 = pt.server("return workspace.LooseCrate.Position.Z")["result"]
    pt.client(MOVE_CRATE)                                   # hostile write from the owning side
    z1 = pt.server("return workspace.LooseCrate.Position.Z")["result"]
    assert abs(z1 - z0) < 1                                 # live: 0 studs pinned, 30 while client-owned
```

To sweep a whole map, run this in the Server data model during a playtest, once players have walked
around. Not yet run (needs Studio):

```luau
--!strict
local Players = game:GetService("Players")

-- Unanchored parts a client owns right now, characters excluded.
local clientOwned: { string } = {}
for _, d in workspace:GetDescendants() do
	if d:IsA("BasePart") and not d.Anchored and d:CanSetNetworkOwnership() then
		local model = d:FindFirstAncestorOfClass("Model")
		local isCharacter = model ~= nil and Players:GetPlayerFromCharacter(model) ~= nil
		if not isCharacter and d:GetNetworkOwner() ~= nil then
			table.insert(clientOwned, d:GetFullName())
		end
	end
end
return clientOwned
```

### Prompt, click and drag handlers

The three detectors are client input like a remote (Creator Docs, client-server boundary):
`Triggered` gets an engine distance check and ignores `Enabled`; `MouseClick` gets no check; drag
events respect only `Enabled` and `PermissionPolicy`. Re-check distance and state on the server in
each handler. `Net.prompt` above does it for `Triggered`. For clicks and drags, after `Net.init`
(P7). Not yet run (needs Studio):

```luau
--!strict
local ServerScriptService = game:GetService("ServerScriptService")
local Net = require(ServerScriptService.NetKit.Net)
local RateLimit = require(ServerScriptService.NetKit.RateLimit)

local REACH = 12

local function within(player: Player, part: BasePart, reach: number): boolean
	local char = player.Character
	local hum = char and char:FindFirstChildOfClass("Humanoid")
	if not (char and hum and hum.Health > 0) then
		return false
	end
	return (char:GetPivot().Position - part.Position).Magnitude <= reach
end

-- ClickDetector: the engine checks nothing on MouseClick.
local lever = workspace:WaitForChild("Lever") :: BasePart
local click = lever:FindFirstChildOfClass("ClickDetector")
local clicks = RateLimit.new(2, 1)
if click then
	click.MouseClick:Connect(function(player: Player)
		if not clicks:allow(player.UserId) then
			return
		end
		if lever:GetAttribute("Locked") == true or not within(player, lever, REACH) then
			Net.flag(player, 1, "click_distance")
			return
		end
		lever:SetAttribute("On", not lever:GetAttribute("On"))
	end)
end

-- DragDetector with RunLocally false (the default): drag events reach server scripts, and the
-- permission function is the server's gate. DragContinue re-checks while the drag lasts.
local crate = workspace:WaitForChild("DragCrate") :: BasePart
local drag = crate:FindFirstChildOfClass("DragDetector")
if drag then
	drag.PermissionPolicy = Enum.DragDetectorPermissionPolicy.Scriptable
	drag:SetPermissionPolicyFunction(function(player: Player, _part: BasePart): boolean
		return crate:GetAttribute("Locked") ~= true and within(player, crate, REACH)
	end)
	drag.DragContinue:Connect(function(player: Player)
		if not within(player, crate, REACH + 4) then
			Net.flag(player, 1, "drag_distance")
		end
	end)
end
```

Bound the motion itself with `MinDragTranslation` and `MaxDragTranslation`, or with
`AddConstraintFunction` on the server (DragDetector reference). The 4-stud allowance during a drag
is a judgment call for latency [added].

### Touched pickups

```luau
local guard = MoveGuard.start({ interval = 0.25, onFlag = onMoveFlag })
local pickups = RateLimit.new(5, 1) -- one limiter for every coin [added]
for _, coin in workspace.Coins:GetChildren() do
	Net.touch(coin, {
		maxDistance = 8, -- from the server's HumanoidRootPart position [added]
		guard = guard,
		limiter = pickups,
		handler = function(player: Player, part: BasePart)
			part.CanTouch = false -- taken: later touches are dropped
			part.Transparency = 1
			task.delay(10, function()
				part.Transparency, part.CanTouch = 0, true
			end)
		end,
	})
end
```

In order, `Net.touch` drops a touch that:

1. comes from no player character;
2. hits a part whose `CanTouch` is false, or comes from a dead character (`state_touch_<part>`);
3. comes from a root farther than `maxDistance` (`distance_touch_<part>`, flagged);
4. comes from a root farther from MoveGuard's last trusted position than the guard's own speed model
   allows since that sample (`teleport_touch_<part>`, flagged). This closes the teleport-then-touch
   race before MoveGuard's next sample;
5. is over the shared limiter (`rate_touch_<part>`).

Then it counts `ok_touch_<part>` and calls the handler.

Exploit test, with `exploit_case` in one playtest: teleport the client's character onto a guarded
part, then onto a part with a bare `Touched` handler as the negative control. Whether a client
`CFrame` write of an anchored, server-owned part fires `Touched` on the server is not tested here.

Result: offline only (Lune 0.11.0, fake Players and parts). Not yet run in Studio.

- Two limbs on one coin pay once.
- A touch 50 studs out, a teleport 100 studs out 0.1 s after the guard's sample, and a dead
  character pay nothing.
- A walk in since the sample pays.
- A shared limiter of 2 stops the third coin.

## P7. Honeypots, suspicion and delayed enforcement [P7]

Goal: high-confidence signals from remotes a real client never fires, a score that needs two
distinct reasons, and a random delay before any visible consequence.

```luau
--!strict
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerScriptService = game:GetService("ServerScriptService")
local Net = require(ServerScriptService.NetKit.Net)

Net.init({
	enforceDelay = { 20, 90 }, -- seconds, random: the exploiter cannot learn the trigger
	enforce = function(player: Player, reasons: { [string]: number })
		local ok, err = pcall(function()
			Players:BanAsync({
				UserIds = { player.UserId },
				ApplyToUniverse = true,
				Duration = 24 * 3600,
				DisplayReason = "Unfair play detected.",
				PrivateReason = "suspicion: " .. table.concat((function()
					local keys = {}
					for k in reasons do
						table.insert(keys, k)
					end
					return keys
				end)(), ","),
				ExcludeAltAccounts = false,
			})
		end)
		if not ok then
			warn("BanAsync failed:", err)
			player:Kick("Disconnected")
		end
	end,
})

Net.honeypot(ReplicatedStorage.Remotes.AdminGiveCoins) -- a tempting name the real client never fires
Net.serverOnly(ReplicatedStorage.Remotes.Effects) -- server-to-client only: a client fire is a signal
```

Ladder (`Suspicion.new` defaults): half-life 120 s; `log` at 1, `mitigate` at 3, `restrict` at 6
(Net drops calls), `enforce` at 10 with at least two distinct reasons. `Net.reset(player)` clears a
score after an appeal.

Result: run in Studio 0.743 on 2026-10-18: pass.

- One AdminGiveCoins fire and one Effects fire: level `enforce` at once (score 15.48).
- Enforcement was scheduled after 0.94 s (test delay 0.5 to 1 s) and applied as a dry run.
- Coins unchanged.

## P8. Latency: rewind against what the attacker saw [P8a, P8b]

Goal: valid hits survive real latency, and the check without rewind shows what latency costs.

```python
LAST_MOMENT_SWINGS = """
local R = game.ReplicatedStorage.Remotes
local root = game.Players.LocalPlayer.Character.HumanoidRootPart
local dummy = workspace.Targets.MovingDummy            -- patrols x = 8 sin(2t): up to 16 studs/s
local t0, last, fired, prev = os.clock(), -1, 0, math.huge
while os.clock() - t0 < 20 do
    local d = (dummy.HumanoidRootPart.Position - root.Position).Magnitude
    local receding = d > prev
    prev = d
    -- swing while the target this client sees is leaving reach (7.5 studs), at most every 0.5 s
    if receding and d <= 7.5 and d > 7.2 and os.clock() - last >= 0.5 then
        R.Swing:FireServer(dummy)
        last, fired = os.clock(), fired + 1
    end
    task.wait()
end
return fired"""

rbx_net.set_latency(s, inbound_ms=100, outbound_ms=100)   # Edit data model, before Play; NetworkSettings
try:
    with Playtest(s) as pt:
        ping = pt.server("return game.Players:GetPlayers()[1]:GetNetworkPing()")["result"]   # about 0.2
        fired = pt.client(LAST_MOMENT_SWINGS, timeout=90)["result"]
        log = rbx_net.net_log(pt)   # hit_Swing (rewind) against nowOk_Swing / nowReject_Swing (no rewind)
finally:
    rbx_net.set_latency(s, 0, 0)
```

The arena records `nowOk_Swing` and `nowReject_Swing` from the same check with `ping = 0` and
`interp = 0`, so one run measures both. Scripted packet loss is capped at 0.5 percent
(`InboundNetworkLossPercent = 5` reads back 0.5).

Result: run in Studio 0.743 on 2026-10-19: pass, three full runs in a row.

- No added latency: 7 of 7 last-moment swings hit; the no-rewind check also accepted all 7.
- 100 ms each way (server ping 202 to 205 ms): 13 of 13 hit with rewind.
- The same check without rewind accepted 0 of 13 in each run.
- Why the trigger is 7.5 studs: the player stands 6 studs off the dummy's path. A receding target at
  7.5 studs passes reach plus slack (8.5) in 0.128 s, well under the latency. At 7 studs it needed
  0.195 s, about the latency itself, so the no-rewind rate swung from 31 to 92 percent across five
  runs (2026-10-18 and 19), while rewind kept 100 percent.

## P9. UnreliableRemoteEvent payload cap [P9]

Goal: know what fits before choosing unreliable delivery.

```python
probe = rbx_net.payload_probe(pt, random_sizes=(900, 980, 1000, 1100), zero_sizes=(1100, 8000))
print(probe["arrived"])     # {"r980": 3, "r1000": 0, ...}
```

Pack aim or input into a small buffer rather than a table:

```luau
--!strict
-- 6 bytes: a unit direction as three int16 (1/32767 resolution). Validate after decoding on the server.
local function packDirection(dir: Vector3): buffer
	local b = buffer.create(6)
	buffer.writei16(b, 0, math.round(dir.X * 32767))
	buffer.writei16(b, 2, math.round(dir.Y * 32767))
	buffer.writei16(b, 4, math.round(dir.Z * 32767))
	return b
end

local function unpackDirection(b: buffer): Vector3?
	if buffer.len(b) ~= 6 then
		return nil
	end
	local v = Vector3.new(buffer.readi16(b, 0), buffer.readi16(b, 2), buffer.readi16(b, 4)) / 32767
	if math.abs(v.Magnitude - 1) > 0.05 then
		return nil
	end
	return v
end

return { packDirection = packDirection, unpackDirection = unpackDirection }
```

Result: run in Studio 0.743 on 2026-10-18: pass.

- Random buffers (arrivals of 3): 200 to 980 bytes 3 of 3; 1,000, 1,020, 1,100 and 2,000 bytes 0
  of 3.
- Console for 1,000 bytes: "Unreliable Event dropped as its payload is too large. Consider reducing
  the total size of the arguments. Payload went over by: 4 bytes". A lone buffer argument fits 996
  bytes.
- Zero-filled buffers of 1,100 to 8,000 bytes: 3 of 3, so the cap applies after compression.
- Reliable RemoteEvent: random 1,100 and 4,000 bytes, 3 of 3.

## P10. Cosmetic stream on an UnreliableRemoteEvent [P10]

Goal: per-frame cosmetic data (aim direction) over unreliable delivery, sequence-numbered, rate
limited, never trusted for hits.

```luau
--!strict
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerScriptService = game:GetService("ServerScriptService")
local Kit = ServerScriptService.NetKit
local Guard = require(Kit.Guard)
local Net = require(Kit.Net)

local lastSeq: { [Player]: number } = {}
Net.bind(ReplicatedStorage.Remotes.Aim, {
	args = { Guard.unit(0.05), Guard.int(0, 65535) },
	limit = { 30, 30 },
	handler = function(player: Player, dir: Vector3, seq: number)
		local prev = lastSeq[player]
		if prev and ((seq - prev) % 65536) > 32768 then
			return -- older than the last one: unreliable events can arrive out of order
		end
		lastSeq[player] = seq
		player:SetAttribute("AimDirection", dir) -- cosmetic only
	end,
})
```

Result: run in Studio 0.743 on 2026-10-18: pass.

- 51 aim packets at 20 Hz: 51 accepted, 0 stale, 0 rate drops.
- Client `Stats.DataSendKbps` 1.67 to 2.19 kbps during the stream.

## P11. Server Authority setup through Rojo [offline O5; live SA-props, SA1, SA2]

Goal: `AuthorityMode` Server with its five companion settings, written in the project file because
scripts cannot set them.

```json
{
  "Workspace": {
    "$properties": {
      "AuthorityMode": "Server",
      "StreamingEnabled": true,
      "SignalBehavior": "Deferred",
      "UseFixedSimulation": "Enabled",
      "NextGenerationReplication": "Enabled",
      "PlayerScriptsUseInputActionSystem": "Enabled"
    }
  }
}
```

Simulation module in ReplicatedStorage, required by a server Script
(`require(script.Parent).Initialize()`) and by a Script with `RunContext` Client (a LocalScript
under ReplicatedStorage never runs). Each player gets a clone of the `Inputs` folder (InputContext
and InputActions) on `PlayerAdded`:

```luau
--!strict
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")

local Simulation = {}

function Simulation.Initialize()
	RunService:BindToSimulation(function(dt: number)
		for _, player in Players:GetPlayers() do
			local root = player.Character and player.Character:FindFirstChild("HumanoidRootPart")
			if root then
				-- State lives in attributes on a predicted instance; plain Lua locals are not rolled back.
				local steps = (root:GetAttribute("SimSteps") :: number?) or 0
				root:SetAttribute("SimSteps", steps + 1)
			end
		end
	end, Enum.StepFrequency.Hz60)
end

return Simulation
```

Scripts cannot read the settings, so check two of them by behavior. Deferred signals, in the Server
data model during a playtest:

```luau
--!strict
local ev = Instance.new("BindableEvent")
local ran = false
ev.Event:Connect(function()
	ran = true
end)
ev:Fire()
local inside = ran -- false when SignalBehavior is Deferred
task.wait()
local later = ran -- true: the handler ran at the next resumption point
ev:Destroy()
return { ranInsideFire = inside, ranAfterYield = later }
```

Movement: under `AuthorityMode` Server the character moves from input only, so drive tests with held
keys (`pt.press("W", hold=2.0)`), never `Humanoid:MoveTo` or `pt.walk_to`. Prove the honest walk
moves the server character before you trust a blocked hack.

Test: `python3 tests/code/scenario-roblox-networking/run_live.py --sa` (opens only the SA place,
merges into results.json).

Result: offline pass (O5); run in Studio 0.743 on 2026-10-19: pass (SA-props, SA1, SA2).

- Offline: Lune read back all six settings from the built place.
- Live, from the Studio MCP Edit context: `AuthorityMode` and `PlayerScriptsUseInputActionSystem`
  are not readable ("lacking capability RobloxScript"); `UseFixedSimulation`,
  `NextGenerationReplication` and `SignalBehavior` are "not a valid member". `inspect_instance` on
  Workspace returns no properties. Only `StreamingEnabled` reads (true in the SA place), so the
  in-place probe in the arena was skipped.
- SA1: the simulation stepped 60 times per second on the server and 61 on the client; every player
  got the `Inputs` clone; the handler did not run inside `Fire` and ran after one yield (Deferred).
- SA2: `pt.walk_to` returned "Success" and moved the character 0 studs. W held 2 s moved the server
  character 32.4 studs, with 0 studs between client and server.
- SA2 exploits: a client CFrame teleport of 100 studs moved the server character 0 and was undone on
  the client within 1.5 s. A local `WalkSpeed = 80` read 80, then 16 again; W held 2 s moved the
  server character 32.0 studs, the honest distance.

### Migrating an existing place

Drew Hamilton's order: prerequisites first (Deferred signals, NextGen replication), then a
character-controller proof of concept, then the engine port, then the game [9IqNHhYXK0s 00:16:57].
Expect the game to break on the way [00:18:38].

1. **Settings.** Write the six settings in the Rojo project (above) or set them in the Properties
   panel. Scripts cannot: from Studio's MCP context, `AuthorityMode` fails with "lacking capability
   RobloxScript" (live).
2. **One simulation step.** Move every per-frame gameplay update into `RunService:BindToSimulation`,
   required by a server Script and a Script with `RunContext` Client [9IqNHhYXK0s 00:07:14].
3. **State the step can roll back.** Keep it in attributes on predicted instances, physical
   properties or ValueBase objects. Plain Lua locals are not rolled back, so the client reverts to
   stale values [9IqNHhYXK0s 00:08:52, 00:21:46; -DJy_CfK2Vk 00:01:57]. Attribute limits: 64 per
   predicted instance, names and strings of at most 50 characters (Creator Docs).
4. **Inputs.** Read InputActions under each player, never `UserInputService` [9IqNHhYXK0s 00:08:19].
   This place clones an `Inputs` folder on `PlayerAdded`.
5. **Effects.** Play sounds and particles outside the step, on a state change or through
   `task.defer`; inside it, resimulation stacks them [9IqNHhYXK0s 00:22:19].
6. **Visualizer loop.** Ctrl+Shift+F6 (Cmd on Mac) during a playtest, with the Network Simulator at
   60 ms plus 10 ms jitter. Aim for 100 percent instance prediction; it names the instance and
   property that mispredict [9IqNHhYXK0s 00:10:06, 00:10:40, 00:18:38]. The panel is GUI only
   ([gui-paths.md](gui-paths.md)); `rbx_net.set_latency` scripts the latency and jitter per
   direction.
7. **Test with input.** Hold keys (`pt.press("W", hold=2.0)`). Under `AuthorityMode` Server,
   `pt.walk_to` (`character_navigation`) reports "Success" and moves the character 0 studs (live,
   SA2 above).
8. **Keep remote validation.** Server Authority stops movement hacks, not camera tricks, ESP or
   aimbots [v_yyUwr0p2Q 00:05:50].

## Ordering traps

Not a stage: rules for every remote and handler written in the stages above.

- **Property changes and remotes are not ordered against each other.** The engine does not guarantee
  replication order; a property change followed by `FireAllClients` can arrive before or after the
  remote. Changes of the same type (two attribute changes) generally arrive in order (Creator Docs,
  Properties and attributes, "Replication order"; the Server Authority overview repeats it). Fix:
  send the value the client needs inside the remote's arguments, or have the client react to the
  property's own change event.
- **RemoteEvent order holds across RemoteEvent instances, not against RemoteFunctions.** A handler
  that yields lets the next one start (Creator Docs, Remote events and callbacks). Use one remote
  type or sequence numbers when order matters.
- **Under Deferred signals, a handler connected inside another handler misses the current fire.**
  Crusherfire's test: A's handler connects to B, the code fires A then B; Immediate runs both,
  Deferred runs only A's, because B fired before the connection existed [xz_G2n1Q8-U 00:03:19 to
  00:05:51]. Connect before firing.
- **Deferred also reorders nested fires.** A's handler fires C, the code fires A then B: Immediate
  runs A, C, B; Deferred runs A, B, C [xz_G2n1Q8-U 00:06:06 to 00:08:52]. Do not depend on nested
  handler order.
- **Removal handlers see `Parent` nil.** Under Deferred, `CharacterRemoving`, `ChildRemoved`,
  `DescendantRemoving` and `Destroying` handlers run after the instance is gone [xz_G2n1Q8-U
  00:08:54 to 00:12:45]. The Creator Docs agree (Deferred events): `Destroy()` takes effect once the
  calling script yields. Capture what cleanup needs (owner, position, inventory) before destroying.
- Server Authority places run Deferred by force; new templates default to it too. Test with Deferred
  on, as the SA place does (P11).
