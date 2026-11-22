# Procedures (scenario-godot-rendering-lighting 0.1, Godot 4.7.2)

Round 2 (2026-10-02): P15 added after blind grading.

Every procedure runs through the scenario-godot-expert toolkit (`gd_run`, `gd_review`) plus this
skill's `scripts/gd_lighting.py` and the GDScript in `scripts/agentkit/rendering/` (copied into
`res://addons/agentkit/rendering/` by `gl.install(P)`). The GDScript files ARE the full code: each
file starts with a usage header.

Live test for all procedures: `tests/code/godot-rendering-lighting/test_lighting_live.py`
(`--only P5,P7`, `--skip-windowed`). It clones Base3D to
`tests/projects/godot-rendering-lighting/runs/<stamp>/Light3D`. Evidence (JSON, contact sheets, run
log) goes to `tests/live_evidence/godot-rendering-lighting/`. Test jobs:
`tests/code/godot-rendering-lighting/jobs/` (probe_api.gd, make_bad_scene.gd,
make_features_scene.gd).

Windowed runs open a 160x90 window. The capture SubViewport carries the real resolution.

```python
import sys
sys.path.insert(0, "<skills>/scenario-godot-expert/scripts"); sys.path.insert(0, "<skills>/scenario-godot-rendering-lighting/scripts")
import gd_run, gd_review, gd_lighting as gl
P = "<project>"; gl.install(P)
```

## P0 Enum-indexed settings (offline)

Some project settings are stored as ENUM INDICES, not as the number shown in the inspector:

- SDFGI probe_ray_count, frames_to_converge and frames_to_update_lights;
- soft shadow quality;
- MSAA, screen-space AA and the scaling mode.

```python
gl.setting_index("rendering/global_illumination/sdfgi/frames_to_converge", 30)   # -> 5
import gd_env; gd_env.set_project_setting(P, "rendering/global_illumination/sdfgi/frames_to_converge", "4")  # 25 frames
```

Run in Godot 4.7.2 on 2026-10-02: pass. The tables were checked against ProjectSettings defaults in
P1 (frames_to_converge "5" means 30 frames).

## P1 Project settings and API facts (headless)

Goal: confirm the renderer and Jolt in an agent-written project.godot, then probe the classes,
properties and defaults the skill relies on.

```python
cfg = open(f"{P}/project.godot").read()
assert 'rendering_method="forward_plus"' in cfg or "rendering_method" not in cfg   # absent means Forward+
assert '3d/physics_engine="Jolt Physics"' in cfg
r = gd_run.run_script(P, "res://jobs/probe_api.gd")   # tests/code/godot-rendering-lighting/jobs/probe_api.gd
```

Run in Godot 4.7.2 on 2026-10-02: pass. 211 of 213 API names found. The two missing:

- `LightmapGI.bake`: no script bake;
- `GeometryInstance3D:lightmap_scale`: the property is now `gi_lightmap_texel_scale`.

Defaults on a new resource:

- Environment: tonemap Linear (0), glow blend Screen (1), intensity 0.3, threshold 1.0,
  sdfgi_bounce_feedback 0.5, cascades 4, max distance 204.8, volumetric fog density 0.05, anisotropy
  0.2, length 64.
- DirectionalLight3D: bias 0.1, normal bias 2.0, max distance 100, 4 splits, blend splits off.
- LightmapGI: quality Medium (1), bounces 3, probes subdiv 8, environment Scene, denoiser on,
  supersampling off.

Project settings:

- `rendering_method.mobile` is "mobile";
- SDFGI frames_to_converge index 5 (30 frames), probe_ray_count index 1 (8 rays);
- volumetric fog volume_size 64, depth 64;
- `driver.macos` metal.

Evidence: `p1_api_probe.json`.

## P2 Renderer-aware lighting audit (headless)

`light_audit.gd:audit` walks a scene and returns flags (severity, code, message, nodes) for every
target renderer.

```python
a = gl.audit(P, "res://level.tscn", ["forward_plus", "mobile"])["result"]
errors = [f for f in a["flags"] if f["severity"] == "error"]
```

The flag codes:

- `no_world_environment`, `multiple_world_environments`, `tonemap_linear`;
- `sdfgi_bounce_feedback_high` (above 0.5), `sdfgi_and_voxelgi`, `sdfgi_beyond_camera_far`;
- `spot_shadow_wide` (above 89°), `small_omni_shadowed`, `multiple_shadowed_directionals`,
  `shadow_atlas_full`, `many_pcss_lights` [added: above 4];
- `clustered_elements`, `area_light_forward_plus`, `lights_per_mesh_mobile`,
  `lights_per_mesh_gl_compatibility`;
- `dynamic_mesh_under_sdfgi`, `emissive_without_glow`;
- `voxelgi_no_data`, `lightmapgi_over_8`, `lightmap_no_data`, `lightmap_data_embedded`,
  `hidden_light_baked`, `static_mesh_without_uv2`;
- `unsupported_on_<renderer>`.

Run in Godot 4.7.2 on 2026-10-02: pass.

- Fixture `make_bad_scene.gd`: 15 flags (5 errors, 8 warnings, 2 infos), all 13 expected codes plus
  `unsupported_on_mobile`.
- `lookdev.tscn`: 0 flags.
- After the bakes, `voxel.tscn` no longer gets `voxelgi_no_data`.

## P3 Lookdev scene and calibration captures (windowed)

`lookdev.gd:build` writes a calibration scene:

- an Environment with a ProceduralSky, sky ambient, AgX and glow, and a sun at (-50°, 35°, 0) with
  shadows;
- dark, gray, white and mirror spheres, a gray card, an emissive block and a 1.8 m hero capsule;
- a sealed room at z -7 with a door, a window, a table and a warm lamp;
- three cameras: Exterior, Spheres and Interior. Every primitive has `add_uv2`.

```python
gl.build_lookdev(P, out="res://lookdev/lookdev.tscn")
r = gd_run.capture_scene(P, "res://lookdev/lookdev.tscn", out="captures/base_Exterior.png", size=(480, 270), camera="Cameras/Exterior")
c = gl.look_checks(r["result"]["images"][0]); assert c["range_p95_p05"] > 0.25 and c["clipped"] < 0.05
gl.squint(r["result"]["images"][0])   # open the *_squint.png
```

Run in Godot 4.7.2 on 2026-10-02: pass. On the Exterior view: p05 0.32, p50 0.49, p95 0.61, range
0.28, nothing clipped. Sheet `p3_lookdev_sheet.png`, opened: the dark sphere keeps its form and the
mirror reflects sky. The room interior reads as bright because sky ambient floods the sealed room in
realtime (no occlusion of ambient without GI). This is the reason for P6 and P7.

## P4 Renderer parity (windowed, one run per renderer)

```python
r = gl.capture_renderers(P, "res://lookdev/features.tscn", camera="Cameras/Exterior", frames=40)
r["rows"][1]["warnings"]   # what Mobile ignores
```

Run in Godot 4.7.2 on 2026-10-02: pass.

- Scene: `features.tscn` with SDFGI, SSR, SSAO, SSIL and volumetric fog on.
- Mobile printed 5 WARNING lines, one per unsupported feature ("only available when using the
  Forward+ renderer"). Compatibility printed 4, because it supports SSAO.
- Changed fraction against Forward+: Mobile 0.013 to 0.07, Compatibility 0.63 to 0.64.
- Opened: Mobile matches except that the emissive glow halo is gone. Compatibility is brighter and
  washed out (mean 0.57 against 0.50).
- Nothing errors: the loss is visible only in the image and in one warning line per feature.

Evidence: `p4_renderers.json`, `p4_renderers_sheet.png`.

## P5 Tonemapper sweep (windowed, one run)

`sweep.gd:sweep` renders one view under N variants in one process. It restores the touched
properties before each variant unless a variant has `keep`; with `measure` it also records GPU and
CPU time. The variant syntax is in the file header.

```python
r = gl.sweep(P, "res://lookdev/lookdev.tscn", gl.tonemap_variants(exposure=1.0), camera="Cameras/Exterior", size=(480, 270), cols=5)
{v["label"]: v["checks"]["p95"] for v in r["result"]["variants"]}; r["contact_sheet"]
```

Run in Godot 4.7.2 on 2026-10-02: pass.

| Tonemapper | p95   |
| ---------- | ----- |
| linear     | 0.630 |
| reinhard   | 0.630 |
| filmic     | 0.764 |
| aces       | 0.791 |
| agx        | 0.607 |

Opened:

- Reinhard at white 1.0 looks like Linear.
- Filmic and ACES brighten the mids (p50 about 0.79 and 0.82 against 0.65).
- AgX has the lowest p95 and keeps the orange emitter orange; Filmic and ACES shift it toward
  yellow.

Exposure has to be retuned per tonemapper. Sheet: `p5_tonemap_sheet.png`.

## P6 VoxelGI bake (windowed job)

```python
gl.build_lookdev(P, out="res://lookdev/voxel.tscn")
gd_run.run_script(P, gl.kit("gi_bake.gd:voxelgi"), {"scene": "res://lookdev/voxel.tscn", "subdiv": 1}, headless=False)
```

The job sizes the VoxelGI to the AABB of the static meshes plus a margin, bakes, saves
`<scene>_voxelgi.res`, and resaves the scene.

Run in Godot 4.7.2 on 2026-10-02: pass.

- Bake time 140 to 169 ms; octree 2.3 MB; size 10.0 x 5.25 x 14.7 m.
- Headless is refused by the guard. Without the guard, headless printed "Expected Image data size
  ... got 0 bytes" and saved empty data.
- Opened (sheet in P7): VoxelGI adds stronger mirror and floor reflections in the room.

## P7 LightmapGI bake without a mouse (editor, windowed)

4.7.2 has no `LightmapGI.bake` for scripts. `gi_bake.gd:lightmap` runs inside the editor
(`editor=True, headless=False`):

1. it opens the scene and sets the LightmapGI properties;
2. it pre-saves an empty `LightmapGIData` at `<scene>.lmbake`, so no file dialog opens;
3. it selects the node, finds the "Bake Lightmaps" toolbar button, emits `pressed` and saves the
   scene.

`prepare` first sets the light bake modes (hybrid: sun Dynamic, other lights Static, hidden lights
Disabled) and lists static meshes without UV2.

```python
gd_run.run_script(P, gl.kit("gi_bake.gd:prepare"), {"scene": "res://lookdev/baked.tscn", "policy": "hybrid"})
r = gd_run.run_script(P, gl.kit("gi_bake.gd:lightmap"), {"scene": "res://lookdev/baked.tscn", "quality": 0},
                      headless=False, editor=True, timeout=900)
gd_run.import_project(P)   # the new EXR is imported before a game run captures it
```

Run in Godot 4.7.2 on 2026-10-02: pass, three times.

- Timing: the bake (button press to done) took 3.6 to 15.4 s at Low quality, and the whole editor
  run 12 to 20 s (log: "Done baking lightmaps in 00:00:12.88" on the first run). The spread follows
  machine load: other Godot jobs ran in parallel.
- Output: `baked.exr` (512x512) and `baked.lmbake`; `lightmap_textures` is 1.
- Interior p50: realtime 0.369, VoxelGI 0.356, lightmap 0.311. Mean luma difference from realtime
  0.046, changed fraction 0.47.
- Opened: the lightmap gives warm bounce from the lamp and a darker, enclosed room, and a UV2 seam
  shows on the sphere at Low quality (raise quality or texel density for the final bake).
- Benign errors in a 160x90 editor window (progress dialog, current_window) are ignored by the job.
- Not run: the human route (select LightmapGI, then Bake Lightmaps), covered in gui-paths.md.

Sheet: `p7_gi_sheet.png`.

## P8 SDFGI convergence (windowed, cumulative sweep)

```python
v = [{"label": "off", "set": [["WorldEnvironment", "environment:sdfgi_enabled", False]], "frames": 20}]
v += [{"label": f"on_{f}f", "set": [["WorldEnvironment", "environment:sdfgi_enabled", True]], "frames": f, "keep": f != 2} for f in (2, 20, 40, 80)]
gl.sweep(P, "res://lookdev/lookdev.tscn", v, camera="Cameras/Exterior")
```

Run in Godot 4.7.2 on 2026-10-02: pass.

- Mean luma difference: 0.034 between 2 frames and 80 frames; 0.000 between 40 and 80 frames.
- Right after enabling, the frame is darker (p50 0.455 against 0.493 off).
- Rule: capture SDFGI after 40 frames or more, and retune exposure after enabling it (GDQuest).

## P9 Effect cost template (windowed, Vulkan)

Profile on `--rendering-driver vulkan`: Metal reports 0 GPU ms in 4.7.2. The test runs a warm-up
variant, then each variant in forward and in reverse order, and averages the two (ABBA). A single
forward pass was skewed by clock ramp-up and gave fog size 256 cheaper than 64. Variants come from
the test (`p9_costs`).

```python
gl.sweep(P, scene, variants, size=(1920, 1080), measure=90, driver="vulkan", sheet=False)
# variant examples: [["WorldEnvironment", "environment:ssil_enabled", True]], [["$viewport", "msaa_3d", 1]],
#                   [["$rs", "environment_set_volumetric_fog_volume_size", [256, 64]]]
```

Run in Godot 4.7.2 on 2026-10-02: pass.

- Setup: 1080p, a tiny scene, GPU ms on an M5 Max with MoltenVK.
- Two ABBA runs, with a glow-off base of 1.99 and 2.49. Each effect alone:

| Effect                   | Run 1 GPU ms | Run 2 GPU ms |
| ------------------------ | ------------ | ------------ |
| glow                     | 2.75         | 2.72         |
| SSAO                     | 2.75         | 2.50         |
| SSIL                     | 3.42         | 4.16         |
| SSR                      | 3.11         | 3.74         |
| SDFGI                    | 3.11         | 3.52         |
| MSAA 2x                  | 2.55         | 2.10         |
| SMAA                     | 2.83         | 2.40         |
| TAA                      | 2.65         | 2.43         |
| volumetric fog, size 64  | 3.09         | 2.70         |
| volumetric fog, size 128 | 3.39         | 2.99         |
| volumetric fog, size 256 | 4.45         | 3.15         |

- The stable signal: SSIL, SSR and SDFGI are the most expensive, and fog cost rises with volume
  size. Deltas under about 0.5 ms are noise at this scene size.
- An earlier session (glow-on base 2.4 ms, `effect_costs_vulkan_1080p.json`) gave SSIL +1.5, SSR
  +0.9, SDFGI +0.7 (p95 5.2 ms, spiky), fog size 512 +3.9.
- Use these only as an order of magnitude and re-measure on the real level.

Evidence: `p9_costs_vulkan_1080p.json`.

## P10 Volumetric fog and god rays (windowed)

```python
e = "environment:"; base = [["WorldEnvironment", e + "volumetric_fog_enabled", True], ["WorldEnvironment", e + "volumetric_fog_density", 0.03]]
v = [{"label": "no_fog", "set": []}, {"label": "vf_aniso0.7_sun3", "set": base + [["WorldEnvironment", e + "volumetric_fog_anisotropy", 0.7], ["Sun", "light_volumetric_fog_energy", 3.0]]}]
gl.sweep(P, "res://lookdev/lookdev.tscn", v, camera_look=[[-1.5, 1.4, -9.4], [2.2, 1.6, -3.5]], frames=20)
```

Run in Godot 4.7.2 on 2026-10-02: pass on the numbers, partial on the look.

- p95 by variant: no fog 0.489, anisotropy 0.2 0.499, anisotropy 0.7 0.514, plus sun fog energy 3
  0.536. A first session also tried volume size 256 (0.531) and length 16 (0.547, range 0.371). No
  clipping in any variant.
- Opened: the fog adds haze and lifts the window light, but **no distinct shafts**. With the sun at
  (-50°, 35°) no beam enters the window inside this view.
- Shafts need the sun aimed through an opening that the camera looks across, plus Four Games'
  anisotropy of about 0.7 and a short length. Test the angle first with the sweep: not yet run with
  a re-aimed sun.

Sheet: `p10_fog_sheet.png`.

## P11 Quality tiers for PC and phones (windowed, both renderers)

`graphics_tiers.gd` holds four presets, low, medium, high and ultra [added values].
`apply(tier, viewport, scene_root)`:

- skips the Forward+-only keys on other renderers;
- turns SSAO off on Mobile;
- replaces FSR1 off Forward+ with MetalFX spatial on Metal, otherwise bilinear;
- sets the shadow atlas and filters through RenderingServer.

Ship it from a GraphicsSettings autoload, or call it from a sweep:

```python
v = [{"label": t, "call": [gl.kit("graphics_tiers.gd"), "apply", [t]]} for t in ("low", "medium", "high", "ultra")]
gl.sweep(P, scene, v, size=(1920, 1080), measure=60, renderer="mobile", driver="vulkan")
```

Run in Godot 4.7.2 on 2026-10-02: pass.

| Tier   | Forward+ GPU ms                                 | Mobile GPU ms | Mobile skips              |
| ------ | ----------------------------------------------- | ------------- | ------------------------- |
| low    | 1.50                                            | 0.62          | fsr1                      |
| medium | 2.12 to 2.23                                    | 0.82          | fsr1                      |
| high   | 2.92 to 2.93 (4.1 to 4.3 in an earlier session) | 1.73          | volumetric fog            |
| ultra  | 3.56 to 3.71 (4.85 earlier)                     | 1.64          | SSIL, SSR, volumetric fog |

Opened: the low tier keeps the mood (fog, glow, AgX). Ultra on Forward+ adds AO contact and
reflections.

Sheets: `p11_tiers_*_sheet.png`.

## P12 Compositor post effect (windowed, three renderers)

- `compositor/post_effect.gd` is a `CompositorEffect` that compiles an `RDShaderFile` (GLSL compute)
  and dispatches it on the color layer at POST_TRANSPARENT.
- It guards against renderers whose color buffer lacks `TEXTURE_USAGE_STORAGE_BIT`: there it warns
  once and skips.
- `compositor/grayscale.glsl` is the template.
- `compositor_tools.gd:attach` adds the effect to a WorldEnvironment or a Camera3D compositor.

```python
gd_run.run_script(P, gl.kit("compositor_tools.gd:attach"), {"scene": "res://lookdev/lookdev.tscn", "target": "world", "out": "res://lookdev/post.tscn"})
gd_run.capture_scene(P, "res://lookdev/post.tscn", out="captures/post.png", camera="Cameras/Exterior", extra_args=["--rendering-method", "forward_plus"])
```

Run in Godot 4.7.2 on 2026-10-02: pass.

- Forward+: grayscale (saturation 0.000), opened.
- Mobile: skipped with one warning (saturation 0.091). Without the guard, the docs pattern logged
  172 errors ("needs the TEXTURE_USAGE_STORAGE_BIT"), on both Metal and Vulkan.
- Compatibility: the compositor is ignored silently (saturation 0.105, no warning).

Sheet: `p12_compositor_sheet.png`.

## P13 Upscalers on Mobile (windowed, Metal)

```python
v = [{"label": m, "set": [["$viewport", "scaling_3d_mode", i], ["$viewport", "scaling_3d_scale", 0.5]]} for m, i in (("bilinear", 0), ("fsr1", 1), ("metalfx_spatial", 3))]
gl.sweep(P, scene, v, renderer="mobile", driver="metal")
```

Run in Godot 4.7.2 on 2026-10-02: pass.

- FSR1 on Mobile renders pixel-identical to bilinear (max channel difference 0.0) and prints "FSR1
  3D scaling is only available when using the Forward+ renderer".
- MetalFX spatial changes the image (max difference 0.35) with no warning.
- Not yet run: MetalFX temporal and FSR2 on Mobile (left out of the sweep). FSR2 is documented as
  Forward+ only.

## P14 Parse check

```python
gd_run.check_all(P)                                   # project scripts
for f in Path(P, "addons/agentkit/rendering").rglob("*.gd"): gd_run.check_only(f, project=P)   # agent_audit skips addons/agentkit/
```

Run in Godot 4.7.2 on 2026-10-02: pass. The 3 project job scripts and the 7 kit scripts all parse
with 0 errors.

## P15 Round-2 facts: defaults, LUT and HDR import (headless)

Jobs: `tests/code/godot-rendering-lighting/jobs/r2_make.gd` (writes a 256x16 LUT strip and two 8x8
EXRs with one bright pixel, plus their `.import` files) and `r2_probe.gd` (reads defaults, loads the
imports).

```bash
godot --headless --path "$P" --script res://jobs/r2_make.gd
godot --headless --path "$P" --import
godot --headless --path "$P" --script res://jobs/r2_probe.gd # prints R2_PROBE {json}
```

LUT import file written before `--import`:

```ini
[remap]
importer="3d_texture"
type="CompressedTexture3D"
[params]
compress/mode=0
slices/horizontal=16
slices/vertical=1
```

Repo check for the lightmap unwrap cache (must print nothing):

```bash
grep -n "unwrap_cache" .gitignore
```

Run in Godot 4.7.2 on 2026-10-02: pass. Evidence
`tests/live_evidence/godot-rendering-lighting/p15_round2_probe.json`.

- LUT: loads as `CompressedTexture3D` 16x16x16 and assigns to `adjustment_color_correction`.
- `process/hdr_clamp_exposure=true`: a 100000 pixel became 14988; with a 50.0 pixel nothing changed
  (the clamp only compresses luminance above about 4096, so it removes sun spikes, not mild
  sparkles). Without the option the pixel stayed 100000.
- Environment: `ssao_light_affect` 0.0; `sdfgi_y_scale` 1 (75 percent; 50 percent is 0);
  `sdfgi_max_distance` 204.8; glow blend 1 (Screen), intensity 0.3, levels 1 to 5 = 0, 0.8, 0.4,
  0.1, 0 (the 4.6 defaults).
- LightmapGI: `shadowmask_mode` 0 (None); enum None 0, Replace 1, Overlay 2 (on `LightmapGIData`);
  `texel_scale` 1.0.
- Meshes: `gi_mode` default 1 (Static), cast_shadow 1 (On). Lights: `light_bake_mode` default 2
  (Dynamic), `light_cull_mask` all layers. Camera3D far 4000.
- Project settings: `use_debanding` false; `fallback_to_opengl3` true;
  `lightmapping/denoising/denoiser` 0 (JNLM); positional atlas 4096 with quadrant subdiv indices 2,
  2, 3, 4 (4, 4, 16, 64 shadows = 88).
- glTF import defaults (from an existing `.glb.import`): `meshes/light_baking=1`,
  `meshes/lightmap_texel_size=0.2`; the importer hint string is "Disabled,Static,Static
  Lightmaps,Dynamic", so Static Lightmaps is 2.
- `AreaLight3D` exists.
- Not run: the doc claims about Cull Mask shadows, PSSM 5 draws, AreaLight3D cost and Compatibility
  sRGB shadows (cited as docs in SKILL.md).

## Not yet run

- **Day and night animation** (Picster 1:01:52): an AnimationPlayer on the sun's parent rotation,
  light color and energy, sky energy and fog density. Not built in this version.
- **ReflectionProbe placement** sized from the room AABB: the audit counts probes, but no procedure
  places them yet.
- **Shadow bias sweep at a grazing angle** (Workflow stage 6): the sweep supports it
  (`[["Sun", "shadow_bias", 0.02]]`), but no recorded run exists yet.
- **Device runs** (iPhone, Android, web) of the tiers: not possible on this Mac without devices or
  export; handed to scenario-godot-performance-export.
