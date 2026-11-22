# Avatar item checks

Checks for a rigid accessory beyond the idle-pose wear test of P8: the engine calls behind the
toolkit, motion on several bodies, the six-view opacity check, tilt against the axis-aligned box,
and what the Accessory Fitting Tool leaves behind. Issue numbers refer to the validation catalog
(Creator Docs, validation system); timestamps to the videos in [sources.md](sources.md).

## Engine calls behind the wrappers

Without the toolkit, call these directly through `execute_luau` or a plugin.

| Wrapper                               | Engine calls inside                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Data model                            |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `AssetAudit.rules()`                  | `AvatarCreationService:GetValidationRules()`, then `MeshRules.AccessoryMaxTriangles`, `MeshRules.MeshVertColor`, `TextureRules.MaxTextureSize`, `AccessoryRules[assetType].Attachments[i].Name`, `.Size`, `.Offset`, and `.RigidAllowed`                                                                                                                                                                                                                                          | Edit or play                          |
| `UGCCheck.validate(acc, type)`        | `AvatarCreationService:ValidateUGCAccessoryAsync(player, accessory, Enum.AccessoryType.Hat)`: yields, returns `(boolean, {string}?)`, at most 10 calls per 60 s                                                                                                                                                                                                                                                                                                                   | Server of a playtest (needs a Player) |
| `UGCCheck.rig()`                      | `Players:CreateHumanoidModelFromDescriptionAsync(Instance.new("HumanoidDescription"), Enum.HumanoidRigType.R15)`                                                                                                                                                                                                                                                                                                                                                                  | Edit or play                          |
| `UGCCheck.wear(acc, rig)`             | `Humanoid:AddAccessory(accessory)`; the joint is a `RigidConstraint` (Avatar Joint Upgrade)                                                                                                                                                                                                                                                                                                                                                                                       | Edit or play                          |
| `Payload.decode(b64)`                 | `EncodingService:Base64Decode(buffer.fromstring(b64))`, `EncodingService:DecompressBuffer(buf, Enum.CompressionAlgorithm.Zstd)`                                                                                                                                                                                                                                                                                                                                                   | Any                                   |
| `MeshBuild.build(mesh, images, opts)` | `AssetService:CreateEditableMesh()`, `EditableMesh:BatchAdd(Enum.MeshAttribute.Vertex / Face / UV, list)`, `EditableMesh:BatchSetFaceAttributes(faces, uvCorners)`, `AssetService:CreateEditableImage({Size = Vector2})`, `EditableImage:WritePixelsBuffer(Vector2.zero, size, buf)`, `AssetService:CreateSurfaceAppearanceAsync({ColorMap = Content.fromObject(image), ...})`, `AssetService:CreateMeshPartAsync(Content.fromObject(mesh), {CollisionFidelity, RenderFidelity})` | Any                                   |
| `AssetAudit.meshStats(part)`          | `MeshPart.MeshContent.Object`, or `AssetService:CreateEditableMeshAsync(part.MeshContent, {FixedSize = true})` for an uploaded mesh; `EditableMesh:GetFaces`, `GetFaceVertices`, `GetPosition`                                                                                                                                                                                                                                                                                    | Edit                                  |

The same validation without the toolkit. These are the calls inside `AssetAudit.rules` and
`UGCCheck.validate`, which ran in Studio 0.743 on 2026-10-19; this standalone form is not yet run
(needs Studio).

```lua
-- Server data model of a playtest: ValidateUGCAccessoryAsync needs a Player.
local ACS = game:GetService("AvatarCreationService")
local rules = ACS:GetValidationRules()
local hatRule
for assetType, rule in rules.AccessoryRules do
	local name = if typeof(assetType) == "EnumItem" then assetType.Name else tostring(assetType)
	if name == "Hat" then -- keyed by AssetType name: Hat, HairAccessory, FaceAccessory...
		hatRule = rule
	end
end
local accessory = game:GetService("ServerStorage"):FindFirstChildWhichIsA("Accessory") :: Accessory
accessory.AccessoryType = Enum.AccessoryType.Hat -- the Fitting Tool leaves Unknown
local player = game:GetService("Players"):GetPlayers()[1]
local ok, valid, errors = pcall(function()
	return ACS:ValidateUGCAccessoryAsync(player, accessory, Enum.AccessoryType.Hat)
end)
return {
	maxTris = rules.MeshRules.AccessoryMaxTriangles,
	maxTexture = rules.TextureRules.MaxTextureSize,
	box = hatRule and hatRule.Attachments[1].Size,
	called = ok,
	valid = ok and valid,
	errors = if ok then errors else tostring(valid),
}
```

## Motion and several bodies

Creators test every item on several bodies and with animations before upload: Avatar Setup
animations on a Rig Builder rig (Eed29gV0hLA [00:10:09], [00:10:13]; C-DwGRBHvmE [00:13:17];
MlyJD_ix9CE [00:33:20]), and a run animation on three preset characters (GVkLYvGYdsA [00:28:36]). An
idle wear test misses what moves: raised hands during emotes, a wide brim meeting the shoulders, a
back item swinging into the legs.

The script below wears the accessory on Classic, Rthro and Rthro Narrow bodies, plays walk, run and
three emotes from the playtest character's own `Animate` script (so no animation ID is hardcoded),
and counts the sampled frames where the Handle overlaps a body part other than the Head. The overlap
uses the Handle's collision geometry; for a tighter test, build the test copy with
`CollisionFidelity` Hull. Capture front and side while a track plays (`Playtest.capture` of
scenario-roblox-expert) and look at the frames. Not yet run (needs Studio).

```lua
-- Server data model of a playtest, the accessory in ServerStorage.
local Players = game:GetService("Players")
local accessory = game:GetService("ServerStorage"):FindFirstChildWhichIsA("Accessory") :: Accessory
local player = Players:GetPlayers()[1]
local animate = (player.Character :: Model):FindFirstChild("Animate") :: Instance

local function animationId(group: string): string?
	local holder = animate:FindFirstChild(group)
	local anim = holder and holder:FindFirstChildWhichIsA("Animation")
	return anim and anim.AnimationId
end

local BODIES: { [string]: { bodyType: number, proportion: number } } = {
	classic = { bodyType = 0, proportion = 0 },
	rthro = { bodyType = 1, proportion = 0 },
	rthroNarrow = { bodyType = 1, proportion = 1 },
}
local CLIPS = { "walk", "run", "wave", "cheer", "dance" }

local report: { [string]: { [string]: any } } = {}
local x = 0
for body, scales in BODIES do
	local desc = Instance.new("HumanoidDescription")
	desc.BodyTypeScale = scales.bodyType
	desc.ProportionScale = scales.proportion
	local rig = Players:CreateHumanoidModelFromDescriptionAsync(desc, Enum.HumanoidRigType.R15)
	x += 8
	rig:PivotTo(CFrame.new(x, 5, 60))
	rig.Parent = workspace
	local root = rig:FindFirstChild("HumanoidRootPart") :: BasePart
	root.Anchored = true -- anchor the root only, so the joints still animate
	local hum = rig:FindFirstChildOfClass("Humanoid") :: Humanoid
	local worn = accessory:Clone()
	hum:AddAccessory(worn)
	local handle = worn:FindFirstChild("Handle") :: BasePart
	local others: { Instance } = {}
	for _, p in rig:GetChildren() do
		if p:IsA("BasePart") and p.Name ~= "Head" and p.Name ~= "HumanoidRootPart" then
			table.insert(others, p)
		end
	end
	local params = OverlapParams.new()
	params.FilterType = Enum.RaycastFilterType.Include
	params.FilterDescendantsInstances = others
	local animator: Animator = hum:FindFirstChildOfClass("Animator") or Instance.new("Animator")
	animator.Parent = hum
	report[body] = {}
	for _, clip in CLIPS do
		local id = animationId(clip)
		if not id then
			report[body][clip] = "no animation in Animate"
			continue
		end
		local anim = Instance.new("Animation")
		anim.AnimationId = id
		local track = animator:LoadAnimation(anim)
		track:Play()
		local waited = 0
		while track.Length == 0 and waited < 3 do
			waited += task.wait(0.1)
		end
		local frames, overlapFrames, touched = 0, 0, {} :: { [string]: boolean }
		local t0 = os.clock()
		while os.clock() - t0 < math.max(track.Length, 1.5) do
			task.wait(0.1)
			frames += 1
			local hits = workspace:GetPartsInPart(handle, params)
			if #hits > 0 then
				overlapFrames += 1
				for _, p in hits do
					touched[p.Name] = true
				end
			end
		end
		track:Stop()
		report[body][clip] = { frames = frames, overlapFrames = overlapFrames, touched = touched }
	end
end
return report
```

Read the report per body and clip: overlap with `UpperTorso` on every frame means the item sits too
low or too wide; overlap only in `wave` or `cheer` with a hand is often acceptable for a hat and
worth a look in the captures. A layered item goes through the cage checks of Avatar Setup instead.

## Six-view opacity (#161, #190)

The validator rasterizes the mesh from six orthographic views (front, back, left, right, top,
bottom) and measures pixel coverage against a threshold per asset type and view. A view with zero
opaque pixels fails "Mesh is completely invisible" (#161), such as a flat plane seen edge-on; a view
under the threshold fails "Asset is not opaque enough from a given view direction" (#190). The
catalog words the check for avatar body parts; flat brims, cards and wings are the accessory shapes
at risk. The thresholds are not published.

Offline estimate from the prepared payload:

```python
o = ra.opacity_views("out/hat_mesh.json")   # {coverage: {front..bottom}, min_view, invisible}
assert not o["invisible"], o
```

It culls back faces the way a single-sided MeshPart draws, since the docs do not say how Roblox
rasterizes. Run offline on 2026-10-19 (O10): the test hat covered 0.40 front and back, 0.36 left and
right, 0.79 top and bottom; the chest 0.86 to 0.92; a single-sided plane covered its front only and
was invisible from the five other views.

## Axis-aligned bounds and tilt

The fitting box is measured on axis-aligned bounds, so rotating a mesh grows its box: a mesh that
looks inside can be out of bounds (KatsBits L28Ng6Hia1E [00:10:34]). Re-orient in Blender rather
than in the box. `AssetAudit.accessory` measures the eight corners of the Handle box in the
attachment frame, so a tilted Handle or attachment already shows the larger box.

```python
ra.tilt_limit("out/hat_mesh.json", [3, 4, 3], axis="z")   # first whole degree that leaves the box
```

Run offline on 2026-10-19 (O11): the test hat (2.47 x 1.76 x 2.49, flat brim) stayed inside 3 x 4 x
3 up to 45 degrees about X and Z, even scaled to 97 percent of the box; a 2.8 x 1.2 x 1.0 block left
it at a 14 degree tilt about Z. Long, thin items are the ones a tilt pushes out.

## What the Accessory Fitting Tool leaves behind

| Fact                                                                        | Consequence                                                                                                                                                              | Source                          |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- |
| The generated Accessory reads `AccessoryType` Unknown                       | Set it in code before validating; `AssetAudit.accessory` reports `accessory_type` (checked under Lune, O12)                                                              | KatsBits L28Ng6Hia1E [00:15:26] |
| The tool adds `AvatarPartScaleType` and a `SurfaceAppearance` `TexturePack` | After any texture change, regenerate the TexturePack with the tool: an invalid URL (#150), a failed download (#151) or maps that differ from the pack (#152) fail upload | Validation #150 to #152         |
| `MeshPart.MeshSize` is computed by the Importer                             | Never set it by hand; when "Calculated mesh size does not match the MeshSize property value" appears, re-import the mesh through the Importer                            | Validation #175                 |

## Memory and batching

The client memory and draw-call audit of imported assets lives in scenario-roblox-performance:
`references/memory-and-crowds.md` and `PerfAudit.assets` (also offline on a place file through
Lune). Run it after an import batch; this skill does not repeat it.
