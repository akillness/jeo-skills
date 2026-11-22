--!strict
-- NpcService: server scheduler for many Humanoid NPCs (patrol, detect, pathfinding chase, melee).
-- One Heartbeat connection for all NPCs, a fixed share thinks per frame (buckets), one budgeted
-- path worker, perception by squared distance then one raycast against static geometry.
--
--   NpcService.configure({ map = workspace.Map, damage = 10 })
--   NpcService.start()
--   NpcService.spawn(template, CFrame.new(0, 3, 0))
--   NpcService.stats()   -- count, states, aiMs (mean, p95), paths (computed, failed, ms), attacks, hits

local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local PathfindingService = game:GetService("PathfindingService")

local NpcBrain = require("./NpcBrain")
local Hitbox = require("./Hitbox")

local NpcService = {}

export type Config = {
	buckets: number, -- one bucket thinks per Heartbeat: 6 buckets = 10 thinks per NPC per second at 60 fps
	pathsPerSecond: number, -- server-wide ComputeAsync budget
	repathDistance: number, -- studs the target may move from the path goal before a recompute
	directChase: number, -- with line of sight and closer than this, MoveTo the target, no path
	waypointReach: number, -- studs on XZ to count a waypoint as reached
	patrolRadius: number,
	telegraph: number, -- seconds from the Action attribute to the hitbox query
	damage: number,
	box: Vector3,
	reach: number,
	fovDot: number, -- -1 sees all around; 0.5 is a 120 degree cone
	trimStates: boolean,
	agent: { [string]: any },
	brain: NpcBrain.Config,
	map: Instance?, -- static geometry for line of sight (IncludeInstances); nil: exclude NPCs and characters
	folder: Instance?,
	collisionGroup: string?,
}

NpcService.config = {
	buckets = 6,
	pathsPerSecond = 30,
	repathDistance = 6,
	directChase = 30,
	waypointReach = 3,
	patrolRadius = 30,
	telegraph = 0.35,
	damage = 10,
	box = Vector3.new(5, 5, 5),
	reach = 3,
	fovDot = -1,
	trimStates = true,
	agent = { AgentRadius = 2, AgentHeight = 5, AgentCanJump = true, WaypointSpacing = 4 },
	brain = NpcBrain.DEFAULT,
	map = nil,
	folder = nil,
	collisionGroup = "NPC",
} :: Config

type Npc = {
	model: Model,
	humanoid: Humanoid,
	root: BasePart,
	brain: any,
	bucket: number,
	home: Vector3,
	goal: Vector3?,
	path: Path,
	waypoints: { PathWaypoint }?,
	wpIndex: number,
	pathGoal: Vector3?,
	pathQueued: boolean,
	alive: boolean,
	conns: { RBXScriptConnection },
}

local npcs: { Npc } = {}
local queue: { Npc } = {}
local running = false
local heartbeat: RBXScriptConnection? = nil
local frame = 0
local aiMs: { number } = table.create(600, 0)
local aiIdx = 0
local counters = {
	paths = 0,
	pathFailed = 0,
	pathMsTotal = 0,
	pathMsMax = 0,
	attacks = 0,
	hits = 0,
	thinks = 0,
	startedAt = 0,
}

local losParams = RaycastParams.new()

local function folder(): Instance
	local f = NpcService.config.folder
	if f and f.Parent then
		return f
	end
	local existing = workspace:FindFirstChild("NPCs")
	if existing then
		NpcService.config.folder = existing
		return existing
	end
	local made = Instance.new("Folder")
	made.Name = "NPCs"
	made.Parent = workspace
	NpcService.config.folder = made
	return made
end

local function ensureGroup(name: string)
	if not workspace:IsCollisionGroupRegistered(name) then
		workspace:RegisterCollisionGroup(name)
	end
	workspace:CollisionGroupSetCollidable(name, name, false)
end

function NpcService.configure(partial: { [string]: any })
	for k, v in partial do
		(NpcService.config :: any)[k] = v
	end
	local map = NpcService.config.map
	if map then
		losParams.IncludeInstances = { map }
	end
end

local function flat(v: Vector3): Vector3
	return Vector3.new(v.X, 0, v.Z)
end

local function requestPath(npc: Npc, goal: Vector3)
	npc.pathGoal = goal
	if not npc.pathQueued then
		npc.pathQueued = true
		table.insert(queue, npc)
	end
end

local function pathWorker()
	while running do
		local npc = table.remove(queue, 1)
		if not npc then
			task.wait(0.05)
			continue
		end
		npc.pathQueued = false
		local goal = npc.pathGoal
		if npc.alive and goal then
			local t0 = os.clock()
			-- ComputeAsync yields and can throw: pcall AND Status (BrawlDev, ckA4fVkAjIA 00:15:48).
			local ok = pcall(npc.path.ComputeAsync, npc.path, npc.root.Position, goal)
			local ms = (os.clock() - t0) * 1000
			counters.paths += 1
			counters.pathMsTotal += ms
			counters.pathMsMax = math.max(counters.pathMsMax, ms)
			if ok and npc.path.Status == Enum.PathStatus.Success then
				npc.waypoints = npc.path:GetWaypoints()
				npc.wpIndex = 2 -- waypoint 1 is the start position
			else
				npc.waypoints = nil
				counters.pathFailed += 1
			end
		end
		task.wait(1 / NpcService.config.pathsPerSecond)
	end
end

local function followPath(npc: Npc)
	local wps = npc.waypoints
	if not wps then
		return
	end
	local wp = wps[npc.wpIndex]
	if wp and flat(wp.Position - npc.root.Position).Magnitude < NpcService.config.waypointReach then
		npc.wpIndex += 1
		wp = wps[npc.wpIndex]
	end
	if not wp then
		npc.waypoints = nil
		return
	end
	if wp.Action == Enum.PathWaypointAction.Jump then
		npc.humanoid.Jump = true
	end
	-- Re-issued every think: MoveTo gives up after 8 s without arrival (Humanoid reference).
	npc.humanoid:MoveTo(wp.Position)
end

local function attack(npc: Npc)
	local cfg = NpcService.config
	counters.attacks += 1
	npc.model:SetAttribute("Action", "Swing")
	task.delay(cfg.telegraph, function()
		if not npc.alive then
			return
		end
		npc.model:SetAttribute("Action", "")
		if npc.brain.current ~= "Attack" then
			return -- the target left during the wind-up: the swing whiffs
		end
		local include: { Instance } = {}
		for _, p in Players:GetPlayers() do
			if p.Character then
				table.insert(include, p.Character)
			end
		end
		local hits = Hitbox.box(Hitbox.inFront(npc.root, cfg.reach), cfg.box, { include = include })
		for _, hum in hits do
			counters.hits += 1
			if cfg.damage > 0 then
				hum:TakeDamage(cfg.damage)
			end
		end
	end)
end

type Target = { root: BasePart, distSq: number }

local function perceive(npc: Npc, targets: { Target }, chasing: boolean): (boolean, number, boolean, Vector3?)
	local cfg = NpcService.config
	local range = cfg.brain.detectRange * (if chasing then 1.5 else 1)
	local pos = npc.root.Position
	local best: BasePart? = nil
	local bestSq = range * range
	for _, t in targets do
		local d = t.root.Position - pos
		local sq = d.X * d.X + d.Y * d.Y + d.Z * d.Z
		if sq < bestSq then
			if cfg.fovDot > -1 and not chasing then
				local look = npc.root.CFrame.LookVector
				if look:Dot(d.Unit) < cfg.fovDot then
					continue
				end
			end
			best, bestSq = t.root, sq
		end
	end
	if not best then
		return false, math.huge, false, nil
	end
	local eye = pos + Vector3.new(0, 1.5, 0)
	local hit = workspace:Raycast(eye, best.Position - eye, losParams)
	return true, math.sqrt(bestSq), hit == nil, best.Position
end

local function think(npc: Npc, targets: { Target }, now: number, dt: number)
	if not npc.alive or npc.root.Parent == nil then
		return
	end
	counters.thinks += 1
	local chasing = npc.brain.current ~= "Patrol"
	local hasTarget, dist, sight, targetPos = perceive(npc, targets, chasing)
	local before = npc.brain.current
	local state, startAttack = NpcBrain.step(npc.brain, {
		hasTarget = hasTarget,
		targetDist = dist,
		hasSight = sight,
	}, now, dt)
	if state ~= before then
		npc.model:SetAttribute("State", state)
		npc.waypoints = nil
	end
	local cfg = NpcService.config
	if state == "Patrol" then
		local goal = npc.goal
		if not goal or flat(goal - npc.root.Position).Magnitude < 4 then
			local a = math.random() * math.pi * 2
			local r = math.random() * cfg.patrolRadius
			goal = npc.home + Vector3.new(math.cos(a) * r, 0, math.sin(a) * r)
			npc.goal = goal
		end
		npc.humanoid:MoveTo(goal :: Vector3)
	elseif state == "Chase" and targetPos then
		if sight and dist <= cfg.directChase then
			npc.waypoints = nil
			npc.humanoid:MoveTo(targetPos)
		else
			if not npc.waypoints or not npc.pathGoal or (npc.pathGoal - targetPos).Magnitude > cfg.repathDistance then
				requestPath(npc, targetPos)
			end
			followPath(npc)
		end
	elseif state == "Attack" and targetPos then
		-- A short step toward the target keeps AutoRotate facing it.
		local toward = flat(targetPos - npc.root.Position)
		if toward.Magnitude > 0.1 then
			npc.humanoid:MoveTo(npc.root.Position + toward.Unit * 0.5)
		end
		if startAttack then
			attack(npc)
		end
	end
end

local function onHeartbeat(dt: number)
	frame += 1
	local t0 = os.clock()
	local targets: { Target } = {}
	for _, p in Players:GetPlayers() do
		local c = p.Character
		local hum = c and c:FindFirstChildOfClass("Humanoid")
		local root = c and c:FindFirstChild("HumanoidRootPart")
		if hum and hum.Health > 0 and root and root:IsA("BasePart") then
			table.insert(targets, { root = root, distSq = 0 })
		end
	end
	local cfg = NpcService.config
	local bucket = frame % cfg.buckets
	local now = time()
	for _, npc in npcs do
		if npc.bucket == bucket then
			think(npc, targets, now, dt * cfg.buckets)
		end
	end
	aiIdx = aiIdx % 600 + 1
	aiMs[aiIdx] = (os.clock() - t0) * 1000
end

function NpcService.start()
	if running then
		return
	end
	running = true
	counters.startedAt = time()
	local group = NpcService.config.collisionGroup
	if group then
		ensureGroup(group)
	end
	if NpcService.config.map then
		losParams.IncludeInstances = { NpcService.config.map :: Instance }
	else
		losParams.ExcludeInstances = { folder() }
	end
	heartbeat = RunService.Heartbeat:Connect(onHeartbeat)
	task.spawn(pathWorker)
end

function NpcService.stop()
	running = false
	if heartbeat then
		heartbeat:Disconnect()
		heartbeat = nil
	end
end

local TRIMMED = {
	Enum.HumanoidStateType.Climbing,
	Enum.HumanoidStateType.Swimming,
	Enum.HumanoidStateType.FallingDown,
	Enum.HumanoidStateType.Ragdoll,
	Enum.HumanoidStateType.Flying,
	Enum.HumanoidStateType.Seated,
}

function NpcService.spawn(template: Model, cf: CFrame, brain: NpcBrain.Config?): Model
	local cfg = NpcService.config
	local model = template:Clone()
	local humanoid = model:FindFirstChildOfClass("Humanoid") :: Humanoid
	local root = model:FindFirstChild("HumanoidRootPart") :: BasePart
	assert(humanoid and root, "template needs a Humanoid and a HumanoidRootPart")
	model:PivotTo(cf)
	if cfg.collisionGroup then
		for _, d in model:GetDescendants() do
			if d:IsA("BasePart") then
				d.CollisionGroup = cfg.collisionGroup
			end
		end
	end
	if cfg.trimStates then
		for _, s in TRIMMED do
			humanoid:SetStateEnabled(s, false)
		end
	end
	humanoid.BreakJointsOnDeath = false
	model:SetAttribute("State", "Patrol")
	model.Parent = folder()
	-- Server-owned: an unpinned NPC near a player is simulated, and movable, by that client.
	if root:CanSetNetworkOwnership() then
		root:SetNetworkOwner(nil)
	end
	local npc: Npc = {
		model = model,
		humanoid = humanoid,
		root = root,
		brain = NpcBrain.new(brain or cfg.brain),
		bucket = (#npcs) % cfg.buckets,
		home = cf.Position,
		goal = nil,
		path = PathfindingService:CreatePath(cfg.agent),
		waypoints = nil,
		wpIndex = 2,
		pathGoal = nil,
		pathQueued = false,
		alive = true,
		conns = {},
	}
	-- Recompute only when the blocked waypoint is still ahead (Pathfinding docs, Blocked paths).
	table.insert(npc.conns, npc.path.Blocked:Connect(function(index: number)
		if npc.waypoints and index >= npc.wpIndex and npc.pathGoal then
			requestPath(npc, npc.pathGoal)
		end
	end))
	table.insert(npc.conns, humanoid.Died:Connect(function()
		npc.alive = false
		NpcService.remove(model, 3)
	end))
	table.insert(npcs, npc)
	return model
end

function NpcService.remove(model: Model, delaySeconds: number?)
	for i, npc in npcs do
		if npc.model == model then
			npc.alive = false
			for _, c in npc.conns do
				c:Disconnect()
			end
			npc.path:Destroy()
			table.remove(npcs, i)
			break
		end
	end
	if delaySeconds and delaySeconds > 0 then
		task.delay(delaySeconds, model.Destroy, model)
	else
		model:Destroy()
	end
end

function NpcService.clear()
	while #npcs > 0 do
		NpcService.remove(npcs[#npcs].model)
	end
	table.clear(queue)
end

function NpcService.resetStats()
	for k in counters do
		counters[k] = 0
	end
	counters.startedAt = time()
	table.clear(aiMs)
	aiIdx = 0
end

function NpcService.stats()
	local samples = {}
	for _, v in aiMs do
		table.insert(samples, v)
	end
	table.sort(samples)
	local sum = 0
	for _, v in samples do
		sum += v
	end
	local states: { [string]: number } = { Patrol = 0, Chase = 0, Attack = 0 }
	local owned = 0
	for _, npc in npcs do
		local current: string = npc.brain.current
		states[current] = (states[current] or 0) + 1
		if npc.root:GetNetworkOwner() ~= nil then
			owned += 1
		end
	end
	local elapsed = math.max(time() - counters.startedAt, 1e-3)
	return {
		count = #npcs,
		states = states,
		clientOwnedRoots = owned,
		aiMsMean = if #samples > 0 then sum / #samples else 0,
		aiMsP95 = if #samples > 0 then samples[math.max(1, math.ceil(#samples * 0.95))] else 0,
		aiMsMax = if #samples > 0 then samples[#samples] else 0,
		thinksPerSecond = counters.thinks / elapsed,
		paths = counters.paths,
		pathFailed = counters.pathFailed,
		pathMsMean = if counters.paths > 0 then counters.pathMsTotal / counters.paths else 0,
		pathMsMax = counters.pathMsMax,
		queued = #queue,
		attacks = counters.attacks,
		hits = counters.hits,
	}
end

function NpcService.list(): { Model }
	local out = {}
	for _, npc in npcs do
		table.insert(out, npc.model)
	end
	return out
end

return NpcService
