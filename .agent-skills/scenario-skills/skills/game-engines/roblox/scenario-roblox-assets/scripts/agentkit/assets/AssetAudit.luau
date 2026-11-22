--!nonstrict
-- AssetAudit: local checks on imported or built meshes and rigid accessories, before any upload.
-- Runs in the Edit data model. Findings are {severity, rule, path, message, value?, limit?}.
--
--   local rules = AssetAudit.rules()                       -- live AvatarCreationService numbers
--   local f = AssetAudit.accessory(workspace.AssetLab.Hat, rules)
--   local f = AssetAudit.prop(workspace.AssetLab.Chest, {expectSize = Vector3.new(3.5, 2.71, 2.46)})
--   local s = AssetAudit.meshStats(part)                   -- {tris, verts, boundaryEdges, source}

local AssetAudit = {}

-- AccessoryType name -> key of GetValidationRules().AccessoryRules (hats are AssetType.Hat, live)
local ASSET_TYPE = {
	Hat = "Hat",
	Hair = "HairAccessory",
	Face = "FaceAccessory",
	Neck = "NeckAccessory",
	Shoulder = "ShoulderAccessory",
	Front = "FrontAccessory",
	Back = "BackAccessory",
	Waist = "WaistAccessory",
}

local function get(inst, name)
	local ok, v = pcall(function()
		return inst[name]
	end)
	return ok and v or nil
end

local function add(out, severity, rule, inst, message, value, limit)
	table.insert(out, {
		severity = severity,
		rule = rule,
		path = inst and inst:GetFullName() or "",
		message = message,
		value = value,
		limit = limit,
	})
end

local function v3(v: Vector3)
	return { math.round(v.X * 1000) / 1000, math.round(v.Y * 1000) / 1000, math.round(v.Z * 1000) / 1000 }
end

-- Live validation numbers. Enum keys become names so the result survives JSON.
function AssetAudit.rules()
	local ok, r = pcall(function()
		return game:GetService("AvatarCreationService"):GetValidationRules()
	end)
	if not ok or type(r) ~= "table" then
		return { error = tostring(r) }
	end
	local out = {
		accessoryMaxTris = r.MeshRules and r.MeshRules.AccessoryMaxTriangles,
		meshVertColor = r.MeshRules and r.MeshRules.MeshVertColor,
		maxTextureSize = r.TextureRules and r.TextureRules.MaxTextureSize,
		accessory = {},
	}
	for assetType, rule in r.AccessoryRules or {} do
		local atts = {}
		for _, a in rule.Attachments or {} do
			table.insert(atts, { name = a.Name, size = a.Size, offset = a.Offset })
		end
		out.accessory[typeof(assetType) == "EnumItem" and assetType.Name or tostring(assetType)] =
			{ attachments = atts, rigidAllowed = rule.RigidAllowed }
	end
	return out
end

-- Triangle, vertex and open-edge counts. Vertices are welded by position (1e-4 stud) first,
-- because uploaded meshes split vertices at UV seams and would count every seam as open.
function AssetAudit.meshStats(part: MeshPart)
	local content = get(part, "MeshContent")
	local em = content and content.Object
	local source = "object"
	if not em then
		source = "asset"
		local ok, res = pcall(function()
			return game:GetService("AssetService"):CreateEditableMeshAsync(content, { FixedSize = true })
		end)
		if not ok then
			return { error = tostring(res), source = source }
		end
		em = res
	end
	local faces = em:GetFaces()
	local key, ids, nUnique = {}, {}, 0
	for _, v in em:GetVertices() do
		local p = em:GetPosition(v)
		local k = string.format("%d,%d,%d", math.round(p.X * 1e4), math.round(p.Y * 1e4), math.round(p.Z * 1e4))
		if not key[k] then
			nUnique += 1
			key[k] = nUnique
		end
		ids[v] = key[k]
	end
	local edges = {}
	for _, f in faces do
		local vs = em:GetFaceVertices(f)
		for i = 1, #vs do
			local a, b = ids[vs[i]], ids[vs[i % #vs + 1]]
			local e = a < b and (a .. ":" .. b) or (b .. ":" .. a)
			edges[e] = (edges[e] or 0) + 1
		end
	end
	local boundary, nonManifold, total = 0, 0, 0
	for _, n in edges do
		total += 1
		if n == 1 then
			boundary += 1
		elseif n > 2 then
			nonManifold += 1
		end
	end
	return {
		tris = #faces,
		verts = #em:GetVertices(),
		weldedVerts = nUnique,
		edges = total,
		boundaryEdges = boundary,
		nonManifoldEdges = nonManifold,
		meshSize = v3(em:GetSize()),
		source = source,
	}
end

local function surfaceInfo(part)
	local sa = part:FindFirstChildOfClass("SurfaceAppearance")
	if not sa then
		return nil
	end
	local maps = {}
	for _, key in { "ColorMapContent", "NormalMapContent", "RoughnessMapContent", "MetalnessMapContent" } do
		local c = get(sa, key)
		local obj = c and c.Object
		if obj and obj:IsA("EditableImage") then
			maps[key] = { obj.Size.X, obj.Size.Y }
		elseif c and c.Uri and c.Uri ~= "" then
			maps[key] = c.Uri
		end
	end
	return { alphaMode = sa.AlphaMode.Name, maps = maps, instance = sa }
end

function AssetAudit.prop(part: MeshPart, opts)
	opts = opts or {}
	local out = {}
	local s = AssetAudit.meshStats(part)
	local cap = opts.maxTris or 20000
	if s.tris and s.tris > cap then
		add(out, "error", "triangles", part, "over the per-mesh import limit", s.tris, cap)
	end
	if opts.expectSize then
		local d = (part.Size - opts.expectSize).Magnitude
		if d > (opts.sizeTolerance or 0.02) then
			add(out, "error", "size", part, "Size differs from the prepared mesh", v3(part.Size), v3(opts.expectSize))
		end
	end
	if part.DoubleSided then
		add(out, "warn", "double_sided", part, "DoubleSided doubles the drawn triangles; keep it for thin cards only")
	end
	local cf = part.CollisionFidelity
	if part.CanCollide and (cf == Enum.CollisionFidelity.PreciseConvexDecomposition or cf == Enum.CollisionFidelity.Default) then
		add(out, "warn", "collision", part, "detailed collision on a prop; Box or Hull is cheaper", cf.Name)
	end
	local sa = surfaceInfo(part)
	if sa and part.TextureID ~= "" then
		add(out, "error", "texture_and_surface", part, "TextureID and SurfaceAppearance both set; the SurfaceAppearance wins")
	end
	if not sa and part.TextureID == "" then
		add(out, "warn", "no_texture", part, "no SurfaceAppearance and no TextureID")
	end
	return out, s, sa and { alphaMode = sa.alphaMode, maps = sa.maps } or nil
end

function AssetAudit.accessory(acc: Accessory, rules)
	rules = rules or {}
	local out = {}
	local typeName = acc.AccessoryType.Name
	if acc.AccessoryType == Enum.AccessoryType.Unknown then
		-- the Accessory Fitting Tool leaves AccessoryType at Unknown (KatsBits L28Ng6Hia1E [00:15:26]);
		-- with Unknown there is no rule to check the attachment name and bounds against
		add(out, "error", "accessory_type", acc, "AccessoryType is Unknown: set it before validating")
	end
	local parts, scripts = {}, {}
	for _, d in acc:GetDescendants() do
		if d:IsA("BasePart") then
			table.insert(parts, d)
		elseif d:IsA("LuaSourceContainer") then
			table.insert(scripts, d)
		end
	end
	for _, inst in { acc, table.unpack(acc:GetDescendants()) } do
		if next(inst:GetAttributes()) then
			add(out, "error", "attributes", inst, "attributes are not allowed in an accessory")
		end
		if #inst:GetTags() > 0 then
			add(out, "error", "tags", inst, "tags are not allowed in an accessory")
		end
	end
	for _, s in scripts do
		add(out, "error", "scripts", s, "scripts are not allowed in an accessory")
	end
	local handle = acc:FindFirstChild("Handle")
	if #parts ~= 1 or not handle or not handle:IsA("MeshPart") then
		add(out, "error", "one_handle", acc, "a rigid accessory holds exactly one MeshPart named Handle", #parts, 1)
	end
	if not handle or not handle:IsA("MeshPart") then
		return out
	end
	-- keep auditing the Handle when extra parts exist, so one run lists every finding
	if handle.Material ~= Enum.Material.Plastic then
		add(out, "error", "material", handle, "Material must be Plastic", handle.Material.Name)
	end
	if handle.Transparency ~= 0 then
		add(out, "error", "transparency", handle, "Transparency must be 0", handle.Transparency)
	end
	if handle.Massless then
		add(out, "error", "massless", handle, "the validator expects Massless false on the Handle")
	end
	local sa = surfaceInfo(handle)
	if sa and handle.TextureID ~= "" then
		add(out, "error", "texture_and_surface", handle, "use TextureID or SurfaceAppearance, not both")
	end
	if sa and sa.alphaMode ~= "Overlay" then
		add(out, "warn", "alpha_mode", sa.instance, "AlphaMode Overlay is the documented accessory default", sa.alphaMode)
	end
	local maxSide = rules.maxTextureSize or 1024
	if sa then
		for key, size in sa.maps do
			if type(size) == "table" and math.max(size[1], size[2]) > maxSide then
				add(out, "error", "texture_size", sa.instance, key .. " over the avatar texture limit", size, maxSide)
			end
		end
	end
	local s = AssetAudit.meshStats(handle)
	local triCap = rules.accessoryMaxTris or 4000
	if s.tris and s.tris > triCap then
		add(out, "error", "triangles", handle, "over the rigid accessory budget", s.tris, triCap)
	end
	if s.boundaryEdges and s.boundaryEdges > 0 then
		add(out, "error", "watertight", handle, "open edges: the mesh is not watertight", s.boundaryEdges, 0)
	end
	local rule = (rules.accessory or {})[ASSET_TYPE[typeName] or ""]
	local allowed = {}
	for _, a in (rule and rule.attachments) or {} do
		allowed[a.name] = a
	end
	local atts = {}
	for _, d in handle:GetChildren() do
		if d:IsA("Attachment") then
			table.insert(atts, d)
		end
	end
	if #atts == 0 then
		add(out, "error", "attachment", handle, "no Attachment in the Handle")
	end
	for _, a in atts do
		local r = allowed[a.Name]
		if rule and not r then
			add(out, "error", "attachment_name", a, "attachment name does not match AccessoryType " .. typeName, a.Name)
		elseif r and r.size then
			-- bounds are a box of Size around the attachment (plus Offset), in the attachment's frame
			local lo = -handle.Size / 2
			local hi = handle.Size / 2
			local corners = {}
			for _, x in { lo.X, hi.X } do
				for _, y in { lo.Y, hi.Y } do
					for _, z in { lo.Z, hi.Z } do
						table.insert(corners, a.CFrame:PointToObjectSpace(Vector3.new(x, y, z)))
					end
				end
			end
			local half = r.size / 2
			local off = r.offset or Vector3.zero
			local worst = 0
			for _, c in corners do
				local d = c - off
				worst = math.max(worst, math.abs(d.X) - half.X, math.abs(d.Y) - half.Y, math.abs(d.Z) - half.Z)
			end
			if worst > 1e-3 then
				add(out, "error", "bounds", handle, "mesh exceeds the accessory bounds by " .. string.format("%.3f", worst) .. " studs", v3(handle.Size), v3(r.size))
			end
		end
	end
	local scaleType = handle:FindFirstChild("AvatarPartScaleType")
	if not scaleType then
		add(out, "warn", "scale_type", handle, "no AvatarPartScaleType StringValue (the Accessory Fitting Tool adds it)")
	elseif scaleType:IsA("StringValue") and scaleType.Value ~= "Classic" then
		-- live: ProportionsNormal switched the Hat box from 3 x 4 x 3 to 1.87 x 2.5 x 1.87
		add(out, "warn", "scale_type_box", handle, "bounds above use the Classic box; " .. scaleType.Value
			.. " uses the smaller docs row, confirm with UGCCheck.validate", scaleType.Value)
	end
	return out, s
end

return AssetAudit
