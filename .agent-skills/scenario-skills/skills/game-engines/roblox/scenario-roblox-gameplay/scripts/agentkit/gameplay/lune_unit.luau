--!nonstrict
-- Offline unit tests of the gameplay modules: the pure ones (StateMachine, NpcBrain, Combo,
-- Projectile, PathGuard) and the instance builders (DebugDraw, GameplayInputs, CarSafety, NpcPool),
-- which load with Roblox-like globals over a Lune DataModel.
--   lune run lune_unit.luau        prints the Spec report as JSON; exit 1 on any failure
local fs = require("@lune/fs")
local luau = require("@lune/luau")
local process = require("@lune/process")
local roblox = require("@lune/roblox")
local serde = require("@lune/serde")
local task = require("@lune/task")

local Spec = require("../../../../scenario-roblox-expert/scripts/agentkit/Spec")
local StateMachine = require("./StateMachine")
local NpcBrain = require("./NpcBrain")
local Combo = require("./Combo")
local Projectile = require("./Projectile")
local PathGuard = require("./PathGuard")

-- Engine-facing modules run with the globals they expect: a Lune DataModel, its Workspace and the
-- roblox datatypes. Instance creation and properties are checked; rendering and physics are not.
local game = roblox.Instance.new("DataModel")
local workspaceLune = game:GetService("Workspace")
local terrain = roblox.Instance.new("Terrain")
terrain.Parent = workspaceLune
local ENV = setmetatable({
	game = game,
	workspace = workspaceLune,
	Instance = roblox.Instance,
	Vector3 = roblox.Vector3,
	Vector2 = roblox.Vector2,
	CFrame = roblox.CFrame,
	Color3 = roblox.Color3,
	UDim2 = roblox.UDim2,
	Enum = roblox.Enum,
	task = task,
	typeof = roblox.typeof or typeof,
}, { __index = _G })
local function loadKit(name: string): any
	return luau.load(fs.readFile(name .. ".luau"), { debugName = name, environment = ENV })()
end

local Vector3 = roblox.Vector3
local t = Spec.new()

-- StateMachine -----------------------------------------------------------------------------------
t:test("validate reports undefined states", function(expect)
	local errors = StateMachine.validate({
		name = "Bad",
		start = "Idle",
		states = { Idle = {} },
		transitions = { { from = { "Idle", "Ghost" }, to = "Nowhere", test = function()
			return true
		end } },
	})
	expect(#errors).toBe(2)
	expect(function()
		StateMachine.new({ name = "Bad", start = "Missing", states = {}, transitions = {} })
	end).toThrow()
end)

t:test("tick runs onExit then onEnter, else onStay; one transition, several sources", function(expect)
	local log = {}
	local def = {
		name = "T",
		start = "A",
		states = {
			A = { onExit = function()
				table.insert(log, "exitA")
			end, onStay = function()
				table.insert(log, "stayA")
			end },
			B = { onEnter = function()
				table.insert(log, "enterB")
			end },
			C = {},
		},
		transitions = { { from = { "A", "C" }, to = "B", test = function(c)
			return c.go
		end } },
	}
	local m = StateMachine.new(def, { go = false })
	expect(StateMachine.tick(m, 0.1)).toBe(false)
	m.context.go = true
	expect(StateMachine.tick(m, 0.1)).toBe(true)
	expect(table.concat(log, ",")).toBe("stayA,exitA,enterB")
	expect(m.current).toBe("B")
	StateMachine.go(m, "C")
	expect(StateMachine.tick(m, 0.1)).toBe(true)
	expect(table.concat(m.history, ",")).toBe("A,B,C,B")
end)

-- NpcBrain ---------------------------------------------------------------------------------------
local function p(hasTarget, dist, sight)
	return { hasTarget = hasTarget, targetDist = dist, hasSight = sight }
end

t:test("patrol to chase only with sight inside detect range", function(expect)
	local m = NpcBrain.new()
	expect((NpcBrain.step(m, p(true, 80, true), 0, 0.1))).toBe("Patrol")
	expect((NpcBrain.step(m, p(true, 40, false), 0.1, 0.1))).toBe("Patrol")
	expect((NpcBrain.step(m, p(true, 40, true), 0.2, 0.1))).toBe("Chase")
end)

t:test("attack hysteresis: enter at 5, leave above 6.5", function(expect)
	local m = NpcBrain.new()
	NpcBrain.step(m, p(true, 20, true), 0, 0.1)
	expect((NpcBrain.step(m, p(true, 5, true), 0.1, 0.1))).toBe("Attack")
	expect((NpcBrain.step(m, p(true, 6, true), 0.2, 0.1))).toBe("Attack")
	expect((NpcBrain.step(m, p(true, 7, true), 0.3, 0.1))).toBe("Chase")
end)

t:test("attack cadence: first swing after the delay, then once per cooldown", function(expect)
	local m = NpcBrain.new()
	NpcBrain.step(m, p(true, 20, true), 0, 0.1)
	NpcBrain.step(m, p(true, 4, true), 0.1, 0.1) -- enters Attack at t = 0.1
	local swings = {}
	for i = 2, 40 do
		local now = i * 0.1
		local _, attack = NpcBrain.step(m, p(true, 4, true), now, 0.1)
		if attack then
			table.insert(swings, math.floor(now * 10 + 0.5) / 10)
		end
	end
	expect(swings[1]).toBeNear(0.3, 1e-6) -- entered at 0.1, firstAttackDelay 0.2
	expect(swings[2]).toBeNear(1.5, 1e-6) -- cooldown 1.2
	expect(#swings).toBe(4)
end)

t:test("chase continues behind a wall for loseAfter, then patrol", function(expect)
	local m = NpcBrain.new()
	NpcBrain.step(m, p(true, 30, true), 0, 0.1)
	expect((NpcBrain.step(m, p(true, 30, false), 3.9, 0.1))).toBe("Chase")
	expect((NpcBrain.step(m, p(true, 30, false), 4.1, 0.1))).toBe("Patrol")
end)

-- Combo ------------------------------------------------------------------------------------------
t:test("three steps at 0.35 s deal 10 + 12 + 20", function(expect)
	local st = Combo.new()
	local total = 0
	for i = 0, 2 do
		local ok, step = Combo.request(st, 10 + i * 0.35)
		expect(ok).toBe(true)
		expect(step).toBe(i + 1)
		total += Combo.DEFAULT.steps[step].damage
	end
	expect(total).toBe(42)
end)

t:test("spam: 10 requests 50 ms apart give 2 swings", function(expect)
	local st = Combo.new()
	for i = 0, 9 do
		Combo.request(st, 5 + i * 0.05)
	end
	-- minGap 0.30 x tolerance 0.8 = 0.24 s: accepted at 5.00 and 5.25 only
	expect(st.accepted).toBe(2)
	expect(st.rejected).toBe(8)
end)

t:test("chain resets after the window; finisher locks", function(expect)
	local st = Combo.new()
	Combo.request(st, 0)
	local ok, step = Combo.request(st, 1.5)
	expect(ok).toBe(true)
	expect(step).toBe(1)
	Combo.request(st, 1.85)
	Combo.request(st, 2.2) -- step 3, locked until 2.8
	local ok2, _, why = Combo.request(st, 2.6)
	expect(ok2).toBe(false)
	expect(why).toBe("cooldown")
	local ok3, step3 = Combo.request(st, 2.9)
	expect(ok3).toBe(true)
	expect(step3).toBe(1)
end)

t:test("cancel drops pending hits and stuns", function(expect)
	local st = Combo.new()
	Combo.request(st, 1)
	expect(Combo.alive(st, 1)).toBe(true)
	Combo.cancel(st, 1.05, 0.5)
	expect(Combo.alive(st, 1)).toBe(false)
	local ok, _, why = Combo.request(st, 1.3)
	expect(ok).toBe(false)
	expect(why).toBe("stunned")
	local ok2, step = Combo.request(st, 1.6)
	expect(ok2).toBe(true)
	expect(step).toBe(1)
	expect(Combo.alive(st, 1.6)).toBe(true)
end)

-- Projectile -------------------------------------------------------------------------------------
local function noHit()
	return nil
end

local function flight(hz)
	local pr = Projectile.new(Vector3.new(0, 10, 0), Vector3.new(0, 30, -100),
		{ gravity = Vector3.new(0, -50, 0), maxDistance = 1e9, lifetime = 1e9 })
	for _ = 1, hz do -- exactly 1 s of flight
		Projectile.step(pr, 1 / hz, noHit)
	end
	return pr.position
end

t:test("trapezoid stepping is frame-rate independent", function(expect)
	local a, b, c = flight(30), flight(60), flight(240)
	expect((a - c).Magnitude).toBeAtMost(1e-3)
	expect((b - c).Magnitude).toBeAtMost(1e-3)
	-- the same flight with semi-implicit Euler drifts with the frame rate
	local function euler(hz)
		local pos, vel, g, dt = Vector3.new(0, 10, 0), Vector3.new(0, 30, -100), Vector3.new(0, -50, 0), 1 / hz
		for _ = 1, hz do
			vel += g * dt
			pos += vel * dt
		end
		return pos
	end
	expect((euler(30) - euler(240)).Magnitude).toBeAtLeast(0.5)
end)

-- A wall plane at z = -50; a sphere of radius r stops when its center reaches z = -50 + r.
local function wallCaster(r)
	return function(from, disp)
		local stopZ = -50 + r
		if from.Z + disp.Z > stopZ or disp.Z >= 0 then
			return nil
		end
		local f = (from.Z - stopZ) / -disp.Z
		local d = f * disp.Magnitude
		return { distance = d, position = from + disp.Unit * d - Vector3.new(0, 0, r) }
	end
end

t:test("swept steps stop at a thin wall at any speed and step", function(expect)
	for _, speed in { 100, 1000, 5000 } do
		for _, hz in { 15, 60 } do
			local pr = Projectile.new(Vector3.new(0, 5, 0), Vector3.new(0, 0, -speed))
			local hit = Projectile.run(pr, 1 / hz, wallCaster(0.5))
			expect(hit ~= nil).toBe(true)
			expect(pr.position.Z).toBeNear(-49.5, 1e-3)
		end
	end
end)

t:test("max distance and lifetime end the flight", function(expect)
	local a = Projectile.new(Vector3.new(0, 0, 0), Vector3.new(0, 0, -100), { maxDistance = 50 })
	Projectile.run(a, 1 / 60, noHit)
	expect(a.reason).toBe("maxDistance")
	local b = Projectile.new(Vector3.new(0, 0, 0), Vector3.new(0, 0, -1), { lifetime = 0.5 })
	Projectile.run(b, 1 / 60, noHit)
	expect(b.reason).toBe("lifetime")
end)

-- PathGuard ---------------------------------------------------------------------------------------
t:test("PathGuard: compute on the ground, in a loaded world, inside 3,000 studs", function(expect)
	local o, far = Vector3.new(0, 3, 0), Vector3.new(3001, 3, 0)
	local ok, why = PathGuard.canCompute({ airborne = false, loaded = false, from = o, to = o })
	expect(ok).toBe(false)
	expect(why).toBe("world-not-loaded")
	_, why = PathGuard.canCompute({ airborne = true, loaded = true, from = o, to = o })
	expect(why).toBe("airborne")
	_, why = PathGuard.canCompute({ airborne = false, loaded = true, from = o, to = far })
	expect(why).toBe("too-far")
	ok = PathGuard.canCompute({ airborne = false, loaded = true, from = o, to = Vector3.new(2999, 3, 0) })
	expect(ok).toBe(true)
	local legs = PathGuard.legs(o, Vector3.new(7000, 3, 0))
	expect(#legs).toBe(3)
	expect((legs[3] - Vector3.new(7000, 3, 0)).Magnitude).toBeNear(0, 1e-6)
	expect((legs[1] - o).Magnitude).toBeAtMost(PathGuard.LEG_STUDS)
end)

t:test("PathGuard: Blocked index rule and the MoveTo retry, then snap", function(expect)
	expect(PathGuard.shouldRecompute(3, 4)).toBe(false) -- behind the agent
	expect(PathGuard.shouldRecompute(4, 4)).toBe(true)
	expect(PathGuard.shouldRecompute(9, 4)).toBe(true)
	expect(PathGuard.onMoveFinished(true, 0)).toBe("next")
	expect(PathGuard.onMoveFinished(false, 0)).toBe("retry")
	expect(PathGuard.onMoveFinished(false, 1)).toBe("snap")
end)

-- DebugDraw ---------------------------------------------------------------------------------------
t:test("DebugDraw: boxes, segments and waypoints are world-space adornments", function(expect)
	local D = loadKit("DebugDraw")
	local cf = roblox.CFrame.new(1, 2, 3)
	local box = D.box(cf, Vector3.new(5, 5, 5))
	expect(box.ClassName).toBe("BoxHandleAdornment")
	expect(box.Adornee).toBe(terrain)
	expect(box.Parent.Name).toBe("DebugDraw")
	expect(box.AlwaysOnTop).toBe(false) -- depth-tested, so screen captures show it
	expect(D.box(cf, Vector3.new(1, 1, 1), { onTop = true }).AlwaysOnTop).toBe(true)
	expect((box.CFrame.Position - cf.Position).Magnitude).toBeNear(0, 1e-6)
	local seg = D.segment(Vector3.new(0, 0, 0), Vector3.new(0, 0, -5))
	expect(seg.Length).toBeNear(5, 1e-6)
	expect((seg.CFrame.LookVector - Vector3.new(0, 0, -1)).Magnitude).toBeNear(0, 1e-6)
	expect(D.segment(Vector3.new(1, 1, 1), Vector3.new(1, 1, 1))).toBe(nil)
	D.clear()
	local walk, jump = roblox.Enum.PathWaypointAction.Walk, roblox.Enum.PathWaypointAction.Jump
	local made = D.path({
		{ Position = Vector3.new(0, 3, 0), Action = walk },
		{ Position = Vector3.new(0, 3, -4), Action = jump },
		{ Position = Vector3.new(0, 6, -8), Action = walk },
	})
	expect(made).toBe(5)
	local folder = workspaceLune:FindFirstChild("DebugDraw")
	expect(#folder:GetChildren()).toBe(5)
	expect(folder:FindFirstChild("Waypoint2").Color3).toBe(roblox.Color3.fromRGB(255, 220, 0))
	D.clear()
	expect(#folder:GetChildren()).toBe(0)
end)

-- GameplayInputs ----------------------------------------------------------------------------------
t:test("GameplayInputs: key, mouse, pad and a touch UIButton per action; idempotent", function(expect)
	local GI = loadKit("GameplayInputs")
	local inputs = roblox.Instance.new("Folder")
	local starterGui = game:GetService("StarterGui")
	local lines = GI.build(inputs, starterGui)
	expect(table.concat(lines, " ")).toBe("Attack.Key=F Attack.Mouse=MouseLeftButton Attack.Pad=ButtonX Attack.Touch=Attack")
	local action = inputs.Combat.Attack
	expect(action.ClassName).toBe("InputAction")
	expect(action.Key.KeyCode).toBe(roblox.Enum.KeyCode.F)
	expect(action.Pad.KeyCode).toBe(roblox.Enum.KeyCode.ButtonX)
	local button = starterGui.GameplayTouch.Attack
	expect(action.Touch.UIButton).toBe(button)
	expect(starterGui.GameplayTouch.ResetOnSpawn).toBe(false)
	GI.build(inputs, starterGui)
	expect(#action:GetChildren()).toBe(4)
	expect(#starterGui.GameplayTouch:GetChildren()).toBe(1)
end)

-- CarSafety ---------------------------------------------------------------------------------------
t:test("CarSafety: highest exit when the car rolls; release stops the motors", function(expect)
	local CS = loadKit("CarSafety")
	local seat = roblox.CFrame.new(10, 3, 0)
	expect(CS.exitPoint(seat).Y).toBeNear(4, 1e-6) -- upright: a side exit, 1 stud up
	local rolled = seat * roblox.CFrame.Angles(0, 0, math.rad(90))
	local p = CS.exitPoint(rolled)
	expect(p.Y).toBeNear(8, 1e-4) -- on its side: the exit on the upper side, 5 studs above the seat
	local car = roblox.Instance.new("Model")
	car:SetAttribute("IdleTorque", 1500)
	local chassis = roblox.Instance.new("Part")
	chassis.Parent = car
	local a0 = roblox.Instance.new("Attachment")
	a0.Parent = chassis
	local base = roblox.CFrame.new(3, 0, -4)
	a0:SetAttribute("BaseCFrame", base)
	a0.CFrame = base * roblox.CFrame.Angles(0.4, 0, 0)
	local drive = roblox.Instance.new("CylindricalConstraint")
	drive:SetAttribute("Drive", true)
	drive.AngularVelocity = 35
	drive.MotorMaxTorque = 5000
	drive.Parent = chassis
	local steer = roblox.Instance.new("CylindricalConstraint")
	steer:SetAttribute("Steer", true)
	steer.Attachment0 = a0
	steer.Parent = chassis
	CS.release(car)
	expect(drive.AngularVelocity).toBe(0)
	expect(drive.MotorMaxTorque).toBe(1500)
	expect((a0.CFrame.LookVector - base.LookVector).Magnitude).toBeNear(0, 1e-6)
	expect(car:GetAttribute("SteerNow")).toBe(0)
end)

-- NpcPool -----------------------------------------------------------------------------------------
t:test("NpcPool: reuse parked models, reset them, destroy the dead", function(expect)
	local P = loadKit("NpcPool")
	local template = roblox.Instance.new("Model")
	local hum = roblox.Instance.new("Humanoid")
	hum.Parent = template
	local storage = roblox.Instance.new("Folder")
	local pool = P.new(template, storage, 1)
	local a = P.acquire(pool)
	local b = P.acquire(pool)
	expect(pool.created).toBe(2)
	a.Humanoid.Health = 10
	a:SetAttribute("State", "Chase")
	P.release(pool, a)
	expect(a.Parent).toBe(storage)
	expect(a.Humanoid.Health).toBe(a.Humanoid.MaxHealth)
	expect(a:GetAttribute("State")).toBe(nil)
	P.release(pool, b) -- over the cap of 1: destroyed
	expect(b.Parent).toBe(nil)
	expect(P.acquire(pool)).toBe(a)
	expect(pool.reused).toBe(1)
	P.release(pool, a, true) -- died: never reused
	expect(#pool.free).toBe(0)
end)

-- Pure think cost (no engine): 100 brains x 600 ticks
t:test("brain logic cost is small", function(expect)
	local brains = {}
	for i = 1, 100 do
		brains[i] = NpcBrain.new()
	end
	local t0 = os.clock()
	for tick = 1, 600 do
		for i, m in brains do
			NpcBrain.step(m, p(true, (i + tick) % 70, (tick % 3) ~= 0), tick / 60, 1 / 60)
		end
	end
	local us = (os.clock() - t0) / 60000 * 1e6
	print(string.format("brain think: %.2f us", us))
	expect(us).toBeAtMost(50)
end)

local report = t:run()
print(serde.encode("json", report, true))
process.exit(if report.failed == 0 and report.total > 0 then 0 else 1)
