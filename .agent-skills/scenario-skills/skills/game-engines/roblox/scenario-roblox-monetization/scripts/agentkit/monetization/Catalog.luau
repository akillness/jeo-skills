--!nonstrict
-- Catalog: every developer product, pass and subscription in one server table, with grants as
-- pure functions over the player's saved data. Pure Luau (no services): inline it, require it,
-- or run it in Lune.
--
--   local catalog = Catalog.new({
--       products = {
--           Coins100 = { id = 1001, kind = "currency", currency = "Coins", amount = 100 },
--           Starter = { id = 1002, kind = "bundle", oncePerAccount = true,
--               currencies = { Coins = 250 }, items = { "Sword" }, fallback = { Coins = 250 } },
--           AdGems = { id = 1003, kind = "adReward", currency = "Gems", amount = 10 },
--       },
--       passes = { VIP = { id = 2001, perk = "vip" } },
--       subscriptions = { Club = { id = "EXP-1234", perk = "club" } },
--   })
--   catalog:validate()   -> findings {severity, rule, message}; gate on no "error"
--   catalog:handlers()   -> { [productId] = function(data, receipt) -> true } for data's Receipts
--   catalog:takeEvents(purchaseId) -> economy events of a NEW grant (nil for a duplicate)
--
-- Grants never yield and never touch Instances: Receipts runs them on a copy of the data and
-- keeps the copy only when they return true. Prices are not stored here: the engine owns them
-- (GetProductInfoAsync), so price tests, regional prices and Plus discounts keep working.

local Catalog = {}
Catalog.__index = Catalog

local KINDS = { currency = true, bundle = true, adReward = true, custom = true }

function Catalog.new(def: any): any
	local self = setmetatable({}, Catalog)
	self.products = def.products or {}
	self.passes = def.passes or {}
	self.subscriptions = def.subscriptions or {}
	self.byId = {}
	for name, p in pairs(self.products) do
		p.name = p.name or name
		self.byId[p.id] = p
	end
	self.pending = {}
	return self
end

local function addCurrency(data, events, currency, amount, purchase)
	data[currency] = (data[currency] or 0) + amount
	table.insert(events, {
		flow = "Source",
		currency = currency,
		amount = amount,
		endingBalance = data[currency],
		transactionType = purchase.transactionType,
		sku = purchase.sku,
	})
end

local function applyBundle(data, events, currencies, items, purchase)
	for currency, amount in pairs(currencies or {}) do
		addCurrency(data, events, currency, amount, purchase)
	end
	if items and #items > 0 then
		data.Inventory = data.Inventory or {}
		for _, item in ipairs(items) do
			table.insert(data.Inventory, item)
		end
	end
end

-- The grant for one product, as Receipts expects: fn(data, receipt) -> true.
function Catalog:grantFor(p)
	return function(data, receipt)
		local events = {}
		local purchase = {
			transactionType = if p.kind == "adReward" then "AdReward" else "IAP",
			sku = p.sku or p.name,
		}
		if p.kind == "currency" or p.kind == "adReward" then
			addCurrency(data, events, p.currency, p.amount, purchase)
		elseif p.kind == "bundle" then
			data.Owned = data.Owned or {}
			if p.oncePerAccount and data.Owned[p.name] then
				-- Bought again (Store tab, second prompt): the money is spent, so grant the fallback.
				applyBundle(data, events, p.fallback, nil, purchase)
			else
				applyBundle(data, events, p.currencies, p.items, purchase)
				data.Owned[p.name] = true
			end
		elseif p.kind == "custom" then
			if p.grant(data, receipt, events) ~= true then
				return false
			end
		end
		self.pending[receipt.PurchaseId] = events
		return true
	end
end

function Catalog:handlers()
	local map = {}
	for _, p in pairs(self.products) do
		map[p.id] = self:grantFor(p)
	end
	return map
end

-- Events recorded by a grant that ran in this server; nil for duplicates and unknown ids.
function Catalog:takeEvents(purchaseId)
	local events = self.pending[purchaseId]
	self.pending[purchaseId] = nil
	return events
end

-- Static checks of the definitions. Severity "error" blocks a launch.
function Catalog:validate()
	local findings = {}
	local function add(severity, rule, message)
		table.insert(findings, { severity = severity, rule = rule, message = message })
	end
	local ids = {}
	local function claim(id, where)
		if ids[id] then
			add("error", "duplicate-id", string.format("%s reuses id %s from %s", where, tostring(id), ids[id]))
		end
		ids[id] = where
	end
	for name, p in pairs(self.products) do
		local where = "product " .. name
		if type(p.id) ~= "number" or p.id <= 0 or p.id % 1 ~= 0 then
			add("error", "bad-id", where .. ": id must be a positive integer developer product id")
		else
			claim(p.id, where)
		end
		if not KINDS[p.kind] then
			add("error", "bad-kind", where .. ": kind must be currency, bundle, adReward or custom")
		end
		if (p.kind == "currency" or p.kind == "adReward") and (type(p.currency) ~= "string" or type(p.amount) ~= "number" or p.amount <= 0) then
			add("error", "bad-grant", where .. ": currency and a positive amount are required")
		end
		if p.kind == "bundle" and p.oncePerAccount and not p.fallback then
			add("error", "no-fallback", where .. ": a once-per-account bundle bought twice still needs a grant (fallback)")
		end
		if p.kind == "custom" and type(p.grant) ~= "function" then
			add("error", "bad-grant", where .. ": custom products need grant(data, receipt, events) -> true")
		end
		if p.kind == "adReward" and (p.odds or p.random) then
			add("error", "random-ad-reward", where .. ": rewarded video rewards cannot be random")
		end
		if p.price or p.priceInRobux then
			add("warn", "price-in-catalog", where .. ": prices come from GetProductInfoAsync at display time, never from code")
		end
		if p.odds then
			add("info", "paid-random", where .. ": paid random item: odds on screen before purchase, policy gate per player")
		end
	end
	for name, p in pairs(self.passes) do
		if type(p.id) ~= "number" or p.id <= 0 then
			add("error", "bad-id", "pass " .. name .. ": id must be a positive integer pass id")
		else
			claim(p.id, "pass " .. name)
		end
	end
	for name, s in pairs(self.subscriptions) do
		if type(s.id) ~= "string" or not s.id:match("^EXP%-%d+$") then
			add("error", "bad-id", "subscription " .. name .. ": id is a string like EXP-1234567890")
		end
	end
	return findings
end

-- Ids checked against the engine. fetch(id, kind) returns info or nil, err; kind is "product" or
-- "pass". A mistyped pass id can resolve to another creator's pass (live test), so the creator is
-- compared when the info carries one. creatorId: game.CreatorId in a published server.
-- A blank description is a warning: items without a name, description and thumbnail may be left
-- out of Home and Search recommendations (RDC 2026); `Description` is nil when blank (reference).
-- Status: tested in Lune and Studio (catalog suite, L2); in Studio it fired on a real answer for
-- another creator's pass (L16). Not yet run on your own items: needs a published game with real items.
-- Thumbnails are checked in Creator Hub only.
function Catalog:verify(fetch, creatorId)
	local findings = {}
	local function check(kind, name, id)
		local info, err = fetch(id, kind)
		if type(info) ~= "table" then
			table.insert(findings, { severity = "error", rule = "unknown-id", message = string.format("%s %s (%s): %s", kind, name, tostring(id), tostring(err)) })
			return
		end
		local creator = info.Creator and (info.Creator.CreatorTargetId or info.Creator.Id)
		if creatorId and creator ~= nil and creator ~= creatorId then
			table.insert(findings, { severity = "error", rule = "foreign-id", message = string.format("%s %s (%s) resolves to %q from another creator", kind, name, tostring(id), tostring(info.Name)) })
		end
		if type(info.Description) ~= "string" or not info.Description:match("%S") then
			table.insert(findings, { severity = "warn", rule = "no-description", message = string.format("%s %s (%s) has no description: set name, description and thumbnail in Creator Hub", kind, name, tostring(id)) })
		end
	end
	for name, p in pairs(self.products) do
		check("product", name, p.id)
	end
	for name, p in pairs(self.passes) do
		check("pass", name, p.id)
	end
	return findings
end

return Catalog
