--!nonstrict
-- PlayerData: ProfileStore session wiring for players, with schema migration in the right place.
-- Dependencies are passed in, so the same module runs in a live server, in a Studio playtest of an
-- unpublished place (ProfileStore's own mock), and in Lune against MockDataStore.
--
--   local data = PlayerData.new({
--       ProfileStore = require(ServerScriptService.Packages.ProfileStore),
--       Players = game:GetService("Players"),
--       storeName = "PlayerData",
--       template = { SchemaVersion = 3, Coins = 0, Inventory = {}, PurchaseIds = {} },
--       migrate = Migrate.new({ latest = 3, steps = { ... } }),
--       onLoaded = function(player, profile) trade:Recover(profile) end,
--       beforeEnd = function(player, profile) trade:Recover(profile) end,
--   })
--   data:Start()
--   local profile = data:WaitForProfile(player, 10)
--   data:Restore("Player_" .. userId, os.time() - 3 * 3600)   -- rollback, see Restore
--
-- Order on join (ProfileStore docs; Rileybytes m2SP_TLeWHI; MonzterDEV evBhoqeYegQ):
--   StartSessionAsync with Cancel -> nil means kick -> AddUserId -> migrate -> Reconcile ->
--   OnSessionEnd kicks -> keep only if the player is still here, else EndSession at once.
-- Migrate runs before Reconcile: Reconcile writes the template's SchemaVersion into old data.
-- Data written by a newer build ("newer") is left untouched and the player is sent away.

local PlayerData = {}
PlayerData.__index = PlayerData

PlayerData.MESSAGES = {
	loadFailed = "Your data could not be loaded. Please rejoin.",
	sessionEnded = "Your data was opened on another server. Please rejoin.",
	newer = "This server is out of date. Please rejoin to get the latest version.",
	migrationFailed = "Your data needs an update that failed. Please rejoin; nothing was lost.",
}

function PlayerData.new(opts: any): any
	local self = setmetatable({}, PlayerData)
	assert(opts.ProfileStore and opts.Players and opts.template, "PlayerData.new: ProfileStore, Players, template required")
	self.Players = opts.Players
	self.store = opts.ProfileStore.New(opts.storeName or "PlayerData", opts.template)
	if opts.useMock then
		self.store = self.store.Mock
	end
	self.migrate = opts.migrate
	self.keyFor = opts.keyFor or function(player)
		return "Player_" .. player.UserId
	end
	self.onLoaded = opts.onLoaded
	-- (player, profile) on PlayerRemoving, before EndSession; may yield (resolve a pending trade).
	self.beforeEnd = opts.beforeEnd
	self.messages = setmetatable(opts.messages or {}, { __index = PlayerData.MESSAGES })
	local taskLib = opts.task or task -- Lune: pass require("@lune/task")
	self.wait = opts.wait or taskLib.wait
	self.spawn = taskLib.spawn
	self.Profiles = {}
	self.stats = { loaded = 0, kicked = 0, leftEarly = 0, migrated = 0, newer = 0, ended = 0 }
	return self
end

local function present(self, player)
	return player.Parent == self.Players
end

function PlayerData:_kick(player, message)
	self.stats.kicked += 1
	if present(self, player) then
		player:Kick(message)
	end
end

function PlayerData:_load(player)
	local profile = self.store:StartSessionAsync(self.keyFor(player), {
		Cancel = function()
			return not present(self, player)
		end,
	})
	if profile == nil then
		-- Another server kept the session, DataStores are down, or the player left (Cancel).
		self:_kick(player, self.messages.loadFailed)
		return
	end
	profile:AddUserId(player.UserId)
	if self.migrate then
		local status = self.migrate:run(profile.Data)
		if status == "newer" or status == "error" then
			-- Data is left as loaded (Migrate edits a copy); EndSession saves it back unchanged.
			if status == "newer" then
				self.stats.newer += 1
			end
			profile:EndSession()
			self:_kick(player, if status == "newer" then self.messages.newer else self.messages.migrationFailed)
			return
		elseif status == "migrated" then
			self.stats.migrated += 1
		end
	end
	profile:Reconcile()
	profile.OnSessionEnd:Connect(function()
		self.stats.ended += 1
		self.Profiles[player] = nil
		self:_kick(player, self.messages.sessionEnded)
	end)
	if not present(self, player) then
		-- Left while loading: release at once so the next server can load.
		self.stats.leftEarly += 1
		profile:EndSession()
		return
	end
	self.Profiles[player] = profile
	self.stats.loaded += 1
	if self.onLoaded then
		self.onLoaded(player, profile)
	end
end

function PlayerData:Start()
	self.Players.PlayerAdded:Connect(function(player)
		self:_load(player)
	end)
	-- Players who joined before this script connected PlayerAdded.
	for _, player in ipairs(self.Players:GetPlayers()) do
		self.spawn(self._load, self, player)
	end
	self.Players.PlayerRemoving:Connect(function(player)
		local profile = self.Profiles[player]
		if profile ~= nil then
			if self.beforeEnd then
				-- A joining server may take the session while this yields; its load recovers the same way.
				pcall(self.beforeEnd, player, profile)
			end
			profile:EndSession()
		end
	end)
	return self
end

-- Rollback: overwrite `key` with the newest version saved at or before `before` (Unix seconds).
-- Restore points: one per key per UTC hour (that hour's last write), kept 30 days after being
-- overwritten. A key some server holds is refused unless opts.force; with force, the holder's
-- next save ends its session (its player is kicked) and the restored data stays.
-- ProfileStore's mock mode (unpublished place) has no versions: the result is "no version".
function PlayerData:Restore(key, before, opts)
	opts = opts or {}
	local current = self.store:GetAsync(key)
	if current ~= nil and current.Session ~= nil and not opts.force then
		return false, "in use"
	end
	local descending = opts.descending or Enum.SortDirection.Descending
	local version = self.store:VersionQuery(key, descending, nil, math.floor(before * 1000)):NextAsync()
	if version == nil then
		return false, "no version"
	end
	version:SetAsync()
	return true, version.KeyInfo and version.KeyInfo.Version
end

-- Yields until the profile is loaded, the player leaves, or `timeout` seconds pass.
function PlayerData:WaitForProfile(player, timeout)
	local t0 = os.clock()
	while self.Profiles[player] == nil and present(self, player) and os.clock() - t0 < (timeout or 30) do
		self.wait()
	end
	return self.Profiles[player]
end

return PlayerData
