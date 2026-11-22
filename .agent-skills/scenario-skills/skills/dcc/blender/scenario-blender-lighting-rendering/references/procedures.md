# Procedures (tested on Blender 5.2.1 LTS)

Every procedure below ran headless with
`blender --background --factory-startup --python-exit-code 1 --python <test>`. Tests live in
`tests/code/blender-lighting-rendering/` (fixture: `_common.py`, a stylized character in a 4 x 3.5 m
workshop with 0.2 m walls, a window and a hanging lamp). The module is
`<skills>/scenario-blender-lighting-rendering/scripts/bx_light.py`; import it with:

```python
import sys; sys.path.append("<skills>/scenario-blender-lighting-rendering/scripts"); import bx_light as BL
```

It works in a live GUI session too (object mode). Tests: `test_01` to `test_13` (172 checks, all
pass on 5.2.1). Raw bpy is given where it is short, so a session without the module can still do it.

---

## P1. Light units: set energies from a target level, not from watts

Verified on 5.2.1: `test_01_units_placement.py`.

A light's _level_ = the linear value a white Lambertian card facing the light at the target reaches.
Measured constants (EEVEE and Cycles agree to 0.1 % with custom distance on):

| Light                                         | Level at distance d                | `BL.energy_for`                 |
| --------------------------------------------- | ---------------------------------- | ------------------------------- |
| Point, spot (cone does not concentrate power) | P / (4 pi^2 d^2) = 0.02533 P / d^2 | `energy_for("POINT", level, d)` |
| Area (small, `normalize` on, any shape)       | P / (pi^2 d^2) = 0.1013 P / d^2    | `energy_for("AREA", level, d)`  |
| Sun                                           | S / pi = 0.3183 S                  | `energy_for("SUN", level)`      |

- A source as large as its distance delivers 75 % of the nominal level (1 m area at 1 m: 0.752 in
  both engines); a point radius of d/2 about 80 %.
- Inverse square verified: same power at double distance = 0.2501 of the level (Andrew Price
  [00:13:27]).
- **EEVEE custom distance (Gleb [00:01:26]) is not cosmetic:** with the automatic distance a 5 W
  area light lands 8 % low (0.459 vs 0.4995); with
  `use_custom_distance = True, cutoff_distance = 100` EEVEE matches Cycles.
  `BL.eevee_softness(light, dist)` sets it on every rig light.

```python
L = BL.new_light("Key", "AREA")                 # get-or-create in collection BX_Lights
d = BL.place(L, head, 40, 35, 2.2, cam)         # returns the distance actually used
L.data.energy = BL.energy_for("AREA", 1.0, d)   # white card at the head would read 1.0
BL.eevee_softness(L, d)                          # custom distance + jitter if >= 3 deg apparent size
```

Display mapping of linear values (emission ramp through each view, `test_01`):

| linear              | 0.02  | 0.05  | 0.18  | 0.5   | 1.0   | 2.0   | 4.0   | 16    |
| ------------------- | ----- | ----- | ----- | ----- | ----- | ----- | ----- | ----- |
| Standard            | 0.153 | 0.247 | 0.463 | 0.737 | 1.0   | 1.0   | 1.0   | 1.0   |
| AgX                 | 0.125 | 0.227 | 0.463 | 0.667 | 0.773 | 0.851 | 0.910 | 1.0   |
| AgX - High Contrast | 0.063 | 0.165 | 0.463 | 0.733 | 0.851 | 0.933 | 0.988 | 1.0   |
| AgX - Punchy        | 0.039 | 0.137 | 0.345 | 0.565 | 0.694 | 0.796 | 0.871 | 0.976 |
| Khronos PBR Neutral | 0.031 | 0.133 | 0.412 | 0.710 | 0.937 | 0.980 | 0.992 | 1.0   |
| ACES 2.0            | 0.039 | 0.133 | 0.349 | 0.565 | 0.706 | 0.820 | 0.898 | 0.976 |
| Filmic              | 0.161 | 0.275 | 0.502 | 0.694 | 0.808 | 0.894 | 0.949 | 1.0   |

So under AgX a key level of 1.0 on albedo 0.8 (linear 0.8) displays 0.74; and **clipping hides in
the PNG** (linear 4 shows 0.91): read the EXR maximum.

## P2. Placing lights and the camera relative to subject and camera

Verified: `test_01_units_placement.py`, `test_02_rigs.py`.

Convention: azimuth 0 = light on the camera side (frontal), +90 = screen right of the subject, 180 =
behind it; elevation above the target's horizontal plane. World (sun) azimuth is compass style, 0 =
+Y, 90 = +X, identical to the Sky texture's `sun_rotation` (measured with an equirect probe).

```python
BL.place(light, target, azimuth, elevation, distance, cam, avoid=subject_objs)  # avoid: stay out of walls
BL.angles(light, target, cam)        # {'azimuth','elevation','distance','off_camera_axis'}
BL.free_distance(target, direction, 5.0, ignore=subject_objs)   # ray cast, skips the subject
BL.sun_azimuth(sun_obj)              # world azimuth/elevation toward the sun (continuity checks)
BL.screen_xy(head, cam)              # frame position (x right, y up, 0..1)
BL.aim_camera_at_frame_point(head, 1/3, 0.62, cam)   # turn the camera so the head sits on a third
```

- Round trip place/angles within 0.2 deg over 32 az/el combinations.
- Trap found while testing: `matrix_world` is stale right after setting location or rotation; every
  `bx_light` function that reads matrices calls `view_layer.update()` first. In your own code do the
  same.
- Lights placed behind a subject in a small room end up inside walls (the first rim test contributed
  0.0); `avoid=` pulls them in to 85 % of the free distance.

## P3. Three-point rig (and when to break it)

Verified: `test_02_rigs.py`.

```python
rig = BL.three_point(subject_objs, target=head, key_az=40, key_el=35, fill_ratio=0.25,
                     key_temp=None, fill_color=None, rim_side="key", link_rim=False)
print(BL.light_report(target=head, face=head))   # flags: frontal key, key below the eye line, key smaller than the head
```

Defaults: key 40 deg off the camera axis, 35 deg up, 3 subject radii away, source as big as the
subject radius (form); fill on the other side, 10 deg up, twice the key size, 0.25 of the key level
[added]; rim behind on the key side (Andy [00:53:36]). All lights get custom distance and, when
soft, per-light jitter. Idempotent. Break it when: the scene has a motivation (use P4 or P5); a
product needs one lamp for form plus a dim shadow-side lamp (Andrew [00:04:45]); a portrait works
with one light (Gleb [00:00:56]).

- **Fill level is not a ratio.** `fill_ratio=0.25` is only a starting value [added]: Andrew calls
  the textbook "fill at half the key" "bogus" [ENnEYoUpFfU 00:04:45]; lower the shadow-side lamp
  until that side still reads as shadow but shows its detail, and measure the result on the subject
  (`light_contributions`, clay `internal_ratio`), not lamp values (distance and size change
  irradiance).
- **Face keys are large sources.** Andrew: large sources for faces so form reads and pores do not;
  small ones for grit, aggression or a sun/streetlamp cue [00:19:17] [00:22:34]. The rig's key is as
  big as the subject radius (0.86 m on the fixture); `light_report(face=head)` flags a key smaller
  than the head (a 4 cm point key on a 0.62 m head is flagged, test_12). Ignore the flag for a toon
  key.
- **Light linking lives on the light OBJECT**: `light_obj.light_linking.receiver_collection = coll`
  (and `.blocker_collection`); `bpy.types.Light` has no `light_linking` (verified), so
  `light.data.light_linking` raises AttributeError. `BL.link_light` accepts a Light datablock with
  one user and resolves its object (`BL.light_object`), and refuses a shared one (test_12).

## P4. Motivated interior (window + practical), dusk or night

Verified: `test_02_rigs.py`, `test_08_s7_hero.py`.

```python
rig = BL.motivated_interior(subject_objs, window=(window_center, (w, h)), practical=bulb_location,
                            target=head, key="practical", key_level=1.2, window_level=0.35,
                            practical_cone=110, cheat_key=True, link_key=True, link_rim=True)
```

What it does, and why:

- Window: rectangle area light in the opening, sized to it, facing in, colored by the sky (Gleb:
  match colors to the environment).
- Practical: downward spot (the shade) at 2700 K (Andrew: point first, spot to carve light off what
  does not matter).
- **Cheated key** when the key source is behind the subject (|azimuth| > 100): an area light in
  front on the source's side, same color, light-linked to the character (Andy [00:21:34]: in backlit
  scenes add a faked key in the face). The practical keeps half the key level for the set.
- Floor bounce tinted by the key; rim from the source that is most behind; a second rim when that
  source is within 15 deg of straight behind (both edges are backlit).
- Every light is kept inside the room (`avoid`). Measured effect on the fixture (EEVEE preview,
  `test_04` variant B vs `test_08`): with no cheated key, no linking, a bare point practical and no
  probe, subject vs surround = -0.011 (merges, silhouette merge 41 %); with the defaults plus the
  probe, +0.123, key share on the character 65 %, key contribution on the background median 0.006.

## P5. Exterior and world tricks

Verified: `test_01`, `test_02`, `test_07_world.py`.

```python
rig = BL.outdoor_sun_sky(subject, target=head, sun_azimuth=210, sun_elevation=35,
                         azimuth_space="world", sun_level=2.0, sun_angle=2.0, sky_strength=0.25)
# Sky texture MULTIPLE_SCATTERING, sun disc off, synced to the lamp; world.sun_threshold = 0
caster = BL.shadow_caster(rig["sun"], subject, target=head)   # Andy: dark plane, invisible to camera/glossy
fs = BL.fake_sun(subject, rig["sun"], target=head)            # Lino: 1-3 deg spot far away for the hero
BL.split_world(camera_color=(0.02, 0.02, 0.03))               # camera sees a dark backdrop, lighting unchanged
BL.world_gradient(top=(0.25, 0.4, 0.9), bottom=(0.35, 0.25, 0.12), strength=0.5)  # Andy's lighting world
eye = BL.eye_light(eye_objs, cam, level=3.0)                  # diffuse 0, linked to the eyes, upper half
hz = BL.haze(room_objs, density=0.05)                          # bounds display, excluded from probe bakes
```

Measured: shadow caster took the sun on the subject from 0.018 to 0.0 and does not cut the Workbench
mask; split world backdrop x0.025 with the subject kept at 0.99 in EEVEE and Cycles (Gleb said "at
least partially" for EEVEE; fully in 5.2.1); gradient world blue/red 1.9 on top, 0.61 underneath;
the light-linked eye light: 1.50 on the eyes, 0.0001 elsewhere (EEVEE), 1.57 / 0.0003 (Cycles).

Raw split world:

```python
nt = scene.world.node_tree; bg = nt.nodes["Background"]; out = nt.nodes["World Output"]
cam_bg = nt.nodes.new("ShaderNodeBackground"); lp = nt.nodes.new("ShaderNodeLightPath")
mix = nt.nodes.new("ShaderNodeMixShader")
nt.links.new(mix.inputs["Fac"], lp.outputs["Is Camera Ray"])
nt.links.new(mix.inputs[1], bg.outputs["Background"]); nt.links.new(mix.inputs[2], cam_bg.outputs["Background"])
nt.links.new(out.inputs["Surface"], mix.outputs["Shader"])
```

## P6. Render presets

Verified: `test_03_presets_color.py`.

```python
BL.preset_eevee(quality="preview"|"final", interior=True, animation=False)
BL.preset_cycles(quality="preview"|"final", budget="film"|"default", glass=False)   # picks Metal/OptiX/CUDA/HIP
```

EEVEE raw: `sc.render.engine = 'BLENDER_EEVEE'`; `sc.eevee.use_raytracing = True` (factory False);
`ro = sc.eevee.ray_tracing_options; ro.resolution_scale = '1'` (final) / `'2'`;
`sc.eevee.fast_gi_step_count = 16`; `sc.eevee.fast_gi_resolution = '2'`; interiors
`shadow_step_count = 12`; finals `shadow_ray_count = 2`; stills `ro.denoise_temporal = False`;
samples 32 preview / 128 final [added]. Cycles film raw (Andy):
`max_bounces = diffuse_bounces = glossy_bounces = transmission_bounces = 3`,
`caustics_reflective = caustics_refractive = False`, `sample_clamp_indirect = 0`,
`use_fast_gi = True`, `fast_gi_method = 'REPLACE'`, `ao_bounces_render = 1`, adaptive sampling,
OIDN; samples 128 preview / 1024 final, threshold 0.03 / 0.01 [added thresholds]. Timings on the
fixture (960x540, M5 Max): EEVEE preview 0.35 s, final 1.9 s; Cycles preview (Metal, first run
includes kernel compile) 17 s.

## P7. Color management

Verified: `test_03_presets_color.py`.

```python
BL.color_setup(view="AgX", look="High Contrast", exposure=0.3)  # -> 'AgX - High Contrast'
BL.working_space("Linear Rec.709")          # once, at project start; operator converts colors
print(BL.color_audit())                     # Non-Color data maps, Standard view, Follow Scene, View as Render
```

- `bpy.data.colorspace.working_space` is read-only;
  `bpy.ops.wm.set_working_color_space(working_space=..., convert_colors=True)` works headless; Base
  Color (0.10, 0.26, 0.26) became (0.16, 0.249, 0.257) in Rec.2020 and came back exactly.
- `'Linear'` and `'Raw'` are rejected as image color spaces in 5.2 (use `'Linear Rec.709'`,
  `'Non-Color'`).
- AgX looks: None, Punchy, Grayscale, Very High / High / Medium High / Base / Medium Low / Low /
  Very Low Contrast (all prefixed `'AgX - '`). ACES 1.3/2.0 have no looks.
- **Exposure belongs in the view transform, not in scaled lights** (Jacob Holiday [qt1GidFwVt0
  00:16:36], digest): `sc.view_settings.exposure = 1.0`. Measured (test_12, Cycles, fixed seed):
  exposure +1 gives exactly the frame of every emitter x2 (lamps, world, emissive bulb: PNG diff
  0.0); doubling only the lamps does not (diff 0.0053: world and bulb forgotten, ratios changed).
  One reversible knob that keeps every ratio and plausible lamp values.
- **View transform by job** (Jacob [00:45:24]; Gleb [6hPZ0ckL5I0 00:21:42]): AgX for scenes;
  `'Khronos PBR Neutral'` when a product or brand color must display as authored; ACES 2.0 or AgX
  High Contrast for portraits (Gleb: Khronos oversaturates skin). Measured in a white furnace
  (Principled plane, base color = the brand sRGB, test_12), max channel error in 8-bit steps:

| Brand color (sRGB)                   | Standard | AgX  | Khronos PBR Neutral               |
| ------------------------------------ | -------- | ---- | --------------------------------- |
| red (200, 30, 45)                    | 33.1     | 41.8 | 3.8                               |
| blue (30, 70, 160)                   | 33.1     | 26.8 | 3.8                               |
| teal (0, 120, 120), a zero channel   | 54.4     | 54.8 | 23.7 (toe lifts the zero channel) |
| orange (250, 120, 0), above the knee | 54.3     | 77.0 | 37.3 (compressed)                 |

Khronos removes the dielectric specular lift that makes Standard look washed out; colors whose
brightest channel exceeds about 0.76 linear (Khronos spec knee) are compressed, and a zero channel
is lifted by its toe.

## P8. Subject masks

Verified: `test_02`, `test_04_analysis.py`.

```python
m = BL.mask_workbench(subject_objs)                 # any engine, visible silhouette, occluders count
r = BL.render("/abs/out/shot")                      # shot.png + shot.exr (multilayer, all passes)
m = BL.mask_cryptomatte(r["exr"], [o.name for o in subject_objs])   # needs use_pass_cryptomatte_object
```

- Workbench vs Cryptomatte IoU 0.987 in EEVEE and in Cycles. EEVEE 5.2.1 writes Cryptomatte but **no
  Object Index pass**; use Cryptomatte for ID masks.
- OIIO 3.1 ships with Blender. Trap:
  `ImageInput.read_image(subimage, miplevel, chbegin, chend, format)`: the first argument is the
  subimage; passing 0 reads part 0 whatever `seek_subimage` chose.
- With compositing on, the main multilayer EXR holds `ViewLayer.*` passes plus `Composite.Combined`;
  `BL.load_rgba` picks the composite, `part="ViewLayer.Combined"` the raw render.

## P9. Render analysis and verdict

Verified: `test_04_analysis.py` (synthetic images with known answers plus four calibrated variants).

```python
rep = BL.analyse(r["png"], m, exr=r["exr"])   # dict, see docstring
print(BL.verdict(rep))                        # list of problems; [] = pass
```

Key fields: `subject.minus_ring` (subject median minus the median of a ring 4 % of the diagonal
around it), `subject.edge_merge_pct` (outline pixels where inside/outside differ by < 0.05),
`subject.internal_ratio` (p90/p10 of subject values: form), `subject.band` vs `ring_band`,
`focus.peak_on_subject`/`concentration` (local-contrast peak), `squint` (16x9 weights),
`vignette_ratio`, `value_range` (p2..p98), `clip_pct`/`crush_pct`, `linear_max`/`over1_pct`,
`hue.clusters`, `thirds.distance`.

Calibration (EEVEE preview, fixture):

| Variant                                                | minus_ring       | edge merge % | internal ratio (clay) | verdict                      |
| ------------------------------------------------------ | ---------------- | ------------ | --------------------- | ---------------------------- |
| A flat: frontal key, bright ambient                    | +0.141           | 17.7         | 2.07 (1.34)           | flat light                   |
| B motivated, no cheated key, no linking, world leaking | -0.011           | 40.8         |                       | separation, silhouette merge |
| C designed (P4 + probe)                                | +0.116 to +0.123 | 31 to 32     | 11.7 (6.05)           | pass                         |
| D = C with light walls                                 | +0.049           | 30.8         |                       | separation, same band        |

Thresholds in `BL.THRESH` [added, set from this table]: minus_ring 0.10, edge merge 35 %, internal
ratio 2.5 (use a clay render for a pure lighting measure), value range 0.30, clip 0.5 %, crush 25 %,
vignette ratio 1.0. Separation alone does not catch flat light (A separates): that is what the form
ratio is for.

## P10. Looking like a lighter: value study, solo lights, clay, contact sheets

Verified: `test_04`, `test_08`.

```python
BL.value_study(r["png"], "/abs/out/values.png", mask=m)   # [desaturated | 4 value groups | squint]
res = BL.light_contributions(rig.values(), m, "/abs/out/solo")  # each light alone + world alone
BL.clay(True); ...; BL.clay(False)                         # view_layer.material_override gray
BL.contact_sheet(pngs, "/abs/out/sheet.png", cols=4)
BL.sheet_stats(pngs)    # outlier = > 0.5 stop from the median (or > 2 sigma with 8+ shots)
```

`light_contributions` returns per light the mean/median linear luminance on the subject, the
background median and its share of the total. A z-score cannot exceed (n-1)/sqrt(n), so small sets
use the median rule; on 7 coverage shots plus one +2 EV shot only the latter was flagged.

## P11. EEVEE specifics, measured

Verified: `test_05_eevee_specifics.py`.

1. **World leak (sealed-room test) and Andrew's wall rule.** Room with no window, world strength 2,
   no lights, 0.2 m walls. Andrew puts the outermost probe points exactly at the inner wall
   [-gW6vk_OuNQ 00:38:22] ("the last point needs to be the exact position of the wall"). Where 5.2.1
   puts the points: N samples per axis at local (i + 1) / (N + 1) x 2 - 1 (shader
   `eevee_lightprobe_volume_grid_sample_position`, read from the GLSL embedded in the 5.2.1 binary),
   i.e. one spacing INSIDE each box face, never on it. Interior mean luma against where the outer
   samples sit (`test_13`, `test_05`):

| Outer samples                                          | Leak           | Note                                                                  |
| ------------------------------------------------------ | -------------- | --------------------------------------------------------------------- |
| no probe                                               | 0.260          | Cycles: 0.0000                                                        |
| 0.44 m inside the walls (box stops at the inner faces) | 0.223          | a box drawn "to the walls"                                            |
| 0.2 to 0.25 m inside                                   | 0.054 to 0.066 |                                                                       |
| at the inner wall faces (Andrew)                       | 0.0022         | default of `volume_probe_for_room`                                    |
| half the wall deep (0.1 m into 0.2 m walls)            | 0.0007         | lowest measured                                                       |
| 0.1 m past the outer wall face                         | 0.0091         | leaks again (Andrew [00:41:10]: points must not escape through walls) |

History of this finding: the skill's first version measured only box sizes, assumed the points sat
on the box faces, and concluded that Andrew's rule was not reproduced and that the box must "enclose
the walls". With the real sample positions the same numbers agree with Andrew: its "wall + half a
cell" box had put the outer samples within 1.3 cm of the inner walls. The default now sizes the box
from the points:

```python
pb = BL.volume_probe_for_room(room_inner_lo, room_inner_hi, cell=0.5, wall=0.2)   # inset=0: samples on the inner walls
print(BL.probe_report(pb, room_inner_lo, room_inner_hi)["flags"])                # [] ; flags samples > 0.1 m inside or past the wall
BL.bake_probes()   # bpy.ops.object.lightprobe_cache_bake(subset='ALL'); synchronous headless
```

Raw sizing: `N = round(2 * inner_half / cell) + 1`, `half = inner_half * (N + 1) / (N - 1)` per
axis, `probe.scale = half`. Keep walls thick and `escape_bias` small; re-bake after material
changes; seal the windows to test. 2. **Per-light jitter** on a soft key: head 5th-percentile luma
0.0060 without, 0.0044 with (contact shadows deepen). `scene.eevee.use_shadow_jitter_viewport` is
viewport only. 3. **Fast GI steps** 8 vs 16: frame mean 0.0398 vs 0.0400 on 5.2.1 (Andrew's "more
steps, brighter" is marginal after the 5.2 overhaul; keep 16, it costs little). 4. **HDRI sun
threshold applies after strength** (Andrew [00:51:15]): synthetic HDRI with a 2000 sun: at strength
1 threshold 10 vs 0 changes the image (2.66 to 4.19 mean); at strength 0.004 (sun 8 < 10) the two
are identical. The extracted sun's cast shadow did not show in this top-down setup (not
verified). 5. Factory facts: `use_raytracing` False; `gi_cubemap_resolution` '512'; Cycles
`sample_clamp_indirect` 10, 12 bounces, caustics on.

## P12. Compositor finish (5.x node group)

Verified: `test_06_compositor.py`.

```python
nodes = BL.comp_finish(bloom=0.25, threshold=1.0, vignette=0.3, contrast=0.05, color_boost=0.05)
tree, rl, out = BL.comp_tree()          # scene.compositing_node_group, Group Output
fac = BL.matte(tree, ["EyeL", "EyeR"])  # Cryptomatte by name -> Factor socket
px = BL.relative_px(tree, rl.outputs["Image"], 0.01)   # pixel-unit input as 1 % of width
```

Raw chain:
`tree = bpy.data.node_groups.new("Comp", "CompositorNodeTree"); scene.compositing_node_group = tree`;
`CompositorNodeRLayers` > `CompositorNodeGlare` (`inputs["Type"].default_value = "Bloom"`, display
names) > `CompositorNodeGroup` with `node_tree` = the appended `Vignette` asset
(`<DATAFILES>/assets/nodes/compositing_nodes_essentials.blend`) > `Tune Image` asset >
`NodeGroupOutput` (after
`tree.interface.new_socket(name="Image", in_out="OUTPUT", socket_type="NodeSocketColor")`).
Measured: vignette ratio 0.723 to 0.544; ring around the bulb 0.115 to 0.222 (bloom); Cryptomatte
grade +1 stop = x1.98 inside, x1.00 outside; Kuwahara driven by Relative To Pixel differs less
between 50 % and 25 % renders (0.0072) than a fixed 10 px size (0.0096).

## P13. Passes, back to beauty, view layers, EXR

Verified: `test_06_compositor.py`, `test_10_view_layers.py`.

```python
BL.enable_beauty_passes()                    # diffuse/glossy/transmission direct+indirect+color, emit, env
tree, rl, out = BL.comp_tree()
rebuilt = BL.back_to_beauty(tree, rl)        # mean abs diff to Image 7.6e-7 (Cycles, no denoise)
BL.file_output(tree, "//exr/", {"rebuilt": rebuilt, "image": rl.outputs["Image"]}, depth="32")
```

View layers (Robin Ruud): `bpy.ops.scene.view_layer_add(type='COPY')`; per layer
`vl.layer_collection.children["FG"].indirect_only = True` (casts light/shadow onto this layer) or
`.holdout = True` (in front of and behind); work layer `vl.use = False`; comp
`CompositorNodeRLayers.layer = "BGL"` + `CompositorNodeAlphaOver` (inputs Background, Foreground).
Re-assembly vs one-layer render: 0.0004 mean abs diff; excluding instead of indirect-only: 0.016
(the shadow is lost). One layer: `bpy.ops.render.render(layer="BGL", write_still=True)`. Output:
`ims.media_type = 'MULTI_LAYER_IMAGE'; ims.color_depth = '16'; ims.exr_codec = 'DWAA'` for comp
masters; finals PNG with `color_management = 'FOLLOW_SCENE'`.

## P14. S7 end to end (stylized character, workshop at dusk)

Verified: `test_08_s7_hero.py` (outputs in
`archive/tests/lighting_skill/skill_out/test_08_s7_hero/`).

1. Composition first: nose vs head screen x gives the facing;
   `aim_camera_at_frame_point(head, 1/3 or 2/3, 0.62)` gives look room. Result (0.332, 0.62).
2. Dusk world (0.03, 0.05, 0.13), volume probe with its outer samples on the inner walls.
3. `motivated_interior` + `eye_light`; `light_report(key="BX_Key")` clean.
4. EEVEE preview, AgX Medium High Contrast, bake, render, Cryptomatte mask, `analyse`/`verdict`
   clean first time; key share 63 % (65 % with the first probe sizing), world 3.5 %.
5. Final EEVEE (1.5 s) + `comp_finish`: verdict clean, thirds distance 0.087, clip 0.02 %, crush 6.4
   %, linear max 19.5 (the bulb).
6. Cycles reference (film preset): EEVEE/Cycles median on the character 0.94, background 1.54 (EEVEE
   lifts the set; judge the set in Cycles if it matters).

## P15. Stylized / NPR

Verified: `test_09_npr.py`.

```python
tm = BL.toon_material("toon_skin", (0.8, 0.52, 0.38), band_color=(0.9, 0.25, 0.1))  # EEVEE only
BL.register_aovs()                        # adds 'toon_mask' (VALUE) to every view layer
BL.outline_hull(obj, thickness=0.015)     # Solidify flipped + culled dark material, shadow-transparent
BL.freestyle(thickness=2.0)               # or Freestyle lines
light.data.shadow_filter_radius = 8.0; light.data.shadow_maximum_resolution = 0.2   # soft "suggestive" shadows
```

- The toon factor comes from the ramp's **Alpha** (0/1): a Color-to-float link read 0.88 for white
  in this setup, leaking shadow color into lit areas [observed].
- Toon terminators need a **small, unjittered key**: a 0.75 m jittered area key dithered the
  terminator (AOV max 0.88); a 5 cm key gave a binary mask (94 % of pixels at 0 or 1 at 960 px).
- Measured: toon head 82 % of pixels in two values vs 13 % for the smooth Principled head;
  terminator band present; AOV missing before `register_aovs` (renders nothing, silently); hull
  darkened bright-background ring pixels 0.309 to 0.165; soft settings doubled the in-between share
  of the toon mask (0.056 to 0.128).
- The hull shell encloses the mesh and **shadows it** unless the outline material is transparent to
  shadow rays (Light Path Is Shadow Ray + `use_transparent_shadow`), which `outline_hull` does.
- Other options (not tested here): Grease Pencil Line Art
  `bpy.ops.object.grease_pencil_add(type='LINEART_SCENE')` (verified to exist by the distiller);
  toon normals by Data Transfer from a proxy (see `notes/lighting/M4v_hfGF4EM...`); Kuwahara
  painterly comp (P12).

## P16. Light groups: rebalance key, fill, rim, window without re-rendering (Cycles)

Verified: `test_11_light_groups.py`.

Wyatt plans the final image in comp and splits anything he may grade independently into its own
light group [M4v_hfGF4EM 00:07:57]; studios split light so late changes need no 3D re-render (Robin
[vtdczoXVyvQ 00:32:55]). **Cycles only in 5.2.1**: the EEVEE Render Layers node exposes no
`Combined_<group>` outputs (verified), so in EEVEE separate with light linking and view layers.

```python
rep = BL.light_groups({"key": [rig["key"]], "window": [rig["window"]], "rim": [rig[k] for k in ("rim", "rim2") if k in rig],
                       "practical": [rig["practical"]]}, world="window")      # leftovers (bounce, emissive bulb) -> "rest"
r = BL.render("/abs/out/base")                                               # multilayer EXR with Combined_<group>
print(BL.lightgroup_check(r["exr"], mask=mask))                               # rel_error ~0: groups add up; share per group
lin = BL.rebalance(r["exr"], {"key": 1.6, "window": 0.5, "rim": 2.0})         # numpy, no render: iterate with analyze()
mix = BL.lightgroup_mix({"key": 1.6, "window": 0.5, "rim": 2.0}, exr=r["exr"])  # comp-only scene BX_Regrade
BL.render("/abs/out/regrade", scene=mix["scene"])                             # re-grade from the EXR
BL.set_gain(mix, "key", (1.2, 1.1, 1.0))                                      # RGB gain = recolor a light (Pau)
mix2 = BL.lightgroup_mix({"key": 1.6, "window": 0.5})                        # live comp on the Render Layers
BL.comp_finish(bloom=0.0, vignette=0.3, source=mix2["socket"])                # finish continues the light-mix tree
```

Raw: `vl.lightgroups.add(name="key")`; `light_obj.lightgroup = "key"` (an Object property, like
`light_linking`; Light datablocks have neither); `world.lightgroup = "window"`; emissive meshes need
`obj.lightgroup` too; the Render Layers node (and the EXR, part `ViewLayer.Combined_key`) gets one
output per group; multiply each by a gain (`ShaderNodeMix` MULTIPLY, color sockets 6/7) and add.
Renaming a view-layer group renames the objects' assignments. Measured on the workshop (Cycles, 64
samples, denoise off because light-group passes are not denoised): groups sum to the beauty with rel
error 0.0; frame shares key 0.28, window 0.38, rim 0.04, practical 0.08, rest 0.23, and on the
character (mask) key 0.77, window 0.12 (the linked key does its job); the numpy rebalance with key
1.6, window 0.5, rim 2 matches a real re-render with the lights (and world) scaled by the same gains
within 2.2 % (noise; the unbalanced frame differs by 35 %); the comp-only regrade equals the numpy
result (max diff 2e-6; also with an RGB gain) and took 0.2 to 0.3 s against 0.7 to 2.8 s for this
tiny 240x135 render, a cost that does not grow with samples or scene complexity.

## P17. Exposure, product color, light-linking location, face key size

Verified: `test_12_exposure_color_keys.py`. The numbers are in P3 (face key, fill level, light
linking) and P7 (exposure, Khronos PBR Neutral vs AgX).

```python
BL.color_setup(view="AgX", look="Medium High Contrast", exposure=1.0)   # brightness here, never by scaling lamps
BL.color_setup(view="Khronos PBR Neutral")                               # product or brand color shots
BL.link_light(key_obj, character_collection)                              # OBJECT; a single-user Light datablock is resolved
print(BL.light_report(target=head, face=head)["flags"])                  # "small source for a face" when key < head
```
