# GUI paths

Menus and panels for the same work, for a human or a computer-use agent. Studio paths use the Next
Gen UI (tabs Home, Model, Avatar, UI, Script, Plugins). Each row names the scripted substitute from
[procedures.md](procedures.md) when one exists. Paths come from the Creator Docs and the videos in
[sources.md](sources.md); they were not clicked in this skill's tests (no GUI scripting).

## Import (the shipping path)

| Step                         | Path                                | Setting or action                                                                                 | Scripted substitute                                                    |
| ---------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Open the Importer            | File > Import (or Home > Import 3D) | Pick the `.glb` or `.fbx`; several files open the import queue                                    | None. The Importer is a dialog; the agent preview is P5 (session only) |
| Stop uploads while iterating | File General                        | **Upload to Roblox** off                                                                          | Not needed for P5                                                      |
| Units                        | File Geometry                       | **Scale Unit** = Studs when 1 Blender unit = 1 stud                                               | P2 scales in Blender                                                   |
| Orientation                  | File Transform                      | World Forward Front, World Up Top (defaults)                                                      | P2 `yaw`                                                               |
| Pivot                        | File General / Object General       | Set Pivot to Scene Origin on, Use Imported Pivot on                                               | P2 `pivot`                                                             |
| One part or a model          | File Geometry                       | **Merge Meshes** off for separate props                                                           | n/a                                                                    |
| Faces                        | File Geometry                       | **Invert Negative Faces** off unless a mirrored export flipped faces (importer.md, File geometry) | P2 sets glTF single-sided                                              |
| Faces                        | Object Geometry                     | **Make Double Sided** off (importer.md, Object geometry)                                          | P2 sets glTF single-sided                                              |
| Vertex colors                | Object Geometry                     | **Ignore Vertex Colors** on for AI meshes, or strip them in Blender                               | P2 strips them                                                         |
| Batch settings               | Queue row, right-click              | **Apply settings to all**                                                                         | n/a                                                                    |
| Read warnings                | Hierarchy icons in the preview      | Expand to the child with the icon; red = error, orange = warning                                  | P3 gates                                                               |
| After import                 | Right-click the result              | **Find in Workspace**; **Copy asset ID**                                                          | `insert_asset` once an ID exists                                       |

## Accessory

| Step                                 | Path                                                                                                          | Setting or action                                                                                                                                   | Scripted substitute                                                                        |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Fit a rigid accessory                | Avatar > Accessory Fitting Tool                                                                               | Select the MeshPart > Next > Accessory > type (Hat) > body scale > fit inside the box (blue valid, red out of bounds) > Generate MeshPart Accessory | P6 builds Accessory, Handle and attachment; P7 checks the bounds from `GetValidationRules` |
| Body scale                           | Accessory Fitting Tool, body type                                                                             | Classic, Normal (Rthro), Slender (Rthro Narrow); Normal and Slender shrink the box the validator applies (Hat 1.87 x 2.5 x 1.87 at Normal, live)    | `AvatarPartScaleType` StringValue (P7 warns when missing or not Classic)                   |
| Wear test                            | Avatar > Rig Builder, or Insert a rig                                                                         | Drop the Accessory into the rig, not onto the head                                                                                                  | P8 `UGCCheck.wear`                                                                         |
| Run validation with visual aids      | File > Beta Features > **Visualizing UGC Validation**, restart, then mezzanine + > Add tools > UGC Validation | Select the accessory > Run validation > confirm the type                                                                                            | P9 `ValidateUGCAccessoryAsync` in a playtest                                               |
| Avatar Setup (bodies, layered items) | Avatar > Avatar Setup                                                                                         | Rig, cage and test layered clothing                                                                                                                 | None; out of scope for scripted checks beyond P7                                           |
| Upload                               | Right-click > Save to Roblox, then Creator Hub                                                                | Fee, moderation, ownership                                                                                                                          | None. Never in agent work: stop at P9                                                      |

## SurfaceAppearance by hand

| Step                  | Path                                                 | Setting                                                                                             |
| --------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Add PBR to a MeshPart | Explorer, hover the MeshPart > + > SurfaceAppearance | Paste uploaded image IDs into ColorMap, NormalMap, RoughnessMap, MetalnessMap                       |
| Tint                  | SurfaceAppearance properties                         | `Color` multiplies the ColorMap; `MeshPart.Color` shows only where AlphaMode Overlay is transparent |
| Alpha                 | SurfaceAppearance properties                         | `AlphaMode` Overlay for accessories; Transparency for cutouts with `MeshPart.Transparency` 0        |

## Blender (the fix stage)

| Step         | Path                                                                                               | Setting                                                                |
| ------------ | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Import GLB   | File > Import > glTF 2.0                                                                           | Defaults                                                               |
| Find holes   | Edit mode, Select > Select All by Trait > Non Manifold                                             | Count boundary edges                                                   |
| Close a hole | Alt+click the boundary loop, E, right-click > Merge Vertices > At Center (Roblox watertight guide) | Or F to fill, then triangulate                                         |
| Decimate     | Modifier > Decimate > Collapse                                                                     | Ratio = budget / triangles, Triangulate on                             |
| Export       | File > Export > glTF 2.0                                                                           | Selected Objects, Apply Modifiers, +Y Up, no animation, no compression |
