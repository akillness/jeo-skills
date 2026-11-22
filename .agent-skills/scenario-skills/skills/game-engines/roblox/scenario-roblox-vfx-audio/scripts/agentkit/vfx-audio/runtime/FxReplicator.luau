--!nonstrict
-- FxReplicator: combat VFX that every client sees, built on each client, never replicated as instances.
-- The server validates a request, decides where the effect happens, and sends (name, CFrame) to nearby
-- clients; each client clones the template from the library and plays it with VfxKit. Projectiles travel
-- on every client from (origin, velocity, server time), so late or laggy clients draw them in the right place.
-- Requires VfxKit next to this module (ReplicatedStorage.VfxAudio).
--
-- Server:  FxReplicator.server({library = RS.FxLibrary, rules = {Slash = {cooldown = 0.4, range = 60}}})
--          FxReplicator.broadcast("Impact", cf, caster?)                 -- server-made effects (NPC hits)
--          FxReplicator.projectile(id, "Fireball", origin, velocity)   -- then FxReplicator.impact(id, "Boom", cf)
-- Client:  FxReplicator.client({library = RS.FxLibrary, cullDistance = 400})
--          FxReplicator.request("Slash", targetPosition)
-- The FxNet folder carries Accepted, Rejected and LastReject attributes (server) for tests and debugging.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local VfxKit = require((script.Parent :: any).VfxKit)

local FxReplicator = {}

local state = {
	library = nil :: any,
	fxFolder = nil :: any,
	radius = nil :: number?,
	live = {} :: { [number]: any },
	played = 0,
}

local function finite(v: Vector3): boolean
	return v.X == v.X and v.Y == v.Y and v.Z == v.Z and v.Magnitude < 1e6
end

-- CFrame at `pos` whose +Y is `normal` (impacts face away from the surface).
function FxReplicator.alignUp(pos: Vector3, normal: Vector3): CFrame
	local up = normal.Unit
	local ref = math.abs(up.Y) > 0.99 and Vector3.xAxis or Vector3.yAxis
	local right = ref:Cross(up).Unit
	return CFrame.fromMatrix(pos, right, up)
end

local function net(create: boolean)
	if create then
		local folder = ReplicatedStorage:FindFirstChild("FxNet") or Instance.new("Folder")
		folder.Name = "FxNet"
		for _, n in { "Request", "Play" } do
			if not folder:FindFirstChild(n) then
				local r = Instance.new("RemoteEvent")
				r.Name = n
				r.Parent = folder
			end
		end
		folder.Parent = ReplicatedStorage
		return folder
	end
	return ReplicatedStorage:WaitForChild("FxNet")
end

-- ------------------------------------------------------------------------------------------- server

local function send(kind: string, origin: Vector3, ...)
	local play = net(true).Play
	for _, p in Players:GetPlayers() do
		local root = p.Character and p.Character:FindFirstChild("HumanoidRootPart")
		if not state.radius or (root and (root.Position - origin).Magnitude <= state.radius) then
			play:FireClient(p, kind, ...)
		end
	end
end

function FxReplicator.broadcast(name: string, cf: CFrame, caster: Player?)
	send("burst", cf.Position, name, cf, caster and caster.UserId or 0)
end

function FxReplicator.projectile(id: number, name: string, origin: Vector3, velocity: Vector3)
	send("projectile", origin, id, name, origin, velocity, workspace:GetServerTimeNow())
end

function FxReplicator.impact(id: number, name: string, cf: CFrame)
	send("impact", cf.Position, id, name, cf)
end

function FxReplicator.server(config)
	assert(RunService:IsServer(), "FxReplicator.server runs on the server")
	state.radius = config.radius
	local folder = net(true)
	folder:SetAttribute("Accepted", 0)
	folder:SetAttribute("Rejected", 0)
	local last: { [Player]: { [string]: number } } = {}
	local function reject(why: string)
		folder:SetAttribute("Rejected", folder:GetAttribute("Rejected") + 1)
		folder:SetAttribute("LastReject", why)
	end
	folder.Request.OnServerEvent:Connect(function(player: Player, name: any, target: any)
		if typeof(name) ~= "string" or typeof(target) ~= "Vector3" or not finite(target) then
			reject("type")
			return
		end
		local rule = config.rules[name]
		if not rule or not config.library:FindFirstChild(name) then
			reject("unknown")
			return
		end
		local char = player.Character
		local root = char and char:FindFirstChild("HumanoidRootPart")
		if not root then
			reject("no-character")
			return
		end
		local now = os.clock()
		local times = last[player] or {}
		if now - (times[name] or -math.huge) < rule.cooldown then
			reject("cooldown")
			return
		end
		local offset = target - root.Position
		if offset.Magnitude > rule.range then
			reject("range")
			return
		end
		times[name] = now
		last[player] = times
		-- The server picks the point: a ray from the caster, never the client's claim of what it hit.
		local params = RaycastParams.new()
		params.FilterType = Enum.RaycastFilterType.Exclude
		params.FilterDescendantsInstances = { char }
		local hit = workspace:Raycast(root.Position, offset, params)
		local cf = if hit
			then FxReplicator.alignUp(hit.Position, hit.Normal)
			else FxReplicator.alignUp(target, Vector3.yAxis)
		folder:SetAttribute("Accepted", folder:GetAttribute("Accepted") + 1)
		FxReplicator.broadcast(name, cf, player)
	end)
	Players.PlayerRemoving:Connect(function(p)
		last[p] = nil
	end)
	return folder
end

-- ------------------------------------------------------------------------------------------- client

local predicted: { [string]: number } = {}

function FxReplicator.request(name: string, target: Vector3, predictAt: CFrame?)
	if predictAt then
		predicted[name] = os.clock()
		VfxKit.play(state.library:FindFirstChild(name), predictAt, state.fxFolder)
	end
	net(false).Request:FireServer(name, target)
end

local function stopLayers(model: Instance)
	for _, d in model:GetDescendants() do
		if d:IsA("ParticleEmitter") or d:IsA("Beam") or d:IsA("Trail") or d:IsA("Light") then
			d.Enabled = false
		elseif d:IsA("AudioPlayer") then
			d:Stop()
		end
	end
end

function FxReplicator.client(config)
	assert(RunService:IsClient(), "FxReplicator.client runs on a client")
	state.library = config.library
	state.fxFolder = config.fxFolder
		or workspace:FindFirstChild("Fx")
		or (function()
			local f = Instance.new("Folder")
			f.Name = "Fx"
			f.Parent = workspace
			return f
		end)()
	local me = Players.LocalPlayer
	local function far(pos: Vector3): boolean
		local cam = workspace.CurrentCamera
		return config.cullDistance ~= nil and cam ~= nil and (cam.CFrame.Position - pos).Magnitude > config.cullDistance
	end
	net(false).Play.OnClientEvent:Connect(function(kind: string, ...)
		if kind == "burst" then
			local name, cf, casterId = ...
			if casterId == me.UserId and predicted[name] and os.clock() - predicted[name] < 0.5 then
				predicted[name] = nil -- already drawn locally
				return
			end
			local template = state.library:FindFirstChild(name)
			if template and not far(cf.Position) then
				VfxKit.play(template, cf, state.fxFolder)
				state.played += 1
				me:SetAttribute("FxPlayed", state.played)
			end
		elseif kind == "projectile" then
			local id, name, origin, velocity, t0 = ...
			local template = state.library:FindFirstChild(name)
			if not template then
				return
			end
			local fx = template:Clone()
			fx:PivotTo(CFrame.lookAlong(origin, velocity))
			fx.Parent = state.fxFolder
			VfxKit.emit(fx)
			for _, d in fx:GetDescendants() do
				if d:IsA("ParticleEmitter") and d:GetAttribute("Loop") then
					d.Enabled = true
				end
			end
			state.live[id] = { fx = fx, origin = origin, velocity = velocity, t0 = t0 }
		elseif kind == "impact" then
			local id, name, cf = ...
			local p = state.live[id]
			if p then
				state.live[id] = nil
				stopLayers(p.fx)
				-- let live particles and the trail finish instead of popping them
				task.delay(VfxKit.lifetime(p.fx), function()
					p.fx:Destroy()
				end)
			end
			local template = state.library:FindFirstChild(name)
			if template and not far(cf.Position) then
				VfxKit.play(template, cf, state.fxFolder)
				state.played += 1
				me:SetAttribute("FxPlayed", state.played)
			end
		end
	end)
	RunService.RenderStepped:Connect(function()
		local now = workspace:GetServerTimeNow()
		for _, p in state.live do
			p.fx:PivotTo(CFrame.lookAlong(p.origin + p.velocity * (now - p.t0), p.velocity))
		end
	end)
end

return FxReplicator
