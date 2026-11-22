--!nonstrict
-- AgentKit environment/TerrainKit: smooth terrain from code, the substitute for the Terrain Editor brushes.
-- Edit data model through rbx_environment.run(..., kit=["TerrainKit"]). Pure helpers run in Lune.
--
--   TerrainKit.snap(min, max)               {min, max} tables snapped outward to the 4-stud grid (pure)
--   TerrainKit.region(min, max)             grid-aligned Region3 (resolution 4)
--   TerrainKit.plan(nx, ny, nz, maxVoxels)  chunks along X and Z so each call stays under the voxel cap (pure)
--   TerrainKit.occupancy(surfaceY, cellMinY) voxel occupancy that puts the surface at surfaceY (pure)
--   TerrainKit.heightfield(opts)            WriteVoxels a height function, material by height, slope and depth
--   TerrainKit.fromPart(part, material, keep)  Part to Terrain: block, ball, cylinder, wedge
--   TerrainKit.fromParts(folder, material, keep)  every BasePart under a folder
--   TerrainKit.smooth(min, max, passes)     occupancy blur on a region (the Smooth brush)
--   TerrainKit.water(min, max, level)       LiquidOccupancy fill under a level, solid voxels left alone
--   TerrainKit.paintUnder(root, opts)       repaint Grass as LeafyGrass under floors and paths (blades poke through)
--   TerrainKit.groundY(x, z, fromY, frames) terrain surface height and material by raycast, retried while it misses
--   TerrainKit.surfaceY(x, z, minY, maxY)   surface height and material read from the voxels (no physics lag)
--   TerrainKit.stats()                      CountCells, MaxExtents

local TerrainKit = {}

TerrainKit.RES = 4 -- the only resolution the region APIs accept
TerrainKit.MAX_VOXELS = 4194304 -- per ReadVoxels or WriteVoxels call

local function v3(t)
	if typeof(t) == "Vector3" then
		return t.X, t.Y, t.Z
	end
	return t[1] or t.x or t.X, t[2] or t.y or t.Y, t[3] or t.z or t.Z
end

function TerrainKit.snap(minV, maxV)
	local r = TerrainKit.RES
	local ax, ay, az = v3(minV)
	local bx, by, bz = v3(maxV)
	return {
		math.floor(math.min(ax, bx) / r) * r,
		math.floor(math.min(ay, by) / r) * r,
		math.floor(math.min(az, bz) / r) * r,
	}, {
		math.ceil(math.max(ax, bx) / r) * r,
		math.ceil(math.max(ay, by) / r) * r,
		math.ceil(math.max(az, bz) / r) * r,
	}
end

function TerrainKit.region(minV, maxV)
	local a, b = TerrainKit.snap(minV, maxV)
	return Region3.new(Vector3.new(a[1], a[2], a[3]), Vector3.new(b[1], b[2], b[3])):ExpandToGrid(TerrainKit.RES)
end

-- Splits nx by nz columns into square-ish chunks of whole columns; each chunk holds at most maxVoxels.
function TerrainKit.plan(nx, ny, nz, maxVoxels)
	maxVoxels = maxVoxels or TerrainKit.MAX_VOXELS
	local perColumn = math.max(1, ny)
	local cols = math.max(1, math.floor(maxVoxels / perColumn))
	local side = math.max(1, math.floor(math.sqrt(cols)))
	local chunks = {}
	for x0 = 0, nx - 1, side do
		for z0 = 0, nz - 1, side do
			table.insert(chunks, { x0 = x0, z0 = z0, sx = math.min(side, nx - x0), sz = math.min(side, nz - z0) })
		end
	end
	return chunks
end

-- Measured in Studio 0.743 (raycast): the surface sits at the top filled voxel's center plus 4 x its occupancy,
-- so a full voxel under air puts the ground 2 studs above that voxel's top face.
function TerrainKit.occupancy(surfaceY, cellMinY)
	return math.clamp((surfaceY - (cellMinY + TerrainKit.RES / 2)) / TerrainKit.RES, 0, 1)
end

-- [added] default material rule. Thresholds are a starting point, tune them on a capture.
-- y is the voxel center, depth how far it sits under the surface, so y + depth is the surface height.
function TerrainKit.defaultMaterial(_x, y, _z, slope, depth)
	if depth > 8 or slope > 40 then
		return Enum.Material.Rock
	end
	if slope > 25 then
		return Enum.Material.Basalt -- hill sides (SmartyRBX)
	end
	if y + depth < -0.5 then
		return Enum.Material.Sand -- below the walkable plateau: shores and basins
	end
	return Enum.Material.Grass
end

-- opts: min = {x, z} corner in studs, size = {x, z} in studs, bottom = y in studs, top = y cap in studs,
-- height = function(x, z) -> surface y, material = function(x, y, z, slopeDeg, depth) -> Enum.Material,
-- maxVoxels = per-call cap (default MAX_VOXELS), yield = true to task.wait() between chunks
function TerrainKit.heightfield(opts)
	local terrain = workspace.Terrain
	local r = TerrainKit.RES
	local mx, mz = opts.min[1], opts.min[2]
	local a, b = TerrainKit.snap({ mx, opts.bottom, mz }, { mx + opts.size[1], opts.top, mz + opts.size[2] })
	local nx, ny, nz = (b[1] - a[1]) / r, (b[2] - a[2]) / r, (b[3] - a[3]) / r
	local height, mat = opts.height, opts.material or TerrainKit.defaultMaterial
	local t0 = os.clock()
	local chunks = TerrainKit.plan(nx, ny, nz, opts.maxVoxels)
	local written = 0
	for _, c in chunks do
		local materials, occ = {}, {}
		for ix = 1, c.sx do
			local x = a[1] + (c.x0 + ix - 0.5) * r
			local mcol, ocol = {}, {}
			materials[ix], occ[ix] = mcol, ocol
			for iy = 1, ny do
				mcol[iy], ocol[iy] = {}, {}
			end
			for iz = 1, c.sz do
				local z = a[3] + (c.z0 + iz - 0.5) * r
				local h = height(x, z)
				local gx = (height(x + r, z) - height(x - r, z)) / (2 * r)
				local gz = (height(x, z + r) - height(x, z - r)) / (2 * r)
				local slope = math.deg(math.atan(math.sqrt(gx * gx + gz * gz)))
				for iy = 1, ny do
					local cellMin = a[2] + (iy - 1) * r
					local o = TerrainKit.occupancy(h, cellMin)
					ocol[iy][iz] = o
					mcol[iy][iz] = if o > 0
						then mat(x, cellMin + r / 2, z, slope, h - (cellMin + r / 2))
						else Enum.Material.Air
				end
			end
		end
		local region = Region3.new(
			Vector3.new(a[1] + c.x0 * r, a[2], a[3] + c.z0 * r),
			Vector3.new(a[1] + (c.x0 + c.sx) * r, b[2], a[3] + (c.z0 + c.sz) * r)
		)
		terrain:WriteVoxels(region, r, materials, occ)
		written += c.sx * ny * c.sz
		if opts.yield ~= false then
			task.wait()
		end
	end
	return { chunks = #chunks, voxels = written, ms = math.floor((os.clock() - t0) * 1000), min = a, max = b }
end

-- Part to Terrain. A Part cylinder runs along its X axis; FillCylinder runs along Y, hence the rotation.
function TerrainKit.fromPart(part, material, keep)
	local terrain = workspace.Terrain
	local cf, size = part.CFrame, part.Size
	local kind
	if part:IsA("WedgePart") then
		terrain:FillWedge(cf, size, material)
		kind = "wedge"
	elseif part:IsA("Part") and part.Shape == Enum.PartType.Ball then
		terrain:FillBall(cf.Position, math.min(size.X, size.Y, size.Z) / 2, material)
		kind = "ball"
	elseif part:IsA("Part") and part.Shape == Enum.PartType.Cylinder then
		terrain:FillCylinder(cf * CFrame.Angles(0, 0, math.pi / 2), size.X, math.min(size.Y, size.Z) / 2, material)
		kind = "cylinder"
	else
		terrain:FillBlock(cf, size, material)
		kind = "block"
	end
	if not keep then
		part:Destroy()
	end
	return kind
end

function TerrainKit.fromParts(folder, material, keep)
	local kinds = {}
	for _, p in folder:GetDescendants() do
		if p:IsA("BasePart") then
			local k = TerrainKit.fromPart(
				p,
				p:GetAttribute("TerrainMaterial") and Enum.Material[p:GetAttribute("TerrainMaterial")] or material,
				keep
			)
			kinds[k] = (kinds[k] or 0) + 1
		end
	end
	return kinds
end

-- Box blur of occupancy over 3x3x3 neighbors. Air that gains occupancy takes the most common solid neighbor material.
function TerrainKit.smooth(minV, maxV, passes)
	local terrain = workspace.Terrain
	local region = TerrainKit.region(minV, maxV)
	local changed = 0
	for _ = 1, passes or 1 do
		local mats, occ = terrain:ReadVoxels(region, TerrainKit.RES)
		local size = mats.Size
		local nx, ny, nz = size.X, size.Y, size.Z
		local newOcc, newMat = {}, {}
		for x = 1, nx do
			newOcc[x], newMat[x] = {}, {}
			for y = 1, ny do
				newOcc[x][y], newMat[x][y] = {}, {}
				for z = 1, nz do
					local sum, n = 0, 0
					local counts, best, bestN = {}, mats[x][y][z], 0
					for dx = -1, 1 do
						for dy = -1, 1 do
							for dz = -1, 1 do
								local xx, yy, zz = x + dx, y + dy, z + dz
								if xx >= 1 and xx <= nx and yy >= 1 and yy <= ny and zz >= 1 and zz <= nz then
									local o = occ[xx][yy][zz]
									sum += o
									n += 1
									local m = mats[xx][yy][zz]
									if o > 0 and m ~= Enum.Material.Air and m ~= Enum.Material.Water then
										counts[m] = (counts[m] or 0) + 1
										if counts[m] > bestN then
											best, bestN = m, counts[m]
										end
									end
								end
							end
						end
					end
					local o = sum / n
					if mats[x][y][z] == Enum.Material.Water then
						o = occ[x][y][z] -- leave water voxels alone
					end
					if math.abs(o - occ[x][y][z]) > 0.01 then
						changed += 1
					end
					newOcc[x][y][z] = o
					newMat[x][y][z] = if o > 0
						then (if mats[x][y][z] ~= Enum.Material.Air then mats[x][y][z] else best)
						else Enum.Material.Air
				end
			end
		end
		terrain:WriteVoxels(region, TerrainKit.RES, newMat, newOcc)
	end
	return { changed = changed }
end

-- Fills water up to `level` wherever voxels are not fully solid. Uses the channel API with LiquidOccupancy only.
function TerrainKit.water(minV, maxV, level)
	local terrain = workspace.Terrain
	local region = TerrainKit.region(minV, maxV)
	local ch = terrain:ReadVoxelChannels(region, TerrainKit.RES, { "SolidOccupancy", "LiquidOccupancy" })
	local solid = ch.SolidOccupancy
	local size = ch.Size -- ReadVoxelChannels puts Size on the result; ReadVoxels puts it on the materials array
	local liquid = {}
	local y0 = region.CFrame.Position.Y - region.Size.Y / 2
	local filled = 0
	for x = 1, size.X do
		liquid[x] = {}
		for y = 1, size.Y do
			liquid[x][y] = {}
			local cellMin = y0 + (y - 1) * TerrainKit.RES
			local below = TerrainKit.occupancy(level, cellMin)
			for z = 1, size.Z do
				local w = math.max(0, math.min(below, 1 - solid[x][y][z]))
				liquid[x][y][z] = w
				if w > 0 then
					filled += 1
				end
			end
		end
	end
	terrain:WriteVoxelChannels(region, TerrainKit.RES, { LiquidOccupancy = liquid })
	return { voxels = filled }
end

-- Grass decoration grows up through parts that sit on Grass terrain: repaint the terrain under them with
-- LeafyGrass, which has no blades (SmartyRBX), or pass opts.to.
-- roles: GrayboxRole values to treat (default floor and path); parts without the attribute count when roles is "all".
-- Reads and writes the voxels (the result counts them) instead of Terrain:ReplaceMaterial, so the edit is checkable.
function TerrainKit.paintUnder(root, opts)
	opts = opts or {}
	local to = opts.to or Enum.Material.LeafyGrass
	local fromSet = {}
	for _, m in opts.from or { Enum.Material.Grass } do
		fromSet[m] = true
	end
	local roles = opts.roles or { floor = true, path = true }
	local margin = opts.margin or 2
	local terrain = workspace.Terrain
	local n, changed = 0, 0
	for _, p in root:GetDescendants() do
		if not p:IsA("BasePart") then
			continue
		end
		if roles ~= "all" and not roles[p:GetAttribute("GrayboxRole") or ""] then
			continue
		end
		local cf, s = p.CFrame, p.Size / 2
		local ext = Vector3.new(
			math.abs(cf.XVector.X) * s.X + math.abs(cf.YVector.X) * s.Y + math.abs(cf.ZVector.X) * s.Z,
			math.abs(cf.XVector.Y) * s.X + math.abs(cf.YVector.Y) * s.Y + math.abs(cf.ZVector.Y) * s.Z,
			math.abs(cf.XVector.Z) * s.X + math.abs(cf.YVector.Z) * s.Y + math.abs(cf.ZVector.Z) * s.Z
		)
		local pos = cf.Position
		local bottom = pos.Y - ext.Y
		local region = TerrainKit.region(
			{ pos.X - ext.X - margin, bottom - 8, pos.Z - ext.Z - margin },
			{ pos.X + ext.X + margin, bottom + 4, pos.Z + ext.Z + margin }
		)
		local mats, occ = terrain:ReadVoxels(region, TerrainKit.RES)
		local size = mats.Size
		local dirty = false
		for x = 1, size.X do
			for y = 1, size.Y do
				for z = 1, size.Z do
					if occ[x][y][z] > 0 and fromSet[mats[x][y][z]] then
						mats[x][y][z] = to
						changed += 1
						dirty = true
					end
				end
			end
		end
		if dirty then
			terrain:WriteVoxels(region, TerrainKit.RES, mats, occ)
		end
		n += 1
	end
	return { parts = n, voxels = changed }
end

-- Terrain collision updates after voxel edits: a ray cast right after a fill can miss the edited area.
-- groundY retries for up to `frames` frames (default 30) before returning nil.
function TerrainKit.groundY(x, z, fromY, frames)
	local params = RaycastParams.new()
	params.FilterType = Enum.RaycastFilterType.Include
	params.FilterDescendantsInstances = { workspace.Terrain }
	params.IgnoreWater = true
	local top = fromY or 500
	for _ = 0, frames or 30 do
		local r = workspace:Raycast(Vector3.new(x, top, z), Vector3.new(0, -top - 500, 0), params)
		if r then
			return r.Position.Y, r.Material
		end
		task.wait()
	end
	return nil, nil
end

-- The surface of the 4-stud column holding (x, z), from the voxels: the top solid voxel's center plus
-- 4 times its occupancy (the model that matched the live surface heights). Water voxels are skipped.
function TerrainKit.surfaceY(x, z, minY, maxY)
	local r = TerrainKit.RES
	local cx, cz = math.floor(x / r) * r, math.floor(z / r) * r
	local lo = math.floor((minY or -64) / r) * r
	local region = TerrainKit.region({ cx, lo, cz }, { cx + r, maxY or 128, cz + r })
	local mats, occ = workspace.Terrain:ReadVoxels(region, r)
	for y = mats.Size.Y, 1, -1 do
		local o, m = occ[1][y][1], mats[1][y][1]
		if o > 0 and m ~= Enum.Material.Air and m ~= Enum.Material.Water then
			return lo + (y - 1) * r + r / 2 + r * o, m
		end
	end
	return nil, nil
end

function TerrainKit.stats()
	local t = workspace.Terrain
	return { cells = t:CountCells(), maxExtents = tostring(t.MaxExtents) }
end

return TerrainKit
