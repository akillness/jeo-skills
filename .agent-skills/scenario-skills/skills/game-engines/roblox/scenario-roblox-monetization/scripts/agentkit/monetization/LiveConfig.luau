--!nonstrict
-- LiveConfig: ConfigService with typed defaults, refresh on update, experiment enrollment at the
-- point of exposure, and a client mirror through Player attributes. Server only: ConfigService
-- errors in client scripts (configs doc).
--
--   local live = LiveConfig.new({ service = ConfigService, http = HttpService, defaults = {
--       ["shop.starterOffer.enabled"] = false, ["shop.starterOffer.discount"] = 0,
--       ["shop.layout"] = { tabs = { "Coins", "Passes" } } } })
--   live:start()                                   -- global snapshot; never throws
--   live:get("shop.starterOffer.enabled")          -- no experiment, no enrollment
--   live:forPlayer(player, "shop.starterOffer.discount")  -- enrolls in an experiment on this key
--   live:publish(player, { "shop.layout" })        -- attributes for the client, then cfgReady
--   LiveConfig.read(player, "shop.layout", default) -- client side
--
-- A value whose type differs from its default is ignored (a config typed "10" for a number
-- falls back to the default and counts in `stats.typeMismatch`).

local LiveConfig = {}
LiveConfig.__index = LiveConfig

local READY = "cfgReady"
LiveConfig.READY = READY

-- Attribute names allow letters, digits, periods, hyphens, slashes and underscores, 100 characters
-- at most (SetAttribute reference; spaces error in Studio). "shop.layout" -> "cfg_shop.layout".
function LiveConfig.attributeName(key)
	local name = "cfg_" .. key:gsub("[^%w%._%-/]", "_")
	assert(#name <= 100, "config key too long for an attribute name: " .. key)
	return name
end

function LiveConfig.new(opts: any): any
	local self = setmetatable({}, LiveConfig)
	self.service = opts.service
	self.http = opts.http
	self.defaults = opts.defaults or {}
	self.snapshot = nil
	self.players = {} -- [player] = snapshot
	self.version = 0
	self.listeners = {}
	self.task = opts.task or task -- Lune: pass require("@lune/task")
	self.stats = { loadErrors = 0, typeMismatch = 0, missing = 0, refreshes = 0 }
	self.lastError = nil
	return self
end

local function sameType(value, default)
	if default == nil then
		return true
	end
	return type(value) == type(default)
end

function LiveConfig:_value(snapshot, key)
	local default = self.defaults[key]
	if snapshot == nil then
		return default, "default"
	end
	local ok, v = pcall(function()
		return snapshot:GetValue(key)
	end)
	if not ok or v == nil then
		self.stats.missing += 1
		return default, "default"
	end
	if not sameType(v, default) then
		self.stats.typeMismatch += 1
		return default, "default"
	end
	return v, "config"
end

function LiveConfig:_watch(snapshot, onUpdate)
	local ok = pcall(function()
		snapshot.UpdateAvailable:Connect(function()
			local refreshed = pcall(function()
				snapshot:Refresh()
			end)
			if refreshed then
				self.stats.refreshes += 1
				self.version += 1
				onUpdate()
			end
		end)
	end)
	return ok
end

-- Loads the global snapshot. Returns true when configs loaded, false when running on defaults.
function LiveConfig:start()
	local ok, snapshot = pcall(function()
		return self.service:GetConfigAsync()
	end)
	if not ok then
		self.stats.loadErrors += 1
		self.lastError = tostring(snapshot)
		return false
	end
	self.snapshot = snapshot
	self:_watch(snapshot, function()
		for _, fn in ipairs(self.listeners) do
			self.task.spawn(fn)
		end
	end)
	return true
end

function LiveConfig:onUpdate(fn)
	table.insert(self.listeners, fn)
end

function LiveConfig:get(key)
	return (self:_value(self.snapshot, key))
end

-- Player snapshot, created on first use. Enrollment in an experiment happens on the first GetValue
-- of a key, so call this where the player meets the feature, not at join.
function LiveConfig:forPlayer(player, key)
	local snapshot = self.players[player]
	if snapshot == nil then
		local ok, s = pcall(function()
			return self.service:GetConfigForPlayerAsync(player)
		end)
		if ok then
			snapshot = s
			self.players[player] = s
			self:_watch(s, function()
				self:_republish(player)
			end)
		else
			self.stats.loadErrors += 1
			self.lastError = tostring(s)
			snapshot = false -- remembered: no retry storm for this player
			self.players[player] = false
		end
	end
	return (self:_value(snapshot or nil, key))
end

function LiveConfig:_encode(v)
	if type(v) == "table" then
		return if self.http then self.http:JSONEncode(v) else nil
	end
	return v
end

-- Mirrors keys to the player's attributes, then bumps cfgReady so the client knows they are set.
function LiveConfig:publish(player, keys, perPlayer)
	self.published = self.published or {}
	self.published[player] = { keys = keys, perPlayer = perPlayer }
	for _, key in ipairs(keys) do
		local v = if perPlayer then self:forPlayer(player, key) else self:get(key)
		player:SetAttribute(LiveConfig.attributeName(key), self:_encode(v))
	end
	player:SetAttribute(READY, self.version + 1)
end

function LiveConfig:_republish(player)
	local p = self.published and self.published[player]
	if p and player.Parent then
		self:publish(player, p.keys, p.perPlayer)
	end
end

function LiveConfig:forget(player)
	self.players[player] = nil
	if self.published then
		self.published[player] = nil
	end
end

-- Client: waits for cfgReady, then decodes. `http` decodes JSON tables when given.
function LiveConfig.read(player: any, key: string, default: any, http: any?, timeout: number?): any
	local deadline = os.clock() + (timeout or 10)
	while player:GetAttribute(READY) == nil and os.clock() < deadline do
		task.wait()
	end
	local v = player:GetAttribute(LiveConfig.attributeName(key))
	if v == nil then
		return default
	end
	if type(default) == "table" and type(v) == "string" and http then
		local ok, decoded = pcall(function()
			return http:JSONDecode(v)
		end)
		return if ok then decoded else default
	end
	if default ~= nil and type(v) ~= type(default) then
		return default
	end
	return v
end

return LiveConfig
