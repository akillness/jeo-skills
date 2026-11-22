---
name: scenario-maya-lookdev
description: "Use when shading an asset in Maya with Arnold: OpenPBR or aiStandardSurface materials, hooking up Substance Painter or UDIM texture sets, color spaces (sRGB, Raw, ACEScg), a normal map that looks wrong, displacement with black holes or faceting, skin SSS, chrome and metals, glass or crystal, car paint, aiStandardHair, porting Standard Surface to OpenPBR, or a lookdev turntable with chrome and gray balls. Also when textures render washed out, too dark or plastic in Arnold."
license: MIT
---

# Look development in Maya 2027 (Arnold)

Expert look dev is a material that holds under any light a lighter throws at it: correct data in
(every map in the right color space through the right plug), physically meaningful base values
(measured metal colors, glass tinted by depth, scattering at real scale), then deliberate
imperfection, judged on a neutral turntable with reference balls, one change per render. Nothing is
done before a render has been looked at. If a sibling skill named here is missing from your
available skills, load it with `skill_get` (Scenario MCP) or ask the user to install it
(https://github.com/scenario-labs/skills#install); unattended, proceed from tool schemas and flag
the gap.

**REQUIRED BACKGROUND:** scenario-maya-expert (execution channel, review loop, 2027 version traps).

**Status (2026-09-24):** [`scripts/mx_shade.py`](scripts/mx_shade.py) is **not yet run in Maya**:
122 offline checks passed; the Maya layer ran against a fake `maya.cmds` (logic only). Once Maya is
installed: `tests/code/maya-lookdev/run_all.sh`, then fix the attribute tables from
`probe_lookdev.json`.

## Stance (the expert delta)

- **Every map is a three-part contract: color space, grayscale plug, destination.** Sarkamari's
  table [ZtEiVa3MPLg 00:27:44]; J Hill's two questions, "what color space is it and is it black and
  white" [mpk6IurOWbs 00:21:43]. Base, subsurface and emission color are color (sRGB for 8/16-bit,
  linear Rec.709 for EXR); everything else is Raw. outAlpha with Alpha Is Luminance off reads no
  data (Raycast [vPHhVrxxThU 00:19:14]). Maya 2027's rules tag .tx, .hdr and .exr as Raw, so a base
  color .tx or EXR arrives wrong: override it, Ignore Color Space File Rules on (Maya 2027 help).
- **Under ACEScg an HDRI is linear Rec.709, not Raw.** J Hill and Raycast set Raw, correct only in a
  linear-sRGB rendering space; the Arnold ACES page calls a linear HDRI read as ACEScg incorrect.
  Colors typed from linear-sRGB tables convert to the rendering space too [added: swatches are
  rendering-space numbers, Maya 2027 help].
- **Metals are data, not taste.** OpenPBR base color is F0 and specular color the F82 edge tint,
  both from the Arnold table; IOR does nothing on metals (Arnold OpenPBR doc; official intro
  [tEUiIBApw-U 00:02:51]). Generalists leave specular color white.
- **Scale is physics.** Subsurface radius and transmission depth are world lengths. Glass color
  lives in depth, not saturation: light tint, lower depth to deepen (Arvid [cpMBRIWwghg 00:18:13]).
  Skin scatters about 1 mm at real size (J Hill, scale 0.1 in cm [mpk6IurOWbs 00:18:31]).
- **Perfect reads as CG: "just look at the reflections".** Ranged noise on roughness, subtle micro
  bump, car-paint waviness on the coat normal, never the base (Arvid [cpMBRIWwghg 00:35:49,
  00:43:25]); J Hill's "subtle variation" layers [mpk6IurOWbs 00:23:24]. Polished metal and glass
  also get smudge or fingerprint roughness, the doc's own example (OPBR § Specular Roughness; Arvid
  [cpMBRIWwghg 00:25:11]), as clean as the reference.
- **Build layered shaders by killing every lobe, then adding one at a time,** one or two changes per
  render (Arvid [cpMBRIWwghg 00:36:52]; J Hill [mpk6IurOWbs 00:51:43]).
- **Hero close-ups displace; props use normal maps.** The normal-mapped nose "looks flat to me and
  fake" (J Hill [mpk6IurOWbs 00:28:39]). Bake float EXR with zero at 0 so micro detail adds, match
  the zero value, pad the bounds.
- **Judge on a lookdev rig, then under the reference's light.** Camera carrying chrome ball, gray
  ball and a diffuse chart; asset spins, then the HDRI (Raycast [vPHhVrxxThU 00:05:11, 00:07:43]). A
  hero product is judged against its photo, lit like the photo first (Arvid [cpMBRIWwghg 00:02:44,
  00:36:21]); a Painter transfer under Painter's HDRI and focal length (Sarkamari [ZtEiVa3MPLg
  00:13:10]).

## Establish first

| Input              | Changes                                                                                                                                                          | Default when silent           |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| Target             | Arnold stills or sequence vs a game engine (shade for export, judge in the engine)                                                                               | Arnold                        |
| Shader model       | OpenPBR for new assets (default since 2026, MaterialX and USD); aiStandardSurface when the scene, a Painter "Arnold (AiStandard)" export or the pipeline uses it | OpenPBR                       |
| Hero or background | per-material shaders, displacement, breakup vs one textured shader (Raycast [vPHhVrxxThU 00:11:20])                                                              | hero if it fills the frame    |
| Texture source     | Painter preset, normal convention, UDIMs, bit depth, displacement zero and scale, whether AO is meant to be used                                                 | OpenGL normals, AO unused     |
| Rendering space    | `mx_shade.cm_info()`; converts typed colors                                                                                                                      | ACEScg, Maya-default config   |
| Scale              | SSS, transmission, displacement, noise scales                                                                                                                    | real size in cm               |
| Look reference     | photos per material; HDRI: neutral studio, the sequence's graded HDRI for plates (Raycast [vPHhVrxxThU 00:01:58]), Painter's for a transfer                      | procedural studio HDR [added] |
| Camera             | 85 mm portrait lens (J Hill [mpk6IurOWbs 00:05:10]); longer for products [added]                                                                                 | 85 mm, 24 + 24 frames         |

## Workflow

All stages run headless through scenario-maya-expert's `mx_run.py --plugins mtoa`;
`import mx_shade as sh`. Arnold RenderView is GUI only: iterate with batch renders you open.

1. **Intake.** `mx_validate.validate(profile="model")`, `mx_audit.audit(mesh)` for UVs (every face
   mapped, clean UDIM tiles), real-world size from the bounding box, closed outward meshes for SSS
   and transmission (Arnold docs). GATE: validate clean, UVs complete, size matches the reference.
2. **Lookdev scene.** `ld = sh.lookdev_scene(["asset_GRP"], hdri=path, frames=24)`: turntable
   locators, skydome at HDRI width (cap 4096), HDRI tagged linear Rec.709, camera with the reference
   strip hidden from secondary rays. GATE: frame 1: chrome ball shows the HDRI the right way round,
   gray ball neutral, close to the chart's neutral 5 patch.
3. **Material plan.** One shader per material on heroes, named `<asset>_<part>_MTL` / `_SG`,
   assigned by a name table so remodels keep shaders (Arvid [cpMBRIWwghg 00:01:37]). GATE: every
   mesh off the default shading group.
4. **Texture hookup.** `ts = sh.parse_texture_set(folder)`;
   `sh.build_material(ts, "case", meshes=[...], texture_set="watch_case")`. Options: `normal_mode`
   aiNormalMap (default), bump2d, hybrid; `tangent_space="mikk"` on 2027.1+ for Painter bakes, A/B
   it on a bevel [verify]; `ao="multiply"` only to match a Painter or real-time look. Pre-bake .tx
   (TX Manager or `maketx`) for heavy assets and batches; file nodes stay on the source images and
   spaces (Raycast [vPHhVrxxThU 00:13:04]). GATE: `sh.verdict(sh.lint_scene())["pass"]`; a render
   under Painter's HDRI and focal length matches a Painter screenshot.
5. **Base values, one lobe at a time.** `saved = sh.isolate_lobes(shader, keep=("base",))`, render,
   add specular, coat and the rest; `sh.apply_preset(shader, "steel_polished")` for table materials.
   GATE: per-material crop at final samples; highlight size and edge tint against the photo.
6. **Surface detail.** Normal map for props; displacement for hero organics:
   `sh.add_displacement(sg, "disp.exr", meshes, scale=s, zero=0.0, iterations=2)` (3 to 4 for
   finals). GATE: polygon budget printed, no clipped black patches, A/B crop normal vs displacement.
7. **Breakup.** `sh.roughness_breakup(shader, lo, hi)`, `sh.smudge_roughness(shader)` (scan or cell
   noise, added on top), `sh.noise_bump(shader, height, scale)`, `sh.coat_waviness(paint)`;
   per-object masks (dial, indices, case parts) as `mtoa_constant_` user data, no extra textures:
   `sh.user_mask(shapes, "mask")` (Arvid [cpMBRIWwghg 00:23:04]). GATE: on the turntable, highlights
   break and travel across panels, never wobble.
8. **Special materials.** `sh.skin(...)`, glass presets plus `sh.set_transmission_depth`,
   `sh.car_paint(...)`, `sh.hair_shader(...)`; checks in
   [`references/critique.md`](references/critique.md). Transmissive media that touch or overlap
   (crystal on a gasket, liquid in glass) get a Dielectric Priority: higher wins, glass 3,
   inclusions 2, liquid 1 (OPBR § Dielectric Priority). GATE: lint `dielectric_priority` clean.
9. **Turntable review and handoff.** `sh.render_frames([1, 7, 13, 19, 25, 31, 37, 43], out)` writes
   PNGs and a sheet; judge with the critique; `sh.handoff_report(path)`, new saved version. GATE:
   lint passes, sheet reviewed, not-verified list written.

## Numbers

| Item               | Value                                                                                                                                        | Relative to, source                                               |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Steel F0 / F82     | 0.669 0.639 0.598 / 0.789 0.823 0.870                                                                                                        | linear sRGB, Arnold OpenPBR table (12 metals in `METALS_OPENPBR`) |
| Skin               | subsurface 1, radius scale (1, 0.35, 0.2), IOR 1.4, radius 1 mm                                                                              | J Hill [mpk6IurOWbs 00:17:25]; doc example 3.7 mm is deeper       |
| Skin oil           | coat roughness about 0.1, mask from inverted roughness                                                                                       | J Hill [mpk6IurOWbs 00:32:49]                                     |
| Pore chatter       | alligator cell noise, amplitude 0.003 to 0.004 in displacement                                                                               | J Hill [mpk6IurOWbs 00:34:48]                                     |
| Subdivision        | catclark, 2 while working, 3 to 4 final; each level x4 polygons                                                                              | J Hill; Arnold subdivision doc                                    |
| Displacement zero  | 0 for float bakes, 0.5 for mid-gray maps                                                                                                     | J Hill [mpk6IurOWbs 00:26:59]                                     |
| Glass              | IOR 1.5, roughness 0, light tint, depth near object size                                                                                     | Arvid [cpMBRIWwghg 00:17:40]; [added] depth start                 |
| Dispersion         | off on flat, parallel-faced crystal (no visible fringe) [added optics]; small scale with the material's Abbe on faceted gems or close bevels | OPBR "gems only"; digest P9                                       |
| Rubber             | linear base 0.01 to 0.04, roughness 0.2 to 0.4 via smoothstep range                                                                          | Arvid [cpMBRIWwghg 00:06:25, 00:10:47]                            |
| Leather            | alligator cell noise bump, scale 400 to 500, very subtle, roughness about 0.2                                                                | Arvid [cpMBRIWwghg 00:04:33]                                      |
| Brushed metal      | roughness about 0.15, anisotropy up, specular samples 3, rotation map mip bias -8, smooth tangents + 1 iteration                             | Arvid [cpMBRIWwghg 00:15:43]; SS doc                              |
| Car paint          | flakes 0.001 to 0.025 scale, flake roughness 0.2, coat 1, coat-normal noise at 3, 25, 80, 200 mixed about 0.01                               | Arvid [cpMBRIWwghg 00:39:01 to 00:47:46]                          |
| Thin film          | Standard Surface 0 to 2000 nm; OpenPBR micrometers, colors fade above 1                                                                      | Arvid [cpMBRIWwghg 00:31:47]; [tEUiIBApw-U 00:12:35]              |
| Hair               | melanin 0.2 blonde, 0.5 brown or red, 1 black; roughness 0.2; IOR 1.55; shift 0 to 10; diffuse 0; tints white                                | Arnold Standard Hair doc                                          |
| Skydome resolution | HDRI width (default 1000)                                                                                                                    | Arnold lights doc                                                 |

## Quality gates

- **Code:** `sh.verdict(sh.lint_scene())["pass"]` (zero errors). The lint covers the texture
  contract (spaces, plugs, UDIM, normal routes, missing files, .tx), physical plausibility (weights,
  F82, glass tint and depth, dielectric priority, thin film, opacity, anisotropy, smudges),
  subdivision and displacement, and hygiene. Rules: `references/critique.md`.
- **Visual:** the turntable sheet and crops, judged with `references/critique.md`: breakup visible
  and moving, metal edge tint, glass tint deepening with thickness, ear backlight and a non-waxy
  nose; fireflies that survive more samples are data (Raycast [vPHhVrxxThU 00:33:43]).

## Common mistakes

| Mistake                                               | Looks like                                        | Fix                                                     |
| ----------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------- |
| Roughness or metal map in sRGB                        | glossy-plastic or dull metal                      | Raw + Ignore Color Space File Rules                     |
| Grayscale via outAlpha, Alpha Is Luminance off        | map has no effect                                 | outColorR, or Alpha Is Luminance on                     |
| Base color .tx or EXR left on the Raw rule            | washed-out or oversaturated color                 | sRGB (8/16-bit source) or linear Rec.709                |
| HDRI on Raw under ACEScg                              | over-saturated lighting and reflections           | linear Rec.709 input space                              |
| Normal into a plain bump or straight into the shader  | lumpy or flat normals                             | aiNormalMap, or bump2d Tangent Space Normals            |
| DirectX normal read as OpenGL                         | relief inverted on one axis (dents read as bumps) | invertY on aiNormalMap (flip G on bump2d)               |
| Smooth Mesh Preview plus Arnold iterations            | render time explodes                              | displaySmoothMesh 0                                     |
| Displacement zero value wrong                         | object inflated or shrunk                         | 0.5 mid-gray maps, 0 float bakes                        |
| No bounds padding                                     | black holes in the displaced render               | padding from the maximum displacement                   |
| Saturated transmission color                          | black, ink-like glass                             | light tint, lower depth                                 |
| Overlapping glass or liquid at the same priority (0)  | wrong refraction in the overlap                   | Dielectric Priority, higher wins                        |
| Anisotropy at roughness 0 or faceted                  | brushing invisible or stepped                     | roughness > 0, smooth tangents, 1 iteration             |
| Car-paint waviness on the base normal                 | coat reflections stay perfectly straight          | coat normal only (Arvid [cpMBRIWwghg 00:43:25])         |
| Layer shader created, displacement left on the old SG | displacement disappears                           | reconnect to the new SG (J Hill [mpk6IurOWbs 00:49:07]) |

## Handoffs

- **Receives** from scenario-maya-retopology-uv: a version passing `validate(profile="model")`, UVs
  complete (0-1 or clean UDIMs), texel density stated, bakes named by channel with normal convention
  and tangent basis, displacement EXR with its zero value and scale. From Substance Painter:
  textures, preset name, normal format, UDIM flag, the HDRI Painter displayed. From
  scenario-maya-groom: descriptions to shade with aiStandardHair.
- **Delivers** to scenario-maya-lighting-rendering: `<asset>_lookdev_v###.ma` (never over the
  source) with named materials and shading groups; `handoff_report()` JSON (materials, textures,
  color spaces, .tx status, displacement, a passing verdict); the turntable sheet; sampling notes
  (SSS, transmission depth, anisotropy, flakes to protect from the denoiser); the not-verified list.
  Lighting owns render settings, AOVs, light rigs and denoising.

## Maya 2027 notes

- OpenPBR is the default shader. Porting from Standard Surface (`sh.port_standard_to_openpbr`): thin
  film nm to micrometers, emission weight 1 to 1000 nits, SSS radius and scale roles swapped, sheen
  to fuzz, dispersion needs scale above 0, metal colors re-picked from the F82 table. "Convert All
  Standard Surface to OpenPBR Surface" skips shaders inside networks (MTOA-2560): lint after.
- Color names: default input `sRGB Encoded Rec.709 (sRGB)` since 2026.2, linear sRGB spelled two
  ways, "Utility - Raw" is ACES 1.x naming: always `sh.space_name(role)`. Regenerate .tx after
  changing the rendering space (Brejon).
- `normal_map.tangent_space_type` mikk (MtoA 5.6.1.1, Maya 2027.1); `interior_set` replaces
  `sss_setname`; OpenPBR thin film energy change in 5.6.0 can shift hue on old assets; Standard Hair
  `scattering_mode` (5.6.0).
- Maya IPR does not work with MtoA 5+ (Arnold RenderView); command-line renders watermark without a
  license; "Use Autobump in SSS" is deprecated; nested dielectrics on by default change old
  glass-in-liquid scenes.

## References

- [`references/expert-notes.md`](references/expert-notes.md): depth per expert with timestamps,
  disagreements and deciders. Load when a material or decision is not covered above.
- [`references/procedures.md`](references/procedures.md): test-backed procedures, hookup to handoff.
  Load before writing shading code.
- `references/critique.md`: the rubric for a turntable, a crop or a lint report. Load at every gate.
- [`references/gui-paths.md`](references/gui-paths.md): Hypershade, Attribute Editor, Arnold and
  Painter paths for a computer-use agent or a human.
- [`references/sources.md`](references/sources.md): sources, credentials, URLs, timestamps.
- `scripts/mx_shade.py`: the toolkit (docstring lists every call).
