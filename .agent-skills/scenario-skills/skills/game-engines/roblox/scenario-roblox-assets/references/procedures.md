# Procedures

Full code for each stage of the asset pipeline. Python runs on the agent side
(`scripts/rbx_assets.py`, `scripts/blender_roblox_prep.py`); Luau runs in Studio through
`rbx_assets.run`, which inlines the modules of `scripts/agentkit/assets/` as locals (nothing is
written into the place).

Setup, once per session:

```python
import sys
from pathlib import Path
SKILLS = Path("<skills folder>")
sys.path[:0] = [str(SKILLS / "scenario-roblox-expert" / "scripts"), str(SKILLS / "scenario-roblox-assets" / "scripts")]
import rbx_assets as ra
import rbx_env
```

Test files: `tests/code/scenario-roblox-assets/run_offline.py` (O1 to O9), `run_live.py` (L1 to L12)
and `fit_preview.py` (Blender render of the measured fit). Inputs were two image-to-3D GLBs: a
treasure chest (prop) and a wizard hat (rigid accessory), 2048 px JPEG maps each.

## P1 Triage a GLB (offline, no Blender)

Goal: know what you received before choosing a path.

```python
info = ra.glb_info("chest.glb")
# tris, verts, dims (glTF Y up = Roblox Y up), center, min_y, images [{mime, size}],
# materials [{doubleSided, alphaMode, metallicFactor, maps}], skins, animations, extensions
```

Read it this way:

- `dims` near 1.0 on the longest axis means a unit-boxed generator output: the real size is your
  decision.
- `doubleSided: true` on every material is a generator default, not a request for double-sided
  rendering.
- `skins > 0` routes the asset to scenario-roblox-animation after import; a rigid accessory must
  have none.
- `extensions` listing `KHR_draco_mesh_compression` means decode in Blender before import [added].

Test O2: run offline on 2026-10-19: pass. Chest 8,201 triangles, dims 0.950 x 0.735 x 0.668; hat
15,575 triangles, dims 0.951 x 0.676 x 0.956; all six maps 2048 x 2048 JPEG; `doubleSided` true and
`metallicFactor` 1.0 on both.

## P2 Fix in Blender, headless, behind the machine guard

Goal: a mesh at its size in studs, facing -Z, pivot where Roblox expects it, under budget, clean,
with maps sized for Roblox.

```python
side = ra.texture_side([3.5, 2.71, 2.46])            # 512: 256 px per 2 studs, power of two
chest = ra.blender_prep({**ra.PROP_PREP, "input": "chest.glb", "out_dir": "out", "name": "chest",
                         "yaw": 180, "scale": {"width": 3.5}, "views": 4,
                         "textures": {"color": side, "normal": side, "roughness": side, "metalness": side}})
hat = ra.blender_prep({**ra.ACCESSORY_PREP, "input": "hat.glb", "out_dir": "out", "name": "hat", "yaw": 180,
                       "scale": {"opening": 1.35, "band": [0.08, 0.2], "cap": [3, 4, 3]}, "views": 4})
```

`blender_prep` waits until GPU use is at most 85 percent, RAM at most 75 percent and fewer than two
Blender processes run, then calls
`blender -b --factory-startup -P blender_roblox_prep.py -- spec.json`. The script, in order:

1. Imports the GLB, joins meshes, applies transforms.
2. Welds by distance (glTF splits vertices at every UV seam), removes loose and degenerate geometry,
   drops islands under `min_island_faces`.
3. With `fill_holes`: caps every simple boundary loop with a face. `bmesh.ops.holes_fill` capped
   only 2 of 9 pinhole loops on the hat, so the script builds the faces itself, then cuts out and
   re-caps any edge shared by three faces.
4. Collapse-decimates to `max_tris` and triangulates, then repairs again: decimation left edges
   shared by three faces on the hat.
5. Turns by `yaw` about the up axis, scales to `height`, `width`, `max_dim`, `fit` or `opening`
   (studs on Roblox axes), and moves the pivot to the bottom center (props) or the box center
   (accessories). `opening` is for hats: the narrower of the X and Z widths of the vertices between
   8 and 20 percent of the height becomes 1.35 studs, so the crown clears the head; `cap` keeps the
   result inside the type's box.
6. Removes vertex colors, sets materials single-sided, splits the glTF metallic-roughness image
   (roughness G, metalness B) into grayscale maps, snaps metalness at `metal_threshold`, forces
   ColorMap alpha to 1 with `opaque_color`, and resizes every map in place so the exported GLB
   carries them.
7. Exports `<name>_roblox.glb` (+Y up, no animation, no vertex color), writes `<name>_mesh.json` for
   P5 and `<name>_report.json` with before and after stats, and renders front, right, back and top
   views with Workbench.

Coordinates: Blender (x, y, z) is Roblox (x, z, -y). The front views look from Roblox -Z.

Test O3 and O4: run offline in Blender 5.2 on 2026-10-19: pass.

|                              | Chest (prop)                   | Hat (accessory)                 |
| ---------------------------- | ------------------------------ | ------------------------------- |
| Triangles before, after      | 8,201, 8,201                   | 15,575, 3,686                   |
| Boundary edges before, after | 93, 93 (not required)          | 40, 0                           |
| Pieces                       | 47                             | 2                               |
| Size in studs                | 3.5 x 2.71 x 2.46, bottom at 0 | 2.472 x 1.759 x 2.489, centered |
| Maps                         | 512 x 4                        | ColorMap 1024, others 256       |
| Exported GLB                 | 0.43 MB (7.3 MB in)            | 0.24 MB (5.7 MB in)             |
| Gates                        | 12 of 12                       | 15 of 15 (Classic box)          |

The first hat pass filled the docs' ProportionsNormal box (1.71 studs wide). Its crown opening was
0.93 studs, and the fit render showed a 1.16-stud head through the crown. An opening of 1.25 still
measured 1.142 at the head top (L5 failed); 1.35 passes.

## P3 Gate offline

```python
imgs = {k: {"size": v["size"]} for k, v in hat["files"].items() if k in ("color", "normal", "roughness", "metalness")}
g = ra.gates(hat["after"], "accessory", "Hat", images=imgs)   # Classic box; scale="ProportionsNormal" for that type
assert not ra.failed(g), ra.failed(g)
```

Gates: triangles, n-gons, UV layer, loose geometry, zero-area faces, vertex colors white or absent,
and per kind: watertight, edges with three faces, one object, bounds for the type and the scale type
it will declare (`box=` takes live numbers), centered pivot (accessory); bottom pivot and non-zero
size (prop); texture sides against the place or avatar caps.

Test O5 (negative control): the raw hat fails `triangles` and `watertight`, as it should. Run
offline on 2026-10-19: pass.

## P4 Read the live validation rules

```python
r = ra.run(studio, "return AssetAudit.rules()", kit=["AssetAudit"])
rules = r["result"]   # accessoryMaxTris, maxTextureSize, meshVertColor, accessory[AssetType] = {attachments, rigidAllowed}
```

Use these numbers over the tables in this skill when they differ: Roblox tunes them server-side.

Test L1: run in Studio 0.743 on 2026-10-19: pass. `AccessoryMaxTriangles` 4000, `MaxTextureSize`
1024, `MeshVertColor` white. Rules are keyed by AssetType name: `Hat` (not HatAccessory),
`HairAccessory`, `FaceAccessory` and so on. Boxes: Hat 3 x 4 x 3 (offset 0), Hair 3 x 5 x 3.5
(offset 0, -0.5, 0.25), Face 3 x 2 x 2, Neck 3 x 3 x 2, Front 3 x 3 x 3, Back 10 x 7 x 4.5 (offset z
0.75), Waist 4 x 3.5 x 7 (offset y -0.25), Shoulder 7 x 3 x 3 on NeckAttachment; layered types
`RigidAllowed` false, 8 x 8 x 8. These equal the docs' Classic row; L9 shows the ProportionsNormal
row applies when the item declares it.

## P5 Preview a mesh in Studio without uploading

Goal: see and measure the prepared asset in the place, with its PBR maps, before anyone imports it
for real.

```python
mesh = ra.pack_mesh("out/chest_mesh.json")              # zstd + base64 of positions, UVs, triangles
imgs = ra.pack_images(chest["files"])                   # RGBA8 rows from the top, per map
ra.stage(studio, "chest", mesh, imgs)                   # chunks into _G.RbxAssetStage in the Edit data model
r = ra.run(studio, """
local d = Payload.fromStage("chest")
local part = MeshBuild.build(d.mesh, d.images, {Name = "Chest", CollisionFidelity = Enum.CollisionFidelity.Box})
part.CFrame = CFrame.new(-5, part.Size.Y / 2, 0)
part.Parent = workspace
local findings, stats = AssetAudit.prop(part, {expectSize = Vector3.new(3.5, 2.71, 2.46)})
return {size = part.Size, findings = findings, stats = stats}
""", kit=["Payload", "MeshBuild", "AssetAudit"], timeout=240)
```

`MeshBuild.build` creates an EditableMesh with `BatchAdd` (vertices, faces, UVs with per-corner
`BatchSetFaceAttributes`), EditableImages with `WritePixelsBuffer`, then
`CreateMeshPartAsync(Content.fromObject(em), {CollisionFidelity = ...})` and
`CreateSurfaceAppearanceAsync`. Choose CollisionFidelity in that call; game scripts may not be able
to change it later.

The result lives only in this data model: it is not saved with the place, cannot be published, and a
playtest copy of the place keeps the parts' Size but drops the mesh (L8). Ship through the Importer
(see [gui-paths.md](gui-paths.md)). After an import batch, run the memory and batching audit of
scenario-roblox-performance (`references/memory-and-crowds.md`, `PerfAudit.assets`).

Test L2 (transport): run in Studio 0.743 on 2026-10-19: pass. `_G` persists across Edit calls. The
hat (mesh 112,416 bytes of base64 plus four maps) staged in 14 calls of 180,000 characters, 1.94 MB
in 1.05 s; the chest in 13 calls, 1.72 MB in 1.0 s. A 1024 px ColorMap is 4,194,304 bytes raw and
1,688,292 after zstd and base64.

Test L3 (chest): run in Studio 0.743 on 2026-10-19: pass. Size 3.5 x 2.710 x 2.460, equal to the
Blender report; 8,201 triangles, 4,219 vertices, 93 open edges (allowed on a prop);
SurfaceAppearance with four 512 px EditableImage maps, AlphaMode Overlay; no audit finding; decode
0.009 s, build 0.007 s.

## P6 Build a rigid accessory around the mesh

```python
ra.stage(studio, "hat", ra.pack_mesh("out/hat_mesh.json"), ra.pack_images(hat["files"]))
r = ra.run(studio, """
local d = Payload.fromStage("hat")
local handle = MeshBuild.build(d.mesh, d.images, {Name = "WizardHat"})
local acc = MeshBuild.accessory(handle, Enum.AccessoryType.Hat, "HatAttachment",
  Vector3.new(0, -handle.Size.Y / 2 + 0.3, 0))
acc.Parent = workspace
return AssetAudit.accessory(acc, AssetAudit.rules())
""", kit=["Payload", "MeshBuild", "AssetAudit"])
```

`MeshBuild.accessory` renames the part `Handle`, unanchors it, turns off collision, leaves
`Massless` false (the validator requires it), removes attributes, and adds one attachment named for
the type. The attachment offset is the point that meets the head's `HatAttachment`; 0.3 stud above
the mesh bottom puts this brim a quarter of the head height below the head top (L5 and the fit
render).

Test L4: run in Studio 0.743 on 2026-10-19: pass. Size 2.472 x 1.759 x 2.489; 3,686 triangles; 0
open edges, 0 edges with three faces; HatAttachment at (0, -0.580, 0); the only finding is the
`scale_type` warning.

## P7 Audit an accessory or a prop (Edit)

`AssetAudit.accessory(acc, rules)` returns findings `{severity, rule, path, message, value, limit}`
for: AccessoryType Unknown (added after the live run, checked under Lune in O12), attributes, tags,
scripts, one Handle MeshPart, Plastic, Transparency 0, TextureID with SurfaceAppearance, AlphaMode
Overlay, texture sizes, triangles, open edges (vertices welded by position first), attachment name
for the type, bounds (the mesh box in the attachment frame against the rule's `Size` and `Offset`),
and a missing `AvatarPartScaleType`. `AssetAudit.prop(part, opts)` checks triangles, expected size,
DoubleSided, costly collision on a prop, and TextureID with SurfaceAppearance.
`AssetAudit.meshStats(part)` reads object content directly, and asset content through
`CreateEditableMeshAsync` when permissions allow.

Test L6 (negative control): run in Studio 0.743 on 2026-10-19: pass. One broken copy (Neon,
Transparency 0.3, an attribute, an extra Part, a Script, the attachment renamed HairAttachment)
raised material, transparency, attributes, one_handle, scripts and attachment_name in one pass; a
copy at 2x size raised bounds. Studio's validator reports one problem per call (L9), so this audit
is the faster loop.

## P8 Wear test

```python
r = ra.run(studio, """
local acc = (workspace:FindFirstChild("WizardHat") :: Accessory):Clone()
local rig, kind = UGCCheck.rig(workspace)
rig:PivotTo(CFrame.new(5, 3, 0))
local w = UGCCheck.wear(acc, rig)
w.rig = kind
return w
""", kit=["UGCCheck"], timeout=180)
```

The idle pose is the first check only: wear the item on several bodies through walk, run and emotes
as in [avatar-item-checks.md](avatar-item-checks.md).

`UGCCheck.rig` builds an R15 rig from a default `HumanoidDescription` (falls back to a block head
with a `HatAttachment`). `UGCCheck.wear` anchors the rig, calls `Humanoid:AddAccessory`, and returns
the joint class, the distance between the two attachments, the gap between the mesh bottom and the
head top, and `opening`: the mesh's X and Z width in a 0.1-stud slice at the head top, with `clears`
true when both reach the head's size.

Test L5: run in Studio 0.743 on 2026-10-19: pass. Joint `RigidConstraint`; attachment error 0; gap
-0.296 stud; crown at the head top 1.239 x 1.284 against a 1.159 x 1.161 head. `AddAccessory`
rescaled the Handle to 2.396 x 1.729 x 2.411 (0.969 of the built size) on this rig. Fit render from
these numbers: `tests/live_evidence/scenario-roblox-assets/blender/fit_sheet.jpg`, brim at the
forehead, crown over the head, star band in front.

`UGCCheck.wear` anchors the rig: use it on a test rig, never on a player's character. To wear the
hat on a player in a running experience, call `AddAccessory` from the server. If the mesh and
texture were built from Editable content on the server, each client then fills the replicated Handle
with its own copy:

```lua
-- Server: the joint replicates to every client
local function wearOnServer(player: Player, data: any): Accessory
  local char = player.Character or player.CharacterAdded:Wait()
  local hum = char:WaitForChild("Humanoid") :: Humanoid
  local handle = MeshBuild.build(data.mesh, data.images, {Name = "WizardHat"})
  local acc = MeshBuild.accessory(handle, Enum.AccessoryType.Hat, "HatAttachment",
    Vector3.new(0, -handle.Size.Y / 2 + 0.3, 0))
  hum:AddAccessory(acc)
  return acc
end

-- Client: Editable content made on the server draws as a checkered cube here, so apply a local copy
local function fillOnClient(acc: Accessory, data: any)
  local h = acc:WaitForChild("Handle") :: MeshPart
  local localPart = MeshBuild.build(data.mesh, data.images, {Name = "LocalHatMesh"})
  localPart.Size = h.Size
  h:ApplyMesh(localPart)
  local serverSA = h:FindFirstChildWhichIsA("SurfaceAppearance")
  local localSA = localPart:FindFirstChildWhichIsA("SurfaceAppearance")
  if localSA then
    if serverSA then serverSA.Parent = nil end
    localSA.Parent = h
  end
end
```

Test L12 (server path): run in Studio 0.743 on 2026-10-19 with the same calls: pass. Server: joint
`RigidConstraint`, attachment error 0. Client after replication: joint present, attachment error 0
on 10 samples over one second, gap -0.295 stud. Before the fill the client drew a small checkered
cube above the head; after `ApplyMesh` and the local `SurfaceAppearance` it drew the hat seated on
the head (error 0, size unchanged). Seen in a Studio playtest, where server and client run in one
Studio process; a live server was not tested (nothing is published).

## P9 Run Studio's validator locally (playtest, Server)

`ValidateUGCAccessoryAsync` needs a Player, so it runs in the Server data model of a playtest. The
engine calls without the toolkit are in [avatar-item-checks.md](avatar-item-checks.md). Stage the
payload again there: `_G` belongs to each data model.

```python
from rbx_play import Playtest
with Playtest(studio) as pt:
    ra.stage(pt.s, "hat", mesh, imgs, dm="Server")
    r = ra.run(pt.s, """
local d = Payload.fromStage("hat")
local handle = MeshBuild.build(d.mesh, d.images, {Name = "WizardHat"})
local acc = MeshBuild.accessory(handle, Enum.AccessoryType.Hat, "HatAttachment",
  Vector3.new(0, -handle.Size.Y / 2 + 0.3, 0))
acc.Parent = game:GetService("ServerStorage")
return UGCCheck.validate(acc, Enum.AccessoryType.Hat)
""", "Server", kit=["Payload", "MeshBuild", "AssetAudit", "UGCCheck"], timeout=300)
```

Sort every returned string into one of two lists: fixable here (geometry, schema, materials,
textures, bounds) or needs an uploaded asset (ownership, moderation, a mesh or texture that "failed
to load" from an asset ID). Fix the first list and run again. Stop at the second list: it is where
the real validation needs an upload.

The validator allows 10 calls per 60 seconds; `UGCCheck.validate` waits 61 s and retries once on
"request limit".

Test L9: run in Studio 0.743 on 2026-10-19: pass, 108 s. The prepared hat returned valid with no
string. Ten single-fault copies each failed with one string:

| Fault                                    | String (shortened)                                    |
| ---------------------------------------- | ----------------------------------------------------- |
| Neon                                     | invalid material, only Plastic allowed                |
| Transparency 0.3                         | Transparency expected == 0                            |
| `Massless` true                          | Massless expected = false                             |
| An attribute                             | contain Attributes, remove them                       |
| A tag                                    | marketplace assets cannot have any tags               |
| A Script, an extra Part                  | not part of the approved schema                       |
| Attachment renamed                       | could not find required HatAttachment                 |
| 2.5x size; attachment moved 2.2 studs up | larger than max bounding size, Hat [3.00, 4.00, 3.00] |
| `AvatarPartScaleType` ProportionsNormal  | larger than max bounding size, Hat [1.87, 2.50, 1.87] |

With `AvatarPartScaleType` Classic the hat stayed valid. The first run failed the good hat on
`Massless` (MeshBuild then set it true). The validator accepted session content (EditableMesh and
EditableImage), so it did not run what needs asset IDs: ownership, moderation, and the asset type
behind mesh and texture IDs. That is where the agent's part ends.

## P10 Roblox's own generator through Studio MCP (evidence only)

`generate_mesh` is a Studio MCP tool. It sends the prompt to Roblox and inserts the result into the
place. Required: `textPrompt`, `studio_id`. Optional: `maxTriangles` (12 to 20,000), `size` (target
bounding box), `segmentation` (auto, none, explicit) with `partNames` (up to 8), `async`.

Test L10: run once in Studio 0.743 on 2026-10-19: pass. With only the prompt "a small wooden
treasure chest with iron bands" it returned after 90 s with the text `{generationName, tag}` and
inserted a Model of two MeshParts (auto segmentation: `body_geom` 5,334 triangles, `lid_geom`
4,140), 5.16 x 4.0 x 4.0 studs overall, each with an `rbxassetid` MeshId and a TextureID (no
SurfaceAppearance), both closed. Size and split came from Roblox: pass `size`, `maxTriangles` and
`segmentation` when they matter, then audit with `AssetAudit.prop`.

## P11 Captures and contact sheet

```python
shots = [("chest_front", [-5, 2.2, -7.5], [-5, 1.3, 0]), ("hat_worn_front", [5, 5.4, -5.5], [5, 4.6, 0])]
paths = [studio.capture(f"captures/{n}.png", {"camera_position": c, "look_at_position": l}) for n, c, l in shots]
sheet = rbx_review.contact_sheet([str(p) for p in paths], "captures/contact_sheet.png", cols=3, thumb=520)
```

Open the sheet and look: facing, ground contact, texture orientation, black faces, hat on the head.
Reject a frame where one luminance band holds over 95 percent of the pixels: `image_checks` passed
such frames here.

Test L11 and L12: run in Studio 0.743 on 2026-10-19: pass in the final run. Edit captures show the
chest lock facing the -Z camera and the hat on the R15 rig from front and side; the playtest client
view shows the client-built chest and the hat seated on the player's avatar. Earlier runs returned
dark frames (only the view cube, or the Roblox UI over an empty view) while other windows covered
this one; 99 percent of pixels sat in one luminance band, which `image_checks` alone passed. Judge
on numbers when that happens. In the Client data model, `Humanoid:AddAccessory` on the player's own
character made no joint: the Handle stayed where it was built and fell 38.5 studs in 0.5 s. The
client view therefore seats a preview Handle with a CFrame on the head's `HatAttachment` (attachment
error 0, gap -0.295 stud, as in L5); the server path is in P8.

## Other results

- L7, property access from `execute_luau` in Edit: `SurfaceAppearance.AlphaMode`, `Color`,
  `ColorMap`, `ColorMapContent` (on a new SurfaceAppearance too), `MeshPart.DoubleSided`,
  `CollisionFidelity`, `RenderFidelity` writes and `MeshSize` reads all succeeded. `ColorMap` reads
  as an empty string on object content; `ColorMapContent.SourceType` is Object. These are plugin
  rights; game scripts have fewer.
- L8, what object content keeps: a `Clone()` shares the same EditableMesh (SourceType Object, MeshId
  empty). In the playtest copy, the parts built in Edit kept their Size but had SourceType None and
  no object (L9 Server, L12 Client). An EditableMesh built in the Client data model through
  `execute_luau` worked (SourceType Object).
- O6 and O7, payload round trip: the 3,686-triangle hat packs to 136,880 bytes raw and 112,416 bytes
  of base64 after zstd; Lune decodes the same layout (1,841 vertices, 3,289 UVs, first vertex equal
  to 1e-4).
- O1 and O9: every AgentKit module and every Luau snippet in this skill passes `rbx_check` with zero
  errors.
