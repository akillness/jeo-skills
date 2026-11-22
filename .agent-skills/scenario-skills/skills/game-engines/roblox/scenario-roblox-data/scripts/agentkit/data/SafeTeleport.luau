--!nonstrict
-- SafeTeleport: the official "Handle failed teleports" pattern (pcall, 5 attempts, 1 s delay,
-- 15 s after Flooded) with two fixes, and an injected TeleportService so the logic runs in Lune.
--   * Party teleports reserve the server once (ReserveServerAsync) and reuse the access code
--     on every retry. Retrying with ShouldReserveServer = true reserves a NEW server, so a player
--     whose teleport failed lands alone. [added]
--   * TeleportInitFailed retries are capped per player; the doc sample retries without a cap. [added]
-- Teleports do not run in Studio playtests: everything past argument checks needs a published
-- experience. Teleport data is client-visible: never put currency or unlock flags in it.
--
--   local tp = SafeTeleport.new({ TeleportService = game:GetService("TeleportService") })
--   local ok, result = tp:Teleport(placeId, players)             -- public server
--   local ok2, result2 = tp:TeleportParty(placeId, players, data) -- same reserved server for all

local SafeTeleport = {}
SafeTeleport.__index = SafeTeleport

local MAX_GROUP = 50

local function newOptions()
	return Instance.new("TeleportOptions")
end

local function enumName(v)
	if typeof(v) == "EnumItem" then
		return v.Name
	end
	return tostring(v):match("([%w]+)$")
end

function SafeTeleport.new(opts: any): any
	local self = setmetatable({}, SafeTeleport)
	self.service = assert(opts.TeleportService, "SafeTeleport.new: TeleportService required")
	self.newOptions = opts.newOptions or newOptions
	self.attempts = opts.attempts or 5
	self.retryDelay = opts.retryDelay or 1
	self.floodDelay = opts.floodDelay or 15
	self.maxInitRetries = opts.maxInitRetries or 3
	local taskLib = opts.task or task -- Lune: pass require("@lune/task")
	self.wait = opts.wait or taskLib.wait
	self.spawn = taskLib.spawn
	self.log = opts.log or warn
	self.initRetries = {} -- [userId] = count
	self.stats = { calls = 0, failures = 0, initFailed = 0, initRetried = 0, initGaveUp = 0 }
	self.connection = self.service.TeleportInitFailed:Connect(function(...)
		self:_onInitFailed(...)
	end)
	return self
end

-- Exactly one of ReservedServerAccessCode, ServerInstanceId, ShouldReserveServer (combining errors).
function SafeTeleport.checkOptions(o: any): (boolean, string?)
	if o == nil then
		return true
	end
	local n = 0
	if o.ReservedServerAccessCode ~= nil and o.ReservedServerAccessCode ~= "" then
		n += 1
	end
	if o.ServerInstanceId ~= nil and o.ServerInstanceId ~= "" then
		n += 1
	end
	if o.ShouldReserveServer == true then
		n += 1
	end
	if n > 1 then
		return false, "set only one of ReservedServerAccessCode, ServerInstanceId, ShouldReserveServer"
	end
	return true
end

function SafeTeleport:_call(placeId, players, options)
	assert(type(players) == "table" and #players > 0, "players must be a non-empty array")
	assert(#players <= MAX_GROUP, "TeleportAsync takes at most 50 players per call")
	local okOpt, why = SafeTeleport.checkOptions(options)
	assert(okOpt, why)
	self.stats.calls += 1
	local ok, result
	for attempt = 1, self.attempts do
		ok, result = pcall(self.service.TeleportAsync, self.service, placeId, players, options)
		if ok then
			return true, result
		end
		if attempt < self.attempts then
			self.wait(self.retryDelay)
		end
	end
	self.stats.failures += 1
	self.log("SafeTeleport failed: " .. tostring(result))
	return false, result
end

function SafeTeleport:Teleport(placeId, players, options)
	return self:_call(placeId, players, options)
end

-- One reserved server for the whole party; the access code is reused by every retry.
function SafeTeleport:TeleportParty(placeId, players, teleportData)
	local okR, code = pcall(self.service.ReserveServerAsync, self.service, placeId)
	if not okR then
		self.stats.failures += 1
		return false, code
	end
	local options = self.newOptions()
	options.ReservedServerAccessCode = code
	if teleportData ~= nil then
		options:SetTeleportData(teleportData)
	end
	local ok, result = self:_call(placeId, players, options)
	return ok, result, code
end

function SafeTeleport:_onInitFailed(player, teleportResult, errorMessage, placeId, options)
	self.stats.initFailed += 1
	local name = enumName(teleportResult)
	local id = player.UserId
	local n = (self.initRetries[id] or 0) + 1
	if (name ~= "Flooded" and name ~= "Failure") or n > self.maxInitRetries then
		self.initRetries[id] = nil
		self.stats.initGaveUp += 1
		self.log(string.format("Teleport gave up for %d [%s]: %s", id, tostring(name), tostring(errorMessage)))
		return
	end
	self.initRetries[id] = n
	if options ~= nil and options.ShouldReserveServer == true then
		self.log("Teleport retry would reserve a new server: use TeleportParty to keep the party together")
	end
	self.wait(if name == "Flooded" then self.floodDelay else self.retryDelay)
	self.stats.initRetried += 1
	if player.Parent ~= nil then
		self:_call(placeId, { player }, options)
	end
end

function SafeTeleport:Destroy()
	self.connection:Disconnect()
end

return SafeTeleport
