# Blockout contract tables

Situational detail for the output contract in SKILL.md: names, dimensions, colors, format, lenses,
rigs, handheld budgets, scene recipes and recovery. `B` is `bx_blockout`.

## Names and collections

| Prefix                     | Role                                  | Prefix         | Role                                  |
| -------------------------- | ------------------------------------- | -------------- | ------------------------------------- |
| `ENV_`                     | set shell and masses                  | `CAM_`         | cameras, one per shot                 |
| `HERO_`                    | parts of a hero object (car, product) | `CRV_`         | camera rails                          |
| `FIG_<name>`               | figure root and its `_part` children  | `NULL_target_` | aim targets                           |
| `PRP_`                     | props                                 | `RIG_`         | dolly, gimbal, aim and vehicle roots  |
| `CRT_`                     | creatures                             | `WHL_`         | wheels                                |
| `REF_`                     | scale reference figure                | `TXT_`         | one text object per letter            |
| `LGT_key`, `LGT_rim`, etc. | lights named by purpose               | `ZZ_parked`    | hidden collection for parked defaults |

- Cameras carry the shot index and a slug: `CAM_01_establish`, `CAM_02_ots_blue`; a single-camera
  scene uses `CAM_main`.
- One root collection per build (`BLK_<scene>`) with role children (`ENV`, `FIGS`, `PROPS`, `RIG`,
  `LIGHTS`).
- A scene the video model must fill with invented content gets a parked `CAM_gap` aimed at empty
  space, so the playblast shows black for exactly that span, and the sheet says why.

## Dimensions

Typical real-world values; say in the plan which ones you assumed.

| Element                                 | Size                                                                                                    |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Standing adult, top of head             | 1.70 to 1.92 m                                                                                          |
| Seated adult, top of head               | about 1.35 m                                                                                            |
| Cyclist riding, top of head             | about 1.7 m; bicycle about 1.75 m long, wheel radius 0.34 m                                             |
| Door                                    | 0.9 to 1.0 x 2.1 m                                                                                      |
| Table top / chair seat / counter        | 0.72 to 0.75 m / 0.42 to 0.45 m / 0.9 m                                                                 |
| Room ceiling                            | 2.5 to 3.0 m domestic, 3 to 3.5 m commercial                                                            |
| Interior wall / exterior wall thickness | 0.10 to 0.15 m / 0.3 m                                                                                  |
| Car body                                | about 4.6 x 1.95 x 1.45 m; wheel radius 0.33 to 0.36 m at z = radius                                    |
| City bus                                | about 12 x 2.55 x 3.1 m                                                                                 |
| Tram or light rail (low floor)          | 2.3 to 2.65 m wide, 3.3 to 3.6 m tall without pantograph, 30 to 45 m long; standard track gauge 1.435 m |
| Traffic lane / sidewalk / curb height   | 3.0 to 3.5 m / 2 to 4 m / 0.12 to 0.15 m                                                                |
| Street light                            | 6 to 8 m urban                                                                                          |
| Warehouse                               | 34 x 20 m floor, 7 m walls                                                                              |

## Color

- Palette (`B.PALETTE`, linear RGB): red (0.80, 0.05, 0.05), blue (0.05, 0.18, 0.85), green (0.05,
  0.60, 0.12), yellow (0.90, 0.72, 0.04), purple (0.50, 0.07, 0.78), cyan (0.04, 0.75, 0.80). The
  hero takes the color the brief puts on them, red when it names none. Two heroes the brief puts in
  one color both keep it, since a substitute hue reads as another garment: tell them apart with
  `featured` signature features, and name each by its features in the legend. A brief color the
  palette lacks (black, white, gray, brown) cannot carry an identity against the gray set and dark
  world. Make that hero `featured`: the capsule takes the next free color, and the worn feature
  closest to the garment (`coat`, `hood`, `hat`, `cape`, `skirt`) takes the brief's color through
  `colors`. Name a garment for the capsule's color above that feature (a red hood and sweater over
  the black coat), as for a default red hero: a color named as a marker only came back as a bare
  capsule. The legend and the prompt name both garments. These colors are load-bearing: the prompt
  later says which reference image each one becomes.
- Set gray 0.32 to 0.55 (`B.NEUTRAL` 0.42), one light, world color about 0.035 to 0.055.
- `B.paint` shares one material per color (`MAT_cc0d0d`); a figure gets its own (`MAT_FIG_<name>`
  via `material_name`) so it can be recolored alone. For linked duplicates put the material on the
  mesh, which `B.box` does.
- When facing matters on a single block (a monolith, a statue base): red front face, black back,
  green sides and top.
- Grid floors, checkerboards and textured walls go only where the camera travels and depth must
  read; the sheet calls them "motion-tracking aid, replace, never inherit".
- Lookdev or restyle rig: all gray clay, one sun, no identity colors, by design; it tests
  silhouettes, not characters.
- The plugin's Blockout colors by category with muted values (wall 0.78, floor 0.62, vehicle a pale
  red 0.75, 0.40, 0.40). Keep its set elements, recolor anything that becomes a tracked character or
  vehicle.

## Format

| fps | 6 s    | 8 s    | 10 s   | 12 s   | 15 s   | 20 s   | 30 s   |
| --- | ------ | ------ | ------ | ------ | ------ | ------ | ------ |
| 24  | 1..144 | 1..192 | 1..240 | 1..288 | 1..360 | 1..480 | 1..720 |
| 30  | 1..180 | 1..240 | 1..300 | 1..360 | 1..450 | 1..600 | 1..900 |

Resolution: 16:9 1920x1080, 21:9 2520x1080, 9:16 1080x1920, always at 100 %. Prefer several short
shots to one long take when layout fidelity matters (see handoff.md, tested limits).

## Lenses

`B.lens_for_coverage(distance_m, vertical_coverage_m)`: focal = sensor height x distance / vertical
coverage, sensor 36 mm wide fitted to a 16:9 frame (20.25 mm high), clamped 14 to 85 mm. Coverage
for a shot size: full figure about 2.2 m, cowboy 1.4 m, medium (waist up) 1.0 m, close-up 0.4 m.

| Shot                              | Lens                     |
| --------------------------------- | ------------------------ |
| Orbit around a group              | 28 mm                    |
| Over-the-shoulder                 | 42 to 45 mm              |
| Interior, aerial                  | 24 to 30 mm              |
| Locked lateral dolly along a wall | 21 mm                    |
| Underwater route                  | 20 mm                    |
| Macro insert                      | 85 mm, `clip_start` 0.03 |

Lens is a property of the shot: a cut may change it by changing camera, a shot may ease it slowly,
nothing may step it in one frame.

## Camera rigs

**Rail** (`B.rail_camera`): `CRV_<shot>` Bezier rail, `RIG_dolly_<shot>` on Follow Path (fixed
position, no curve follow, `offset_factor` keyed 0 to 1 with `B.key_rail`), `RIG_aim_<shot>` child
with Track To on `NULL_target_<shot>` (-Z, up Y), the camera under the aim at zero local transform.
Reframe by animating the target. With `follow=<figure root>` the target rides the subject at
`target_offset`, so a tracking shot holds its subject while the rail sets the camera's path.

**Tracking a moving subject**: lay the rail along the subject's path at the planned height and side
distance, then key the dolly so the camera keeps its planned lead on the subject. Plan it as rows of
(frame, lead distance, coverage) and derive offsets from the rail length. For a constant lead on a
constant-speed subject, `B.key_rail` keys evenly spaced in frame and value hold a constant speed:
the auto-clamped ease only flattens the first and last key, which sit outside the shot. When the
subject outruns the frame, rebuild the rail from those rows and recompute the lens from coverage; do
not rotate the camera to catch up.

**Handheld tracking**: dolly (location noise) > gimbal (Track To the target) > camera (rotation
noise). `B.rail_camera` gives the chain; add the noise below.

**Straight push-in**: the camera parented to a dolly empty with a fixed local rotation and no Track
To; key only the dolly. Use it when "push in from the door" must stay perfectly straight.

**Multi-shot master**: key each camera's own location, and its rotation from a look-at
(`(target - cam).to_track_quat('-Z', 'Y')`). Cameras that ride a vehicle are parented to its root;
pass-by cameras stay world-locked.

**Plugin `camera_path`**: one `Scenario Shot Camera` through `Shot N` marker objects, aimed at a
static center; fits single orbits, push-ins, cranes and flyovers around a still set.

## Easing and motion

- Bezier keys, auto-clamped handles (`B.smooth_keys`): flat at the first and last key, no overshoot.
- Speed is key spacing on the dolly's `offset_factor`: an acceleration is widening gaps, a pause is
  two near-equal values.
- LINEAR only for per-frame baked travel: a vehicle's position as one monotone curve keyed every
  frame (creep, launch at an exact second and drift become speed changes on one curve), wheel spin =
  distance / radius on one rotation channel.
- Keys run past each cut frame (shot ends at 192, last key at 210), so nothing rests on the
  boundary.
- Figures: animate the root only. Beats are tables of (frame, location, facing, pitch); a dive is a
  lift then a pitch to about 85 degrees. A walk can stay a gliding root, since the video pass draws
  the gait; when the brief needs stride timing, rotate each leg about the hip with one shared period
  (about 28 frames at 24 fps), opposite phase per side.

## Handheld budgets

Starting values, measured afterwards with `B.audit_handheld` (which compares the camera with its
NOISE modifiers live and muted):

| Setup                     | Channel                | Amplitude          | Noise scale       |
| ------------------------- | ---------------------- | ------------------ | ----------------- |
| Camera on a rail with aim | camera location (sway) | 0.045 to 0.055 m   | 205 to 250 frames |
|                           | camera rotation (sway) | 0.015 to 0.018 rad | 235 to 280 frames |
|                           | tremor, both           | 0.005 m, 0.002 rad | 7 to 12 frames    |
|                           | target                 | slow drift         | long              |
| Dolly > gimbal > camera   | dolly location         | 0.035 to 0.045 m   | 13 to 19 frames   |
|                           | camera rotation        | 0.010 to 0.018 rad | 18 to 26 frames   |

```python
cam = bpy.data.objects["CAM_s1"]
cam.keyframe_insert("rotation_euler", frame=1)  # a modifier needs an F-curve to live on
for fc in B.fcurves(cam):
    if fc.data_path == "rotation_euler" and fc.array_index in (0, 2):
        noise = fc.modifiers.new("NOISE")
        noise.scale, noise.strength, noise.phase = 22.0, 0.03, 5.0 * fc.array_index
result["handheld"] = B.audit_handheld("CAM_s1")  # adjust strength until it lands in budget
```

Blend type changes the result (REPLACE centers the noise on the curve, ADD offsets it), so trust the
measurement, not the setting. `animation_data_clear()` deletes the modifiers with the keys.

## Vehicles

- Front marked in geometry: emissive or light-gray headlight blocks and a grille at the front, dark
  red blocks at the rear (`K.vehicle`'s `rear_rgb` default), so they never read as a red hero.
- Kit materials are shared per color and named after it. A kit call resets the materials of the
  colors it uses, so an edit in place reverts. Recolor through `rgb` or `rear_rgb`.
- Wheels: cylinders rotated so the spin axis is one local axis, centered at z = radius. `K.vehicle`
  builds them into the body mesh, which reads right at a distance; a close shot that reads rotation
  needs separate wheel objects with one keyed rotation channel.
- Bicycles: `K.vehicle(name, "bicycle", size=h / 1.75)` for a rider of height h. It builds two
  wheels at z = radius, a tube frame, a pale lamp in front and a dark red reflector behind, and
  spinning cranks as a child object.
- Riders: `K.pedal(fig, bike, (first, last))` seats a figure of any style on a bicycle.
  - It parents the root to the bike with the pelvis on the saddle and leans the torso 25 degrees.
  - A jointed figure or a mannequin also puts its hands on the bars and keys its legs on the cranks
    every frame (70 rpm by default).
  - A capsule only sits and leans. A featured rider's `arm_L` and `arm_R` hang: pose them onto the
    bars with `K.pose`.
  - A nonzero `overreach_m` in its result means the bike is too big for the rider: rebuild it with a
    smaller `size`.
  - Drive the bike with `K.drive`, never the rider. The rider counts with the bike in `K.movers`.
  - It clears the rider's earlier keys, a `K.walk_path` included. Key gestures with `K.pose` after
    it.
  - Pass the bike, not the rider, to `B.audit_ground`: a pedaling foot is off the ground.
- Interior shots: build the cabin (dashboard, steering wheel, a sphere-head driver) and give the
  cabin shell alpha (about 0.22, blended) so interior cameras see through it.

## Several scenes in one clip

- One origin, keyed `hide_viewport` and `hide_render` per object per scene; or
- sub-scenes tens of meters apart, so nothing from one strays into another's frame edge.

## Scene recipes

| Scene type             | Shell                                               | Proxies                                                 | Camera                                                                                              |
| ---------------------- | --------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| One-take interior      | six thick boxes, linked repeats every 4 to 8 m      | figure on a root path                                   | one rail planned as (frame, lead distance, coverage) rows                                           |
| Dialogue at a table    | floor disk, low round wall, one disk light          | seated color figures, heads still                       | rail + dolly + aim per shot, 28 mm orbit, 42 to 45 mm OTS, orbit phase chosen by an occlusion sweep |
| Product ad             | one origin, props hide-keyed per scene              | literal primitives, one object per letter               | one camera per shot, markers, 24 to 85 mm, `CAM_gap` for invented spans                             |
| Organic exterior       | terrain with visible relief, a volume box           | grouped clusters, creatures on path rigs, `REF_` figure | one 20 to 24 mm route, Follow Path + Track To                                                       |
| Small interior push-in | room plus a real doorway and hallway behind frame 1 | performers as connected volumes, cables as curves       | dolly with fixed rotation, no Track To                                                              |
| Warehouse action       | shell, doorway, crates and pillars as cover         | 9-part color figures, beats on roots                    | dolly > gimbal > camera, handheld, aim rides the hero                                               |
| Vehicle commercial     | road ribbon, guardrails, terrain rows               | marked-front car on a root, wheels, driver dummy        | many marker-bound cameras, riding vs world-locked, one travel curve                                 |
| Valley overlook        | terrain relief, lake basin, ridges                  | tree clusters with clearings                            | elevated and close enough that the subject clears the trees: render, check, reposition              |

## Recovery and provenance

- Probe first, read-only, and trace every object you later touch to one of your stages; a scene that
  already looks finished is someone else's work until proven otherwise.
- `B.guard` in every call: queued calls run in whatever file and scene are open when they reach
  Blender.
- Keep payloads short; one stage piece per call.
- Reset mid-build: from the last `B.stage_backup` copy, append the whole scene (`bpy.ops.wm.append`
  on `<backup>.blend/Scene/<name>`) or the root collection (`bpy.data.libraries.load`), then set the
  frame range, fps, resolution, engine, scene camera and world again, since a collection carries
  none of them.
- Headless helpers run on a backup copy with `--factory-startup`, never on the open file.
