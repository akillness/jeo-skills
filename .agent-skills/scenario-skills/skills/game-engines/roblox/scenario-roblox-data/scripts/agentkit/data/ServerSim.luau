--!nonstrict
-- ServerSim: runs unmodified server modules (ProfileStore, your PlayerData service) as several
-- simulated Roblox servers in ONE process (Lune, or Studio Edit), all backed by one MockDataStore
-- backend. Each server gets its own globals (game, script, Instance, Enum, os, task) and its own
-- copy of every module it loads, so module-level state (ProfileStore's session table) is per server.
-- The engine pieces are fakes: Players, RunService.Heartbeat, HttpService, BindToClose.
-- `load(source, {debugName, environment})` returns the chunk: luau.load in Lune; in Studio Edit,
-- loadstring then setfenv(f, environment). The environment already falls back to STD below.
--
--   local sim = ServerSim.new(backend, { jobId = "A", load = luau.load, task = task, encode = enc })
--   local PS = sim:require(profileStoreSource, "ProfileStore")
--   local player = sim.Players:join(1001)
--   sim:shutdown()   -- runs BindToClose callbacks (30 s budget) then stops
--   sim:crash()      -- no BindToClose; every later DataStore call from this server hangs
--   sim.clockSkew = 700  -- this server's os.time() runs 700 s ahead (cross-server clock drift)

local Sim = {}
Sim.__index = Sim

local ENUM_ITEM = {
	__tostring = function(item)
		return "Enum.SortDirection." .. item.Name
	end,
}
local function simTypeof(v)
	if type(v) == "table" and getmetatable(v) == ENUM_ITEM then
		return "EnumItem"
	end
	return typeof(v)
end

-- Globals a server module may read besides the per-server ones; nil entries (Lune lacks some) drop out.
local STD = {
	assert = assert, error = error, pcall = pcall, xpcall = xpcall, print = print, warn = warn,
	type = type, typeof = typeof, tostring = tostring, tonumber = tonumber, select = select,
	pairs = pairs, ipairs = ipairs, next = next, unpack = unpack, require = require,
	setmetatable = setmetatable, getmetatable = getmetatable, rawget = rawget, rawset = rawset,
	rawequal = rawequal, rawlen = rawlen, string = string, table = table, math = math,
	coroutine = coroutine, utf8 = utf8, bit32 = bit32, buffer = buffer, debug = debug,
}

local function signal(task)
	local s = { handlers = {} }
	function s:Connect(fn)
		local h = { fn = fn, connected = true }
		table.insert(self.handlers, h)
		return {
			Connected = true,
			Disconnect = function(c)
				h.connected = false
				c.Connected = false
			end,
		}
	end
	function s:Once(fn)
		local c
		c = self:Connect(function(...)
			c:Disconnect()
			fn(...)
		end)
		return c
	end
	function s:Fire(...)
		for _, h in ipairs(table.clone(self.handlers)) do
			if h.connected then
				task.spawn(h.fn, ...)
			end
		end
	end
	function s:Wait()
		local co = coroutine.running()
		self:Once(function(...)
			task.spawn(co, ...)
		end)
		return coroutine.yield()
	end
	return s
end
Sim.signal = signal

local function fakePlayers(sim)
	local task = sim.task
	local P = { PlayerAdded = signal(task), PlayerRemoving = signal(task), list = {}, kicks = {}, Name = "Players" }
	function P:GetPlayers()
		return table.clone(self.list)
	end
	function P:GetPlayerByUserId(userId)
		for _, p in ipairs(self.list) do
			if p.UserId == userId then
				return p
			end
		end
		return nil
	end
	function P:join(userId)
		local player = { UserId = userId, Name = "Player" .. userId, Parent = P, ClassName = "Player" }
		function player:IsDescendantOf(x)
			return self.Parent == x
		end
		function player:Kick(message)
			table.insert(P.kicks, { userId = self.UserId, message = message })
			P:leave(self)
		end
		table.insert(self.list, player)
		self.PlayerAdded:Fire(player)
		return player
	end
	function P:leave(player)
		local i = table.find(self.list, player)
		if i then
			table.remove(self.list, i)
			self.PlayerRemoving:Fire(player)
			player.Parent = nil
		end
	end
	return P
end

function Sim.new(backend: any, opts: any): any
	local self = setmetatable({}, Sim)
	assert(opts.load and opts.task and opts.encode, "ServerSim needs opts.load (luau.load), opts.task, opts.encode")
	self.backend = backend
	self.task = opts.task
	self.load = opts.load
	self.jobId = opts.jobId or "job"
	self.placeId = opts.placeId or 1
	self.clockSkew = opts.clockSkew or 0
	self.closing = {}
	self.alive = true
	self.Players = fakePlayers(self)
	self.server = backend:server({
		jobId = self.jobId,
		players = function()
			return #self.Players.list
		end,
	})
	local task = self.task
	local guidRng = 0
	local services = {
		DataStoreService = self.server.DataStoreService,
		MessagingService = self.server.MessagingService,
		Players = self.Players,
		RunService = {
			Heartbeat = signal(task),
			IsStudio = function()
				return opts.studio == true
			end,
			IsServer = function()
				return true
			end,
			IsClient = function()
				return false
			end,
		},
		HttpService = {
			GenerateGUID = function(_, braces)
				guidRng += 1
				local s = string.format("%08X-%04X-4%03X-A%03X-%012X", math.random(0, 0x7fffffff), guidRng % 0x10000, math.random(0, 0xfff), math.random(0, 0xfff), math.random(0, 0x7fffffff))
				return if braces == false then s else "{" .. s .. "}"
			end,
			JSONEncode = function(_, v)
				return opts.encode(v)
			end,
		},
		MarketplaceService = { ProcessReceipt = nil },
	}
	self.services = services
	local game = {
		PlaceId = self.placeId,
		JobId = self.jobId,
		GetService = function(_, name)
			local svc = services[name]
			assert(svc, "ServerSim: no fake for service " .. tostring(name))
			return svc
		end,
		BindToClose = function(_, fn)
			table.insert(self.closing, fn)
		end,
	}
	local simOs = table.clone(os)
	simOs.time = function(t)
		if t ~= nil then
			return os.time(t)
		end
		return math.floor(backend:now() + self.clockSkew)
	end
	-- SortDirection items pass ProfileStore's VersionQuery check (typeof "EnumItem", EnumType match).
	local sortDirection = {}
	for _, name in ipairs({ "Ascending", "Descending" }) do
		sortDirection[name] = setmetatable({ Name = name, EnumType = sortDirection }, ENUM_ITEM)
	end
	local enum = {
		SortDirection = sortDirection,
		ProductPurchaseDecision = { PurchaseGranted = "PurchaseGranted", NotProcessedYet = "NotProcessedYet" },
	}
	self.globals = {
		game = game,
		task = task,
		os = simOs,
		Enum = enum,
		typeof = simTypeof,
		Instance = {
			new = function(className)
				local o = { ClassName = className }
				function o:SetExperimentalFeatures() end
				function o:SetMetadata(md)
					self.Metadata = md
				end
				function o:GetMetadata()
					return self.Metadata or {}
				end
				return o
			end,
		},
		shared = {},
	}
	task.spawn(function()
		local last = os.clock()
		while self.alive do
			task.wait(1 / 60)
			local now = os.clock()
			services.RunService.Heartbeat:Fire(now - last)
			last = now
		end
	end)
	return self
end

-- Load a module source with this server's globals. `name` becomes script.Name.
function Sim:require(source, name, extra)
	local env = setmetatable(table.clone(self.globals), { __index = STD })
	env.script = { Name = name or "Module" }
	for k, v in pairs(extra or {}) do
		env[k] = v
	end
	local fn = self.load(source, { debugName = (name or "Module") .. "@" .. self.jobId, environment = env })
	return fn()
end

-- Graceful shutdown: BindToClose callbacks run in parallel; the engine allows 30 s.
function Sim:shutdown(budget)
	budget = budget or 30
	local task = self.task
	local pending = #self.closing
	for _, fn in ipairs(self.closing) do
		task.spawn(function()
			fn()
			pending -= 1
		end)
	end
	local t0 = os.clock()
	while pending > 0 and os.clock() - t0 < budget do
		task.wait(0.02)
	end
	self.alive = false
	return pending == 0, os.clock() - t0
end

function Sim:crash()
	self.alive = false
	self.server:crash()
end

function Sim:stop()
	self.alive = false
end

return Sim
