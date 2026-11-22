--!nonstrict
-- PriceText: shop prices from the engine, never from code. Run it on the CLIENT so each player
-- sees their own price (price tests, regional prices, Roblox Plus discounts).
--
--   local info = PriceText.fetch(MarketplaceService, productId, Enum.InfoType.Product)  -- nil on error
--   local view = PriceText.view(info)
--   -- view = { text = "\u{E002} 90", strike = "\u{E002} 100" or nil, buyable = true, reason = nil }
--   label.Text = view.text; button.Active = view.buyable
--
-- With no info (unpublished place, wrong id, network error) the view says "..." and is not
-- buyable: a placeholder, never a literal price.

local PriceText = {}

PriceText.ROBUX = utf8.char(0xE002) -- the Robux glyph in Roblox fonts
PriceText.PENDING = "..."

-- GetProductInfoAsync throws for an unknown id; the yield is batched when called in parallel.
function PriceText.fetch(marketplace: any, id: number, infoType: any, cache: { [number]: any }?): (any, string?)
	if cache and cache[id] then
		return cache[id], nil
	end
	local ok, info = pcall(function()
		return marketplace:GetProductInfoAsync(id, infoType)
	end)
	local result = if ok and type(info) == "table" then info else nil
	if cache and result then
		cache[id] = result -- failures are not cached: the next shop open retries
	end
	return result, if ok then nil else tostring(info)
end

function PriceText.view(info: any): any
	if type(info) ~= "table" then
		return { text = PriceText.PENDING, buyable = false, reason = "no product info" }
	end
	if info.IsForSale == false then
		return { text = "Off sale", buyable = false, reason = "IsForSale false" }
	end
	local price = info.PriceInRobux or info.Price
	if type(price) ~= "number" then
		return { text = PriceText.PENDING, buyable = false, reason = "no PriceInRobux" }
	end
	local view = { text = PriceText.ROBUX .. " " .. tostring(price), buyable = true }
	local base = info.UserBasePriceInRobux
	if type(base) == "number" and base > price then
		view.strike = PriceText.ROBUX .. " " .. tostring(base)
		local details = info.PriceDiscountDetails
		if type(details) == "table" and details[1] and details[1].Type then
			view.discount = tostring(details[1].Type)
		end
	end
	return view
end

return PriceText
