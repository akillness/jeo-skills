# scenario-godot-shaders procedures

Every procedure ran live in Godot 4.7.2.stable on macOS (M5 Max, Metal by default) through the
scenario-godot-expert toolkit, in `tests/projects/godot-shaders/Shaders3D` (a Base3D copy: Jolt
Physics, Forward+). Tests:

- `tests/code/godot-shaders/test_shaders_live.py` (S0 to S16; `--cost` adds S6);
- `tests/code/godot-shaders/test_shaders_offline.py` (O1 to O4).

Evidence is in `tests/live_evidence/godot-shaders/`: `live_*.json`, `offline_*.json`, `sheets/`,
`captures/` and `logs/`.

Full job files are in `scripts/agentkit/shaders/examples/`. Copy them into the project's
`res://jobs/` or `res://probe/`; they expect the paths used below. The templates are in
`scripts/agentkit/shaders/`.

```python
import sys; sys.path.insert(0, "<skills>/scenario-godot-shaders/scripts")
import gd_shaders, gd_run, gd_review          # gd_shaders puts scenario-godot-expert/scripts on sys.path
P = "tests/projects/godot-shaders/Shaders3D"
```

---

## P1 Install the kit and lint

```python
gd_shaders.install(P)                    # tools -> addons/agentkit/shaders/, templates -> res://shaders/ (kept unless overwrite=True)
for f in Path(P, "shaders").glob("*.gdshader"):
    print(f.name, gd_shaders.lint(f, renderers=["forward_plus", "gl_compatibility"], project=P))
gd_shaders.uniform_bytes(open(f).read())  # {"bytes", "mobile_ok" (<= 16,384), "desktop_ok" (<= 65,536)}
```

- `lint` inlines `#include "x.gdshaderinc"` (relative or res://) before checking.
- Rules:
  - `godot3`: Godot 3 names, and `vertex()` in particles shaders;
  - `source_color`: missing on color uniforms, or wrongly set on data samplers;
  - `array_default`, `instance_uniform` (samplers, arrays, more than 16), `screen_lod`, `renderer`
    (normal-roughness off Forward+, fog under Compatibility);
  - `uniform_budget`, `transparent`, `mobile_cost`, `reversed_z`, `include`, `stencil`, `discard`,
    `light`;
  - `int_literal`, `uninitialised`, `canvas_color`, and `global_uniform` (needs `project`).
- Each rule matches a behavior observed in 4.7.2 (P2, P3, P15, P17).

Test: O1 (16 snippets, each must trigger its rule), O2 (every template has no `error` finding;
includes inlined), O3 (byte budget: float 4, vec2 and vec3 16, mat4 64, arrays per element;
samplers, globals and instances excluded). **Run in Godot 4.7.2 on 2026-10-02: pass** (offline; the
rules come from the live probes below).

## P2 Compile under each renderer, headless

```python
r = gd_shaders.compile_matrix(P, root="res://shaders/", renderers=["forward_plus", "mobile", "gl_compatibility"])
r["ok"], r["failed"], r["by_renderer"]["mobile"]["files"]["res://shaders/water_stylized.gdshader"]["errors"]
```

`shader_tools.gd:compile` loads each `.gdshader` (and each VisualShader `.tres`) and calls
`get_shader_uniform_list()`, which forces compilation. The AgentKit logger captures errors with type
"shader". `--rendering-method` changes what compiles.

`examples/compile_probe.gd` holds 20 cases. The headless results per renderer:

- **Fail:**
  - `float a = 2;`;
  - a syntax error;
  - an array uniform with a default;
  - `instance uniform sampler2D`;
  - a varying assigned in `light()`;
  - `#include` of a `.gdshader` ("Unknown character #35");
  - `hint_color` and `SCREEN_TEXTURE` (the message suggests the hinted uniform);
  - `vertex()` in a particles shader;
  - `hint_normal_roughness_texture`, only under mobile and gl_compatibility.
- **Compile with no error:**
  - an uninitialized local;
  - `DEPTH` written in one branch;
  - a global uniform that is not registered;
  - sky, fog, particles and canvas_item shaders;
  - the `#if CURRENT_RENDERER` branch.

Test: S1 (asserts each case, three renderers), S2 (all templates and the VisualShader `.tres`, three
renderers). **Run in Godot 4.7.2 on 2026-10-02: pass**, 11 files x 3 renderers in 1.3 s.

## P3 Draw once per renderer (backend-only errors)

```python
r = gd_shaders.draw_check(P, files=["res://shaders/portal_reader.gdshader"], renderers=["forward_plus", "gl_compatibility"])
# or the probe job, which logs errors per case:
gd_run.run_script(P, "probe/render_probe.gd", headless=False, extra_args=["--rendering-method", "gl_compatibility", "--resolution", "160x90"])
```

`draw_check` puts each shader on a probe that is really drawn for 3 frames:

- spatial: a mesh;
- canvas_item: a ColorRect;
- sky: a WorldEnvironment;
- particles: a GPUParticles3D;
- fog: a FogVolume.

These errors only appear at draw time:

- `stencil_mode read` in an opaque material logs "Attempting to use a shader that reads stencil but
  is not in the alpha queue", in Forward+ and in Compatibility;
- a fog shader under Compatibility logs "shader type fog not supported in OpenGL renderer";
- an `#include` of a `.gdshaderinc` from code compiles and draws.

Cold pipeline builds take time: the first windowed draw took 7.5 s on Metal, 5.3 s under Mobile and
1.6 s under Compatibility.

Test: S3. **Run in Godot 4.7.2 on 2026-10-02: pass** (stencil 1 error per renderer, fog 1 error
under compat, include 0).

## P4 Stylized water (HQ and LITE) on a shoreline scene

Templates:

- `water_common.gdshaderinc`: uniforms, `water_noise`, `scene_world_pos` with the compat branch,
  `toon`, `vertex()` and `fragment()`;
- `water_stylized.gdshader` (HQ: depth plus screen refraction, background through EMISSION,
  `ALPHA = 1.0`);
- `water_lite.gdshader` (`#define WATER_LITE`: depth only, alpha blended).

The recipe:

- Bramwell: two panned cellular noises multiplied, then `pow(.., 1.25)`, shared by `vertex()` and
  `fragment()`;
- Dylearn: hybrid toon bands;
- [added]:
  - vertical water depth from the depth texture;
  - shore foam as `smoothstep(fine - aa, fine + aa, shore)` broken by a finer noise;
  - two-tone ripples from `step(ripple_threshold, n)`;
  - refraction samples rejected when they land above the surface.

```gdscript
# water_common.gdshaderinc, core of fragment()
float raw = texture(depth_tex, SCREEN_UV).r;
vec3 bottom = scene_world_pos(SCREEN_UV, raw, INV_PROJECTION_MATRIX, INV_VIEW_MATRIX);
float water_depth = max(world_pos.y - bottom.y, 0.0);
float banded = toon(clamp(water_depth / depth_range, 0.0, 1.0), float(color_bands), band_smoothing);
```

The scene comes from `examples/build_water_scene.gd`:

- a 24 m heightfield crossing y = 0, with a checker texture so refraction is visible;
- four rocks;
- an 80 x 80 PlaneMesh subdivided 159 times;
- AgX.
- `shader: ""` gives the StandardMaterial3D baseline (transparent, same color).
- The noise is `ShaderTools.noise_texture_2d(256, 0.02)`: cellular, Euclidean squared, seamless.

```python
for sh, out in [("res://shaders/water_stylized.gdshader", "res://scenes/water_shore.tscn"),
                ("res://shaders/water_lite.gdshader", "res://scenes/water_shore_lite.tscn"), ("", "res://scenes/water_shore_standard.tscn")]:
    gd_run.run_script(P, "jobs/build_water_scene.gd", {"shader": sh, "out": out})
r = gd_shaders.renderer_captures(P, "res://scenes/water_shore.tscn", size=(480, 270), out="captures/live/water_shore")
```

Test: S4. Pixel probes check that shallow water near the camera is greener than deep water (the
green/blue ratio drops with depth), for HQ and LITE, in all three renderers. **Run in Godot 4.7.2 on
2026-10-02: pass**:

- Forward+: shallow (114,150,147), deep (104,120,148);
- Compatibility renders brighter and more saturated with the same Environment: shallow (69,152,161),
  deep (93,141,201);
- the depth foam ring is correct in all three.

Sheets: `sheets/water_shore_renderers_sheet.png` and `water_shore_lite_renderers_sheet.png`
(viewed).

## P5 Water sweeps: foam width and motion

```python
gd_shaders.param_sweep(P, "res://scenes/water_shore.tscn", node="Water", param="shore_foam_distance", values=[0.0, 0.25, 0.8])
gd_shaders.param_sweep(P, "res://scenes/water_shore.tscn", node="Water", param="wave_speed", values=[1.0, 25.0, 50.0])
```

Motion is checked through phase: `t = TIME * wave_speed`, so different speeds at the same moment
give different wave phases.

- Two captures 120 frames apart changed only 0.02% of pixels, because TIME advances by wall time and
  the frames render fast. Comparing frame counts misses motion.
- The first foam pass looked wrong. A crest foam threshold read as blobs or specks, and a 0.5 m
  shore band was too wide. They became two-tone ripples and 0.25 m (contact sheet
  `captures/water_sweep_foam_sheet.png`).

Test: S5. **Run in Godot 4.7.2 on 2026-10-02: pass**, phase changes [0, 0.016, 0.024], foam changes
[0, 0.010, 0.059], monotonic. Sheets viewed.

## P6 GPU cost against the baseline

```python
gd_shaders.cost_compare(P, {"standard": "res://scenes/water_shore_standard.tscn", "hq": "res://scenes/water_shore.tscn",
                             "lite": "res://scenes/water_shore_lite.tscn"})   # 1920x1080, Vulkan (Metal reports gpu_ms 0)
```

Test: S6 (`--cost`). **Run in Godot 4.7.2 on 2026-10-02: pass**. Whole-frame GPU p50 over three
runs:

- standard 2.88 to 3.17 ms;
- HQ 3.39 to 3.52;
- LITE 3.04 to 3.11.

HQ refraction costs about +0.35 to 0.5 ms here, and LITE about +0 to 0.15. These are desktop
proxies; a phone is the judge.

## P7 Dissolve on a shared material with instance uniforms

The template is `dissolve.gdshader`:

- `instance uniform float dissolve_amount`;
- `instance uniform vec2 bounds`: the object-space min and max along `dissolve_direction`;
- a 3D noise sampled in object space;
- a hot and a cool edge with emission x6;
- an `interior_color` on back faces (`cull_disabled`);
- `ALPHA = step(0.0, diff); ALPHA_SCISSOR_THRESHOLD = 0.5;`, so the shadow dissolves too and the
  material stays opaque.

```gdscript
# examples/build_dissolve_scene.gd (excerpt): one ShaderMaterial, per-mesh bounds
var b := ShaderTools.dissolve_bounds(mi.mesh, Vector3.UP, 0.02)   # Vector2(min, max) in object space
mi.set_instance_shader_parameter("bounds", b)
mi.set_instance_shader_parameter("dissolve_amount", 0.0)
```

The threshold is `mix(-noise_strength - edge_width - 0.001, 1 + noise_strength + 0.001, amount)`, so
amounts 0 and 1 are exactly whole and exactly gone.

```python
shots = [{"label": "a050", "set": [["Hero", "instance", "dissolve_amount", 0.5], ["Torus", "instance", "dissolve_amount", 0.5]]}, ...]
gd_shaders.param_sweep(P, "res://scenes/dissolve_lab.tscn", shots=shots, out="captures/live/dissolve")
```

Test: S7 (amounts 0, .25, .5, .75, 1 plus a mixed shot; the same run under gl_compatibility). **Run
in Godot 4.7.2 on 2026-10-02: pass**:

- changes [0, 0.004, 0.033, 0.089, 0.110, 0.061];
- the mixed shot shows each mesh at its own amount;
- the shadows dissolve;
- Compatibility draws the instance uniforms correctly.

The torus dissolves sideways because the direction is in object space and the torus is rotated:
expected, and stated in the template. Glow on against off changed 1.4% of pixels. Sheets:
`sheets/dissolve_sheet.png`, `captures/dissolve_amount_sheet.png` and
`captures/dissolve_close_sheet.png` (viewed).

Not done: a central-crop compare for a moved hero. A full-frame compare after moving the hero and
the camera together changed 1.4%, mostly at the floor edge, so it neither confirms nor rejects that
the effect follows the object.

## P8 Animate shader parameters

```gdscript
# examples/animate_instance_uniform.gd
create_tween().tween_property(hero, "instance_shader_parameters/dissolve_amount", 1.0, 0.5)
anim.track_set_path(t, NodePath("Torus:instance_shader_parameters/dissolve_amount"))   # relative to root_node (".." of the player)
mat.set_shader_parameter("edge_width", 0.06)            # REQUIRED before tweening a material uniform left at its default
create_tween().tween_property(mat, "shader_parameter/edge_width", 0.2, 0.2)
```

Test: S8 (headless). **Run in Godot 4.7.2 on 2026-10-02: pass**:

- the tween reads 0.496 at mid-time and 1.0 at the end;
- the AnimationPlayer track ends at 0.8;
- the other instance stays at 0;
- the material tween ends at 0.2.

A material uniform still at its shader default reads `null`. A tween from it fails with "Type
mismatch between initial and final value: Nil and float" and never emits `finished`, so the job
hangs.

## P9 VisualShader built in code (for a human who wants the graph)

`examples/build_visual_shader.gd` builds this graph:

- a FloatParameter `amount` (hint range, default 0.4);
- a Texture2DParameter `noise`, connected to the sampler port (port 2) of a VisualShaderNodeTexture
  with `SOURCE_PORT`;
- an Expression node holding the dissolve maths as text;
- the Output ports albedo 0, alpha 1, emission 5 and alpha_scissor_threshold 19.

The graph is saved as `res://shaders/vs_dissolve.tres`. `get_input_port_count()` and the port names
are not exposed to GDScript on VisualShaderNode subclasses ("Nonexistent function"), so
`examples/vs_ports.gd` maps the output indices by connecting a constant and reading `get_code()`:

- 0 albedo, 1 alpha, 2 metallic, 3 roughness, 4 specular, 5 emission, 6 AO;
- 10 normal map depth, 11 rim, 13 clearcoat, 15 anisotropy, 17 SSS strength;
- 19 alpha scissor threshold, 23 depth.

```python
gd_run.run_script(P, "jobs/build_visual_shader.gd")
v = gd_run.run_script(P, "res://addons/agentkit/shaders/shader_tools.gd:visual_shader",
                      {"path": "res://shaders/vs_dissolve.tres", "save_code": "res://.agent_out/vs_dissolve_code.gdshader"})
```

Test: S9 (generated code has ALPHA_SCISSOR_THRESHOLD, EMISSION, `uniform float amount`,
`texture(noise, UV)`; sweep amount 0, .5, 1). **Run in Godot 4.7.2 on 2026-10-02: pass**:

- 6 fragment nodes, 48 lines of generated code, no errors;
- changes [0, 0.006, 0.008].

The generated code is in `live_evidence/scenario-godot-shaders/vs_dissolve_code.gdshader`.

## P10 Stencil: portal, X-ray and outline

- **Portal, shader side:**
  - `portal_writer.gdshader`: `stencil_mode write, compare_always, 1;`, unshaded, `ALPHA = 0.0`,
    render_priority 0;
  - `portal_reader.gdshader`: `stencil_mode read, compare_equal, 1;`, writes `ALPHA = 1.0`,
    `depth_test_disabled`, so it shows behind the frame that holds the portal, render_priority 1.
- **Material presets:**

```gdscript
var xm := StandardMaterial3D.new()
xm.stencil_mode = BaseMaterial3D.STENCIL_MODE_XRAY          # creates its own next_pass
xm.stencil_color = Color(0.2, 0.9, 1.0)
om.stencil_mode = BaseMaterial3D.STENCIL_MODE_OUTLINE
om.stencil_color = Color(1.0, 0.9, 0.1); om.stencil_outline_thickness = 0.06
```

Setting a preset sets `next_pass`, `stencil_flags` 2 (write), compare 0 and reference 1 on the base
material. The scene comes from `examples/build_fx_scenes.gd`.

Test: S10 (Forward+ and Compatibility; pixel probes on the portal and the X-ray silhouette). **Run
in Godot 4.7.2 on 2026-10-02: pass**:

- portal (174,74,30) in Forward+ and (217,82,20) in Compatibility;
- X-ray (124,196,205);
- no errors.

What failed first:

- With the default depth test, the portal content was hidden by the frame.
- With thickness 0.03, the outline on a box was 1 px and broken at the corners, because the box's
  split normals spread apart (`captures/crate_crop.png`, LowQualityCoding [00:01:39]).
- At 0.06 on a sphere, the outline is continuous.

Sheet: `sheets/stencil_sheet.png` (viewed).

## P11 Global uniforms

```python
gd_shaders.register_global(P, "day_tint", "color", "Color(1, 0.55, 0.3, 1)")   # writes the editor's multi-line block
gd_shaders.shader_globals(P)                                                   # parse back
gd_shaders.lint("res://...gdshader", project=P)                                # flags unregistered globals
```

```gdscript
RenderingServer.global_shader_parameter_set("day_tint", Color(1, 0.6, 0.4))   # live change; keep a copy in an autoload
```

What 4.7.2 did in the runs:

- `[shader_globals]` entries look like `day_tint={"type": "color", "value": Color(...)}` on several
  lines.
- `ProjectSettings.set_setting` at runtime does not register a global:
  `global_shader_parameter_get_list()` stays empty.
- `ProjectSettings.save()` rewrites project.godot and drops keys equal to their defaults.
- A shader that uses an unregistered global:
  - compiles at runtime with no error, headless or windowed;
  - the docs say it fails;
  - it does not read 0: it showed the value of `day_tint`, (185,156,133) against (184,154,129) for
    the registered cube;
  - adding a global that sorts earlier (`aaa_red`) did not change that, so the slot rule is not
    resolved;
  - the shader baker and the editor do report it: "Global uniform 'not_registered_tint' does not
    exist. Create it in Project Settings.".

Test: S14 (capture, registered cube warm) and O4 (register and replace on a temporary copy; lint
flags only the unregistered name). **Run in Godot 4.7.2 on 2026-10-02: pass.**

## P12 Compute: local device with CPU parity

`shader_tools.gd:compute_probe`:

- inline GLSL through `RDShaderSource` and `shader_compile_spirv_from_source`;
- computes `v * 2 + 1` over n floats, with a push constant;
- runs submit and sync, reads back, compares with the CPU result;
- frees every RID.

```python
gd_run.run_script(P, "res://addons/agentkit/shaders/shader_tools.gd:compute_probe", {"n": 1 << 20}, headless=False,
                  extra_args=["--rendering-driver", "vulkan", "--resolution", "160x90"])
```

Test: S15. **Run in Godot 4.7.2 on 2026-10-02: pass**:

- `create_local_rendering_device()` returns null headless and under Compatibility;
- windowed, 1,048,576 floats gave 0 mismatches;
- submit plus sync took 1.18 to 1.19 ms on Metal and 1.9 to 2.4 ms on Vulkan.

## P13 Compute output on screen with Texture2DRD

`examples/compute_texture.gd` (The Pathfinders Codex recipe):

- on the main device (`RenderingServer.get_rendering_device()`), every RD call goes inside
  `RenderingServer.call_on_render_thread`;
- an RGBA32F storage texture with usage bits storage, sampling and can-update;
- `Texture2DRD.texture_rd_rid` feeds a TextureRect;
- no submit or sync;
- RIDs are freed on exit.

Test: S15. **Run in Godot 4.7.2 on 2026-10-02: pass**, frames changed 0.91 between the first and the
last capture, no errors, no leaks. Sheet: `captures/compute_sheet.png` (viewed).

## P14 Shader baker

```python
gd_run.ensure_preset(P, "mac_baked", "macOS", options={"binary_format/architecture": "arm64",
                     "application/bundle_identifier": "com.example.shaders", "shader_baker/enabled": True})
# headless export: the baker does NOT run
gd_run.export(P, "mac_baked", out, pack=True)
# windowed export: the baker runs (one GD_MAX windowed slot)
cmd = [gd_run._godot(), "--path", P, "--resolution", "160x90", "--export-pack", "mac_baked", out]
log, code, timed_out, secs, _ = gd_run._run(cmd, Path(P), 900, True, log_path)
```

Test: S16. **Run in Godot 4.7.2 on 2026-10-02: pass**:

- headless packs: 4,887,144 bytes with the baker and without it, and no baker line in the log;
- windowed with the baker: "Started Baking shaders (709 steps)", pack 18.3 MB, 19.4 s on the first
  bake and 4.1 to 12.3 s on later runs;
- "Metal shader baking limited to SPIR-V: Unable to determine toolchain properties to compile
  .metallib", because Xcode Metal tools are not installed;
- the unregistered-global error from P11.

Not yet run: the load-time gain on a device, because that needs a full app export and a launch
timer. Hand it to scenario-godot-performance-export.

## P15 Full-screen post-process with depth

`fullscreen_depth.gdshader`:

- `render_mode unshaded, fog_disabled, depth_draw_never, depth_test_disabled`;
- `POSITION = vec4(VERTEX.xy, 1.0, 1.0)`;
- linear depth and world position from the depth texture, with the compat branch;
- `debug_view` 0 fog tint, 1 `fract(linear_depth)` bands, 2 `fract(world_position)`.

The mesh is a QuadMesh of size 2 x 2 with `flip_faces`, a child of the Camera3D,
`extra_cull_margin = 16384`.

Test: S11 (Forward+ and Compatibility, plus the trap quad with the pre-4.3
`POSITION = vec4(VERTEX, 1.0)` and the default depth test). **Run in Godot 4.7.2 on 2026-10-02:
pass**:

- 1 m depth bands and a world-space grid in both renderers;
- the trap quad in Forward+ draws only over the sky (floor pixel unchanged, sky pixel changed),
  because z = 0 is the far plane under reversed-z;
- in Compatibility the trap quad covers the whole screen, so a project tested only in Compatibility
  hides the bug.

Sheets: `sheets/fullscreen_forward_plus_sheet.png` and
`sheets/fullscreen_gl_compatibility_sheet.png` (viewed).

## P16 Sky shader

`sky_toon.gdshader`:

- banded zenith-to-horizon gradient (`floor(pow(h, 0.5) * bands) / bands`);
- a hard sun disc where `dot(EYEDIR, LIGHT0_DIRECTION) > cos(sun_size)`, tinted by
  `LIGHT0_COLOR * LIGHT0_ENERGY`;
- ground color below the horizon.

Assign it with `Sky.sky_material = ShaderMaterial`. When the Environment's ambient or reflection
source is Sky, it also lights the scene (StayAtHomeDev [00:01:22]).

Test: S12 (three renderers, pixel at the sun direction). **Run in Godot 4.7.2 on 2026-10-02: pass**,
sun (239..255) in all three. Sheet: `sheets/sky_renderers_sheet.png` (viewed).

## P17 canvas_item hit flash

```glsl
shader_type canvas_item;
uniform vec4 flash_color : source_color = vec4(1.0);
uniform float flash : hint_range(0.0, 1.0) = 0.0;
void fragment() {
	vec4 c = COLOR;                       // already texture * modulate
	COLOR = vec4(mix(c.rgb, flash_color.rgb, flash), c.a);
}
```

Keeping `c.a` stops the whole rectangle from tinting (Single-Minded Ryan). Use an instance uniform,
or `resource_local_to_scene`, for a per-enemy flash.

Test: S13. **Run in Godot 4.7.2 on 2026-10-02: pass**:

- flash 0 matches the untouched sprite (54,61,82);
- flash 1 is white;
- the first version used `texture(TEXTURE, UV) * COLOR` and read (11,15,26), the color squared
  (`captures/flash_squared_trap_sheet.png`).

Not run: BackBufferCopy for 2D screen reading.

## P18 Round 2: swap-in dissolve, pausable time, LIGHT_VERTEX, sorted transparency

Added 2026-10-02 after blind grading. Jobs and shaders: `tests/code/godot-shaders/jobs/`
(`r2_swap.gd`, `r2_gametime.gd`, `r2_shaders/`). Kit files:
`scripts/agentkit/shaders/dissolve_swap.gd`, `game_time.gd`.

```gdscript
# Swap the dissolve material in for the effect only (alpha scissor loses early-Z), then restore.
const Swap = preload("res://addons/agentkit/shaders/dissolve_swap.gd")
var saved := Swap.swap_in(mi, dissolve_mat)          # one duplicate per surface, albedo colour and texture copied
mi.set_instance_shader_parameter("dissolve_amount", 0.0)
var tw := create_tween()
tw.tween_property(mi, "instance_shader_parameters/dissolve_amount", 1.0, 0.6)
await tw.finished
Swap.restore(mi, saved)                              # or free the node
```

```gdshader
// Pausable time: register game_time in [shader_globals], add game_time.gd as an autoload.
global uniform float game_time;
void fragment() { ALBEDO = texture(tex, UV + speed * game_time).rgb; }
```

```gdshader
// LIGHT_VERTEX: snapped lighting position, VERTEX untouched (light_vertex_snap.gdshader).
vec3 world = (INV_VIEW_MATRIX * vec4(VERTEX, 1.0)).xyz;
world = floor(world / texel) * texel + texel * 0.5;
LIGHT_VERTEX = (VIEW_MATRIX * vec4(world, 1.0)).xyz;
```

```gdshader
render_mode depth_prepass_alpha, cull_disabled;   // sorted_transparent.gdshader
```

```python
gd_shaders.register_global(P, "game_time", "float", "0.0")
gd_shaders.compile_matrix(P, files=[...]); gd_shaders.draw_check(P, files=[...])
```

**Run in Godot 4.7.2 on 2026-10-02: pass.** Evidence
`tests/live_evidence/godot-shaders/p18_round2.json`.

- `compile_matrix` and windowed `draw_check`: the three shaders pass under Forward+, Mobile and
  Compatibility (LIGHT_VERTEX included). Lint: only an `info` that the depth-prepass shader is
  transparent.
- Swap (headless, a 2-surface ArrayMesh with red and textured blue StandardMaterial3D): both
  surfaces get distinct ShaderMaterials, the red color and the blue surface's texture are copied,
  one `set_instance_shader_parameter` reads back 0.7, and `restore` puts the null overrides back
  (active material red again).
- `game_time.gd`: after 20 frames t = 0.169; with `paused = true` it stayed at 0.169 for 20 more
  frames. Headless, `global_shader_parameter_get` returns null (dummy renderer), so check the value
  in script, not through the getter.
- Not measured: the early-Z cost of alpha scissor on a phone (docs claim, shading-language page).
