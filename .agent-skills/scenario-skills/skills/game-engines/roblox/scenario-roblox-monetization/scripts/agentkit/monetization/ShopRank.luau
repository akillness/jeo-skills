--!nonstrict
-- ShopRank: shop order from MarketplaceService:RankProductsAsync, a personalized order of passes
-- and developer products. Client only: on the server it errors "Cannot be called from the Server."
-- (live). The reference sets a client throttle of 10 requests per minute and 50 items per call;
-- the developer-products page says to call it once at join. Any failure keeps the catalog order,
-- and items the ranking leaves out follow the ranked ones in catalog order [added].
-- Status (Studio 0.743, unpublished place, 2026-10-19): the module logic ran through the shoprank suite
-- (5 tests, engine answer faked) in Lune and in Studio (L2); fetch against the real engine ran in a
-- client (P5 block, L16): HTTP 400, catalog order kept. Not yet run: a real ranked answer, which
-- needs a published game.
--
--   local items = { { key = "Coins100", id = 1234567, infoType = Enum.InfoType.Product }, ... }
--   local order, err = ShopRank.fetch(MarketplaceService, items)   -- once per session, LocalScript
--   for i, item in order do rows[item.key].LayoutOrder = i end

local ShopRank = {}

ShopRank.MAX = 50 -- productIdentifiers per call (RankProductsAsync reference)

local function keyOf(infoType, id)
	return tostring(infoType) .. ":" .. tostring(id)
end

-- The productIdentifiers argument: { InfoType, Id } for the first 50 items.
function ShopRank.identifiers(items: { any }): { any }
	local out = {}
	for i, item in items do
		if i > ShopRank.MAX then
			break
		end
		table.insert(out, { InfoType = item.infoType, Id = item.id })
	end
	return out
end

-- Pure: items in ranked order, then the items the ranking did not return, in catalog order.
-- ranked: the RankProductsAsync answer (array of { ProductIdentifier = { InfoType, Id }, ... }) or nil.
function ShopRank.order(items: { any }, ranked: any): { any }
	local byKey, seen, out = {}, {}, {}
	for _, item in items do
		byKey[keyOf(item.infoType, item.id)] = item
	end
	if type(ranked) == "table" then
		for _, r in ranked do
			local pid = type(r) == "table" and r.ProductIdentifier
			local item = pid and byKey[keyOf(pid.InfoType, pid.Id)]
			if item and not seen[item] then
				seen[item] = true
				table.insert(out, item)
			end
		end
	end
	for _, item in items do
		if not seen[item] then
			table.insert(out, item)
		end
	end
	return out
end

-- One call per items table and session; later calls reuse the first answer, so a shop that
-- reopens never spends the throttle. Returns order, err (err is nil when the ranking applied).
local cache = setmetatable({}, { __mode = "k" })
function ShopRank.fetch(marketplace: any, items: { any }): ({ any }, string?)
	local hit = cache[items]
	if hit then
		return hit.order, hit.err
	end
	local ok, ranked = pcall(function()
		return marketplace:RankProductsAsync(ShopRank.identifiers(items))
	end)
	local entry = { order = ShopRank.order(items, if ok then ranked else nil), err = if ok then nil else tostring(ranked) }
	cache[items] = entry
	return entry.order, entry.err
end

return ShopRank
