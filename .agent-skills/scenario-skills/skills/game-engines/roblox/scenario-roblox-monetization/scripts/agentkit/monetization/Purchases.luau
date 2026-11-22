--!nonstrict
-- Purchases: the one developer product receipt entry point of a server. It checks the receipt
-- shape, hands persistence and idempotency to the data layer's Receipts (scenario-roblox-data:
-- PurchaseId log in the profile, granted only once the saved copy holds the id), and logs economy
-- events for new grants only.
--
--   local purchases = Purchases.new({ receipts = receipts, catalog = catalog, telemetry = telemetry,
--       players = Players, places = nil })           -- places: optional { [placeId] = true }
--   purchases:bind(MarketplaceService)                -- BindReceiptHandler if present, else ProcessReceipt
--   purchases:process(receiptInfo)                    -- what the engine calls; tests call it directly
--
-- Decisions: Receipts answers with its own granted / notYet values; `process` maps them to
-- Enum.ReceiptDecision (BindReceiptHandler) or Enum.ProductPurchaseDecision (ProcessReceipt).
-- Engine callbacks cannot be read back (MarketplaceService.ProcessReceipt is write-only), so keep
-- this object to call `process` in tests.

local Purchases = {}
Purchases.__index = Purchases

local function enumOr(path, fallback)
	local ok, v = pcall(function()
		return path()
	end)
	return if ok and v ~= nil then v else fallback
end

function Purchases.new(opts: any): any
	assert(opts.receipts and opts.receipts.Process, "Purchases.new: receipts (data layer Receipts) required")
	local self = setmetatable({}, Purchases)
	self.receipts = opts.receipts
	self.catalog = opts.catalog
	self.telemetry = opts.telemetry
	self.players = opts.players
	self.places = opts.places
	self.mode = "unbound"
	self.stats = { calls = 0, malformed = 0, wrongPlace = 0, granted = 0, notYet = 0, events = 0 }
	self.log = opts.log or function() end
	return self
end

local function decisionsFor(mode)
	if mode == "BindReceiptHandler" then
		return {
			granted = enumOr(function()
				return Enum.ReceiptDecision.Processed
			end, "Processed"),
			notYet = enumOr(function()
				return Enum.ReceiptDecision.NotProcessedYet
			end, "NotProcessedYet"),
		}
	end
	return {
		granted = enumOr(function()
			return Enum.ProductPurchaseDecision.PurchaseGranted
		end, "PurchaseGranted"),
		notYet = enumOr(function()
			return Enum.ProductPurchaseDecision.NotProcessedYet
		end, "NotProcessedYet"),
	}
end

local function wellFormed(info)
	return type(info) == "table"
		and type(info.PurchaseId) == "string"
		and info.PurchaseId ~= ""
		and type(info.PlayerId) == "number"
		and type(info.ProductId) == "number"
end

-- Returns the engine decision for `mode` ("ProcessReceipt" default, or "BindReceiptHandler").
-- CurrencySpent is not checked: ad rewards arrive with channel AdReward, and price tests,
-- regional prices and Plus discounts change what each player pays.
function Purchases:process(info, mode)
	mode = mode or self.mode
	local d = decisionsFor(mode)
	self.stats.calls += 1
	if not wellFormed(info) then
		self.stats.malformed += 1
		self.log("malformed receipt")
		return d.notYet
	end
	if self.places and not self.places[info.PlaceIdWherePurchased] then
		-- Another place of the universe owns this product's grant; it is redelivered there on join.
		self.stats.wrongPlace += 1
		return d.notYet
	end
	local result = self.receipts:Process(info)
	local granted = result == self.receipts.decisions.granted
	if granted then
		self.stats.granted += 1
		local events = self.catalog and self.catalog:takeEvents(info.PurchaseId)
		if events and self.telemetry and self.players then
			local player = self.players:GetPlayerByUserId(info.PlayerId)
			if player then
				for _, e in ipairs(events) do
					self.telemetry:economy(player, e.flow, e.currency, e.amount, e.endingBalance, e.transactionType, e.sku)
					self.stats.events += 1
				end
			end
		end
		return d.granted
	end
	self.stats.notYet += 1
	return d.notYet
end

-- Binds once per server. A second catch-all BindReceiptHandler errors in the engine; a second
-- ProcessReceipt assignment silently replaces the first, so this module refuses it too.
function Purchases:bind(marketplace)
	assert(self.mode == "unbound", "Purchases:bind: already bound in this server")
	local ok, method = pcall(function()
		return marketplace.BindReceiptHandler
	end)
	if ok and method ~= nil then
		local receiptType = enumOr(function()
			return Enum.ReceiptType.DeveloperProduct
		end, "DeveloperProduct")
		self.connection = marketplace:BindReceiptHandler(receiptType, function(info)
			return self:process(info, "BindReceiptHandler")
		end)
		self.mode = "BindReceiptHandler"
	else
		marketplace.ProcessReceipt = function(info)
			return self:process(info, "ProcessReceipt")
		end
		self.mode = "ProcessReceipt"
	end
	return self.mode
end

return Purchases
