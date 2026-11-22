--!strict
-- Net: one server entry point for everything a client can trigger. Order per call: rate limit
-- (cheapest), argument validation, then the handler. Failures feed Suspicion; nothing is echoed to
-- the client. Counters land in ServerStorage.NetLog (attributes), which never replicates.
--
--   local Net = require(ServerScriptService.NetKit.Net)
--   Net.init({ enforce = function(player, reasons) player:Kick("Disconnected") end })
--   Net.bind(Remotes.Buy, { args = { Guard.oneOf(PRICES) }, limit = { 4, 2 }, handler = buy })
--   Net.honeypot(Remotes.AdminGiveCoins)          -- never fired by the real client
--   Net.serverOnly(Remotes.Effects)               -- server-to-client only: a client fire is a signal
--   Net.prompt(workspace.Shop.Prompt, { maxDistance = 12, handler = openShop })
--   Net.touch(workspace.Coins.Coin1, { maxDistance = 8, guard = moveGuard, handler = collect })
--
-- Requires sibling ModuleScripts Guard, RateLimit and Suspicion (same folder).

local Players = game:GetService("Players")
local ServerStorage = game:GetService("ServerStorage")

local Guard = require(script.Parent.Guard)
local RateLimit = require(script.Parent.RateLimit)
local Suspicion = require(script.Parent.Suspicion)

export type BindSpec = {
	args: { Guard.Validator }?,
	limit: { number }?, -- { capacity, perSecond }
	handler: (player: Player, ...any) -> ...any,
	argWeight: number?, -- suspicion added on rejected arguments (a real client never sends them)
	rateWeight: number?, -- once per second in which more than 50 calls were dropped (scripted flood)
}

export type InitOptions = {
	enforce: ((player: Player, reasons: { [string]: number }) -> ())?, -- kick or Players:BanAsync
	enforceDelay: { number }?, -- { min, max } seconds; delayed so exploiters cannot learn the trigger
	suspicion: Suspicion.Options?,
	verbose: boolean?,
}

local Net = {}

local log: Folder
local playersLog: Folder
local suspicion: Suspicion.Suspicion
local options: InitOptions = {}
local enforced: { [Player]: boolean } = {}
local limiters: { RateLimit.RateLimit } = {}
-- Dropped calls per player and remote in the current one-second window. Humans and autoclickers
-- stay under FLOOD; a scripted flood crosses it, and only that is flagged (once per window).
local FLOOD = 50
local floods: { [string]: { start: number, n: number } } = {}

local function key(s: string): string
	return (s:gsub("[^%w_]", "_"))
end

function Net.count(name: string, by: number?)
	local k = key(name)
	log:SetAttribute(k, ((log:GetAttribute(k) :: number?) or 0) + (by or 1))
end

local function playerFolder(player: Player): Folder
	local name = tostring(player.UserId)
	local f = playersLog:FindFirstChild(name)
	if f and f:IsA("Folder") then
		return f
	end
	local nf = Instance.new("Folder")
	nf.Name = name
	nf.Parent = playersLog
	return nf
end

-- Adds suspicion and applies the ladder. Returns the level.
function Net.flag(player: Player, weight: number, reason: string): string
	local level = suspicion:add(player.UserId, weight, reason)
	local f = playerFolder(player)
	f:SetAttribute("score", math.floor(suspicion:score(player.UserId) * 100) / 100)
	f:SetAttribute("level", level)
	f:SetAttribute(key(reason), ((f:GetAttribute(key(reason)) :: number?) or 0) + 1)
	Net.count("flag_" .. reason)
	if options.verbose then
		print(string.format("[NET] %s %s +%g -> %s", player.Name, reason, weight, level))
	end
	if level == "enforce" and not enforced[player] then
		enforced[player] = true
		local range = options.enforceDelay or { 20, 90 }
		local delay = range[1] + math.random() * (range[2] - range[1])
		f:SetAttribute("enforcePending", true)
		f:SetAttribute("enforceDelay", math.floor(delay * 100) / 100)
		task.delay(delay, function()
			if not enforced[player] then
				return -- reset in the meantime
			end
			f:SetAttribute("enforced", true)
			if options.enforce and player.Parent then
				options.enforce(player, suspicion:reasons(player.UserId))
			end
		end)
	end
	return level
end

function Net.level(player: Player): string
	return suspicion:level(player.UserId)
end

-- Clears a player's score and pending enforcement (appeals, false positives, tests).
function Net.reset(player: Player)
	suspicion:forget(player.UserId)
	enforced[player] = nil
	local f = playersLog:FindFirstChild(tostring(player.UserId))
	if f then
		f:Destroy()
	end
end

function Net.init(opts: InitOptions?)
	local given: InitOptions = opts or {}
	options = given
	suspicion = Suspicion.new(options.suspicion)
	local existing = ServerStorage:FindFirstChild("NetLog")
	if existing then
		existing:Destroy()
	end
	log = Instance.new("Folder")
	log.Name = "NetLog"
	playersLog = Instance.new("Folder")
	playersLog.Name = "Players"
	playersLog.Parent = log
	log.Parent = ServerStorage
	Players.PlayerRemoving:Connect(function(p)
		suspicion:forget(p.UserId)
		enforced[p] = nil
		for k in floods do
			if k:sub(1, #tostring(p.UserId)) == tostring(p.UserId) then
				floods[k] = nil
			end
		end
		for _, l in limiters do
			l:forget(p.UserId)
		end
	end)
end

local function gate(name: string, spec: BindSpec, limiter: RateLimit.RateLimit?, player: Player, ...: any): boolean
	if limiter and not limiter:allow(player.UserId) then
		Net.count("rate_" .. name)
		local k = player.UserId .. name
		local now = os.clock()
		local w = floods[k]
		if w == nil or now - w.start > 1 then
			local fresh = { start = now, n = 0 }
			floods[k] = fresh
			w = fresh
		end
		w.n += 1
		if w.n == FLOOD then
			Net.flag(player, spec.rateWeight or 1, "flood_" .. name)
		end
		return false
	end
	if spec.args then
		local ok = Guard.check(spec.args, ...)
		if not ok then
			Net.count("args_" .. name)
			Net.flag(player, spec.argWeight or 1, "args_" .. name)
			return false
		end
	end
	if Net.level(player) == "restrict" or enforced[player] then
		Net.count("restricted_" .. name)
		return false
	end
	return true
end

-- OnServerEvent on either event class; IsA gives each branch its real type.
local function onServerEvent(remote: Instance, fn: (Player, ...any) -> (), who: string)
	if remote:IsA("RemoteEvent") then
		remote.OnServerEvent:Connect(fn)
	elseif remote:IsA("UnreliableRemoteEvent") then
		remote.OnServerEvent:Connect(fn)
	else
		error(who .. ": not a remote: " .. remote:GetFullName())
	end
end

function Net.bind(remote: Instance, spec: BindSpec)
	local name = remote.Name
	local limiter = if spec.limit then RateLimit.new(spec.limit[1], spec.limit[2]) else nil
	if limiter then
		table.insert(limiters, limiter)
	end
	if remote:IsA("RemoteFunction") then
		remote.OnServerInvoke = function(player: Player, ...: any): ...any
			if not gate(name, spec, limiter, player, ...) then
				return nil
			end
			Net.count("ok_" .. name)
			return spec.handler(player, ...)
		end
	else
		local function onEvent(player: Player, ...: any)
			if gate(name, spec, limiter, player, ...) then
				Net.count("ok_" .. name)
				spec.handler(player, ...)
			end
		end
		onServerEvent(remote, onEvent, "Net.bind")
	end
end

-- A remote with a tempting name that the real client never fires.
function Net.honeypot(remote: Instance, weight: number?)
	local function hit(player: Player)
		Net.count("honeypot_" .. remote.Name)
		Net.flag(player, weight or 10, "honeypot")
		Net.flag(player, 0.5, "honeypot_" .. remote.Name)
	end
	if remote:IsA("RemoteFunction") then
		remote.OnServerInvoke = function(player: Player)
			hit(player)
			return nil
		end
	else
		onServerEvent(remote, hit, "Net.honeypot")
	end
end

-- A server-to-client remote: the server only fires it, so any client fire is a direction honeypot.
function Net.serverOnly(remote: RemoteEvent | UnreliableRemoteEvent, weight: number?)
	onServerEvent(remote, function(player: Player)
		Net.count("direction_" .. remote.Name)
		Net.flag(player, weight or 5, "direction")
	end, "Net.serverOnly")
end

export type PromptSpec = {
	maxDistance: number,
	limit: { number }?,
	handler: (player: Player) -> (),
}

-- ProximityPrompt: the client can edit Enabled, MaxActivationDistance and HoldDuration locally,
-- and the server still receives Triggered; re-check everything here.
function Net.prompt(prompt: ProximityPrompt, spec: PromptSpec)
	local limiter = RateLimit.new(spec.limit and spec.limit[1] or 2, spec.limit and spec.limit[2] or 1)
	table.insert(limiters, limiter)
	prompt.Triggered:Connect(function(player: Player)
		local name = "prompt_" .. (prompt.Parent and prompt.Parent.Name or "?")
		if not limiter:allow(player.UserId) then
			Net.count("rate_" .. name)
			return
		end
		local anchor = prompt.Parent
		local pos: Vector3? = nil
		if anchor and anchor:IsA("BasePart") then
			pos = anchor.Position
		elseif anchor and anchor:IsA("Attachment") then
			pos = anchor.WorldPosition
		elseif anchor and anchor:IsA("Model") then
			pos = anchor:GetPivot().Position
		end
		local char = player.Character
		if not (pos and prompt.Enabled and char) then
			Net.count("state_" .. name)
			return
		end
		if (char:GetPivot().Position - pos).Magnitude > spec.maxDistance then
			Net.count("distance_" .. name)
			Net.flag(player, 1, "distance_" .. name)
			return
		end
		Net.count("ok_" .. name)
		spec.handler(player)
	end)
end

export type TouchSpec = {
	maxDistance: number, -- studs from the server's HumanoidRootPart position to the part
	limiter: RateLimit.RateLimit?, -- shared by every part of one pickup kind; counts accepted pickups
	-- MoveGuard.start's guard: the root must also be reachable from its last trusted position.
	guard: { tracks: { [any]: { pos: Vector3, at: number } }, margin: number, burst: number }?,
	handler: (player: Player, part: BasePart) -> (),
}

-- Touched pickup: the touch comes from the client's physics, so re-check who touched, the part's
-- state, and distance here. The handler takes the part by setting CanTouch false; later touches
-- (other limbs, queued events) are dropped until it sets CanTouch true again.
function Net.touch(part: BasePart, spec: TouchSpec)
	local name = "touch_" .. part.Name
	local limiter = spec.limiter
	if limiter and not table.find(limiters, limiter) then
		table.insert(limiters, limiter) -- forgets leaving players, like the others
	end
	part.Touched:Connect(function(hit: BasePart)
		local char = hit:FindFirstAncestorOfClass("Model")
		local player = char and Players:GetPlayerFromCharacter(char)
		if not (char and player) then
			return -- not a character: no count, props touch all the time
		end
		local hum = char:FindFirstChildOfClass("Humanoid")
		local root = char:FindFirstChild("HumanoidRootPart")
		if not (part.CanTouch and hum and hum.Health > 0 and root and root:IsA("BasePart")) then
			Net.count("state_" .. name)
			return
		end
		if (root.Position - part.Position).Magnitude > spec.maxDistance then
			Net.count("distance_" .. name)
			Net.flag(player, 1, "distance_" .. name)
			return
		end
		local guard = spec.guard
		local track = guard and guard.tracks[player]
		if guard and track then
			-- MoveGuard samples every interval: a teleport onto the part can touch before the next
			-- sample, so bound the move since then with the guard's own speed model.
			local reach = (hum.WalkSpeed + guard.margin) * math.max(os.clock() - track.at, 0.01) + guard.burst
			local moved = Vector3.new(root.Position.X - track.pos.X, 0, root.Position.Z - track.pos.Z).Magnitude
			if moved > reach then
				Net.count("teleport_" .. name)
				Net.flag(player, 1, "teleport_" .. name)
				return
			end
		end
		if limiter and not limiter:allow(player.UserId) then
			Net.count("rate_" .. name)
			return
		end
		Net.count("ok_" .. name)
		spec.handler(player, part)
	end)
end

return Net
