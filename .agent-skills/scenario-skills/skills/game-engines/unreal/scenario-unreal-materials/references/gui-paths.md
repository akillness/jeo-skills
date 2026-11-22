# GUI paths (for a computer-use agent or a human)

The same procedures as `procedures.md`, by menu. Menu names come from the saved 5.8 docs and the
expert notes; items marked [verify] were described in talks or older versions and must be confirmed
in the installed editor. Graph editing is the part scripts reach least well: when a scripted link
fails (`failed_links`), these are the clicks that replace it.

## Project settings

| Task                       | Path                                                                                                                                          |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Enable Substrate (restart) | Edit > Project Settings > Engine > Rendering > search "Substrate" > Substrate materials                                                       |
| GBuffer format             | same section > Substrate GBuffer Format (Project): Blendable GBuffer / Adaptive GBuffer                                                       |
| Rough refraction           | same section > Substrate translucent material rough refraction; Substrate opaque material rough refraction (Experimental)                     |
| Advanced Substrate views   | same section > Substrate advanced visualization shaders (Win64 DX12 editors only, not this Mac)                                               |
| Auto usage flags off       | Project Settings > Engine > Rendering > Materials > Automatically set Material usage flags in editor default (Lauf [00:31:10]) [verify label] |
| Energy conservation        | Project Settings > Rendering > Materials > Energy Conservation (off by default for backward compatibility)                                    |
| Virtual textures           | Project Settings > Engine > Rendering > Virtual Textures > Enable virtual texture support (on by default since 5.6)                           |
| Texture encode speed       | Project Settings > Engine > Texture Encoding (Fast and Final)                                                                                 |

## Material Editor

| Task                                                      | Path                                                                                                                                                                      |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New material / UI material                                | Content Browser > right-click > Material; Material > UI Material (Used with Static Mesh off)                                                                              |
| Add a node                                                | right-click the canvas, type the name ("Substrate Slab", "Horizontal Blend", "Channel Mask Parameter", "If"); Shift+click or Shift+Enter creates and auto-connects (5.6)  |
| Front Material                                            | root node, purple input at the bottom; every Substrate graph ends there                                                                                                   |
| Convert a legacy material (one-way)                       | right-click the root node > Convert to Substrate                                                                                                                          |
| Parameter blending                                        | select a Horizontal Blend or Vertical Layer > Details > Use Parameter Blending                                                                                            |
| Slab options                                              | select the Slab > Details > Sub-Surface Type (None, Wrap, Two-Sided Wrap, Diffusion, Simple Volume), Subsurface Profile, Specular Profile                                 |
| Substrate panel (features in downgrade order, PB preview) | Window > Substrate                                                                                                                                                        |
| Blend mode, lighting mode, refraction                     | select the root > Details > Material > Blend Mode; Translucency > Lighting Mode; Refraction > Refraction Method                                                           |
| Usage flags                                               | select the root > Details > search "usage"; Used with Static Mesh under Usage > Advanced (5.8)                                                                            |
| Sampler type and source                                   | select a Texture Sample > Details > Sampler Type; Sampler Source = Shared: Wrap                                                                                           |
| Fix sampler mismatches                                    | Clean Graph > Fixup Mismatched Samplers (5.7)                                                                                                                             |
| Enum on a scalar                                          | select a Scalar Parameter > Details > enumeration field (5.7 release notes; shown as 5.8 at Unreal Fest) [verify label]                                                   |
| Temporal Responsiveness (experimental)                    | right-click the canvas, search "Temporal Responsiveness"; needs `r.Velocity.TemporalResponsiveness.Supported=1`; check with `r.TSR.Visualize 3` (5.7) [verify node label] |
| Specular occlusion                                        | Masks cavity channel > One Minus > Multiply by 0.5 > Specular (legacy) or the Metalness helper's Specular pin (Substrate)                                                 |
| Custom Primitive Data                                     | select a Scalar or Vector Parameter > Details > Use Custom Primitive Data, Primitive Data Index                                                                           |
| Shader count and code                                     | viewport bottom right: Total Shaders (5.8); Window > Shader Code (list view of shaders); toolbar Stats and Platform Stats                                                 |
| Diff two versions                                         | right-click an asset > Diff against (5.7)                                                                                                                                 |
| Preview mesh                                              | viewport toolbar > Shader Ball (5.8) or drag a mesh onto the preview                                                                                                      |

## Material Instance Editor

| Task                       | Path                                                                                                                       |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Create                     | right-click a material or MI > Create Material Instance                                                                    |
| Parameters                 | Details > Parameter Groups; tick the override box, then edit (an editable static switch sets the HSPR tag even at default) |
| Usage Flag Overrides (5.8) | Details > Usage Flag Overrides [verify]                                                                                    |
| MPC override (5.7)         | Details > Parameter Collection Overrides with a derived MPC                                                                |
| Layer stack                | Layer Parameters tab: add, reorder (top wins), eye toggle, blend asset per layer                                           |
| HSPR tag                   | hover the asset in the Content Browser: Has Static Permutation Resource                                                    |
| Bulk edit                  | select assets > right-click > Bulk Edit via Property Matrix (5.8 for materials) [verify label]                             |

## Texture Editor

| Task                | Path                                                                                                                       |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Compression         | Details > Compression > Compression Settings; Compress Without Alpha; Maximum Texture Size; Lossy Compression Amount       |
| Color space         | Details > Texture > sRGB; Flip Green Channel (OpenGL normals)                                                              |
| Mips and group      | Details > Level Of Detail > Mip Gen Settings, LOD Bias, Texture Group, Never Stream                                        |
| Normal mips         | Details > Texture > Normalize after making Mips; Compositing > Composite Texture (roughness from normal variance)          |
| Judge RDO           | Details > Editor Show Final Encode; Oodle panel > Try Encodings, On-disk Sizes                                             |
| Per-platform result | Platforms panel (X dropped, S streamed, I inline); confirm with `listtextures` in a cooked build                           |
| Streaming pool      | console `stat streaming` [verify], `r.Streaming.PoolSize`, `r.Streaming.DropMips 1`, `r.Streaming.FullyLoadUsedTextures 1` |

## Viewport and console

| Task                                    | Path                                                                                                                      |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Shader complexity (hint only)           | View Mode > Optimization Viewmodes > Shader Complexity; `viewmode shadercomplexity`                                       |
| Buffer visualization                    | View Mode > Buffer Visualization > Base Color, Specular, Roughness, Metallic, World Normal                                |
| Substrate views                         | View Mode > Substrate > Material Properties, Material Count, Material Bytes Count, Substrate Info (console form [verify]) |
| Decal cost                              | `stat gpu` with `ShowFlag.Decals 0` and `1`                                                                               |
| RVT                                     | `stat virtualtexturing`, `stat virtualtexturememory`, `r.VT.MaxUploadsPerFrame`                                           |
| Game view (hide write-only RVT helpers) | G                                                                                                                         |

## Landscape and RVT

| Task              | Path                                                                                                                                                                                                  |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Target layers     | Landscape mode (Shift+2) > Paint tab (names shown here, not in Sculpt or Manage) > + to create Layer Info                                                                                             |
| Layer blend       | Material Editor > Landscape Layer Blend > Details > Layers + (Layer Name, Blend Type, Preview Weight)                                                                                                 |
| Assign            | select the Landscape > Details > Landscape Material                                                                                                                                                   |
| RVT asset         | Content Browser > right-click > Texture > Runtime Virtual Texture (size in tiles, tile size, material type)                                                                                           |
| RVT volume        | Place Actors > Runtime Virtual Texture Volume > Details > Transform from Bounds > Source Actor (eyedropper the landscape) > Set Bounds; or Landscape Details > Virtual Textures > add > Create Volume |
| Writers           | primitive Details > Virtual Texture > Draw in Virtual Textures (+), Draw in Main Pass (Never, From Virtual Texture, Always); Rendering > Translucency Sort Priority                                   |
| Rebuild SVT       | Build > Build Virtual Textures, or the volume's Build button; Map Check warns when stale                                                                                                              |
| Fix RVT consumers | RVT asset > Asset Actions > Fix Material Usage; Find Materials Using This                                                                                                                             |

## Decals and stylization

| Task                  | Path                                                                                                                                                                                           |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Decal material        | Details > Material Domain = Deferred Decal, Blend Mode Translucent or AlphaComposite; Substrate: Convert To Decal before Front Material                                                        |
| Place                 | Place Actors > Visual Effects > Decal Actor (arrow = projection direction); Details > Decal > Sort Order, distinct on overlapping decals [verify label]                                        |
| Receivers             | material Details > Decal Response; actor Details > Receives Decals                                                                                                                             |
| Toon Profile          | select the Substrate Toon BSDF > Details > Toon Profile > Create New Asset > Toon Profile; double-click it to edit the Diffuse Ramp keys (Delete removes a key, arrow resets)                  |
| Post-process material | Details > Material Domain = Post Process, Blendable Location ("Scene Color After DOF" before AA); Post Process Volume > Rendering Features > Post Process Materials; Infinite Extent (Unbound) |
| Overlay material      | mesh Details > Rendering > Overlay Material                                                                                                                                                    |
| Curve atlas           | Content Browser > Miscellaneous > Curve (Linear Color), Curve Atlas [verify menu]                                                                                                              |
