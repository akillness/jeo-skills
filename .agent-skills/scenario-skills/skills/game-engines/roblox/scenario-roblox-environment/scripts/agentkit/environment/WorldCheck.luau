--!nonstrict
-- AgentKit environment/WorldCheck: what a capture cannot show by itself. Invisible blockers, Studio debug views for
-- collision geometry and CSG triangles, and which landmarks a client holds under streaming.
-- Edit, Server or Client data model through rbx_environment.run(..., kit=["WorldCheck"]). Nothing runs at load.
--
--   WorldCheck.invisibleColliders(root, opts)  parts nobody sees that still block: Transparency >= 0.95, CanCollide
--   WorldCheck.mark(parts, opts)               a SelectionBox per part in an overlay folder, for the next capture
--   WorldCheck.clear(root)                      removes that overlay folder again
--   WorldCheck.debugViews(on)                  collision geometry and CSG wireframe (Studio settings, plugin security)
--   WorldCheck.positions(root, names)          server: where each named landmark is (x, y, z)
--   WorldCheck.presence(root, names)           client: which named landmarks have parts streamed in, plus a count

local WorldCheck = {}

WorldCheck.OVERLAY = "_check_overlay"
WorldCheck.BARRIER_TAG = "Barrier" -- [added] tag intended invisible walls so the audit skips them
WorldCheck.INVISIBLE = 0.95 -- [added] transparency from which a part counts as invisible

local function inCharacter(inst)
	local m = inst:FindFirstAncestorWhichIsA("Model")
	while m do
		if m:FindFirstChildWhichIsA("Humanoid") then
			return true
		end
		m = m:FindFirstAncestorWhichIsA("Model")
	end
	return false
end

function WorldCheck.invisibleColliders(root, opts)
	opts = opts or {}
	local tag = opts.tag or WorldCheck.BARRIER_TAG
	local limit = opts.transparency or WorldCheck.INVISIBLE
	local found, tagged = {}, 0
	for _, d in root:GetDescendants() do
		if d:IsA("BasePart") and d.CanCollide and d.Transparency >= limit and not inCharacter(d) then
			if d:HasTag(tag) then
				tagged += 1
			else
				table.insert(found, d)
			end
		end
	end
	return found, tagged
end

function WorldCheck.mark(parts, opts)
	opts = opts or {}
	local root = opts.parent or workspace
	local folder = root:FindFirstChild(WorldCheck.OVERLAY)
	if not folder then
		folder = Instance.new("Folder")
		folder.Name = WorldCheck.OVERLAY
		folder.Parent = root
	end
	for _, p in parts do
		local box = Instance.new("SelectionBox")
		box.Adornee = p
		box.Color3 = opts.color or Color3.fromRGB(255, 0, 170)
		box.LineThickness = opts.thickness or 0.2
		box.SurfaceTransparency = opts.surface or 0.6
		box.SurfaceColor3 = box.Color3
		box.Parent = folder
	end
	return folder
end

function WorldCheck.clear(root)
	local folder = (root or workspace):FindFirstChild(WorldCheck.OVERLAY)
	if folder then
		folder:Destroy()
		return true
	end
	return false
end

-- PhysicsSettings.ShowDecompositionGeometry and RenderSettings.RenderCSGTrianglesDebug are PluginSecurity
-- (API reference). Returns true per view that accepted the write, or the error text.
function WorldCheck.debugViews(on)
	local result = {}
	local ok, err = pcall(function()
		settings().Physics.ShowDecompositionGeometry = on
	end)
	result.collisionGeometry = if ok then true else tostring(err)
	ok, err = pcall(function()
		settings().Rendering.RenderCSGTrianglesDebug = on
	end)
	result.csgWireframe = if ok then true else tostring(err)
	return result
end

local function where(inst)
	if inst:IsA("BasePart") then
		return inst.CFrame.Position
	end
	local p = inst:IsA("Model") and inst.PrimaryPart or inst:FindFirstChildWhichIsA("BasePart", true)
	return p and p.CFrame.Position
end

function WorldCheck.positions(root, names)
	local out = {}
	for _, name in names do
		local inst = root:FindFirstChild(name, true)
		local p = inst and where(inst)
		out[name] = if p then { p.X, p.Y, p.Z } else false
	end
	return out
end

-- Present means at least one part of the landmark is streamed in: an emptied Model container does not count.
function WorldCheck.presence(root, names)
	local out = { present = {}, descendants = #root:GetDescendants() }
	for _, name in names do
		local inst = root:FindFirstChild(name, true)
		out.present[name] = inst ~= nil
			and (inst:IsA("BasePart") or inst:FindFirstChildWhichIsA("BasePart", true) ~= nil)
	end
	return out
end

return WorldCheck
