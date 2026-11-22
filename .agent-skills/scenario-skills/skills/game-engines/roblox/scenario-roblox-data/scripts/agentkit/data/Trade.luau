--!nonstrict
-- Trade: a crash-safe item swap between two session-locked profiles on the same server.
-- Neither DataStores nor ProfileStore offer a write across two keys: two profiles save
-- separately, so a crash between the two saves duplicates or loses items. This module adds
-- an escrow and a single commit record (one key in a trade log store) that decides the outcome.
--
--   local trade = Trade.new({ log = KeyQueue.new(DataStoreService:GetDataStore("TradeLog")),
--                             guid = function() return HttpService:GenerateGUID(false) end })
--   if Trade.paidTradingAllowed(PolicyService, playerA) and Trade.paidTradingAllowed(PolicyService, playerB) then
--       local status = trade:Execute(profileA, profileB, { Sword = 1 }, { Shield = 1 })
--   end
--   -- on every profile load, after migration and Reconcile:
--   trade:Recover(profile)
--
-- Protocol:
--   1. escrow (no yield): take each side's offer out of its inventory into Data.PendingTrade;
--   2. save both profiles and wait until LastSavedData of both holds the escrow;
--   3. commit: log:UpdateAsync(id, old or "committed"); whatever value is stored is the outcome;
--   4. resolve (no yield): "committed" gives each side the other's offer, "aborted" returns it.
--   Recovery on load: log:UpdateAsync(id, old or "aborted"), then resolve. The first writer of the
--   record wins, so a server that commits and a server that recovers always agree.
-- Inventory shape: Data[field] maps item id (string) to a count (number).

local Trade = {}
Trade.__index = Trade

function Trade.new(opts: any): any
	local self = setmetatable({}, Trade)
	assert(opts.log, "Trade.new: log (a KeyQueue over the trade log DataStore) required")
	assert(type(opts.guid) == "function", "Trade.new: guid() required")
	self.log = opts.log
	self.guid = opts.guid
	self.field = opts.field or "Inventory"
	self.saveTimeout = opts.saveTimeout or 15
	local taskLib = opts.task or task -- Lune: pass require("@lune/task")
	self.wait = opts.wait or taskLib.wait
	self.spawn = taskLib.spawn
	self.clock = opts.clock or os.clock
	self.onStage = opts.onStage or function() end -- (stage, id): "escrowed", "saved", "decided", "resolved"
	self.stats = { committed = 0, aborted = 0, pending = 0, invalid = 0, recovered = 0 }
	return self
end

-- True while a trade holds items of this profile in escrow: block other trades and spending.
function Trade.locked(data: any): boolean
	return data.PendingTrade ~= nil
end

-- Paid-item trading policy for one player (PolicyService:GetPolicyInfoForPlayerAsync). Call it
-- for both players before Execute. Fails closed: an error or a missing field counts as not allowed.
function Trade.paidTradingAllowed(policyService: any, player: any): boolean
	local ok, info = pcall(policyService.GetPolicyInfoForPlayerAsync, policyService, player)
	return ok and type(info) == "table" and info.IsPaidItemTradingAllowed == true
end

local function has(inv, offer)
	for item, n in pairs(offer) do
		if type(n) ~= "number" or n <= 0 or n % 1 ~= 0 then
			return false, "bad count for " .. tostring(item)
		end
		if (inv[item] or 0) < n then
			return false, "missing " .. tostring(item)
		end
	end
	return true
end

local function add(inv, items, sign)
	for item, n in pairs(items) do
		local v = (inv[item] or 0) + sign * n
		inv[item] = if v == 0 then nil else v
	end
end

function Trade:_inventory(data)
	local inv = data[self.field]
	if type(inv) ~= "table" then
		inv = {}
		data[self.field] = inv
	end
	return inv
end

-- Apply the logged outcome to one profile and clear its escrow. No yield.
function Trade:_resolve(data, outcome)
	local p = data.PendingTrade
	if p == nil then
		return
	end
	local inv = self:_inventory(data)
	if outcome == "committed" then
		add(inv, p.Get, 1)
	else
		add(inv, p.Give, 1)
	end
	data.PendingTrade = nil
end

local function savedHolds(profile, id)
	local saved = profile.LastSavedData
	return saved ~= nil and saved.PendingTrade ~= nil and saved.PendingTrade.Id == id
end

-- Save every profile and wait until each saved copy holds the escrow `id`.
function Trade:_saveAll(profiles, id)
	for _, profile in ipairs(profiles) do
		profile:Save()
	end
	local t0 = self.clock()
	while self.clock() - t0 < self.saveTimeout do
		local all = true
		for _, profile in ipairs(profiles) do
			if not profile:IsActive() then
				return false -- a session ended mid-trade: abort
			elseif not savedHolds(profile, id) then
				all = false
			end
		end
		if all then
			return true
		end
		self.wait(0.05)
	end
	return false
end

-- Returns "committed" | "aborted" | "pending" (outcome unknown: escrow kept, Recover later) | "invalid", reason.
function Trade:Execute(profileA, profileB, offerA, offerB)
	if profileA == profileB or not profileA:IsActive() or not profileB:IsActive() then
		self.stats.invalid += 1
		return "invalid", "both profiles must be active and distinct"
	end
	local a, b = profileA.Data, profileB.Data
	if Trade.locked(a) or Trade.locked(b) then
		self.stats.invalid += 1
		return "invalid", "a trade is already pending"
	end
	local okA, whyA = has(self:_inventory(a), offerA)
	local okB, whyB = has(self:_inventory(b), offerB)
	if not okA or not okB then
		self.stats.invalid += 1
		return "invalid", whyA or whyB
	end
	-- 1. escrow both sides in one step (no yield between the two edits)
	local id = self.guid()
	add(self:_inventory(a), offerA, -1)
	add(self:_inventory(b), offerB, -1)
	a.PendingTrade = { Id = id, Give = table.clone(offerA), Get = table.clone(offerB) }
	b.PendingTrade = { Id = id, Give = table.clone(offerB), Get = table.clone(offerA) }
	self.onStage("escrowed", id)
	-- 2. both escrows durable, or abort
	local wanted = if self:_saveAll({ profileA, profileB }, id) then "committed" else "aborted"
	self.onStage("saved", id, wanted)
	-- 3. one record decides
	local ok, stored = self.log:UpdateAsync(id, function(old)
		return old or wanted
	end, function(v)
		return v == "committed" or v == "aborted"
	end)
	if not ok or (stored ~= "committed" and stored ~= "aborted") then
		self.stats.pending += 1
		return "pending", tostring(stored)
	end
	self.onStage("decided", id, stored)
	-- 4. resolve the profiles this server still owns; the others resolve in Recover on load
	for _, profile in ipairs({ profileA, profileB }) do
		if profile:IsActive() then
			self:_resolve(profile.Data, stored)
			profile:Save()
		end
	end
	self.stats[stored] += 1
	self.onStage("resolved", id, stored)
	return stored
end

-- Call after loading a profile (after migration and Reconcile). Returns "none" | "committed" | "aborted" | "pending".
function Trade:Recover(profile)
	local p = profile.Data.PendingTrade
	if p == nil then
		return "none"
	end
	local ok, stored = self.log:UpdateAsync(p.Id, function(old)
		return old or "aborted"
	end, function(v)
		return v == "committed" or v == "aborted"
	end)
	if not ok or (stored ~= "committed" and stored ~= "aborted") then
		return "pending"
	end
	if profile:IsActive() and profile.Data.PendingTrade and profile.Data.PendingTrade.Id == p.Id then
		self:_resolve(profile.Data, stored)
		profile:Save()
		self.stats.recovered += 1
	end
	return stored
end

return Trade
