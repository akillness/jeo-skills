# scenario-godot-vfx procedures (Godot 4.7.2)

Every procedure runs through the scenario-godot-expert toolkit in a clone of Base3D. The live test
is `tests/code/godot-vfx/test_vfx_live.py` (one function per procedure, V1 to V12), and the evidence
is in `tests/live_evidence/godot-vfx/`. The machine was an Apple M5 Max running macOS. Windowed runs
render through 640x360 SubViewports, or 160x90 where no image is kept.

Common header for every Python snippet:

```python
import sys
SK = "<repo>/skills"
sys.path[:0] = [SK + "/scenario-godot-expert/scripts", SK + "/scenario-godot-vfx/scripts"]
import gd_env, gd_run, gd_review, gd_vfx
P = gd_env.base_project("3d", "<repo>/tests/projects/godot-vfx/runs/<stamp>/Work3D")
```

Kit layout after `gd_vfx.install(P)`:

- `res://addons/agentkit/vfx/` holds the tooling: vfx_build, vfx_recipes, vfx_audit, vfx_capture,
  vfx_jobs, vfx_selftest and fx_looper. Exports do not need it.
- `res://vfx/shaders/` holds fx_fire_head, fx_soft_core, fx_erode.gdshaderinc, fx_erode_add,
  fx_erode_mix and fx_trail_follow.
- `res://vfx/runtime/` holds fx_burst.gd, fx_projectile.gd and juice.gd.
- `res://vfx/tex/` holds the shared textures, created on first build.

---

## P1. Project, kit, settings check

```python
inst = gd_vfx.install(P)                       # 16 files
gd_run.import_project(P)
lines = (P / "project.godot").read_text().splitlines()
assert '3d/physics_engine="Jolt Physics"' in lines
assert 'renderer/rendering_method="forward_plus"' in lines
c = gd_run.run_script(P, "res://addons/agentkit/vfx/vfx_selftest.gd:compile")   # every kit .gd, CACHE_MODE_IGNORE, except itself
assert c["ok"] and not c["parse_errors"]
```

`gd_run.check_all` skips `res://addons/agentkit/`, so the kit has its own `compile` job. It must not
reload its own file: a first version did, and on 4.7.2 the running function broke ("Internal script
error! Opcode: 43 (please report)") and returned a corrupt result. That is a finding, not a parse
error. Run in Godot 4.7.2 on 2026-10-02: **pass** (V1, V2). Jolt and forward_plus present; 16 files
installed; 10 scripts compiled, 0 errors.

## P2. Build the G4 kit per tier in code

```python
for tier in ("high", "mobile", "low"):
    r = gd_vfx.build(P, tier)      # vfx_jobs.gd:build -> vfx_recipes.build_all
    assert r["ok"] and r["result"]["ok"]
```

Each layer is a dictionary spec. The fire layer of the explosion (`vfx_recipes.gd`):

```gdscript
root.add_child(VB.emitter({
	"name": "Fire", "amount": n(24, tier), "lifetime": 0.7, "one_shot": true, "explosiveness": 0.95, "aabb": mid,
	"pm": {"emission_shape": ParticleProcessMaterial.EMISSION_SHAPE_SPHERE, "emission_sphere_radius": 0.25 * s,
		"direction": [0, 1, 0], "spread": 180.0, "initial_velocity_min": 2.0 * s, "initial_velocity_max": 4.5 * s,
		"damping_min": 5.0, "damping_max": 7.0, "gravity": [0, 1.5, 0], "lifetime_randomness": 0.35,
		"scale_min": 0.7, "scale_max": 1.3, "scale_curve": [[0.0, 0.4], [0.15, 1.0], [1.0, 0.6]],
		"angle_min": 0.0, "angle_max": 360.0,
		"color_ramp": [[0.0, [2.4, 1.3, 0.45, 0.8]], [0.2, [1.8, 0.6, 0.1, 0.75]], [0.55, [0.8, 0.16, 0.03, 0.55]], [1.0, [0.1, 0.02, 0.01, 0.0]]]},
	"draw": {"mesh": "quad", "size": [2.0 * s, 2.0 * s], "material": erode_material("add")},
	"node": {"cast_shadow": GeometryInstance3D.SHADOW_CASTING_SETTING_OFF, "position": [0.0, 0.5 * s, 0.0]}}))
```

Rules that `VB.apply` and `VB.emitter` enforce:

- An unknown property name causes `push_error`, which makes the job fail.
- `*_curve` arrays become CurveTexture with the Curve range widened (Curve enforces min and max
  since 4.4).
- `*_ramp` arrays become GradientTexture1D with `use_hdr` set when a channel is above 1.
- `fixed_fps` defaults to 60.
- `particle_material()` turns on vertex color, transparency, unshaded and cull disabled, and sets
  particle billboard with `billboard_keep_scale`.

Sub-emitter link (cap computed, AABB copied, child `one_shot` off):

```gdscript
VB.link_sub_emitter(debris, trail, ParticleProcessMaterial.SUB_EMITTER_CONSTANT, 1, 30.0)   # cap 8 x 30 Hz x 0.5 s = 120
```

Projectile head shader (Le Lu's VisualShader as text, `res://vfx/shaders/fx_fire_head.gdshader`):

```glsl
shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_disabled, shadows_disabled, fog_disabled;
uniform vec4 fire_color : source_color = vec4(2.0, 1.3, 0.6, 1.0);
uniform vec4 edge_color : source_color = vec4(1.4, 0.35, 0.06, 1.0);
uniform sampler2D noise_tex : hint_default_white, repeat_enable, filter_linear_mipmap;
uniform vec2 scroll = vec2(0.1, -3.0);
uniform vec2 tiling = vec2(2.0, 1.0);
uniform float coverage : hint_range(0.0, 1.0) = 0.45;
uniform float sharpness = 2.0;
uniform float intensity = 1.0;
void fragment() {
	float n = texture(noise_tex, UV * tiling + TIME * scroll).r;
	float a = clamp((n - (UV.y - coverage)) * sharpness - 0.5, 0.0, 1.0);   // clamp: no black marks (Le Lu 00:11:01)
	a *= smoothstep(0.0, 0.45, abs(dot(NORMAL, VIEW)));
	ALBEDO = mix(edge_color.rgb, fire_color.rgb, a) * intensity;
	ALPHA = a * fire_color.a;
}
```

Ribbon that follows the projectile (`fx_trail_follow.gdshader`, the Octodemy trick):

```glsl
shader_type particles;
render_mode disable_velocity;
uniform vec4 color : source_color = vec4(1.0);
void start() { TRANSFORM = EMISSION_TRANSFORM; VELOCITY = vec3(0.0); COLOR = color; CUSTOM = vec4(0.0); }
void process() {
	CUSTOM.y = clamp(CUSTOM.y + DELTA / LIFETIME, 0.0, 1.0);
	TRANSFORM[3].xyz = EMISSION_TRANSFORM[3].xyz;
}
```

It is used with `amount` 1, `trail_enabled`, `trail_lifetime` 0.22, a RibbonTrailMesh with 12
sections and `section_length` 0.06, and a taper curve. The material has `use_particle_trails`.

Run in Godot 4.7.2 on 2026-10-02: **pass** (V2). Node counts for high:

- explosion 10, fireball 7, shot 14.
- The low explosion has 6 nodes.
- 0 captured errors.

## P3. Static audit (and proof that it bites)

```python
r = gd_vfx.audit(P, "res://vfx/explosion_high.tscn", "high", "res://vfx/burst_stage_high.tscn")
res = r["result"]           # findings [{emitter, id, severity, msg}], counts, totals, ids
gd_run.run_script(P, "res://addons/agentkit/vfx/vfx_jobs.gd:broken")       # one emitter per classic mistake
gd_vfx.audit(P, "res://vfx/broken.tscn", "high")
```

The audit checks each item below. Rows marked [added] are judgment calls without an expert source.

| Check                                                                                           | Severity     |
| ----------------------------------------------------------------------------------------------- | ------------ |
| no process material, no draw pass                                                               | error        |
| color from the process material without `vertex_color_use_as_albedo`                            | error        |
| `scale_curve` with a particle billboard and no `billboard_keep_scale`                           | error        |
| trail without a trail mesh, or without `use_particle_trails` (or `render_mode particle_trails`) | error        |
| trail, SDF collider or Decal on the low tier                                                    | error        |
| `AT_COLLISION` sub-emitter with collision off                                                   | error        |
| child amount below the cap; child AABB not enclosing the parent's                               | warn         |
| collision with no collider                                                                      | warn         |
| tunnelling: step above half the thinnest collider box                                           | warn         |
| `collision_base_size` left at 0.01 under a quad wider than 0.05 m                               | warn         |
| default 8 m AABB with a reach above 4 m                                                         | warn         |
| preprocess on a one-shot                                                                        | warn         |
| angle with `BILLBOARD_ENABLED`                                                                  | warn [added] |
| shadow-casting additive or unshaded emitter                                                     | warn [added] |
| light with shadows                                                                              | warn [added] |
| HDR color on the low tier                                                                       | warn         |
| turbulence on mobile or low                                                                     | warn         |
| `amount_ratio` below 1                                                                          | info         |
| custom particle shader (cannot become CPU)                                                      | info         |
| `fixed_fps` 0 with collision                                                                    | info         |

Run in Godot 4.7.2 on 2026-10-02: **pass** (V3).

- All six tier scenes report 0 errors.
- The low tier warns only `hdr_on_compat`.
- `explosion_high` audited as low reports `decal_on_compat` (error), plus `sub_emitter_on_compat`,
  `hdr_on_compat` and `no_collider` (warnings).
- `fireball_high` audited as low reports `trail_on_compat`.
- `broken.tscn` reports 4 errors, 15 warnings and 2 infos, covering the 13 expected ids.
- Tunnelling example: 44.7 m/s at 60 fps gives 0.745 m per tick, against a 0.2 m wall.

## P4. Fit visibility AABBs (the agent's "Generate AABB")

```python
r = gd_vfx.fit_aabb(P, "res://vfx/burst_stage_high.tscn", node="Explosion", play_method="Explosion:play",
                    write=True, out="res://vfx/explosion_high.tscn", margin=0.1)
for row in r["result"]["rows"]:
    print(row["emitter"], row["live"], row["fitted"], row["old_encloses_live"])
```

This is a windowed run with `--fixed-fps 60`. It unions `capture_aabb()` every 2 frames over the
longest lifetime x 1.5 + 0.2 s, then grows the box by 10% of its diagonal plus
`longest_axis x (max scale - 1)`, because `capture_aabb()` leaves particle scale out. Sub-emitter
children also get the parent's box. Measure inside the level (`node=`): the colliders change where
particles go.

Run in Godot 4.7.2 on 2026-10-02: **pass** (V4).

- Live box widths, x in meters: Debris 10.2 to 12.5, DebrisSmoke 10.8 to 13.0, Sparks 9.7 to 10.7,
  Fire 5.8 to 6.4, Smoke 6.2 to 6.6, Flash 4.0, Shockwave 2.0. The ranges come from random seeds
  across runs.
- Flash (a 2 m quad at scale 1) gave exactly 4.0 m. Shockwave (a 1 m quad scaled to 4.5) gave 2.0 m.
  This is how the padding rule was established.
- First finding: the original hand boxes were too small for Fire, Flash, Smoke and Shockwave, and
  the timeline `aabb_check` flagged them.
- Second finding: Debris with `collision_base_size` 0.12, spawned at 0.05 m above the floor
  collider, traveled 0.5 m in total. Raised to 0.3 m, it traveled 10.2 to 12.5 m.

## P5. Timeline capture per renderer, then look

```python
BT = [0.03, 0.1, 0.2, 0.35, 0.6, 1.0, 1.5, 2.2]
r = gd_vfx.timeline(P, "res://vfx/burst_stage_high.tscn", times=BT, out_dir="vfx/burst_high_compat",
                    renderer="gl_compatibility", trigger="none", cam_pos=[3.6, 1.7, -3.6], cam_look=[0, 0.9, -8],
                    extra={"play_method": "Explosion:play", "aabb_check": True})
r["contact_sheet"]                        # open it; r["checks"] = gd_review.image_checks per frame
gd_vfx.timeline(P, "res://vfx/shot_high.tscn", times=[0.3, 0.6, 0.85, 1.0], renderer="forward_plus",
                trigger="none", extra={"hold": "Fireball"})
```

How the timeline is timed:

- `--fixed-fps 60` is passed, so `frames_after_trigger` 132 means t = 2.2 s.
- `hold` keeps the projectile `PROCESS_MODE_DISABLED` during the 8 warm-up frames, while noise
  textures generate on a thread.
- `play_method` calls `fx_burst.play()` at t = 0.

Run in Godot 4.7.2 on 2026-10-02: **pass** (V5). Twelve timelines, all opened. Evidence:
`burst_high_fwd`, `burst_high_mobile`, `burst_high_compat`, `burst_low_compat`, `shot_*` sheets.

Seen in the frames:

- **Forward+:** flash at 0.03 s, fire with ring at 0.1 to 0.2 s, sparks and debris at 0.35 s, gray
  smoke with dotted debris trails at 0.6 to 1.0 s, scorch at 2.2 s.
- **Mobile:** nearly identical.
- **Compatibility:**
  - Smoke rendered near black with the same ramp, so the low tier multiplies the smoke ramp by 3.6.
  - The background reads bluer.
  - The scorch decal is absent, with no log line. Measured contrast under the explosion
    (`_scorch_contrast`, t = 2.2 s): 10.5 on Forward+, 10.7 on Mobile, 1.7 on Compatibility.
  - The log has "The Compatibility renderer does not support particle sub-emitters." and "Particle
    trails are only available when using the Forward+ or Mobile renderer.", and the ribbon is
    missing from the shot.
- **Projectile:** hits the wall at 0.867 s. The explosion stands on the wall normal, and the ring
  lies flat on the wall.

## P6. CPU fallback (CPUParticles3D twin)

```python
r = gd_vfx.to_cpu(P, "res://vfx/explosion_high.tscn", "res://vfx/explosion_high_cpu.tscn")
r["result"]["lost"]   # [{emitter, lost: [...]}]
```

`VB.to_cpu` fixes three things `convert_from_particles` gets wrong on 4.7.2:

```gdscript
var order := gp.draw_order
gp.draw_order = GPUParticles3D.DRAW_ORDER_INDEX      # raw int copy: GPU VIEW_DEPTH 3 is out of bounds for CPU
cpu.convert_from_particles(gp)
gp.draw_order = order
match order:
	GPUParticles3D.DRAW_ORDER_VIEW_DEPTH: cpu.draw_order = CPUParticles3D.DRAW_ORDER_VIEW_DEPTH
	GPUParticles3D.DRAW_ORDER_LIFETIME: cpu.draw_order = CPUParticles3D.DRAW_ORDER_LIFETIME
if pm.alpha_curve != null:
	cpu.color_ramp = _bake_alpha(pm)                 # CPUParticles3D has no alpha_curve
if gp.transform_align != GPUParticles3D.TRANSFORM_ALIGN_DISABLED:
	cpu.particle_flag_align_y = true                 # no camera-facing variant on CPU
gp.name = str(keep_name) + "_gpu_old"               # free the name first, or the twin is saved as @CPUParticles3D@2
```

Run in Godot 4.7.2 on 2026-10-02: **pass** (V6). What each twin lost:

- **explosion_high:** Debris lost its sub-emitter and collision, Sparks lost collision and its align
  mode, and Shockwave's alpha curve was baked into the ramp.
- **fireball_high:** Ribbon lost its trail and its particle shader.

Rendered in Compatibility (opened), the twin looks close to the GPU low tier. Before the fixes, the
job failed with "Index p_order = 3 is out of bounds (DRAW_ORDER_MAX = 3)", the ring stayed opaque,
and the sparks drew vertical.

## P7. Overdraw, calibrated

```python
cal = gd_run.run_script(P, "res://addons/agentkit/vfx/vfx_selftest.gd:overdraw_calibrate", args={"layers": 8},
                        headless=False, extra_args=["--rendering-method", "forward_plus"])
r = gd_vfx.overdraw(P, "res://vfx/burst_stage_high.tscn", times=[0.2, 0.35, 0.6], renderer="forward_plus",
                    trigger="none", cam_pos=[3.6, 1.7, -3.6], cam_look=[0, 0.9, -8], extra={"play_method": "Explosion:play"})
r["overdraw"]     # per frame: mean_layers_screen, covered_fraction, p95/p99/max_layers
```

The baseline frame is captured before `play()`. The layers are the effect frame minus the baseline.
The calibration lives in `gd_vfx.OVERDRAW_CAL`:

- **Forward+ and Mobile:** the PNG is sRGB-encoded, so each value is linearized first. One layer
  adds 0.0700 of linear luma.
- **Compatibility:** each layer adds 36.6 of raw luma, and the PNG saturates past 6 layers.

Run in Godot 4.7.2 on 2026-10-02: **pass** (V11).

- Forward+ luma by layer count: 0, 74.9, 104.4, 126.1, 144.1, 160.2, 173.4, 185.7, 197.1. Linear
  steps: 0.070 ± 0.003.
- Compatibility luma by layer count: 0, 36.5, 73.3, 109.8, 146.6, 183.1, 219.9, 231.2, 235.7.
- High explosion p99 layers: 2.5, 2.5 to 3.0 and 4.9 to 5.9 at 0.2, 0.35 and 0.6 s, across 3 runs
  with random seeds. Maximum 7.2 to 8.5 layers, covering 10 to 16% of the 640x360 frame (smoke at
  0.6 s).
- Low tier p99: 1.1 to 3.3.
- The sheet shows whole quads, because overdraw counts the full quad and not the texture's alpha.

## P8. GPU time

```python
gd_run.run_script(P, "res://addons/agentkit/vfx/vfx_jobs.gd:stress", args={"tier": "high", "count": 6})
r = gd_run.profile_scene(P, "res://vfx/stress_high_6.tscn", seconds=5, size=(1280, 720), driver="vulkan",
                         extra_args=["--rendering-method", "forward_plus"])
r["gpu_budget"]["value_ms"]     # p95
```

`stress` places six explosions under `fx_looper.gd`, which replays them staggered every 2 s.
`count=0` gives the stage alone.

Run in Godot 4.7.2 on 2026-10-02: **pass** (V12), 3 runs. GPU p95 at 1280x720 through MoltenVK, on a
machine shared with other agents' Godot jobs:

| Scene                      | Renderer | GPU p95                           |
| -------------------------- | -------- | --------------------------------- |
| stage alone                | Forward+ | 1.4 to 2.3 ms (mean 1.34 to 1.44) |
| six high explosions        | Forward+ | 3.4 to 4.0 ms (mean 2.8 to 3.1)   |
| stage alone                | Mobile   | 1.0 ms                            |
| six mobile-tier explosions | Mobile   | 2.1 to 2.7 ms                     |
| six low-tier explosions    | Mobile   | 1.2 ms                            |

- CPU frame time stays at the display cap, under 10.1 ms.
- One cold-cache Mobile run had a single 212 ms frame, which did not repeat. It is most likely a
  first-use pipeline compile, so prewarm effects behind a loading screen. That cause is not yet
  confirmed.

## P9. Hit-stop and shake (Juice autoload)

```gdscript
# res://vfx/runtime/juice.gd, autoload "Juice"
func hitstop(time_scale: float = 0.05, duration: float = 0.08) -> void:
	_stops += 1
	Engine.time_scale = minf(Engine.time_scale, time_scale)
	await get_tree().create_timer(duration, true, false, true).timeout   # process_always, idle, ignore_time_scale
	_stops -= 1
	if _stops <= 0:
		_stops = 0
		Engine.time_scale = 1.0
```

The shake works as follows:

- `add_trauma(a)` adds to `trauma`.
- In `_process`, `real_dt = delta / time_scale`, so the shake keeps moving during a stop.
- `shake = noise(t) * trauma²`, written to the current Camera3D `h_offset` and `v_offset` (or the
  Camera2D `offset`).
- `_ready` resets `Engine.time_scale` (Mostly Mad 00:01:37).

Run in Godot 4.7.2 on 2026-10-02: **pass** (V7, headless).

- A single stop restored 1.0 after 57 ms.
- Overlapping stops (0.1 for 0.2 s, then 0.02 for 0.05 s) held the lowest scale, 0.02, and restored
  at 207 ms with no early restore.
- Shake: maximum |h| 0.12 m (limit 0.30), maximum |v| 0.09 to 0.11 m (limit 0.22), back to exactly 0
  after 564 to 566 ms (1/1.8 s).

## P10. Spawn-and-forget lifecycle

```python
r = gd_run.run_script(P, "res://addons/agentkit/vfx/vfx_selftest.gd:lifecycle", args={"tier": "high"},
                      headless=False, extra_args=["--fixed-fps", "60"])
```

`fx_burst.play()` restarts its one-shot emitters, counts their `finished` signals, and gives
non-one-shot children (sub-emitter targets) one lifetime more. A safety timer covers (longest +
tail) x 2 + 1 s. Finally it emits `done` and calls `queue_free` (or keeps the node for a pool).

Run in Godot 4.7.2 on 2026-10-02: **pass** (V8). The run is windowed, because headless particles
never simulate, so `finished` would never fire.

- High: node count 13 to 63 to 13, `done` fired 5 times, settled 1.1 s after the last spawn.
- Low: 13 to 43 to 13.
- No safety timeouts.

## P11. Projectile: hit, impact, cleanup

```python
r = gd_run.run_script(P, "res://addons/agentkit/vfx/vfx_selftest.gd:projectile", args={"tier": "high"},
                      headless=False, extra_args=["--fixed-fps", "60"])
```

Run in Godot 4.7.2 on 2026-10-02: **pass** (V9, high and low).

- One `hit` on Wall at (0, 1.3, -12) with normal (0, 0, 1), at frame 52 (0.867 s). Expected 12 m /
  14 m/s = 0.857 s, so the first tick past it.
- The fireball freed itself at frame 74, after its 0.3 s linger.
- The explosion freed itself, leaving only the stage nodes.

## P12. `sub_emitter_frequency`: Hz or seconds?

```python
r = gd_run.run_script(P, "res://addons/agentkit/vfx/vfx_selftest.gd:frequency",
                      args={"frequency": 4.0, "seconds": 2.0, "fixed_fps": 60}, headless=False, extra_args=["--fixed-fps", "60"])
gd_vfx.count_blobs(r["result"]["image"])     # dots and their x centroids
```

The setup: a parent particle moves along +X at 1 m/s for 2 s, and the CONSTANT sub-emitter leaves 20
s dots. An orthographic top view is captured.

Run in Godot 4.7.2 on 2026-10-02: **pass** (V10).

- The dots are 1/f m apart (0.25 m at 4 Hz, 0.10 m at 10 Hz), so the value is a frequency in Hz.
  Reading it as "seconds between spawns" would give 1 dot.
- Some emissions are missing even with a generous child cap:
  - 4 Hz: 7 of 8.
  - 10 Hz at fixed_fps 60: 13 of 20.
  - 10 Hz at fixed_fps 120: 17 of 20.
- The gaps are deterministic. Do not rely on exact counts from sub-emitters; raise `fixed_fps` for
  denser trails.
- No dot appeared at the child's own origin, which is consistent with the docs: "setting sub_emitter
  stops the target emitting on its own".

## P13. Round 2: deterministic frames, premultiplied blend, smoke LOD, duplication

Added 2026-10-02 after blind grading. Jobs: `tests/code/godot-vfx/jobs/r2_vfx.gd` (windowed
320x180), `r2_smoke.gd` (windowed, once per renderer), `r2_unique.gd` and `r2_props.gd` (headless).
Shader: `scripts/agentkit/vfx/shaders/fx_smoke_lod.gdshader`.

```gdscript
# Seek a particle system to time t, the same frame every run.
p.use_fixed_seed = true; p.seed = 7
p.speed_scale = 0.0
p.restart()
p.request_particles_process(0.4)
```

```gdscript
# Fire into smoke in one system (Brackeys 00:30:56): low alpha adds, high alpha mixes.
mat.blend_mode = BaseMaterial3D.BLEND_MODE_PREMULT_ALPHA
mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA   # and import the texture with process/premult_alpha=true
```

```gdscript
# "Make Unique Recursive, but never the texture" (Brackeys 00:13:59) in code:
var pm2 := pm.duplicate(true)     # embedded curves and ramps copied, external .tres textures shared
```

```gdscript
# Smoke LOD (Le Lu 00:16:40): colour ramp black to white carries the mip level; colour from a uniform.
var g := Gradient.new(); g.set_color(0, Color(0, 0, 0, 1)); g.set_color(1, Color(1, 1, 1, 1))
var ramp := GradientTexture1D.new(); ramp.gradient = g; process_material.color_ramp = ramp
var sm := ShaderMaterial.new(); sm.shader = load("res://vfx/shaders/fx_smoke_lod.gdshader")
sm.set_shader_parameter("noise_tex", noise_texture_2d_with_mipmaps)
```

```bash
godot --path "$P" --resolution 320x180 --script res://jobs/r2_vfx.gd
for r in forward_plus mobile gl_compatibility; do godot --path "$P" --resolution 320x180 --rendering-method $r --script res://jobs/r2_smoke.gd; done
```

Run in Godot 4.7.2 on 2026-10-02: **pass**. Evidence:
`tests/live_evidence/godot-vfx/p13_round2.json`, `r2_vfx.png`, `smoke_sheet.png` (opened).

- Determinism: two seeks to 0.4 s of a 64-particle burst gave max channel difference 0.0 with
  `use_fixed_seed`; the same burst without it differed by 0.50. Two runs gave the same result.
- Premultiplied over a 0.498 gray: alpha 0 gave (0.624, 0.533, 0.498), brighter than the background
  (add); alpha 1 gave (0.4, 0.2, 0.0), the source color (mix).
- Smoke LOD: luminance spread inside the puff 0.105 at 0.05 s and 0.000 at 1.9 s on Forward+ and
  Mobile, 0.150 to 0.000 on Compatibility; the sheet shows noisy then soft smoke.
- `duplicate(true)`: external `.tres` ramp shared, embedded CurveTexture unique.
  `duplicate_deep(DEEP_DUPLICATE_ALL)` copies the external one too (avoid). `duplicate(false)`
  shares both.
- Enums and defaults: `TRANSFORM_ALIGN_Z_BILLBOARD_Y_TO_VELOCITY` 3; `DRAW_ORDER_INDEX` 0 and the
  default; `BLEND_MODE_PREMULT_ALPHA` 4; `DISTANCE_FADE_PIXEL_ALPHA` 1; `sorting_offset` 0.0;
  `fixed_fps` 30.
- Not run: TAA ghosting with other draw orders, and the preprocess GPU stall (docs claims).
- Sub-emitter cap (Numbers table): `link_sub_emitter` already implements both rules (per-event:
  parent amount x count; CONSTANT: parent amount x Hz x child lifetime); the CONSTANT one is
  derived, the per-event one is Godotneers 00:44:48.

## Not yet run (and why)

- **Trail sections refresh bug** (Octodemy iPCzOe-S9EQ 00:02:24: changing `sections` at runtime does
  not reach the renderer). Testing it needs a before and after capture of a runtime edit, which was
  not built in this pass. Workaround if seen: set `trail_enabled` false and then true, or reassign
  `draw_pass_1`.
- **Godotneers 4.2 bugs** (cZ5Ang_Ji8E): lit trail meshes dark on the lit side, TubeTrailMesh
  vanishing, SDF bake tree level. Not re-tested. The kit uses unshaded ribbons and box colliders
  only.
- **SDF collision:** baking is editor-only (docs). This needs a human or editor session to press
  Bake SDF.
- **GPUParticles2D:** the audit covers 2D (`_check_2d`), but no 2D effect was captured in this pass.
- **Real phone GPU:** the Mobile renderer ran on the Mac. Device numbers belong to
  scenario-godot-performance-export.
