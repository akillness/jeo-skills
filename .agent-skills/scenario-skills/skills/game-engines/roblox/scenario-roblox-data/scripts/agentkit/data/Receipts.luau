--!nonstrict
-- Receipts: an idempotent MarketplaceService.ProcessReceipt over session-locked profiles
-- (ProfileStore or anything with Data, LastSavedData, IsActive, Save, OnAfterSave).
--
--   local receipts = Receipts.new({
--       getProfile = function(userId) return PlayerData.Profiles[Players:GetPlayerByUserId(userId)] end,
--       isPresent = function(userId) return Players:GetPlayerByUserId(userId) ~= nil end,
--       handlers = { [PRODUCT_100_COINS] = function(data, receipt) data.Coins += 100 return true end },
--   })
--   MarketplaceService.ProcessReceipt = function(info) return receipts:Process(info) end
--
-- Order of operations (Roblox player-data-purchasing doc; Rileybytes 8FIj3gmP5Ls; ProfileStore docs):
--   1. wait for the profile while the buyer is in this server (the callback fires right at join);
--   2. if the PurchaseId is not in the profile's log: grant and log it in the same step, no yield;
--   3. return PurchaseGranted only once LastSavedData (what the DataStore holds) contains the id;
--   4. every other path returns NotProcessedYet, and Roblox calls again later (rejoin included).
-- Handlers must not yield: a yield lets the session end between the grant and the log entry.
-- Handlers get a copy of Data: nested tables of profile.Data are new tables after a grant.

local Receipts = {}
Receipts.__index = Receipts

local function defaultDecisions()
	local ok, e = pcall(function()
		return Enum.ProductPurchaseDecision
	end)
	if ok and e then
		return { granted = e.PurchaseGranted, notYet = e.NotProcessedYet }
	end
	return { granted = "PurchaseGranted", notYet = "NotProcessedYet" }
end

function Receipts.new(opts: any): any
	local self = setmetatable({}, Receipts)
	assert(type(opts.getProfile) == "function", "Receipts.new: getProfile(userId) required")
	assert(type(opts.handlers) == "table", "Receipts.new: handlers {[productId] = fn(data, receipt) -> true} required")
	self.getProfile = opts.getProfile
	self.isPresent = opts.isPresent or function()
		return true
	end
	self.handlers = opts.handlers
	self.logField = opts.logField or "PurchaseIds"
	self.logMax = opts.logMax or 100
	self.waitProfileSeconds = opts.waitProfileSeconds or 60
	self.saveTimeout = opts.saveTimeout or 15
	self.retryDelay = opts.retryDelay or 10
	local taskLib = opts.task or task -- Lune: pass require("@lune/task")
	self.wait = opts.wait or taskLib.wait
	self.spawn = taskLib.spawn
	self.clock = opts.clock or os.clock
	self.decisions = opts.decisions or defaultDecisions()
	self.log = opts.log or function() end
	self.stats = { granted = 0, duplicate = 0, notYet = 0, handlerErrors = 0, saves = 0 }
	return self
end

local function deepCopy(v)
	if type(v) ~= "table" then
		return v
	end
	local out = {}
	for k, x in pairs(v) do
		out[k] = deepCopy(x)
	end
	return out
end

local function inLog(t, field, id)
	local log = t and t[field]
	return type(log) == "table" and table.find(log, id) ~= nil
end

function Receipts:_notYet(reason, info)
	self.stats.notYet += 1
	self.log("NotProcessedYet", reason, info and info.PurchaseId)
	return self.decisions.notYet
end

-- Save now, then wait for OnAfterSave (connected first) or a timeout.
function Receipts:_saveAndWait(profile)
	local done = false
	local conn = profile.OnAfterSave:Connect(function()
		done = true
	end)
	profile:Save()
	local t0 = self.clock()
	while not done and self.clock() - t0 < self.saveTimeout and profile:IsActive() do
		self.wait(0.05)
	end
	conn:Disconnect()
	return done
end

function Receipts:Process(info)
	local userId, id = info.PlayerId, info.PurchaseId
	local profile = self.getProfile(userId)
	local t0 = self.clock()
	while profile == nil and self.isPresent(userId) and self.clock() - t0 < self.waitProfileSeconds do
		self.wait()
		profile = self.getProfile(userId)
	end
	if profile == nil then
		return self:_notYet("no profile (player absent or not loaded)", info)
	end
	if not profile:IsActive() then
		return self:_notYet("session ended", info)
	end
	local data = profile.Data
	if not inLog(data, self.logField, id) then
		local handler = self.handlers[info.ProductId]
		if handler == nil then
			return self:_notYet("no handler for product " .. tostring(info.ProductId), info)
		end
		-- The handler edits a copy; the copy replaces Data's fields only if it finished without
		-- yielding or erroring, so a failed grant leaves nothing half-applied.
		local draft = deepCopy(data)
		local co = coroutine.create(handler)
		local ok, granted = coroutine.resume(co, draft, info)
		if coroutine.status(co) ~= "dead" then
			coroutine.close(co) -- the scheduler must not resume it later
			self.stats.handlerErrors += 1
			return self:_notYet("handler yielded: grants must not yield", info)
		end
		if not ok or granted ~= true then
			self.stats.handlerErrors += 1
			return self:_notYet("handler failed: " .. tostring(granted), info)
		end
		for k in pairs(data) do
			data[k] = nil
		end
		for k, v in pairs(draft) do
			data[k] = v
		end
		local log = data[self.logField]
		if type(log) ~= "table" then
			log = {}
			data[self.logField] = log
		end
		table.insert(log, id)
		while #log > self.logMax do
			table.remove(log, 1)
		end
		self.stats.granted += 1
	else
		self.stats.duplicate += 1
	end
	-- Confirm persistence: PurchaseGranted only when the DataStore copy holds the id.
	while profile:IsActive() do
		if inLog(profile.LastSavedData, self.logField, id) then
			return self.decisions.granted
		end
		self.stats.saves += 1
		self:_saveAndWait(profile)
		if inLog(profile.LastSavedData, self.logField, id) then
			return self.decisions.granted
		end
		self.wait(self.retryDelay)
	end
	return self:_notYet("session ended before the save was confirmed", info)
end

return Receipts
