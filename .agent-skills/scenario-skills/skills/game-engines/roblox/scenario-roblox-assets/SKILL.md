---
name: scenario-roblox-assets
description: "Use when bringing 3D assets into Roblox Studio or preparing avatar items: import from Blender, GLB, FBX or OBJ files, AI-generated or image-to-3D meshes (Scenario or other tools), wrong scale or size in studs, mesh faces the wrong way, too many triangles, mesh fails validation, holes or non-watertight meshes, textures too big or blurry, SurfaceAppearance and PBR maps, metalness or normal maps look wrong, rigid accessories and hats, UGC items, Accessory Fitting Tool, out of bounds, AvatarCreationService validation, EditableMesh or EditableImage previews, or generate_mesh."
license: MIT
---

# Roblox Asset Pipeline and UGC

Target: Roblox Studio (October 2026 build) on macOS, driven through the scenario-roblox-expert
toolkit.

Expert level here means every mesh arrives in Studio already at its size in studs, facing -Z, under
its triangle budget, closed when it must be, with maps sized and split for Roblox, and with numbers
that prove it. Fix in Blender, preview and audit in Studio without uploading, validate locally to
green, and stop exactly where Roblox needs an uploaded asset.

If a sibling skill named here is missing from your available skills, load it with `skill_get`
(Scenario MCP) or ask the user to install it (https://github.com/scenario-labs/skills#install);
unattended, proceed from tool schemas and flag the gap.

**REQUIRED BACKGROUND:** scenario-roblox-expert (channels, review loop, toolkit, current-Roblox
traps).

## Stance (the expert delta)

1. **Treat an AI GLB as raw input with known defects.** Image-to-3D output arrives about 0.95 units
   across, front facing +Z, every material `doubleSided`, `metallicFactor` 1.0 with painted partial
   metalness, 2048 px JPEG maps and pinholes [added, measured on two generator outputs]. Raw meshes
   need remesh, pivot and scale work (CallMeDogey).
2. **Decide size in studs in Blender, not in Studio.** One Blender unit is one stud; glTF then needs
   no Importer scale (Creator Docs, Importer; KatsBits [00:02:56]). Props pivot at the bottom center
   (Common Sense Machines [00:02:39]); accessories at the mesh center (validation #173).
3. **Turn the front to -Z before export.** glTF fronts face +Z; Roblox's LookVector is -Z. A 180
   degree yaw in Blender fixes it for good [added].
4. **An accessory is its bounding box, and a hat is its crown.** Bounds are per AccessoryType,
   measured around the attachment, and rotation grows the box (KatsBits [00:10:34]). The box follows
   `AvatarPartScaleType`: none or Classic gives the `GetValidationRules()` box (Hat 3 x 4 x 3),
   ProportionsNormal the docs row (1.87 x 2.5 x 1.87) [added, live]. Scale a hat so its crown clears
   the head, then check the box: filled to the Normal box by its brim, the test hat's crown was
   narrower than the default head [added].
5. **Measure watertightness; do not trust a fill operator.** `bmesh.ops.holes_fill` capped 2 of 9
   pinholes on the test hat, and decimation then created edges with three faces [added]. Cap each
   loop, repair after decimation, count boundary edges again. Never use Make Double Sided to hide
   holes (Creator Docs, Importer).
6. **Preview without uploading.** EditableMesh plus EditableImage rebuild the prepared mesh and its
   PBR maps in the place for audits, wear tests and captures [added]. That content is session-only
   and empty in a playtest copy [added]; ship through the Importer with Upload to Roblox off while
   iterating (Creator Docs; Templates [00:02:31]).
7. **Validate locally to green, then stop.** `ValidateUGCAccessoryAsync` runs Roblox's validator
   inside a playtest. Fix every string about geometry, schema, materials or bounds; ownership and
   moderation strings need an uploaded asset and end the agent's part (Creator Docs, validation
   system).
8. **Textures follow density, not the source.** 256 px per 2 x 2 x 2 studs, power of two; OpenGL
   normals; metalness 0 or 1 unless satin by design; opaque ColorMap on accessories (Creator Docs,
   texture specifications and SurfaceAppearance).

## Establish first

- Destination: in-experience prop, or Marketplace avatar item. Only the second must pass validation
  and be watertight.
- Size in studs per asset (an R15 character is about 5 to 6 studs tall), and for accessories the
  AccessoryType and the `AvatarPartScaleType` it will declare (Classic, ProportionsNormal,
  ProportionsSlender).
- Budget class: hero prop, clutter, or accessory (4,000 triangles).
- Source: GLB from scenario-3d (preferred), FBX (needs FBX Unit Scale), or OBJ (mesh only).
- Rigged or skinned input goes to scenario-roblox-animation after import.
- Defaults when unanswered: prop, bottom pivot, longest side from the concept's scale, texture side
  from `texture_side`, hat crown opening 1.35 studs, no scale type (Classic box).

## Procedure

Full code and recorded results: [procedures.md](references/procedures.md). Setup:
`import rbx_assets as ra` (it finds the lead toolkit). Every snippet ran in Studio 0.743 or Blender
5.2 on 2026-10-19, except those marked not yet run; Edit and playtest captures confirmed the fit (a
covered window returns dark frames: judge on numbers then).

1. **Triage.** Goal: know the defects. How: `ra.glb_info(path)` offline. GATE: triangles, size, map
   sizes, `doubleSided`, skins and extensions written down per asset.
2. **Fix in Blender.** Goal: size, facing, pivot, budget, closed mesh, Roblox maps. How:
   `ra.blender_prep({**ra.PROP_PREP or ra.ACCESSORY_PREP, "input", "out_dir", "yaw": 180, "scale": ...})`,
   with `{"opening": 1.35, "band": [0.08, 0.2], "cap": [3, 4, 3]}` for hats; it waits for the
   machine guard, runs `blender -b`, writes a report and four Workbench views. GATE:
   `ra.gates(report["after"], kind, type)` all pass, and the front view shows the front.
3. **Read live rules.** Goal: today's limits. How:
   `ra.run(studio, "return AssetAudit.rules()", kit=["AssetAudit"])`. GATE: `AccessoryMaxTriangles`,
   `MaxTextureSize` and the type's attachment `Size` and `Offset` recorded; the offline gates use
   them.
4. **Preview and audit in Studio.** Goal: the asset in the place, measured. How: `ra.stage` the
   packed mesh and maps, then `MeshBuild.build` and `AssetAudit.prop`. GATE: `Size` equals the
   Blender size within 0.01 stud, the triangle count matches, no audit error, the front capture
   shows the front.
5. **Build the accessory.** Goal: Accessory, Handle, one attachment named for the type. How:
   `MeshBuild.accessory`, then `AssetAudit.accessory(acc, rules)`. GATE: zero errors;
   `AvatarPartScaleType` is the only warning (the Accessory Fitting Tool adds it).
6. **Wear test.** Goal: it sits right. How: `UGCCheck.rig` and `UGCCheck.wear` in Edit, then
   captures front and side. GATE: a joint exists, attachment error under 0.01 stud, `opening.clears`
   (crown at least head-wide at the head top), and the brim rests on the head in the captures.
7. **Validate locally.** Goal: only upload-bound strings left. How: in a `Playtest`,
   `ra.stage(..., dm="Server")` and `UGCCheck.validate(acc, Enum.AccessoryType.Hat)`; run
   single-fault copies as negative controls, at most 10 calls per 60 seconds. GATE: the item returns
   valid with no string; every fault copy fails.
8. **Hand off the import.** Goal: the shipping path. How: the human or a computer-use agent imports
   `<name>_roblox.glb` with the settings in [gui-paths.md](references/gui-paths.md); the Accessory
   Fitting Tool generates the final accessory. GATE: the imported MeshPart's Size equals the
   preview's; P7 audits it again.

## Numbers

| Value                             | Relative to                                                                           | Source                                             |
| --------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------- |
| 20,000 triangles                  | One mesh in a place                                                                   | Creator Docs                                       |
| 4,000 triangles                   | Rigid or layered accessory                                                            | Creator Docs; live `AccessoryMaxTriangles`         |
| 60,000 vertices, 20,000 triangles | One EditableMesh; a quad counts as 2                                                  | EditableMesh reference                             |
| 256 px per 2 x 2 x 2 studs        | Texture side, next power of two                                                       | Texture specifications                             |
| 4096 px                           | Place textures (since 2026-01-30)                                                     | DevForum                                           |
| 1024 px                           | Avatar ColorMap, live `MaxTextureSize`; other avatar maps 256                         | Validation system; live                            |
| 1024 px                           | EditableImage side                                                                    | AssetService reference                             |
| Hat 3 x 4 x 3 studs               | No `AvatarPartScaleType` or Classic; ProportionsNormal 1.87 x 2.5 x 1.87              | Live rules and validator; accessory specifications |
| 10 pieces                         | Disconnected components per accessory MeshPart                                        | Validation #187                                    |
| 0.05 to 4.0 studs                 | Per-axis MeshPart size for avatar parts                                               | Validation #176, #177                              |
| 0.02                              | Lowest `MeshPart.Transparency` for soft alpha with AlphaMode Transparency             | SurfaceAppearance                                  |
| 0 to 40                           | `EmissiveStrength` on Marketplace items                                               | SurfaceAppearance                                  |
| 1.35 studs                        | Hat crown opening, for a 1.16-stud default R15 head                                   | [added, wear test]                                 |
| 0.3 stud                          | Hat attachment above the mesh bottom: brim a quarter of the head height below its top | [added, wear test and fit render]                  |
| 10 calls per 60 s                 | `ValidateUGCAccessoryAsync` rate limit                                                | Live error string                                  |

## Quality gates

Measurable:

- Blender report: every `ra.gates` entry passes; the raw input fails what it should (negative
  control).
- Studio: `AssetAudit` returns no error; `Size` and triangle count equal the report.
- Wear: joint present, attachment error under 0.01 stud.
- Validator: no string left that is fixable without an upload.

Visual (one contact sheet, 1,600 px at most, opened and read):

- Front of each asset faces the camera from -Z; props stand on the ground; nothing black or inside
  out.
- The hat sits on the head from the front and the side, neither floating nor sunk past the brim.
- Textures read like the concept: details in place, no smeared atlas.

Score the result with [critique.md](references/critique.md) before calling it done.

## Common mistakes

| Mistake                                                        | Symptom                                           | Fix                                                                                                                            |
| -------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Importing the unit-sized GLB as is                             | Prop the size of a brick                          | Scale in Blender to studs; Scale Unit Studs                                                                                    |
| No yaw on glTF input                                           | Lock or face on the back side                     | `yaw: 180` before export                                                                                                       |
| Make Double Sided to hide holes                                | Validation boundary-edge error; double triangles  | Close holes in Blender                                                                                                         |
| Trusting `holes_fill`                                          | "Not watertight" after the fix                    | Cap loops, repair after decimation, recount                                                                                    |
| Decimating in Studio's head                                    | Over 4,000 triangles at upload                    | Decimate in Blender to 3,800                                                                                                   |
| Packed metallic-roughness used as one map                      | Metal everywhere or nowhere                       | Split G and B to grayscale maps                                                                                                |
| Partial metalness kept                                         | Tinted, plastic-looking metal                     | Snap to 0 or 1 after reading the mask                                                                                          |
| ColorMap with alpha on an accessory                            | Validation #145, see-through spots                | `opaque_color`                                                                                                                 |
| TextureID and SurfaceAppearance both set                       | Validation #146                                   | One of them                                                                                                                    |
| Attributes or tags left on the accessory                       | Validation #191                                   | Strip before validating                                                                                                        |
| Pivot at the feet for an accessory                             | "Mesh data is not centered"                       | Center pivot                                                                                                                   |
| Rotating the hat inside the fitting box                        | Box red although the mesh looks inside            | Re-center and orient in Blender                                                                                                |
| Sizing a hat by its brim                                       | Head pokes through the crown                      | `scale.opening`, then `opening.clears`                                                                                         |
| `Massless` true on the Handle                                  | Validator: "Expected to be = false"               | Leave the default                                                                                                              |
| `AddAccessory` from the client on your own character           | No joint; the hat falls                           | Attach on the server; seat a local preview by CFrame                                                                           |
| Hat mesh and texture built from Editable content on the server | Clients draw a small checkered cube at the Handle | Keep the joint on the server; on each client, apply a locally built mesh (`ApplyMesh`) and `SurfaceAppearance` (procedures P8) |
| Expecting an EditableMesh preview to save                      | Part empty after reopening                        | Session only; import for real                                                                                                  |
| Expecting the Edit preview in a playtest                       | Copied parts keep Size but have no mesh           | Stage and build in that data model                                                                                             |

## Handoffs

- Receives from scenario-3d: GLB or FBX meshes with PBR maps (image-to-3D, remesh, retexture,
  rigging). Ask for a remesh run when decimation damages the silhouette.
- Receives from scenario-textures: PBR sets for one mesh, which become SurfaceAppearance here.
  Tileable sets go to scenario-roblox-environment as MaterialVariants.
- Receives from scenario-game-assets: the concept image that scenario-3d turns into a mesh (one
  centered subject, plain background, front view). Icons, sprites and UI art go to
  scenario-roblox-ui, decals to scenario-roblox-environment.
- Delivers to scenario-roblox-environment: MeshParts at true size with a bottom pivot, a proposed
  CollisionFidelity and the gate report; it places, sets final fidelity and LevelOfDetail, and
  lights.
- Delivers to scenario-roblox-animation: rigged or skinned imports, checked for scale and facing.
- Delivers to scenario-roblox-performance: each import batch, for its memory and batching audit
  (`references/memory-and-crowds.md`, `PerfAudit.assets`), which this skill does not repeat.

## Current Roblox notes

- `EditableMesh` and `EditableImage` are not creatable with `Instance.new`; use
  `AssetService:CreateEditableMesh()`, `CreateEditableImage()` and `Content.fromObject`. Published
  experiences need the Mesh and Image APIs setting.
- `CreateSurfaceAppearanceAsync` takes EditableImage content only; maps cannot be swapped afterward.
- The Avatar Joint Upgrade joins rigid accessories with `RigidConstraint`, not a weld. Find
  attachments with `FindFirstChild(name, true)`.
- `GenerateMeshAsync` is scheduled for deprecation; `GenerationService:GenerateModelAsync` with
  schema `Car5` or `Body1` replaces it.
- Places take 4096 px textures since 2026-01-30; avatar limits come from `GetValidationRules()`.
- Studio MCP runs with plugin rights: in Edit it wrote `SurfaceAppearance.ColorMap`,
  `ColorMapContent` and `MeshPart.CollisionFidelity` without error. Game scripts have fewer rights;
  test a snippet in a Script before shipping it in one.
- `generate_mesh` (Studio MCP) returns only `{generationName, tag}` and inserts a Model of segmented
  MeshParts with asset IDs and a TextureID; pass `size`, `maxTriangles` and `segmentation`.

## References

- [references/expert-notes.md](references/expert-notes.md): principles by source, disagreements, and
  what the live runs added.
- [references/procedures.md](references/procedures.md): full code for P1 to P11 with test ids and
  results.
- [references/avatar-item-checks.md](references/avatar-item-checks.md): engine calls behind each
  wrapper, motion on several bodies, six-view opacity, tilt, Fitting Tool leftovers (Unknown type,
  TexturePack, MeshSize).
- [references/critique.md](references/critique.md): blocking and quality checks for your own output.
- [references/gui-paths.md](references/gui-paths.md): Importer, Accessory Fitting Tool, validation
  plugin and Blender paths.
- [references/sources.md](references/sources.md): every doc and video with credentials and
  timestamps.
- [scripts/rbx_assets.py](scripts/rbx_assets.py): GLB triage, Blender runner with the machine guard,
  gates, texture sizing, payloads, kit runner.
- [scripts/blender_roblox_prep.py](scripts/blender_roblox_prep.py): the headless Blender inspect and
  prep pass.
- [scripts/agentkit/assets/](scripts/agentkit/assets/): `Payload`, `MeshBuild`, `AssetAudit`,
  `UGCCheck`.
