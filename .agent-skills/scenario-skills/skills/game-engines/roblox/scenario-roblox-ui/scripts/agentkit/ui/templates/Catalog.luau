--!strict
-- Shop catalog (ModuleScript, ReplicatedStorage.UI.Catalog). Shared by the server (prices) and the UI.
-- Rarity has a letter as well as a color: color alone fails color-blind players.

export type Item = { id: string, name: string, price: number, rarity: string, letter: string, color: Color3 }

local RARITY = {
	{ name = "Common", letter = "C", color = Color3.fromHex("9AA3AE") },
	{ name = "Rare", letter = "R", color = Color3.fromHex("3D8BFF") },
	{ name = "Epic", letter = "E", color = Color3.fromHex("D556FF") },
	{ name = "Legendary", letter = "L", color = Color3.fromHex("FFB020") },
}
local KINDS = { "Sword", "Shield", "Bow", "Wand", "Helmet", "Boots" }

local items: { Item } = {}
for i = 1, 30 do
	local r = RARITY[if i % 10 == 0 then 4 elseif i % 5 == 0 then 3 elseif i % 3 == 0 then 2 else 1]
	items[i] = {
		id = string.format("item%02d", i),
		name = KINDS[(i - 1) % #KINDS + 1] .. " " .. math.ceil(i / #KINDS),
		price = 25 * ((i - 1) % 6 + 1),
		rarity = r.name,
		letter = r.letter,
		color = r.color,
	}
end

return { items = items, rarity = RARITY }
