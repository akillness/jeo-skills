--!nonstrict
-- AgentKit environment/Graybox: blockout from plain parts, anchored and named, in map_geo folders.
-- Edit data model through rbx_environment.run(..., kit=["Graybox"]). Nothing runs at load (Lune-safe).
--
--   Graybox.folder(root, "map_geo/village/walls")      nested Folders, reused when present
--   Graybox.gridVariant(opts)                           MaterialVariant "GrayboxGrid" (tile pattern, StudsPerTile 8)
--   Graybox.block(parent, name, size, cframe, role)     anchored Part colored by role, grid variant applied
--   Graybox.wedge(parent, name, size, cframe, role)     same for a WedgePart
--   Graybox.wall(parent, name, base, opts)              wall with a door or window hole built from parts (no CSG)
--   Graybox.house(parent, name, base, opts)             floor, four walls, door, glass window, ceiling, gable roof
--   Graybox.lantern(parent, name, position, opts)       post, neon head, named PointLight tagged "NightLight"
--   Graybox.clearance(root, opts)                        openings and walls below the minimums, plus blocked doors
--   Graybox.walkSeconds(a, b, speed)                     straight-line walk time between two points

local Graybox = {}

-- Greybox tutorial: doorways and hallways at least 10 studs wide, walls at least 10 studs tall.
Graybox.MIN_OPENING = 10
Graybox.MIN_WALL = 10
Graybox.WALK_SPEED = 16 -- Humanoid.WalkSpeed default
Graybox.JUMP_HEIGHT = 7.2 -- Humanoid.JumpHeight default (the tutorial's 5 is stale)
Graybox.GRID_NAME = "GrayboxGrid"
Graybox.GRID_COLOR_MAP = "rbxassetid://17429425079" -- Roblox CeramicTiles color map: a visible tile grid
Graybox.TAG_LIGHT = "NightLight"

-- [added] role palette: ground distinct from walls, landmark placeholders loud pink (RoBuilder).
Graybox.ROLE = {
	ground = Color3.fromRGB(106, 127, 92),
	floor = Color3.fromRGB(150, 150, 150),
	wall = Color3.fromRGB(200, 200, 200),
	roof = Color3.fromRGB(120, 72, 60),
	path = Color3.fromRGB(196, 170, 120),
	landmark = Color3.fromRGB(255, 0, 170),
	prop = Color3.fromRGB(90, 90, 90),
	glass = Color3.fromRGB(170, 210, 230),
	lamp = Color3.fromRGB(255, 190, 120),
}

function Graybox.folder(root, path)
	local node = root
	for name in string.gmatch(path, "[^/]+") do
		local child = node:FindFirstChild(name)
		if not child then
			child = Instance.new("Folder")
			child.Name = name
			child.Parent = node
		end
		node = child
	end
	return node
end

function Graybox.gridVariant(opts)
	opts = opts or {}
	local ms = game:GetService("MaterialService")
	local name = opts.name or Graybox.GRID_NAME
	local v = ms:FindFirstChild(name)
	if not v then
		v = Instance.new("MaterialVariant")
		v.Name = name
		v.BaseMaterial = opts.baseMaterial or Enum.Material.SmoothPlastic
		v.ColorMap = opts.colorMap or Graybox.GRID_COLOR_MAP
		v.StudsPerTile = opts.studsPerTile or 8
		v.Parent = ms
	end
	return v
end

local function finish(p, name, size, cframe, role)
	p.Name = name
	p.Anchored = true
	p.Size = size
	p.CFrame = cframe
	p.Color = Graybox.ROLE[role or "wall"] or Graybox.ROLE.wall
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	if role == "glass" then
		p.Material = Enum.Material.Glass
		p.Transparency = 0.6
		p.CastShadow = false -- a shadow-casting pane blocks the sun shaft
	elseif role == "landmark" then
		p.Material = Enum.Material.SmoothPlastic
	else
		p.Material = Enum.Material.SmoothPlastic
		p.MaterialVariant = Graybox.GRID_NAME
	end
	p:SetAttribute("GrayboxRole", role or "wall")
	return p
end

function Graybox.block(parent, name, size, cframe, role)
	local p = finish(Instance.new("Part"), name, size, cframe, role)
	p.Parent = parent
	return p
end

function Graybox.wedge(parent, name, size, cframe, role)
	local p = finish(Instance.new("WedgePart"), name, size, cframe, role)
	p.Parent = parent
	return p
end

-- base: CFrame at the bottom center of the wall; the wall runs along local X, thickness along Z.
-- opts: width, height, thickness, opening = {kind = "door" | "window", width, height, sill, offset}
function Graybox.wall(parent, name, base, opts)
	local w, h, t = opts.width, opts.height or 16, opts.thickness or 1
	local m = Instance.new("Model")
	m.Name = name
	m:SetAttribute("WallHeight", h)
	local o = opts.opening
	if not o then
		Graybox.block(m, "Wall", Vector3.new(w, h, t), base * CFrame.new(0, h / 2, 0), "wall")
	else
		local ow, oh, sill, off = o.width, o.height, o.sill or 0, o.offset or 0
		local left = (off - ow / 2) - (-w / 2)
		local right = (w / 2) - (off + ow / 2)
		if left > 0 then
			Graybox.block(m, "Left", Vector3.new(left, h, t), base * CFrame.new(-w / 2 + left / 2, h / 2, 0), "wall")
		end
		if right > 0 then
			Graybox.block(m, "Right", Vector3.new(right, h, t), base * CFrame.new(w / 2 - right / 2, h / 2, 0), "wall")
		end
		local top = h - (sill + oh)
		if top > 0 then
			Graybox.block(m, "Lintel", Vector3.new(ow, top, t), base * CFrame.new(off, h - top / 2, 0), "wall")
		end
		if sill > 0 then
			Graybox.block(m, "Sill", Vector3.new(ow, sill, t), base * CFrame.new(off, sill / 2, 0), "wall")
		end
		if o.kind == "window" and o.glass ~= false then
			Graybox.block(m, "Glass", Vector3.new(ow, oh, 0.2), base * CFrame.new(off, sill + oh / 2, 0), "glass")
		end
		m:SetAttribute("OpeningKind", o.kind)
		m:SetAttribute("OpeningWidth", ow)
		m:SetAttribute("OpeningHeight", oh)
		m:SetAttribute("OpeningSill", sill)
		-- center of the opening in world space, for clearance probes
		m:SetAttribute("OpeningCFrame", base * CFrame.new(off, sill + oh / 2, 0))
	end
	m.Parent = parent
	return m
end

-- base: CFrame at the ground center of the house; the door is on the local -Z face.
-- opts: width, depth, height, door = {width, height}, window = {width, height, sill} | false, roof = true
function Graybox.house(parent, name, base, opts)
	opts = opts or {}
	local w, d, h = opts.width or 24, opts.depth or 24, opts.height or 14
	local t = 1
	local door = opts.door or { width = Graybox.MIN_OPENING, height = Graybox.MIN_OPENING }
	local win = opts.window
	if win == nil then
		win = { width = 8, height = 6, sill = 4 }
	end
	local m = Instance.new("Model")
	m.Name = name
	Graybox.block(m, "Floor", Vector3.new(w, 1, d), base * CFrame.new(0, 0.5, 0), "floor")
	local y0 = base * CFrame.new(0, 1, 0)
	Graybox.wall(m, "WallFront", y0 * CFrame.new(0, 0, -d / 2 + t / 2), {
		width = w,
		height = h,
		opening = { kind = "door", width = door.width, height = door.height },
	})
	Graybox.wall(m, "WallBack", y0 * CFrame.new(0, 0, d / 2 - t / 2), { width = w, height = h })
	local side = CFrame.Angles(0, math.pi / 2, 0)
	Graybox.wall(m, "WallLeft", y0 * CFrame.new(-w / 2 + t / 2, 0, 0) * side, { width = d - 2 * t, height = h })
	Graybox.wall(m, "WallRight", y0 * CFrame.new(w / 2 - t / 2, 0, 0) * side, {
		width = d - 2 * t,
		height = h,
		opening = win and { kind = "window", width = win.width, height = win.height, sill = win.sill } or nil,
	})
	Graybox.block(m, "Ceiling", Vector3.new(w, 1, d), y0 * CFrame.new(0, h + 0.5, 0), "roof")
	if opts.roof ~= false then
		local rh = opts.roofHeight or 6
		local top = y0 * CFrame.new(0, h + 1, 0)
		-- WedgePart: high edge on local -Z, slope down toward +Z. Two halves meet at the ridge on X = 0.
		Graybox.wedge(
			m,
			"RoofA",
			Vector3.new(d, rh, w / 2),
			top * CFrame.new(w / 4, rh / 2, 0) * CFrame.Angles(0, -math.pi / 2, 0),
			"roof"
		)
		Graybox.wedge(
			m,
			"RoofB",
			Vector3.new(d, rh, w / 2),
			top * CFrame.new(-w / 4, rh / 2, 0) * CFrame.Angles(0, math.pi / 2, 0),
			"roof"
		)
	end
	m:SetAttribute("Interior", (y0 * CFrame.new(0, h / 2, 0)).Position)
	m.Parent = parent
	return m
end

function Graybox.lantern(parent, name, position, opts)
	opts = opts or {}
	local m = Instance.new("Model")
	m.Name = name
	local ph = opts.height or 9
	Graybox.block(m, "Post", Vector3.new(0.8, ph, 0.8), CFrame.new(position + Vector3.new(0, ph / 2, 0)), "prop")
	local head =
		Graybox.block(m, "Head", Vector3.new(1.6, 1.6, 1.6), CFrame.new(position + Vector3.new(0, ph + 0.8, 0)), "prop")
	head.Material = Enum.Material.Neon
	head.MaterialVariant = ""
	head:SetAttribute("GrayboxRole", "lamp")
	head.Color = opts.color or Color3.fromRGB(255, 190, 120)
	head.CastShadow = false -- the light sits inside this part
	local light = Instance.new("PointLight")
	light.Name = name .. "_Light"
	light.Color = opts.color or Color3.fromRGB(255, 190, 120)
	light.Range = opts.range or 24
	light.Brightness = opts.brightness or 1.5
	light.Shadows = opts.shadows ~= false
	light.Enabled = opts.enabled == true
	light.Parent = head
	light:AddTag(Graybox.TAG_LIGHT)
	m.Parent = parent
	return m
end

-- Findings for openings and walls under the minimums, and for doors that a character-sized box cannot pass.
function Graybox.clearance(root, opts)
	opts = opts or {}
	local minOpen = opts.minOpening or Graybox.MIN_OPENING
	local minWall = opts.minWall or Graybox.MIN_WALL
	local out = { checked = 0, findings = {} }
	local function add(path, rule, msg)
		table.insert(out.findings, { path = path, rule = rule, message = msg })
	end
	for _, m in root:GetDescendants() do
		if not m:IsA("Model") then
			continue
		end
		local wallH = m:GetAttribute("WallHeight") :: number?
		if wallH and wallH < minWall then
			add(m:GetFullName(), "wall-too-low", string.format("wall %.1f studs tall, minimum %d", wallH, minWall))
		end
		local kind = m:GetAttribute("OpeningKind")
		if kind == "door" then
			out.checked += 1
			local ow, oh = m:GetAttribute("OpeningWidth"), m:GetAttribute("OpeningHeight")
			if ow < minOpen or oh < minOpen then
				add(
					m:GetFullName(),
					"door-too-small",
					string.format("door %.1f x %.1f studs, minimum %d x %d", ow, oh, minOpen, minOpen)
				)
			end
			local cf = m:GetAttribute("OpeningCFrame")
			if cf and workspace.Parent then
				-- a probe slightly smaller than the opening; GetPartsInPart tests geometry, not bounding boxes
				local params = OverlapParams.new()
				params.RespectCanCollide = true
				local body = Instance.new("Part")
				body.Size = Vector3.new(math.max(0.5, ow - 0.5), math.max(0.5, oh - 0.5), 4)
				body.CFrame = cf
				local hits = workspace:GetPartsInPart(body, params)
				local solid = {}
				for _, p in hits do
					if p:IsA("BasePart") and p.CanCollide and p:GetAttribute("GrayboxRole") ~= "floor" then
						table.insert(solid, p:GetFullName())
					end
				end
				if #solid > 0 then
					add(
						m:GetFullName(),
						"door-blocked",
						"solid parts inside the opening: " .. table.concat(solid, ", ")
					)
				end
			end
		end
	end
	return out
end

function Graybox.walkSeconds(a, b, speed)
	local d = (a - b).Magnitude
	return d / (speed or Graybox.WALK_SPEED), d
end

return Graybox
