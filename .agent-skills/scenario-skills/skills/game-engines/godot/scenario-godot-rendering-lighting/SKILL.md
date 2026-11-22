---
name: scenario-godot-rendering-lighting
description: "Use when lighting or rendering a Godot 4.7 3D scene: pick a renderer (Forward+, Mobile, Compatibility), choose GI (SDFGI, VoxelGI, LightmapGI, reflection probes), bake lightmaps without a mouse, tune WorldEnvironment, tonemapper (AgX, ACES, Filmic), glow, fog, volumetric fog and god rays, shadows and shadow acne, quality presets for PC and phones, Compositor post effects, or when 'my scene looks flat', 'too dark indoors', 'light leaks', 'lightmap is black', 'looks different on mobile'."
license: MIT
---

# Godot rendering and lighting (lighter / graphics technical artist)

Target: Godot 4.7.2.stable, macOS Apple Silicon (Metal by default).

Expert level here means that lighting comes from a measured loop: a calibration scene, one variable
at a time, a rendered image looked at after every change, numbers on that image, and a GPU cost for
every effect. The renderer and the GI method are chosen first, because they decide what the other
settings can do. The art direction (value pattern, warm and cool, focal contrast) is judged on
pixels the agent actually opened, never on the inspector. If a sibling skill named here is missing
from your available skills, load it with `skill_get` (Scenario MCP) or ask the user to install it
(https://github.com/scenario-labs/skills#install); unattended, proceed from tool schemas and flag
the gap.

**REQUIRED BACKGROUND:** scenario-godot-expert (channels, `gd_run`, the review loop, 4.7 traps).

## Stance (the expert delta)

1. **Use lightmaps for static scenes.** SeasonalAsh measured on an RTX 4060 that SDFGI roughly
   halves fps, VoxelGI runs at 60 to 80 fps, and lightmaps are fastest: lightmaps "9 times out of
   10" unless the world is destructible (SeasonalAsh 13:07, 17:48). In 4.7.2 an agent can bake them:
   the editor job presses "Bake Lightmaps" itself (P7). Dynamic geometry or a moving sun means SDFGI
   or VoxelGI; static means LightmapGI plus ReflectionProbes.
2. **Calibrate on a lookdev scene before lighting the level.** Brackeys uses guide spheres (dark,
   white, mirror) and Display > Lighting (Brackeys 7:19, 28:53). Picster keeps the primitive
   blockout for later retests (Picster 2:05, 1:15:35).
   [`lookdev.gd`](scripts/agentkit/rendering/lookdev.gd) builds an exterior and a sealed room.
3. **Pick the tonemapper by look, then retune exposure.** Brackeys and Wild Ox use AgX; SeasonalAsh
   and LegionGames use ACES. Measured: AgX gives the lowest p95, no clipping, and keeps an orange
   emitter orange where Filmic and ACES push it to yellow (P5). AgX is also the costliest
   tonemapper, which matters on phones (docs). A new Environment is Linear (P1): always set it.
4. **Make emission readable on two levels.** Glow makes an emitter look bright; a real light (or
   baked GI) makes it light the scene (Brackeys 13:56, Gamefromscratch 7:09). Glow defaults changed
   in 4.6 (Screen, intensity 0.3, levels 2 to 4 at 0.8/0.4/0.1, P15): retune scenes made before 4.6.
5. **Never use SDFGI and VoxelGI together, and never trust SDFGI on frame one.** SDFGI converges in
   about 30 frames (P1) and is darker right after enabling (P8). GDQuest retunes the tonemap after
   turning it on.
6. **Volumetric fog quality lives in Project Settings, and that is where its cost is.** Four Games
   calls volume size 64 too low and 256 a good compromise; god rays need anisotropy about 0.7 and a
   shorter length (Four Games 0:32 to 3:52). Raise one hero light's Volumetric Fog Energy, drop a
   flashlight's to 0.1 (Brackeys 19:52, LegionGames 2:08). Measured: 512 costs +3.9 ms at 1080p
   (P9).
7. **The base look must hold on every renderer; tiers only add.** Mobile ignores SDFGI, VoxelGI,
   SSR, SSAO, SSIL and volumetric fog; Compatibility the same minus SSAO; each prints one WARNING
   line at load (P4). Fog, glow, tonemap, lightmaps and probes carry the look everywhere [added].
   Renderer fallback to Compatibility is silent since 4.4 and `fallback_to_opengl3` defaults to true
   (docs, P15): set it false on PC so a bad driver fails loudly; on Android keeping it true is a
   choice, so test the Compatibility look.
8. **CompositorEffect is GLSL compute, not `.gdshader`** (Acerola 9:39). The docs list Forward+ and
   Mobile, but the docs pattern (color as a storage image) logs 172 errors on Mobile in 4.7.2
   because Mobile's color buffer lacks the storage bit, and Compatibility ignores the effect
   silently (P12). Ship it on Forward+ and guard Mobile. Callbacks run on the render thread: mutex
   any state shared with the main thread, pad push constants to multiples of 16 bytes, and remember
   upscaling runs after post (docs). For post with UI on top, a CanvasLayer ColorRect works
   everywhere (Lukky).

## Establish first

| Input                                                            | Default if not given                                                                            |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Target platforms and renderer per platform                       | Forward+ desktop. Project default `rendering_method.mobile="mobile"`, `.web="gl_compatibility"` |
| Frame budget and reference GPU                                   | 60 fps (16.6 ms) on PC; measure on Vulkan (Metal reports 0 GPU ms)                              |
| Static or dynamic world: moving sun, destructible geometry, size | static interior: lightmaps; open day/night: SDFGI; mid-size dynamic: VoxelGI                    |
| Mood references and time of day                                  | one image or three words ("cold dawn, foggy, hopeful")                                          |
| Hero subject and camera(s)                                       | a Camera3D path, else the scene's current camera                                                |
| Asset source                                                     | glTF from blender-expert or scenario-* skills: check UV2 and stray emission                     |

## Workflow

Load the toolkit: `sys.path` gets `skills/scenario-godot-expert/scripts` and
`skills/scenario-godot-rendering-lighting/scripts`, then `import gd_lighting as gl` and
`gl.install(P)`. Full code: [`references/procedures.md`](references/procedures.md).

1. **Renderer.** Read project.godot (`rendering_method`, Jolt, fallback) (P1).
   `gl.capture_renderers(P, scene)` captures one view per renderer and returns the WARNING lines.
   GATE: renderer written in project.godot; parity sheet opened; dropped features listed in the
   handoff.
2. **Lookdev.** `gl.build_lookdev(P)` (P3), capture the three cameras. GATE: `look_checks` p95 minus
   p05 above 0.25, clipped under 5 percent; opened: dark sphere shows form, white not clipped,
   mirror reflects sky.
3. **GI and bake.**
   - static: `gi_bake.gd:prepare` (sun Dynamic, others Static, hidden lights Disabled, UV2 check),
     then the windowed `gi_bake.gd:lightmap` editor job (P7);
   - mid-size dynamic: `gi_bake.gd:voxelgi`, windowed (P6);
   - open world: SDFGI with occlusion, bounce feedback 0.5 or less, Y scale 75 or 50 percent, max
     distance below camera far, captured after 40 frames or more (P8).
   - Add ReflectionProbes with lightmaps (no specular otherwise). GATE: audit has no GI errors; bake
     files exist; interior capture opened and checked for leaks, seams and dark patches.
4. **Key, fill and practicals.** Lights at their sources, matching color; shadows only on key
   lights; candles unshadowed, short range; artificial lights below the sun (Brackeys, SeasonalAsh).
   Run `gl.audit(P, scene, ["forward_plus", "mobile"])` (P2). GATE: no error flags; `squint(img)`
   opened with one focal value; `focal_contrast` at least 0.05.
5. **Environment and post.** `gl.sweep` one variable at a time: tonemapper (`tonemap_variants`, P5),
   exposure, glow, fog, volumetric fog (P10), Adjustments last (cool shadows, warm lights via the
   color-correction gradient, Picster 45:07). GATE: each sheet opened, winner named with its
   numbers, no variant clipping over 5 percent unless briefed.
6. **Shadows.** Sweep `shadow_normal_bias` first, then `shadow_bias` (SeasonalAsh 0.05 against the
   0.1 default, frames 4:13); blend splits on; max distance set to the playable range (Picster 400
   outdoors, default 100). GATE: grazing-angle close-up opened, no stripes, contact shadow attached.
7. **Tiers and cost.** [`graphics_tiers.gd`](scripts/agentkit/rendering/graphics_tiers.gd) presets
   through a sweep with `call` and `measure=60` on `--rendering-driver vulkan` (P11): low and medium
   use 2 shadow splits, high and ultra 4. Per-effect deltas from the P9 template. On Mobile use
   MetalFX spatial on Apple, else bilinear (P13). GATE: each tier's GPU ms fits the budget on the
   target renderer, and the low tier keeps the mood.
8. **Custom post (optional).** `compositor_tools.gd:attach` plus
   [`post_effect.gd`](scripts/agentkit/rendering/compositor/post_effect.gd) and a GLSL compute
   shader (P12). GATE: the effect shows on Forward+; Mobile skips with one warning.

## Expert checklist (state these in the plan)

- **Bake scope.** A hidden light still bakes: set Bake Mode Disabled (docs). Meshes default to GI
  mode Static (P15), so exclude non-playable geometry with GI mode Disabled for faster, better bakes
  (SeasonalAsh 13:39).
- **Import and repo.** glTF `meshes/light_baking=2` (Static Lightmaps; the default 1 is plain
  Static) and `meshes/lightmap_texel_size` (default 0.2; 0.5 or more on huge scenes that crash the
  bake) (P15, docs). Never gitignore `*.unwrap_cache` (keeps UV2 stable); keep `.lmbake` external
  (docs).
- **Leaks.** Closed, thick walls [added]; LightmapGI Interior plus environment mode Disabled for
  sealed rooms (docs).
- **Denoiser.** `rendering/lightmapping/denoising/denoiser` is project-wide: 0 JNLM (default), 1
  OIDN (needs the external binary) (docs, P15).
- **Shadowmask.** `LightmapGI.shadowmask_mode`: None (0, default), Replace (1, realtime near, baked
  beyond max distance, best for foliage), Overlay (2, fast cameras). Only the first Dynamic
  DirectionalLight3D; switch without rebake (docs, P15).
- **Dark indoor bake.** Lightmaps ignore Environment ambient: fill lights or bounces first;
  Spannule's last resort multiplies the EXR and adds ambient at about 8 percent (1JvPYUl1nfo 4:00).
- **SSAO** only darkens ambient light: `ssao_light_affect` defaults to 0.0 (docs, P15).
- **Shadows.** Cull Mask does not stop shadow casting: turn off the mesh's Cast Shadow. 88 shadowed
  positional lights fit the default atlas (quadrants 4+4+16+64, P15). A mesh in all 4 PSSM splits
  draws 5 times. One visible AreaLight3D in Forward+ taxes every object. Compatibility renders
  shadowed lights in sRGB, so retune energy (docs).
- **Post.** A 3D LUT must be imported as Texture3D (`importer="3d_texture"`, `slices/horizontal`); a
  256x16 strip with 16 slices loads as 16x16x16 (P15). HDR Clamp Exposure compresses only luminance
  above about 4096 (a 100000 sun pixel became 14988; 50 stayed 50, P15). Debanding is off by
  default. Exposure and DOF live in CameraAttributes on the Camera3D, quality knobs in Project
  Settings.

## Numbers

| Value                              | What it is relative to                                                                                                   | Source                      |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------- |
| `shadow_bias` 0.05                 | default 0.1                                                                                                              | SeasonalAsh frames 4:13; P1 |
| shadow blur 2 to 3                 | default 1.0                                                                                                              | SeasonalAsh 5:13            |
| directional max distance 100       | default; Picster 400 outdoors                                                                                            | P1; Picster 54:08           |
| volumetric fog volume size         | 64 default, 256 good, 512 best; +0.2 to 1.1 (64), +1.5 to 2.7 (256), +3.9 (512) ms at 1080p                              | Four Games 2:44; P9         |
| fog anisotropy 0.7 for god rays    | default 0.2                                                                                                              | Four Games 0:32; P1         |
| SDFGI convergence                  | about 30 frames (enum index 5); capture after 40                                                                         | P1, P8                      |
| SDFGI bounce feedback              | default 0.5; above 0.5 risks runaway                                                                                     | P1; Omogonix 28:10          |
| SDFGI max distance                 | 204.8 default, camera far 4000                                                                                           | P15                         |
| lights per mesh                    | Mobile 8 omni + 8 spot; Forward+ 512 clustered elements per view                                                         | docs                        |
| spot shadow angle                  | fails above 89°                                                                                                          | docs                        |
| LightmapGI quality order           | supersampling, then texel size, then quality                                                                             | Brackeys 34:34              |
| LightmapGI Low bake, lookdev room  | 3.6 to 15 s bake (M5 Max, under load)                                                                                    | P7                          |
| effect GPU ms at 1080p, tiny scene | SSIL +1.4 to 1.7, SSR +0.9 to 1.3, SDFGI +0.7 to 1.1; SSAO, glow, TAA, SMAA, MSAA 2x each under 0.8 (under 0.5 is noise) | P9, Vulkan                  |
| tier GPU ms (Forward+ / Mobile)    | low 1.5 / 0.62, high 2.9 to 4.3 / 1.73, ultra 3.6 to 4.85 / 1.64                                                         | P11, tiny scene             |

Effect costs scale with resolution and scene: re-measure with the P9 template before quoting them.

## Quality gates

- **Measurable**: `gl.audit` zero error flags per target renderer; `gd_run.check_all` zero parse
  errors; `look_checks` clipped under 0.05, crushed under 0.3, p95 minus p05 above 0.25,
  `focal_contrast` at least 0.05; bake files exist and `lightmap_textures` at least 1; `.gitignore`
  has no `unwrap_cache`; each tier's GPU ms within budget on Vulkan.
- **Visual**: open each contact sheet and squint image: one focal area, readable silhouette, warm
  and cool intent, no leaks, seams, acne or banding, emitters glow, fog does not wash the frame,
  mobile and low tier keep the mood. [`references/critique.md`](references/critique.md) is the
  rubric.

## Common mistakes

| Mistake                              | What it looks like                                                                                  | Fix                                                           |
| ------------------------------------ | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Leaving Linear tonemap               | blown highlights, flat sky                                                                          | AgX or ACES, then exposure                                    |
| Lighting in the editor preview sun   | game is gray                                                                                        | WorldEnvironment and sun in the scene (SeasonalAsh 1:40)      |
| SDFGI plus VoxelGI                   | double bounce, cost                                                                                 | one GI per area                                               |
| Lightmap meshes without UV2          | black or garbage bake                                                                               | `add_uv2` on primitives, Static Lightmaps on glTF             |
| Hidden light still baked             | ghost light                                                                                         | Bake Mode Disabled (`prepare` does it)                        |
| Expecting FSR1 on Mobile             | identical to bilinear, warning "FSR1 3D scaling is only available when using the Forward+ renderer" | MetalFX spatial on Apple, else bilinear (P13)                 |
| docs CompositorEffect on Mobile      | 170+ errors per run                                                                                 | storage-bit guard (`post_effect.gd`)                          |
| Stray emission on imported glTF      | glowing props                                                                                       | audit `emissive_without_glow`, zero it (Gamefromscratch 5:25) |
| Writing "30" into frames_to_converge | wrong enum index                                                                                    | `gl.setting_index(key, 30)` gives 5                           |
| SSAO on, nothing changes             | AO invisible in direct light                                                                        | raise `ssao_light_affect`                                     |
| LUT as a plain PNG                   | color correction ignored                                                                            | reimport as Texture3D with slices                             |

## Handoffs

- **Receives from**: scenario-godot-3d-world (level, static and dynamic split, cameras);
  blender-expert and scenario-* skills (glTF with UV2); scenario-godot-shaders (materials);
  scenario-godot-vfx (emissive effects).
- **Delivers to**: scenario-godot-performance-export (tier table, GPU ms per tier and renderer,
  settings diff); scenario-godot-ui (graphics settings mapped to `graphics_tiers.gd`);
  scenario-godot-shaders (compositor GLSL needs); scenario-godot-expert (sheets, audit JSON, parity
  notes). Scene and `.tres` files committed, plus `.agent_out/` sheets and JSON.

## Godot 4.7 notes

Observed in 4.7.2 ([`references/expert-notes.md`](references/expert-notes.md), Observed):

- `LightmapGI.bake` does not exist for scripts; the editor button route works (P7). `VoxelGI.bake`
  exists but headless saves empty data.
- `GeometryInstance3D.lightmap_scale` is gone: use `gi_lightmap_texel_scale`.
- New Environment: Linear tonemap, glow Screen at 0.3, SDFGI bounce feedback 0.5.
- FSR1 is Forward+ only; MetalFX spatial works on Mobile with Metal.
- GPU timing reads 0 on Metal: profile with `--rendering-driver vulkan`.
- AgX arrived in 4.4. Wild Ox reports 4.6 fixed SDFGI and VoxelGI leaks, glow and SSR, so retest
  2023 workarounds such as encapsulating boxes (Wild Ox 2:23).

## References

- [`references/procedures.md`](references/procedures.md): P0 to P15, full code, live test, result
  line each.
- [`references/expert-notes.md`](references/expert-notes.md): judgment by expert with timestamps,
  plus Observed 4.7.2 facts.
- [`references/critique.md`](references/critique.md): image rubric.
  [`references/gui-paths.md`](references/gui-paths.md): editor paths.
  [`references/sources.md`](references/sources.md): sources and timestamps.
- [`scripts/gd_lighting.py`](scripts/gd_lighting.py) and
  [`scripts/agentkit/rendering/`](scripts/agentkit/rendering/): lookdev, light_audit, sweep,
  gi_bake, graphics_tiers, compositor_tools, compositor/.
