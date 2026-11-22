# Expert notes

Principles and judgment by source, with timestamps. Claims marked [added] are this skill's own,
backed by the live measurements in [procedures.md](procedures.md). Where sources disagree, the
deciding condition is given.

## Roblox Creator Docs (importer, specifications, validation)

- The Importer takes FBX, glTF and OBJ. FBX and glTF carry hierarchies, PBR textures, cages, rigs
  and vertex colors; OBJ is mesh only (Importer).
- Keep **Upload to Roblox** off while iterating, so throwaway copies never reach the Toolbox or
  Asset Manager (Importer; Templates [00:02:31]).
- **Scale Unit** must be the unit the file was modeled in. With 1 Blender unit per stud, Studs is
  correct and glTF needs no other setting (Importer; export requirements).
- **Make Double Sided** is "more performance intensive" and hides holes that validation flags later
  (Importer).
- One mesh is at most 20,000 triangles; rigid and layered accessories at most 4,000 (art
  specifications; rigid accessory specifications).
- Texture budget: 256 x 256 for every 2 x 2 x 2 studs the asset occupies, stepping up to the next
  size when larger (texture specifications).
- Places accept up to 4096 x 4096 since 2026-01-30; avatar items up to 2048 since 2026-02-12; the
  validation example caps ColorMap at 1024 and other maps at 256 (texture specifications; DevForum;
  validation system). Read the live number from `GetValidationRules().TextureRules.MaxTextureSize`.
- Normal maps are OpenGL tangent space only; flat is (127, 127, 255). Roughness and metalness are
  8-bit grayscale. Metalness is 0 or 1 in most cases (SurfaceAppearance).
- `AlphaMode` Overlay reveals `MeshPart.Color` where the ColorMap is transparent; Transparency cuts
  the mesh away; soft gradients need `MeshPart.Transparency` of at least 0.02 (SurfaceAppearance).
- A rigid accessory is one mesh, watertight, no skinning, Plastic, Transparency 0, white vertex
  color, one attachment named for its type, no scripts or extra parts (rigid accessory
  specifications).
- Size limits are per AccessoryType and body scale, measured around the attachment point; Hat at
  Normal scale is 1.87 x 2.5 x 1.87 studs (rigid accessory specifications). The validator applies
  that row only when the Handle declares `AvatarPartScaleType` ProportionsNormal; with none or
  Classic it applies the `GetValidationRules()` box, 3 x 4 x 3 for a Hat [added, live].
- Validation also rejects attributes and tags anywhere in the asset, TextureID together with a
  SurfaceAppearance, a mesh not centered at its origin, more than 10 disconnected components, and
  boundary edges (validation system #146, #173, #187, #188, #191, #207).
- Ownership and moderation checks need uploaded assets owned by the uploader (validation system #193
  to #195). Those are the checks no local run can pass.
- `AvatarCreationService:ValidateUGCAccessoryAsync(player, accessory, accessoryType)` runs the real
  validator in Studio, yields, and returns `(boolean, {string}?)`. `GetValidationRules()` returns
  the live limits (AvatarCreationService reference).
- EditableMesh: 60,000 vertices and 20,000 triangles; a quad counts as two. Counter-clockwise
  winding is the front face (EditableMesh reference; Catargo [00:01:11], [00:09:22]).
- `CreateSurfaceAppearanceAsync` accepts only EditableImage content today, and the maps cannot be
  swapped after creation (AssetService reference).

## KatsBits (Accessory Fitting Tool, 2026)

- Roblox judges an accessory by its bounding box, not the visible mesh. Rotating off-axis grows the
  box, so a mesh that looks inside can still be out of bounds [00:10:34]. Re-center in Blender first
  [00:10:01].
- Export glTF for rigid accessories; FBX arrives larger and needs a scale fix [00:02:56].
- Triangulate yourself and rotate diagonals where concave and convex surfaces meet, or the back
  shows through the front [00:00:39].
- The fitting tool builds `Accessory` > `Handle` MeshPart > the type's attachment [00:13:38]. Test
  by dropping the Accessory into a rig: the attachment places it [00:16:33].
- Pre-scale and pre-rotate before generating; the zone fixes the size [00:14:47].

## Roblox Learn ("Nachos", senior 3D artist, Madison_Hatter2)

- The fitting tool's box is a live size gate: blue valid, red out of bounds (Nachos, Eed29gV0hLA
  [00:09:05]).
- Merge by distance after bevels, then check the geometry (Nachos, Eed29gV0hLA [00:01:57]).
- Never delete cage vertices on layered clothing; hide them (Nachos, C-DwGRBHvmE [00:09:39]).
- Outer cages too far from the mesh fail validation and get items removed (senior 3D artist,
  QwZaA9Gc-WQ [00:52:37]).
- Shoulder pets: upload as Shoulder but attach to the neck so they do not bob (Madison_Hatter2,
  MlyJD_ix9CE [00:32:15]).
- Apply all transforms and export the selection only (Madison_Hatter2 [00:29:56]).

## Practitioners on AI meshes

- Raw AI outputs need remeshing, pivot and scale work before Roblox; image-first generation gives
  more reliable shapes than bare text (CallMeDogey, C37zsRbmYTQ [00:00:32], [00:03:44]).
- Set prop pivots at the bottom of the mesh and embed textures in the export (Common Sense Machines,
  2PuL9bgLBT4 [00:02:39], [00:02:51]).
- Wrap Roblox's own generation calls in `pcall`; moderation can reject benign prompts and texture
  generation can fail separately (Paul1Rb, r1MOsgqzKrg [00:05:11], [00:06:16]).
- Pivot and scale mismatches, not triangle counts, cause most "outside bounds" errors (Joemam's UGC,
  UyeeecOGOfA [00:00:35], [00:01:09]).

## Disagreements and deciding conditions

| Question              | Position A                                | Position B                                                | Decide by                                                                                     |
| --------------------- | ----------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Watertight required?  | CG Noob: open meshes work fine [00:26:51] | Docs: watertight, boundary edges fail validation          | Marketplace items: watertight. In-experience props: optional, then hide holes from the camera |
| FBX scale             | Older videos: transform scale 0.01        | Docs: Apply Scalings = FBX Unit Scale; glTF needs nothing | Prefer glTF; FBX with FBX Unit Scale                                                          |
| Mesh triangle ceiling | Older videos: 10,000                      | Docs: 20,000 per mesh, 4,000 per accessory                | Docs                                                                                          |
| Avatar texture size   | Docs example: ColorMap 1024, others 256   | DevForum 2026: Marketplace 2048                           | `GetValidationRules().TextureRules.MaxTextureSize` on the day (1024 on 2026-10-19)            |
| Hat box               | Docs table: 1.87 x 2.5 x 1.87 (Normal)    | `GetValidationRules()`: 3 x 4 x 3                         | The `AvatarPartScaleType` the item declares; the validator switched boxes on it [added]       |

## Added from the live runs

- Image-to-3D GLBs arrive about 0.95 units across, centered, with every material `doubleSided`,
  `metallicFactor` 1.0 and three 2048 px JPEG maps [added; measured on two image-to-3D outputs].
- Their front faces +Z, the glTF convention. Roblox's front is -Z, so turn them 180 degrees about
  the up axis before export [added; seen in Blender renders].
- `bmesh.ops.holes_fill` capped 2 of 9 simple pinhole loops on the hat; capping each loop with a
  face closed all of them [added].
- Collapse decimation from 15,575 to 3,686 triangles left edges shared by three faces; cutting those
  faces out and capping again restored a closed mesh [added].
- The generator painted partial metalness: on the chest, 25 percent of texels sat between 0.1 and
  0.5 and only 2.7 percent above 0.5. Snapping at 0.5 kept the gold lock and turned the iron bands
  non-metal [added]. Look at the mask before choosing a threshold.
- A hat scaled by its brim to fill the Normal box had a 0.93-stud crown opening; the default R15
  head is 1.16 studs wide, so the head showed through. Scaling by the crown opening (1.35 studs)
  fixed it and stayed inside the Classic box [added].
- `ValidateUGCAccessoryAsync` passed the prepared hat built from EditableMesh and EditableImage
  content, rejected `Massless` true on the Handle, and answered one problem per call. Its limit is
  10 calls per 60 seconds [added].
- `Humanoid:AddAccessory` on the default R15 rig joined the hat with a `RigidConstraint` and
  rescaled the Handle to 0.969 of its size [added].
- In the Client data model, `Humanoid:AddAccessory` on the player's own character created no joint;
  the Handle fell 38.5 studs in half a second. From the Server data model it joined with a
  `RigidConstraint`, and the client read attachment error 0 over one second after replication
  [added].
- A hat built on the server from EditableMesh and EditableImage content replicated with its size,
  joint and position, but the client drew it as a small checkered cube. `MeshPart:ApplyMesh` with a
  part built on the client, plus a locally built `SurfaceAppearance`, drew the real hat in place
  (Studio playtest; a live server was not tested) [added].
- Parts built from EditableMesh in Edit keep their Size in a playtest copy but lose the mesh
  (SourceType None) [added].
- Roblox's `generate_mesh` returned two segmented, closed MeshParts with asset IDs and a TextureID,
  about 5 x 4 x 4 studs for a chest prompt with no size given [added].
