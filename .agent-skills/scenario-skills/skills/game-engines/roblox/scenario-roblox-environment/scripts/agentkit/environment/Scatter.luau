--!nonstrict
-- AgentKit environment/Scatter: foliage and rock scatter by script, one template per variant, flags and LOD per cell.
-- Edit data model through rbx_environment.run(..., kit=["Scatter"]). Nothing runs at load (Lune-safe).
--
--   Scatter.rng(seed)                 deterministic random in [0, 1), identical in Studio, Lune and the luau CLI
--   Scatter.plan(opts)                pure: points per layer by zone, density and spacing; variants not repeated nearby
--   Scatter.ray(opts)                 the default ground function: one downward ray onto terrain and parts
--   Scatter.place(items, opts)        grounds each point, clones its template, sets flags, groups clones in cell Models
--   Scatter.cellKey(x, z, size)       the cell a point falls in
--
-- Sources: BONES (-DoOf32pkPo 00:17:53 to 00:22:19) places large rocks first, rotates rocks to show all faces and
-- avoids repeats close together. RDC 2024 (cWDNVvOh4o0 00:10:31, 00:18:50): same mesh and material batch even when
-- color, size and rotation differ. Streaming techniques doc: models under about 64 studs stream in whole.

local Scatter = {}

Scatter.CELL = 64 -- Streaming techniques doc: keep a streamed model's extent under about 64 studs
-- Every Graybox role except ground.
Scatter.AVOID_ROLES =
	{ floor = true, path = true, wall = true, roof = true, glass = true, lamp = true, landmark = true, prop = true }

-- Park and Miller minimal standard generator; products stay under 2^53, so every runtime gives the same sequence.
function Scatter.rng(seed)
	local state = math.floor(math.abs(seed or 1)) % 2147483647
	if state == 0 then
		state = 1
	end
	return function()
		state = (state * 48271) % 2147483647
		return (state - 1) / 2147483646
	end
end

function Scatter.cellKey(x, z, size)
	size = size or Scatter.CELL
	return string.format("%d_%d", math.floor(x / size), math.floor(z / size))
end

-- Spatial hash of accepted items, for spacing and repeat checks.
local function newHash(cell)
	return { cell = cell, buckets = {} }
end

local function hashAdd(h, item)
	local k = Scatter.cellKey(item.x, item.z, h.cell)
	local b = h.buckets[k]
	if not b then
		b = {}
		h.buckets[k] = b
	end
	table.insert(b, item)
end

local function hashNear(h, x, z, radius, fn)
	local r = math.ceil(radius / h.cell)
	local cx, cz = math.floor(x / h.cell), math.floor(z / h.cell)
	for i = cx - r, cx + r do
		for j = cz - r, cz + r do
			local b = h.buckets[string.format("%d_%d", i, j)]
			if b then
				for _, item in b do
					if fn(item) == false then
						return
					end
				end
			end
		end
	end
end

--[[ Scatter.plan(opts) -> { items, attempts, outside, spacingRejected, byLayer }
  opts.min = { x, z }, opts.size = { width, depth }: the area
  opts.seed: number
  opts.zoneAt(x, z) -> zone name or nil
  opts.layers: placed in order, large items first. Each layer:
    zone = "cliff", per1000 = items per 1,000 square studs of that zone before spacing,
    spacing = studs kept free around each item (the item's footprint), variants = { "RockA", "RockB" },
    scale = { min, max }, yawStep = 90 for rocks (all four faces) or nil for any angle,
    repeatGap = studs within which the same variant is avoided
  Each item: { x, z, layer, zone, variant, scale, yaw, radius } ]]
function Scatter.plan(opts)
	local rand = Scatter.rng(opts.seed)
	local x0, z0 = opts.min[1], opts.min[2]
	local w, d = opts.size[1], opts.size[2]
	local maxSpacing = 1
	for _, layer in opts.layers do
		maxSpacing = math.max(maxSpacing, layer.spacing or 0, layer.repeatGap or 0)
	end
	local hash = newHash(maxSpacing)
	local maxRadius = 0
	local out = { items = {}, attempts = 0, outside = 0, spacingRejected = 0, byLayer = {} }
	for li, layer in opts.layers do
		local radius = (layer.spacing or 0) / 2
		local candidates = math.floor(w * d * (layer.per1000 or 0) / 1000 + 0.5)
		local placed = 0
		for _ = 1, candidates do
			out.attempts += 1
			local x, z = x0 + rand() * w, z0 + rand() * d
			if opts.zoneAt(x, z) ~= layer.zone then
				out.outside += 1
				continue
			end
			local free = true
			hashNear(hash, x, z, radius + maxRadius, function(other)
				local dx, dz = other.x - x, other.z - z
				if dx * dx + dz * dz < (radius + other.radius) ^ 2 then
					free = false
					return false
				end
				return true
			end)
			if not free then
				out.spacingRejected += 1
				continue
			end
			-- Variant: one with no same-variant item within repeatGap, else the one whose nearest twin is farthest.
			local gap = layer.repeatGap or 0
			local ok, best, bestDist = {}, nil, -1
			for _, v in layer.variants do
				local nearest = math.huge
				if gap > 0 then
					hashNear(hash, x, z, gap, function(other)
						if other.variant == v then
							local dist = math.sqrt((other.x - x) ^ 2 + (other.z - z) ^ 2)
							nearest = math.min(nearest, dist)
						end
						return true
					end)
				end
				if nearest >= gap then
					table.insert(ok, v)
				elseif nearest > bestDist then
					best, bestDist = v, nearest
				end
			end
			local variant = if #ok > 0 then ok[math.floor(rand() * #ok) + 1] else best
			local s = layer.scale or { 1, 1 }
			local yaw = if layer.yawStep
				then math.rad(layer.yawStep * math.floor(rand() * (360 / layer.yawStep)))
				else rand() * 2 * math.pi
			local item = {
				x = x,
				z = z,
				layer = li,
				zone = layer.zone,
				variant = variant,
				scale = s[1] + rand() * (s[2] - s[1]),
				yaw = yaw,
				radius = radius,
			}
			hashAdd(hash, item)
			table.insert(out.items, item)
			maxRadius = math.max(maxRadius, radius)
			placed += 1
		end
		out.byLayer[li] = { zone = layer.zone, candidates = candidates, placed = placed }
	end
	return out
end

-- Default ground: one downward ray. Returns position, normal, instance, material, or nil on a miss.
function Scatter.ray(opts)
	opts = opts or {}
	local params = RaycastParams.new()
	params.FilterType = Enum.RaycastFilterType.Include
	params.FilterDescendantsInstances = opts.include or { workspace.Terrain }
	params.IgnoreWater = false -- hit the water surface so the point is rejected, not planted on the lake bed
	local top = opts.y0 or 500
	return function(x, z)
		local r = workspace:Raycast(Vector3.new(x, top, z), Vector3.new(0, -top - 500, 0), params)
		if r then
			return r.Position, r.Normal, r.Instance, r.Material
		end
		return nil
	end
end

local function setFlags(part, spec, out)
	part.Anchored = true
	if spec.collide == false then
		part.CanCollide = false
		part.CanTouch = false
		if part:IsA("MeshPart") or part:IsA("PartOperation") then
			-- Collision guide: no collision needed, Box or Hull; the geometry is still stored.
			if not pcall(function()
				part.CollisionFidelity = Enum.CollisionFidelity.Box
			end) then
				out.fidelityRefused += 1
			end
		end
	end
	if spec.query == false then
		part.CanQuery = false -- takes effect only with CanCollide false (BasePart.CanQuery reference)
	end
	if spec.shadow == false then
		part.CastShadow = false
	end
end

local function tintPart(part, f)
	local c = part.Color
	part.Color = Color3.new(math.clamp(c.R * f, 0, 1), math.clamp(c.G * f, 0, 1), math.clamp(c.B * f, 0, 1))
end

--[[ Scatter.place(items, opts) -> { placed, missed, retried, skipped = { role, material, slope, template }, cells,
                                        variants, fidelityRefused }
  opts.library: Instance holding one template per variant name (a Model with its pivot at the base, or a BasePart)
  opts.parent: where cell Models go (required)
  opts.ground(x, z) -> position, normal, instance, material (default Scatter.ray(opts))
  opts.include: ray targets for the default ground (default { workspace.Terrain }); add the blockout folder to
    scatter on parts as well
  opts.avoidRoles: GrayboxRole values not to plant on (default Scatter.AVOID_ROLES)
  opts.avoidMaterials: { [Enum.Material.Name] = true } (default Water)
  opts.maxSlope: degrees from vertical normal (default none)
  opts.variants: { [name] = { collide = false, query = false, shadow = false, sink = studs, tint = 0.08 } }
  opts.lod: Enum.ModelLevelOfDetail name set on each cell Model ("SLIM"), or nil to leave the default
  opts.cell: cell size in studs (default Scatter.CELL)
  opts.seed: seed for the tint jitter
  opts.retryFrames: frames to wait before one retry of the misses (default 1; a ray right after a terrain fill can
    miss, live) ]]
function Scatter.place(items, opts)
	local ground = opts.ground or Scatter.ray(opts)
	local avoidRoles = opts.avoidRoles or Scatter.AVOID_ROLES
	local avoidMaterials = opts.avoidMaterials or { Water = true }
	local minUp = if opts.maxSlope then math.cos(math.rad(opts.maxSlope)) else -1
	local cellSize = opts.cell or Scatter.CELL
	local rand = Scatter.rng(opts.seed or 7)
	local out = {
		placed = 0,
		missed = 0,
		retried = 0,
		skipped = { role = 0, material = 0, slope = 0, template = 0 },
		cells = 0,
		variants = {},
		fidelityRefused = 0,
	}
	local cells = {}

	local function plant(item, pos, normal, hit, material)
		if hit and hit:IsA("BasePart") and avoidRoles[hit:GetAttribute("GrayboxRole") or ""] then
			out.skipped.role += 1
			return
		end
		if material and avoidMaterials[material.Name] then
			out.skipped.material += 1
			return
		end
		if normal and normal.Y < minUp then
			out.skipped.slope += 1
			return
		end
		local template = opts.library:FindFirstChild(item.variant)
		if not template then
			out.skipped.template += 1
			return
		end
		local spec = (opts.variants and opts.variants[item.variant]) or {}
		local key = Scatter.cellKey(item.x, item.z, cellSize)
		local cellModel = cells[key]
		if not cellModel then
			cellModel = Instance.new("Model")
			cellModel.Name = "cell_" .. key
			if opts.lod then
				cellModel.LevelOfDetail = Enum.ModelLevelOfDetail[opts.lod]
			end
			cellModel.Parent = opts.parent
			cells[key] = cellModel
			out.cells += 1
		end
		local clone = template:Clone()
		local base = CFrame.new(pos.X, pos.Y - (spec.sink or 0), pos.Z) * CFrame.Angles(0, item.yaw, 0)
		local f = if spec.tint then 1 + (rand() * 2 - 1) * spec.tint else nil
		if clone:IsA("BasePart") then
			clone.Size = template.Size * item.scale
			clone.CFrame = base * CFrame.new(0, clone.Size.Y / 2, 0) -- template pivot assumed at its base
			setFlags(clone, spec, out)
			if f then
				tintPart(clone, f)
			end
		else
			clone:ScaleTo(item.scale)
			clone:PivotTo(base)
			for _, p in clone:GetDescendants() do
				if p:IsA("BasePart") then
					setFlags(p, spec, out)
					if f then
						tintPart(p, f)
					end
				end
			end
		end
		clone:SetAttribute("ScatterLayer", item.layer)
		clone.Parent = cellModel
		out.placed += 1
		out.variants[item.variant] = (out.variants[item.variant] or 0) + 1
	end

	local misses = {}
	for _, item in items do
		local pos, normal, hit, material = ground(item.x, item.z)
		if pos then
			plant(item, pos, normal, hit, material)
		else
			table.insert(misses, item)
		end
	end
	if #misses > 0 then
		for _ = 1, opts.retryFrames or 1 do
			task.wait()
		end
		for _, item in misses do
			local pos, normal, hit, material = ground(item.x, item.z)
			if pos then
				out.retried += 1
				plant(item, pos, normal, hit, material)
			else
				out.missed += 1
			end
		end
	end
	return out
end

return Scatter
