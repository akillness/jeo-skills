--!nonstrict
-- AgentKit environment/MaterialKit: MaterialVariant kits, role-based dressing, terrain overrides, link checks.
-- Edit data model through rbx_environment.run(..., kit=["MaterialKit"]). Nothing runs at load (Lune-safe).
--
--   MaterialKit.MAPS[name]                    Roblox-published 2022 material maps (no upload needed)
--   MaterialKit.variant(spec)                 create or update one MaterialVariant in MaterialService
--   MaterialKit.kit(specs)                    several variants, returns names
--   MaterialKit.dress(root, byRole)           set Material, MaterialVariant and Color on parts by GrayboxRole
--   MaterialKit.override(base, name)          SetBaseMaterialOverride and read it back
--   MaterialKit.links(root)                   parts whose MaterialVariant name resolves to nothing

local MaterialKit = {}

-- Asset ids from the Materials page of the Creator Docs (2022 material pack), grouped as color, normal, roughness.
MaterialKit.MAPS = {
	Grass = { "9920551868", "9438955773", "9438955997" },
	LeafyGrass = { "9920557906", "9439080781", "9439080950" },
	Rock = { "9920587470", "9439538417", "9439545859" },
	Ground = { "9920554482", "9439043558", "9439043765" },
	Sand = { "9920591683", "9439577084", "9439577327" },
	Concrete = { "9920484153", "9466554006", "9466554186" },
	Cobblestone = { "9919718991", "9438457162", "9438457470" },
	Basalt = { "9920482056", "9438412214", "9438412457" },
	Slate = { "9920599782", "9439612514", "9439612733" },
	WoodPlanks = { "9920626778", "9439650689", "9439658127" },
	Mud = { "9920578473", "9439509827", "9439510012" },
	Snow = { "9920620284", "9439632006", "9439632145" },
	Pavement = { "9920579943", "9439519281", "9439519532" },
}

local function asset(id)
	if string.find(id, "://", 1, true) then
		return id
	end
	return "rbxassetid://" .. id
end

-- spec: name, base (Enum.Material or its name), maps (a MAPS key or {color, normal, roughness, metalness}),
-- studsPerTile, pattern ("Regular" | "Organic"). Naming: base material first, then the style (CobblestoneMossy).
function MaterialKit.variant(spec)
	local ms = game:GetService("MaterialService")
	local v = ms:FindFirstChild(spec.name)
	if not (v and v:IsA("MaterialVariant")) then
		v = Instance.new("MaterialVariant")
		v.Name = spec.name
	end
	local base = spec.base
	if type(base) == "string" then
		base = Enum.Material[base]
	end
	v.BaseMaterial = base
	local maps = spec.maps
	if type(maps) == "string" then
		maps = MaterialKit.MAPS[maps]
	end
	if maps then
		v.ColorMap = maps[1] and asset(maps[1]) or ""
		v.NormalMap = maps[2] and asset(maps[2]) or ""
		v.RoughnessMap = maps[3] and asset(maps[3]) or ""
		v.MetalnessMap = maps[4] and asset(maps[4]) or ""
	end
	v.StudsPerTile = spec.studsPerTile or 10
	v.MaterialPattern = Enum.MaterialPattern[spec.pattern or "Regular"]
	v.Parent = ms
	return v
end

function MaterialKit.kit(specs)
	local names = {}
	for _, spec in specs do
		table.insert(names, MaterialKit.variant(spec).Name)
	end
	return names
end

-- byRole: role -> {material = Enum.Material, variant = "Name" | "", color = Color3}
function MaterialKit.dress(root, byRole)
	local counts = {}
	for _, p in root:GetDescendants() do
		if not p:IsA("BasePart") then
			continue
		end
		local role = p:GetAttribute("GrayboxRole")
		local look = role and byRole[role]
		if look then
			if look.material then
				p.Material = look.material
			end
			if look.variant then
				p.MaterialVariant = look.variant
			end
			if look.color then
				p.Color = look.color
			end
			counts[role] = (counts[role] or 0) + 1
		end
	end
	return counts
end

-- A variant only replaces its base material everywhere (terrain included) after this call;
-- creating a variant with that BaseMaterial is not enough.
function MaterialKit.override(base, name)
	local ms = game:GetService("MaterialService")
	if type(base) == "string" then
		base = Enum.Material[base]
	end
	local before = ms:GetBaseMaterialOverride(base)
	ms:SetBaseMaterialOverride(base, name)
	return { before = before, after = ms:GetBaseMaterialOverride(base) }
end

-- Name links are resolved per base material: a rename or a wrong BaseMaterial breaks them silently.
function MaterialKit.links(root)
	local ms = game:GetService("MaterialService")
	local broken, used = {}, {}
	for _, p in root:GetDescendants() do
		if p:IsA("BasePart") and p.MaterialVariant ~= "" then
			used[p.MaterialVariant] = (used[p.MaterialVariant] or 0) + 1
			if not ms:GetMaterialVariant(p.Material, p.MaterialVariant) then
				table.insert(
					broken,
					{ path = p:GetFullName(), variant = p.MaterialVariant, material = p.Material.Name }
				)
			end
		end
	end
	return { broken = broken, used = used }
end

return MaterialKit
