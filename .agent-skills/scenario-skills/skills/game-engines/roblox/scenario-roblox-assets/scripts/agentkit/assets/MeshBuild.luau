--!nonstrict
-- MeshBuild: build a MeshPart with a SurfaceAppearance from decoded payloads, without uploading.
-- EditableMesh and EditableImage content lives only in this session: it is not saved with the
-- place and cannot be sold or published. Use it to preview and audit; ship through the 3D Importer.
--
--   local d = Payload.fromStage("chest")
--   local part = MeshBuild.build(d.mesh, d.images, {Name = "Chest", Parent = workspace.AssetLab})

local MeshBuild = {}

local MAP_KEYS = { color = "ColorMap", normal = "NormalMap", roughness = "RoughnessMap", metalness = "MetalnessMap" }

function MeshBuild.editableMesh(mesh)
	local AssetService = game:GetService("AssetService")
	local em = AssetService:CreateEditableMesh()
	assert(em, "editable memory budget exhausted (CreateEditableMesh returned nil)")
	local vIds = em:BatchAdd(Enum.MeshAttribute.Vertex, mesh.positions)
	local faces = table.create(#mesh.tris)
	for i, t in mesh.tris do
		faces[i] = { vIds[t[1]], vIds[t[2]], vIds[t[3]] } -- counter-clockwise = front face
	end
	local fIds = em:BatchAdd(Enum.MeshAttribute.Face, faces)
	if #mesh.uvs > 0 and #mesh.triUV == #fIds then
		local uIds = em:BatchAdd(Enum.MeshAttribute.UV, mesh.uvs)
		local corners = table.create(#fIds)
		for i, t in mesh.triUV do
			corners[i] = { uIds[t[1]], uIds[t[2]], uIds[t[3]] }
		end
		em:BatchSetFaceAttributes(fIds, corners)
	end
	return em
end

function MeshBuild.editableImage(img)
	local AssetService = game:GetService("AssetService")
	local ei = AssetService:CreateEditableImage({ Size = Vector2.new(img.w, img.h) })
	assert(ei, "editable memory budget exhausted (CreateEditableImage returned nil)")
	ei:WritePixelsBuffer(Vector2.zero, Vector2.new(img.w, img.h), img.buf) -- RGBA8, rows from the top
	return ei
end

function MeshBuild.surface(images, alphaMode: Enum.AlphaMode?)
	local AssetService = game:GetService("AssetService")
	local maps = {}
	for role, key in MAP_KEYS do
		if images[role] then
			maps[key] = Content.fromObject(MeshBuild.editableImage(images[role]))
		end
	end
	local sa = AssetService:CreateSurfaceAppearanceAsync(maps)
	sa.AlphaMode = alphaMode or Enum.AlphaMode.Overlay
	return sa
end

function MeshBuild.build(mesh, images, opts)
	opts = opts or {}
	local AssetService = game:GetService("AssetService")
	local em = MeshBuild.editableMesh(mesh)
	-- CollisionFidelity cannot be changed after creation: choose it here
	local part = AssetService:CreateMeshPartAsync(Content.fromObject(em), {
		CollisionFidelity = opts.CollisionFidelity or Enum.CollisionFidelity.Box,
		RenderFidelity = opts.RenderFidelity or Enum.RenderFidelity.Automatic,
	})
	part.Name = opts.Name or "Mesh"
	part.Anchored = opts.Anchored ~= false
	part.Material = opts.Material or Enum.Material.Plastic
	if images and next(images) then
		local sa = MeshBuild.surface(images, opts.AlphaMode)
		sa.Parent = part
	end
	if opts.CFrame then
		part.CFrame = opts.CFrame
	end
	part:SetAttribute("RbxAssetsTris", #em:GetFaces())
	if opts.Parent then
		part.Parent = opts.Parent
	end
	return part
end

-- Rigid accessory around a built Handle. attachName must match the AccessoryType (HatAttachment for Hat).
function MeshBuild.accessory(handle: MeshPart, accessoryType: Enum.AccessoryType, attachName: string, offset: Vector3)
	local acc = Instance.new("Accessory")
	acc.Name = handle.Name
	acc.AccessoryType = accessoryType
	handle.Name = "Handle"
	handle.Anchored = false
	handle.CanCollide = false
	-- leave Massless false: ValidateUGCAccessoryAsync rejects a Handle with Massless true (live)
	handle:SetAttribute("RbxAssetsTris", nil) -- validation rejects attributes on the accessory tree
	local att = Instance.new("Attachment")
	att.Name = attachName
	att.Position = offset
	att.Parent = handle
	handle.Parent = acc
	return acc
end

return MeshBuild
