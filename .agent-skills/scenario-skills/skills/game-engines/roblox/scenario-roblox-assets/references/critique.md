# Critique rubric

Score your own asset work before calling it done. Every line is pass or fail; a single fail in
"Blocking" means not done.

## Blocking

| Check                            | Pass                                                                                                                                                                                | Evidence                                      |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Triangles                        | Prop at most 20,000 per mesh; rigid accessory at most the live `AccessoryMaxTriangles` (4,000 in the docs)                                                                          | P2 report `after.tris`; P7 `meshStats.tris`   |
| Size in studs                    | Matches the size you were asked for within 0.01 stud; props stand on y = 0                                                                                                          | P2 `dims_studs`, P5 `Size` and `bottom`       |
| Facing                           | The front of the asset faces -Z (the LookVector side)                                                                                                                               | Front capture shows the front                 |
| Watertight (accessories)         | 0 boundary edges, 0 edges shared by 3 or more faces                                                                                                                                 | P2 `after.boundary_edges`, P7 `boundaryEdges` |
| One mesh (accessories)           | One MeshPart named Handle, no other BasePart, no scripts, no attributes, no tags                                                                                                    | P7 findings                                   |
| Bounds (accessories)             | Mesh box inside the attachment box from `GetValidationRules` for the AccessoryType, or inside the smaller docs row when the Handle declares ProportionsNormal or ProportionsSlender | P7 has no `bounds` error; P9 valid            |
| Material and alpha (accessories) | Plastic, Transparency 0, AlphaMode Overlay, opaque ColorMap                                                                                                                         | P7 findings, P2 `color_alpha_min`             |
| Texture sizes                    | Places at most 4096; accessories ColorMap at most the live `MaxTextureSize`, other maps at most 256                                                                                 | P2 files, P7                                  |
| No upload                        | Nothing published, saved to Roblox or sent through Open Cloud                                                                                                                       | Your own command log                          |

## Quality

| Check                           | Pass                                                                                                                                    | Evidence                                    |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Texture density                 | Side from 256 px per 2 studs of the largest face, power of two                                                                          | `rbx_assets.texture_side`                   |
| Metalness                       | Mostly 0 or 1; partial values only where the surface is satin by design                                                                 | P2 `metal_partial_fraction`, mask inspected |
| Normal map                      | Mean close to (0.5, 0.5, 1.0); bumps lit from the light side in a capture                                                               | P2 `normal_mean_rgb`, capture               |
| No baked lighting in the albedo | Even color with no cast shadows painted in                                                                                              | Look at the ColorMap                        |
| Collision                       | Box or Hull on props smaller than a character; precise only for walkable large shapes                                                   | P5 `collision`, AssetAudit warnings         |
| Wear                            | Joint created, attachment error under 0.01 stud, `opening.clears` true, hat rests on the head without floating or sinking past the brim | P8 numbers and captures                     |
| Validator                       | `ValidateUGCAccessoryAsync` returns only errors that need an uploaded asset                                                             | P9 strings, classified                      |
| Motion                          | No Handle overlap with the torso through walk, run and emotes on Classic, Rthro and Rthro Narrow bodies                                 | avatar-item-checks.md report and captures   |
| Opacity                         | No view invisible in `opacity_views`; thin shapes checked from every side                                                               | `ra.opacity_views` result                   |

## Visual review (contact sheet, 1,600 px max)

- Front, side and three-quarter captures exist and are not blank: `rbx_review.image_checks` passes
  and no luminance band holds over 95 percent of the pixels (a window that draws no 3D scene passes
  `image_checks` alone).
- No black or inside-out faces, no see-through gaps, no texture seams across the front.
- The prop sits on the ground; the hat sits on the head; scale reads right next to an R15 character.
- The texture reads as the concept: same colors and details (lock, band, star), no smeared atlas
  islands.

## Report

State what passed, what failed, what still needs an upload to verify (ownership, moderation,
MeshId-based checks), and the next step. Never call an accessory "valid" while the validator still
returns strings you did not classify.
