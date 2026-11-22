---
name: scenario-unreal-materials
description: 'Use when a UE5 task involves materials or textures: a master material and instances for a kit, Substrate or legacy, Blendable vs Adaptive GBuffer, glass, emissive screens, decals, edge wear and dirt, landscape layers and RVT, toon or cel shading, "too many shaders" or shader permutations, static switches, usage flags, texture compression (BC7, normal maps, ORM packing, sRGB), texture memory, or "is this material expensive".'
license: MIT
---

# Unreal materials (master materials, Substrate, textures, shader cost)

Expert level means a few master materials whose instances cover the kit, a known and budgeted
permutation count, cost proven in milliseconds on a fixed camera, and physically plausible values
before any artistic push. The graph is authored once (scripted build or template); everything else
is instances, Custom Primitive Data and textures that follow a role policy. Never trust the
instruction count or a pretty preview. If a sibling skill named here is missing from your available
skills, load it with `skill_get` (Scenario MCP) or ask the user to install it
(https://github.com/scenario-labs/skills#install); unattended, proceed from tool schemas and flag
the gap.

**REQUIRED BACKGROUND:** scenario-unreal-expert (channels, review loop, 5.8 traps).

**Status (2026-09-24):** Unreal is not installed; offline tests pass
(`tests/code/unreal-materials/run_all.sh`, editor layer on a fake `unreal`). Every snippet is **not
yet run in Unreal**: run P0 first.

## Stance (the expert delta)

- **Permutations = usage flags x unique static parameter sets across instances (x quality levels
  with a Quality Switch), never a node count.** A parent flag adds a shader row to every unique
  child (Lauf and Nadro, Fortnite [wobQ8ZKQpbc 00:24:25, 00:05:32]); parents carry the fewest flags,
  instances opt in (5.8 Usage Flag Overrides [verify]). Before adding a switch, count the instances
  that would set it (`switch_ranking`; Fortnite kept its top 10 [00:29:31]).
- **A static switch must gate texture samples, or heavy math most instances skip.** Anything else is
  an If (parameter into A, 0.5 into B, A > B pin, never A == B), an Enum-bound scalar or a Channel
  Mask Parameter; the Static Component Mask Parameter is obsolete (Lauf [00:40:24, 00:40:56,
  00:42:35]). An editable switch at default still sets the HSPR tag (5.7).
- **The instruction count is not cost.** Sine plus cosine read +2 but cost about 40 GCN cycles; a
  fetch waits about 200 (Swierad [y0QASid1v8w 00:20:57, 00:35:57]). Math independent of the fetch
  hides inside that wait (a screen's scanlines are nearly free); math on the sampled value is paid
  in full [00:39:34, 00:46:03]. Budget samples and transcendentals (`cost_census`), open every
  material function ("cheap" in a name is not a measurement [00:22:31]), decide on ms at a fixed
  camera.
- **Substrate starts from one slab** (Morgan, Epic [SqPaL8HS_Lw 00:25:45]): a Slab or the Metalness
  helper, never a hand-added Substrate Shading Model node (the conversion target, Substrate
  overview). **Blendable is a ceiling** for every platform, SM6 included (5.7 article); **Adaptive
  falls back per platform** by itself and costs 20 to 80 B/px (663 MB at 4K), about +15% cook and
  forced DBuffer decals (Ben Cloward [P5I38f2O6W8 00:05:46, 00:06:54]). Converting a material is
  one-way.
- **Metal next to paint is two slabs, not gray metallic** (gray reads as plaster, Ben [VrY_SSvWdQ4
  00:05:39]). With Use Parameter Blending a Horizontal Blend is near-lossless and one slab
  everywhere (Morgan [00:37:35]): mask sharpness is then artistic, not cost. "Mix exactly 0 or 1
  evaluates one slab" holds only without parameter blending, on Adaptive [00:29:38]. Parameter
  blending on a Vertical Coat is lossy and propagates beneath: plan it early [00:38:08, 00:38:43].
- **Detail comes from packing and tiling, not resolution.** Two samples per terrain layer (CR +
  NOH), a 2K game ceiling, compression by role, sRGB only on color, packed normals never as
  Normalmap, BC7 for unrelated channels (Ben [-UZlUUQSGgQ 00:12:36], [gjOO5g4cgng 00:11:02]; Sumo
  [SAr7oPKsgLE 00:29:20]; textures doc). Memory truth is the Platforms panel and `listtextures` in a
  cooked build; RDO shrinks disk, not memory.
- **Glass is matter, not opacity:** Colored Transmittance only when tinted (Gray is cheaper),
  Surface Translucency Volume, Pixel Normal Offset for flat panes, slab Simple Volume with
  Transmittance-To-MFP (Ben [sf-K257zWh8 00:01:39, 00:09:17]).
- **An RVT is a cache captured orthographically at time 0:** no Time, Panner, camera distance,
  parallax or MPC in the write pass; a page change redraws all its writers; each distinct RVT
  sampled has a large fixed cost (PrismaticaDev [RLEPA16QDRw 00:20:14, 00:11:59, 01:04:29]).

## Establish first

| Input                                    | What it changes                                                                                                  | Default when silent                                   |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Platforms and frame rate                 | GBuffer format (Blendable caps all), closures, samplers (16 on ES3.1), Adaptive-only features                    | console 60 Hz and PC: Blendable, 1 closure            |
| Project Substrate state                  | `r.Substrate` in the ini (P1); upgraded projects stay legacy                                                     | read it, never assume                                 |
| Style                                    | PBR; Toon BSDF (per asset, experimental); post-process EV cel (whole world)                                      | PBR                                                   |
| Architecture                             | lean master or Material Layering System (Sumo), by library size and projected permutations (`lauf_permutations`) | lean master, under 10 presets                         |
| World-wide values (wetness, alert state) | MPC: at most 2 per material; adding parameters recompiles every user (instances doc)                             | one game-wide, one per level                          |
| Mesh types per family                    | usage flags: static, Nanite, skeletal, cloth, Niagara, decal, UI                                                 | static + Nanite                                       |
| Texture sources                          | packing, DirectX green, texel density, source size                                                               | ORM packed, DirectX, 2K                               |
| Budgets                                  | samples, transcendentals, unique static sets, shaders, BasePass ms, texture pool                                 | project decision; lint warns above 12 samples [added] |

## Workflow

0. **Probe and decide.** P0 `um.probe()` lists what 5.8 really exposes; P1 reads the ini and runs
   `um.choose_gbuffer_format(targets, needs)`, whose reasons state the ceiling and the fallback.
   GATE: `CANDIDATES` corrected; the format decision written.
1. **Plan the family.** One master per domain and blend mode (surface, glass, screen, decals, UI
   Material, landscape), each with its switches and what they gate, approved presets, usage flags
   per mesh type, sample and closure budgets, MPCs. GATE: every switch gates a texture and has a
   `switch_ranking` count; channel picks are Channel Mask Parameters; architecture written.
2. **Textures** (P2): `pack_channels`, `import_textures`, `audit_textures(apply=True)`,
   `albedo_stats`. GATE: audit passes; resident size at most 2048; `lint_graph(g, textures=...)`
   finds no sampler mismatch; normals keep Normalize after making Mips; albedo sRGB 20 (50 rough) to
   240, metals at least 180.
3. **Build masters** (P3, P4): `um.build_kit_surface` or a template: texture-gating switches, an If
   for the paint-mask source, Custom Primitive Data for per-actor wear and dirt, Specular = 0.5 x
   (1 - cavity) as specular occlusion. Substrate: the Metalness helper feeds a base slab, a
   bare-metal slab takes albedo 0 and a measured F0, a parameter-blended Horizontal Blend takes the
   wear mask. Options: value-clamped ID masks, 4 bands per channel (Sumo [00:14:54]); world-aligned
   texture and normal across modular seams, 3 samples per texture (Ben [pXOknekvmwE 00:12:57]);
   world-space directional dust (Sumo [00:20:11]). GATE: no failed links; `lint_graph` free of fail
   and warn; one closure; clean compile log.
4. **Instances** (P5, P6, P16): only `make_presets` sets static switches; children change values;
   Custom Primitive Data varies placed actors. GATE: unique sets at most the preset count, no
   override at default, HSPR only on presets; `audit_instance_values_project` clean (dielectric F0
   at most 0.08, metal albedo 0, Metallic 0 or 1).
5. **Usage flags and shaders** (P7): pin needs on instances, then clear the parent; auto usage off;
   Used with Static Mesh off on decal, UI and Niagara-only materials (Nadro [00:18:38]);
   `shader_count` per root (an upper bound). 5.8 compiles only connected, non-zero outputs
   (`r.Material.UseShaderCompilationParameters`): deleting nodes to strip shaders is folklore.
   Skin-cache and Slate levers (P7) only after measuring. GATE: shaders within budget; the fallback
   board shows no gray default material.
6. **Special families.** Screens: emissive calibrated with the lighter; TSR smearing on scrolling
   text gets the experimental Temporal Responsiveness node, masked, with
   `r.Velocity.TemporalResponsiveness.Supported=1` and a small WPO on Nanite meshes (5.7 article).
   Decals (P14) end in Convert To Decal; overlapping DBuffer-expression decals do not blend; each
   receiver's Decal Response covers only the channels its decals write (`decal_response_for`).
   Landscape P11, stylized P12 and P13, switch triage P8. GATE:
   [`references/critique.md`](references/critique.md) for the family.
7. **Cost A/B** (P9, live editor): fixed camera, `r.ScreenPercentage 100`, warm-up, CSV profile,
   medians of GPU and pass time, `cost_census` beside them. GATE: deltas within budget; instruction
   counts recorded as context only.
8. **Look review** (P10, P15): preset board under the level lighting, buffer visualizations,
   Substrate views. For a Substrate surprise, open Window > Substrate first: features in downgrade
   order, parameter-blending preview (Morgan [00:12:51, 00:38:43]). `ue_review.review_images` runs
   before anyone looks. GATE: critique rubric passes.
9. **Cooked check and handoff** (P17): `listtextures`, `stat streaming` and `r.Streaming.PoolSize`
   through `texture_memory_findings`; hand over reports, captures, open `[verify]` items.

## Numbers

| Value                                                                           | Relative to                          | Source                               |
| ------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------ |
| Specular 0.5 = F0 0.04 (4%)                                                     | 90 to 98% of non-metals              | Ben [fePsD_8p9vM 00:12:09]           |
| Dielectric F0 at most 0.08; gems, carbon fiber up to about 0.18                 | legacy Specular spans IOR 1 to 1.788 | Morgan [00:09:30]                    |
| Metal: albedo 0, F0 average at least 0.5 (doc) or 0.6 (Ben)                     | Substrate slab                       | Ben [a94Lpu1_4dg 00:16:16]           |
| Base color sRGB 20 to 240, floor 50 when rough; metals at least 180             | 8-bit sRGB                           | Ben [fePsD_8p9vM 00:05:28, 00:22:48] |
| Glass IOR 1.5, MFP thickness 0.02; frosted roughness 0.2 to 1                   | rough refraction on                  | Ben [sf-K257zWh8 00:11:02, 00:17:16] |
| 10 shaders, 20 with Skeletal, 27 with Niagara mesh, 186 with every flag         | one material, project-dependent      | Nadro [00:06:28, 00:07:05]           |
| Fetch about 200 cycles; multiply 4; sine about 20                               | AMD GCN: a ranking, not Apple truth  | Swierad                              |
| BC1 2048 = 2.66 MiB with mips; BC3, BC5, BC7 double; BC6H one eighth of RGBA16F | GPU memory                           | textures doc                         |

## Quality gates

- **Measurable:** `lint_graph` (with `textures=` and project `budgets=`) free of fail and warn;
  census within presets; `audit_textures` and `audit_instance_values_project` pass; `shader_count`
  per root; BasePass, Translucency, DBuffer ms A/B; Substrate Material Count 1 on Blendable;
  VirtualTextureUpdate near zero when still; cooked `texture_memory_findings` clean; no blank frame.
- **Visual** (`references/critique.md`): transitions read as two materials; wear on edges, dirt in
  cavities, crevices darker in the Specular buffer; no tiling or seams from far; glass free of
  silhouette seams; screens neither clipped nor smeared; no gray fallback on any mesh type; toon
  bands stable under a sun sweep.

## Common mistakes

| Mistake                                                                        | What it looks like                              | Fix                                               |
| ------------------------------------------------------------------------------ | ----------------------------------------------- | ------------------------------------------------- |
| Budgeting pixel instructions                                                   | "under 200" passes, the frame is still slow     | samples and transcendentals, measured ms          |
| Switch for a UV channel, tint or mask channel                                  | a shader map per unique instance                | If, Enum or Channel Mask                          |
| Parent flag "just in case"; decal or UI material keeping Used with Static Mesh | every unique child compiles another row         | instance overrides, auto usage off, flag off      |
| Deleting nodes "to strip shaders"                                              | no change in 5.8                                | check ListShaders                                 |
| Gray metallic wear                                                             | chalky, plaster edges                           | two slabs, parameter-blended Horizontal Blend     |
| Sharpening masks "for cost" under parameter blending or Blendable              | harsher look, no gain                           | `mask_cost` applies only without them             |
| Blendable "for the weaker platform"                                            | SM6 platforms lose Adaptive features            | Adaptive falls back per platform                  |
| Adaptive on a 60 Hz console game                                               | up to 5x GBuffer memory, forced DBuffer         | Blendable                                         |
| Substrate Shading Model node added by hand                                     | conversion path in a new graph                  | Slab, or Metalness helper into a Slab             |
| Packed NOH as Normalmap; sRGB on masks; sampler left after recompression       | flat terrain, shifted roughness, compile errors | BC7 or Masks, sRGB off, Fixup Mismatched Samplers |
| Mips disabled to fix blur; normals not normalized after mips                   | shimmer, flat distant panels                    | keep mips; normalize, or composite roughness      |
| Time, Panner or MPC in the RVT write pass                                      | frozen or stale pages                           | read pass or RVT Replace                          |
| Temporal Responsiveness without its cvar                                       | text still smears                               | cvar, mask, small WPO on Nanite                   |

## Handoffs

- **Receives:** textures from scenario-maya-lookdev, scenario-zbrush-paint-render,
  scenario-blender-texturing-shading or Substance (role suffixes, DirectX normals), or through
  scenario-unreal-pipeline-automation (Interchange); meshes with slots named by family; exposure
  targets from scenario-unreal-lighting-rendering.
- **Delivers:** to scenario-unreal-world-building, masters, presets and instances (paths,
  parameters, CPD indices), the landscape master, RVT writer rules, decals and receivers' Decal
  Response. To scenario-unreal-lighting-rendering, emissive and glass materials, Substrate state and
  GBuffer format, albedo in range. To scenario-unreal-vfx, Niagara materials (flag on the instance,
  Used with Static Mesh off). To scenario-unreal-performance, census, lint, texture and
  cooked-memory reports. To scenario-unreal-pipeline-automation, `audit_rules()` and the permutation
  gate.

## UE 5.8 notes

- Substrate is on for new projects only, Blendable by default (Adaptive in the Automotive and
  Architectural templates); 5.8 adds EON rough diffuse, removes SheenQuality, approximates F90 on
  Blendable, ships the experimental Toon BSDF.
- ListShaders and Total Shaders are upper bounds; ISMs need no flag on GPU Scene platforms; a
  StaticSwitch mixing Material Attributes and scalars is a validation error; GetMaterialUsedTextures
  replaces GetUsedTextures.
- 5.7: HSPR tag, MPC overrides, Material Diff, Fixup Mismatched Samplers, experimental Temporal
  Responsiveness; the Vector Parameter RGBA pin shifts scripted pin indices. Enum-bound scalars are
  in the 5.7 release notes; Unreal Fest presented them as 5.8.
- Usage Flag Overrides, the validation database, the Experiments panel: shown at Unreal Fest, absent
  from the saved notes [verify].
- Mac: Adaptive needs SM6; advanced Substrate visualization is Win64 DX12 only; virtual textures are
  on by default since 5.6.

## References

- [`references/expert-notes.md`](references/expert-notes.md): principles and judgment by expert,
  with source and timestamp.
- [`references/procedures.md`](references/procedures.md): P0 to P17 with full code, test path and
  status.
- `references/critique.md`: the self-review rubric per material family.
- [`references/gui-paths.md`](references/gui-paths.md): editors, menus and settings for a
  computer-use agent.
- [`references/sources.md`](references/sources.md): every source, credential, URL, best timestamps,
  revision history.
- [`scripts/ue_materials.py`](scripts/ue_materials.py): texture policy, value checks, cost census,
  graph lint, permutation census, Substrate ini, builders, cooked texture memory, probe.
