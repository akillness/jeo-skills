# Tested procedures: scenario-blender-rigging

Every block ran on Blender 5.2.1 LTS with `blender -b --factory-startup` (and works in a live
session). Tests live in `tests/code/blender-rigging/`; `run_all.sh` runs the whole suite (about 2.5
minutes, 16 runs, all passing on 2026-09-24). Outputs and renders land in
`tests/code/blender-rigging/out/`.

Import pattern:

```python
import sys
sys.path.append("<skills>/scenario-blender-rigging/scripts"); sys.path.append("<skills>/scenario-blender-expert/scripts")
import bx_rig as R
```

The raw bpy behind each helper is in `scripts/bx_rig.py` (read the function when adapting it); the
essential lines are repeated here.

---

## P1. Model check and fix

```python
rep = R.model_check([body, shirt, pants, eyes, hair])            # problems / warnings
R.model_check([body, shirt, pants, eyes, hair], fix=True)         # unparent, apply, floor, center
```

Core: `o.data.transform(o.matrix_world, shape_keys=True); o.matrix_world = Matrix.Identity(4)` then
one translation (floor to Z=0, X center, mid-foot Y=0) for the whole set. `shape_keys=True` matters:
without it a mesh with shape keys (Snow's eyes) keeps its old position in the evaluated result.
Mirror modifiers mirror about their `mirror_object` or the object origin: keep the mirror object
(Snow's shoes and eyes use an empty called Center) or apply the Mirror first. Verified on 5.2.1:
`test_snow.py` (Snow: 1.45 m, floor 0.366, 3 objects with unapplied transforms, 7 parented to the
body; clean after fix).

## P2. Landmarks from the mesh (volume snapping substitute)

```python
lm = R.landmarks(body, eyes=eyes, overrides={"knee": (0.1, -0.01, 0.5)})
lm["pose"], lm["arm_angle"], lm["notes"]
S = R.Sections([body]); loops = S.cut(point, normal)   # loops: center, pts, radius, lo, hi
```

Method: horizontal cuts until one loop spans x=0 (crotch); hip = 13% of crotch height above it;
ankle = first cut where the leg section turns round (y extent < 1.3 x extent); knee halfway, kept on
the hip-ankle line from the front; neck = narrowest central section between head and shoulders, head
pivot 20% of the head height above it; spine joints at the front/back midpoint at Rigify's height
fractions (0.226, 0.437, 0.703); arm traced from 65% of the arm span inward with x-planes until the
loop size jumps x1.5 (armpit), then cuts normal to the arm axis: wrist = narrowest section at 60 to
90% of the arm; elbow at 53%; shoulder joint 0.6 arm radii inside the armpit (deep, CGDive); nose
tip = most forward face point, chin = lowest point of the front profile still forward of halfway to
the neck front; eyes = mean of each eye island. Lessons from testing: tracing inward from the
fingertip gets lost between the fingers; the narrowest horizontal section is not always the neck on
stylized heads (use the neck base, not the neck minimum, for the face profile). Verified:
`test_landmarks.py -- T|A` (6/6 each), `test_snow.py` (T-pose, 2.6 deg arm angle).

## P3. Rigify metarig: add, fit, check, face, generate

```python
meta = R.add_metarig("basic")          # "human" for fingers + face; wolf/horse/cat/bird/shark/basic_quadruped
R.fit_metarig(meta, lm)                # joints as shared points, pre-bends, hinge rolls, symmetrize
probs = R.check_metarig(meta, body)    # [] = ready
R.placement_sheet([body, eyes], out, arm_obj=meta, views=("front", "right", "top"))
R.placement_sheet([body, eyes], out, arm_obj=meta, center=head_centre, size=0.4, name="head")
R.upgrade_face(meta)                   # human only, after fitting: irreversible
rig, err = R.generate(meta)            # err: "Error: RIGIFY ERROR: Bone 'spine.004': Cannot connect chain ..."
```

Core facts used by the fit:

- Enable Rigify: `bpy.ops.preferences.addon_enable(module="rigify")`; add at the origin:
  `bpy.ops.object.armature_basic_human_metarig_add()` (1.98 m, faces -Y).
- Limb roll: local X = normal of the chain plane,
  `n = (u.tail-u.head).cross(l.tail-l.head).normalized(); eb.align_roll(n.cross(y_dir))` (Rigify's
  own convention: default arm dot 0.976, leg 1.0). Spine and head `align_roll((0,-1,0))`, shoulder
  and toe `align_roll((0,0,1))`.
- Pre-bend: knee `y = min(section_y, line_y - 0.012 * leg_length)`, elbow `y += 0.012 * arm_length`
  (about 2.7 deg between segments).
- Connected ends propagate: setting a parent's `tail` in Edit Mode moves a connected child's `head`.
  Group transforms must write each end once (`R.transform_bones`); `EditBone.transform()` bone by
  bone double-moved shared ends and produced 0.23 m finger bones in testing.
- Moving a face region: `R.move_points(eb, [(old, new), ...])` moves every coincident end (tails
  first, then heads of disconnected bones). Moving only some lid bones produced "Bone 'eye.R':
  Expected 2 eye corners, but found 1".
- Side names: `lid.T.L.001` does not end with `.L`; select sides with `R.side_of(name)` before
  `bpy.ops.armature.symmetrize()`, or half the face stays unmirrored.
- Face (human): piecewise vertical map through chin bottom, nose tip, eye line and head top, width
  scaled to the head, eyes and lids moved onto the eyeballs. Coarse: jaw and nose bones still need
  manual placement on a stylized face (see `out/snow_human_face/placement_sheet.png`).
- `check_metarig` flags: unapplied scale/pose, positional chain breaks (`connect_chain` needs head
  == parent tail even when `use_connect` is False), knee/elbow bends outside 1 to 15 deg or bending
  the wrong way, hinges off local X, no Rigify UI row, glue ends not coincident, bone middles
  outside the mesh (14-ray vote, tolerant of eye holes).
- Generation failure leaves a partial rig active; `generate()` re-activates the metarig. Verified:
  `test_fit.py -- T|A|human T` (6/6, 6/6, 8/8; 222 bones basic, 918 human, 0.1 to 0.3 s),
  `test_checks.py` (10/10: each check fires on a broken metarig), `test_snow.py -- basic|human`.

## P4. Bind with verification and fallback

```python
rep = R.bind(rig, body, garments=[shirt, pants, shoes],
             rigid={eyes: None, hair: "DEF-spine.006"},     # None = nearest deform bone per island
             max_influences=None, clean=0.01, symmetric=True, route="auto")
rep["route"], rep["ok"], rep["body"]["unweighted"], rep["body"]["empty_major"], rep["stripped_cross_side"]
```

Steps inside: `parent_set(type='ARMATURE_AUTO')` then `weight_report` (heat failure = unweighted
vertices or a major bone inside the mesh with no weight; small face bones and teeth/tongue/eye bones
may legitimately be empty on the skin); on failure `proxy_weights`: voxel remesh of a copy at H/180,
H/90, H/45 until bone heat covers every proxy vertex (an open mesh voxelizes into a thin shell with
the bones outside it; the coarser voxel closes the holes), then Data Transfer:

```python
m = dst.modifiers.new("BX_weights", "DATA_TRANSFER"); m.object = proxy
m.use_vert_data = True; m.data_types_verts = {"VGROUP_WEIGHTS"}; m.vert_mapping = "POLYINTERP_NEAREST"
m.layers_vgroup_select_src = "ALL"; m.layers_vgroup_select_dst = "NAME"
bpy.ops.object.modifier_move_to_index(modifier=m.name, index=0); bpy.ops.object.modifier_apply(modifier=m.name)
```

then `strip_opposite_side` (auto weights put left-thigh weight on 1,888 right-side vertices of the
mannequin), garments by the same transfer from the body (applied), `assign_rigid` (islands, 1.0, one
bone), `remove_non_deform_groups`, `clean_weights` (below 0.01, optional N largest, normalize),
`armature_first` (after Mirror, before Subdivision; Subdivision pinned last). Results: mannequin
auto route 0 unweighted, mirror error 0.03; raw intersecting primitives: auto left 96 unweighted,
proxy route 0; Snow basic and human: auto route clean; Snow with forced proxy: first voxel failed,
H/90 succeeded. Verified: `test_bind.py -- T|A` (15/15), `test_snow.py`.

## P5. Test poses, numbers, renders

```python
dr = R.deformation_report(rig, [body, shirt], R.RIGIFY_POSES)     # Subdivision hidden while measuring
for p in R.flag_report(dr): print(p)
R.pose_sheet(rig, [body, shirt, eyes], R.RIGIFY_POSES, out)        # rows = poses; bx_review Workbench
R.joint_sheet(rig, [body, shirt], [R.pose_by_name("elbow_120.L")], out)   # close-ups at the joint
```

Pose ops are written in world terms so the library works on T and A poses: `("aim", bone, dir)`,
`("hinge", bone, deg, toward)` (rotates about the bone's own local X, so a wrong roll shows as a
wrong pose), `("twist", bone, deg)`, `("rot", bone, axis, deg)`, `("move", bone, delta_in_H)`,
`("prop", bone, key, v)`, `("fk", "arms")`, `("ik", "legs")`. Custom rigs: write poses with their
control names and extend `R.JOINTS` with `"name": ("bone:head", "bone:head", "bone:tail")`. Report
fields: strain p1/p99 and edges outside 0.5 to 1.6 (flagged above 0.2% of edges), joint volume =
mean squared distance to the limb axis posed/rest over the joint's flesh (1.8 local radii, half a
segment each way) with the worst and best band along the limb, cross-side leak in units of H, new
self-intersecting face pairs (bx_audit). Typical auto-weight numbers (mannequin, Rigify basic): arm
down shoulder band 0.47, elbow 120 0.68, knee 120 0.73, wrist twist 80 1.0 (Rigify B-bone twist),
spine and neck about 1.0. Pitfall found: squatting with ('ik',) on all limbs raised the arms (IK
hands stay put); use ('ik', 'legs'). Verified: `test_bind.py`, `test_snow.py` (sheets in
`out/bind_T/`, `out/snow_basic/`).

## P6. Manual rig: skeleton, twist chains, FK/IK, IK, foot roll, symmetry, DEF, organization

```python
rig = R.new_armature("RIG"); R.activate(rig, "EDIT"); eb = rig.data.edit_bones
R.new_bone(eb, "root", (0, 0, 0), (0, 0.25 * H, 0), roll=0.0)          # world-aligned, flat
R.new_bone(eb, "pelvis", P["pelvis"], P["spine1"], "root", deform=True, roll_z=(0, -1, 0))
R.new_bone(eb, "MCH-upper_arm.L", sh, el, "shoulder.L")
R.new_bone(eb, "MCH-lower_arm.L", el, wr, "MCH-upper_arm.L", True)
R._set_limb_roll(eb, ["MCH-upper_arm.L", "MCH-lower_arm.L", "hand.L"])
bpy.ops.object.mode_set(mode="OBJECT")
tw = R.twist_chain(rig, "MCH-lower_arm.L", "hand.L")                                  # distal
R.twist_chain(rig, "MCH-upper_arm.L", None, proximal=True, parent="shoulder.L")        # proximal
prop = R.settings_prop(rig, "rig_settings", "leg_fk_ik.L", default=1.0)                # 1 = IK
fk, ik = R.fk_ik_switch(rig, ["MCH-thigh.L", "MCH-shin.L", "foot.L", "toe.L"], prop)
# (edit mode) IK control, MCH target, pole under the IK control; R.reparent(eb, "foot_IK.L", "MCH-leg_IK_target.L")
c, (angle, err) = R.ik_chain(rig, "shin_IK.L", "MCH-leg_IK_target.L", "leg_pole.L")    # chain 2, locks, pole solved
R.con(rig, "foot_IK.L", "COPY_LOCATION", subtarget="shin_IK.L", head_tail=1.0)
R.foot_roll(rig, "L", "leg_IK.L", "MCH-leg_IK_target.L", heel, toe, inner, outer, ball)
# symmetrize the .L side, then: R.mirror_drivers(rig); settings_prop for the .R keys
R.make_def_layer(rig, deformers); R.organize(rig, settings="rig_settings")
R.set_shape(rig, "upper_arm_FK.L", R.widget("circle"), 0.6)
```

Raw essentials:

- Twist (distal): per twist `COPY_ROTATION` from the hand, `target_space = owner_space = 'LOCAL'`,
  influence 1.0/0.66/0.33/0.1 from the wrist, then `DAMPED_TRACK` to the hand below it. Proximal:
  parent to the clavicle/pelvis, `COPY_LOCATION` (first from the main bone, then the previous twist
  with `head_tail=1`), `DAMPED_TRACK` to the main bone with `head_tail=1`, `COPY_ROTATION`
  Local/Local from the main bone. Measured falloff for a 90 deg hand twist: 9.0, 29.7, 59.4, 90.0
  deg.
- FK/IK: two `COPY_TRANSFORMS` on each main bone named "FK" then "IK"; driver on the IK one's
  influence:
  `v.type='SINGLE_PROP'; v.targets[0].id = rig; v.targets[0].data_path = 'pose.bones["rig_settings"]["leg_fk_ik.L"]'`.
  Property on a pose bone:
  `pb[key] = 1.0; pb.id_properties_ui(key).update(min=0, max=1, default=1.0, step=1)` (without
  `default=` Reset to Default flips the switch).
- Pole angle: set influence 0, record the chain matrices, scan pole angles for the minimum
  difference with influence 1 (coarse 2 deg, then 0.25, then 0.02): leg -90.0 deg (error 7e-5), arm
  -90.0 deg (3e-5).
- Foot roll: pivots pointing up with roll 0; outside > inside > heel > toe > ball > MCH IK target;
  each pivot `COPY_ROTATION` from foot_roll (Local, `use_y=False`) + `LIMIT_ROTATION` (owner Local):
  heel X [-90, 0], toe X [0, 90], inside/outside Z one-sided; foot_roll parented to the ankle
  control. Probes: roll X -30 lifts the toe 0.13 m, X +30 lifts the ankle 0.09 m on the toe pivot,
  each Z direction lifts one edge; Symmetrize mirrored the Z limits.
- `reparent`: clear `use_connect` BEFORE changing the parent. Doing it after moved foot_IK's head
  0.105 m to the new parent's tail and broke FK/IK coincidence (0.63 matrix error); fixed: 1.6e-5.
- `mirror_drivers(id)`: Symmetrize copies bones, constraints and limits but no drivers; this
  recreates each .L driver on .R (paths, bone targets, property paths, keys) and skips targets that
  do not exist yet.
- DEF layer: `DEF-` copies, one `COPY_TRANSFORMS` each, deform only on DEF (vertex groups renamed so
  weights survive). Checks run: static cycles none, runtime cycle check clean, root test 1.4e-5,
  FK/IK coincide 1.6e-5, drivers valid 7 = 7, IK foot planted when the pelvis drops (3.6e-5 m), bind
  auto 0 unweighted, wrist twist 80 deg band 0.97 (no candy wrapper). Verified: `test_manual_rig.py`
  (18/18).

## P7. Rig test suite (manual rigs)

```python
R.static_cycles(rig)      # constraint target inside the owner's children, IK target inside its chain, mutual constraints
R.cycle_check()           # saves a copy, opens it in a background Blender, returns 'Dependency cycle detected' lines
R.root_test(rig)          # (max matrix error, worst bone) after translate + rotate + scale 1.5 of the root
R.twist_angles(rig, twist_names, "MCH-lower_arm.L")
```

Positive controls: two bones damped-tracking each other and a bone copying its own child are caught
by both `static_cycles` and `cycle_check` ("WARNING Dependency cycle detected"). Verified:
`test_checks.py`, `test_manual_rig.py`.

## P8. Weight fixes as data (no brush)

```python
R.strip_opposite_side(body, rig)                                # .L weights off the right half, renormalize
R.assign_rigid(teeth_lower, rig, "DEF-jaw")                     # islands at 1.0
R.smooth_weights(body, rig, factor=0.5, repeat=2, bones=["DEF-hand.L", "DEF-forearm.L.001"], vertex_indices=band)
R.clean_weights(body, rig, limit=0.001, max_influences=4)       # export
W, names = R.weight_matrix(body); R.write_weights(body, W, names)   # arbitrary numpy edits
R.transfer_weights(body, sleeve, rig)                           # same source, applied
```

`smooth_weights` runs
`bpy.ops.object.vertex_group_smooth(group_select_mode='BONE_SELECT'|'BONE_DEFORM')` in Weight Paint
mode with pose bones selected and `mesh.use_paint_mask_vertex = True` (only selected vertices
change). Exact seams (CGDive's Mix 0.5): write equal weight vectors on the seam vertices of both
meshes, or join the meshes, edit, separate (weights survive). Verified: `test_bind.py` (strip,
clean, normalize, garments), `test_mechanical.py` (rigid).

## P9. Corrective shape key without sculpting

```python
R.apply_pose(rig, R.pose_by_name("elbow_120.L"))
idx, tgt = R.volume_restore_targets(body, rig, "elbow.L")            # push flesh back to rest distance, falloff + smoothing
kb = R.corrective_from_targets(body, rig, "CS_elbow.L", tgt, idx)     # rest-space offsets via the skinning Jacobian
R.corrective_driver(body, "CS_elbow.L", rig, "ORG-upper_arm.L", "ORG-forearm.L", 40, 115)
R.mirror_shape_key(body, "CS_elbow.L"); R.mirror_drivers(body.data.shape_keys)
```

Inverse skinning: a temporary shape key with +h offsets on X, Y, Z (three evaluations) measures the
3x3 map from rest offset to posed displacement per vertex; `offset = solve(J, target - posed)`.
Exact at the pose (max error 1e-5 m). Driver: `ROTATION_DIFF` between two bones that follow both IK
and FK (Rigify ORG bones, a manual rig's MCH chain), keys moved to (40 deg, 0) and (115 deg, 1) with
auto-clamped handles so it kicks in late (0.41 at 70 deg), constant extrapolation. Lesson: the
unsmoothed radial push restored the numbers (band 0.68 to 0.90) but the render showed spikes in the
crease; falloff along the limb plus 12 relax passes gave 0.81 with a clean render. The number is a
guide, the render decides. Verified: `test_correctives.py` (6/6, renders `out/correctives/`).

## P10. Preserve Volume done right (Blender-only rigs)

```python
n = R.preserve_volume_mask(body, rig, pose_fn=lambda: R.apply_pose(rig, R.pose_by_name("arm_up.L")))
```

Stack: Armature with Preserve Volume, then a second Armature without it, `use_multi_modifier=True`,
`vertex_group="preserve"`. Result = Preserve Volume blended toward the plain result by the mask
weight (verified to 1e-7). The mask is seeded where Preserve Volume moves vertices more than 0.4% of
the height from the plain result (326 vertices on the mannequin's arm-up pose; mean bulge 12 mm
reduced to 3.7 mm). Verified: `test_pv_mask.py` (4/4).

## P11. Face: shape keys, L/R split, on-face controls

```python
L, Rk = R.split_shape_lr(face, "mouth_smile")            # mouth_smile.L/.R, groups sum to 1 across the center
R.face_control(rig, "SK-mouth_corner.L", head, tail, "head", travel=0.02, axes=("Y",), both_ways=True)
R.drive_shape(face, "mouth_smile.L", rig, "SK-mouth_corner.L", "LOC_Y", 0.02)
R.drive_shape(face, "mouth_frown.L", rig, "SK-mouth_corner.L", "LOC_Y", 0.02, sign=-1)
# symmetrize the SK bone, then R.mirror_drivers(face.data.shape_keys)
```

`face_control` locks every channel except the used axes, adds `LIMIT_LOCATION` in local space with
`use_transform_limit=True` (Affect Transform). Checks: +Y gives smile 1 and frown 0, -Y the reverse
(negative values clamp on the key's 0..1 range), 3x the travel stays at 1, right control drives only
right keys, L + R at 1 reproduces the symmetric shape exactly. Right-side width drivers on a
mirrored X axis need `sign=-1` (pass the path in `mirror_drivers(..., negate=[...])`). New shape
keys start at value 1.0 in 5.2.1: the helpers set 0. Verified: `test_face.py` (8/8,
`out/face/face_sheet.png`).

## P12. Mechanical / hard surface

```python
R.assign_rigid(robot, rig)                       # each island -> nearest deform bone at 1.0
R.rigid_check(robot)                             # max relative edge change at the current pose (4e-6 measured)
act = R.key_action(rig, "AC_plates", {"plate_0": {"rotation_euler": (math.radians(-40), 0, 0)}})
R.action_drive(rig, ["plate_0", "plate_1"], act, "plate_ctrl", "LOCATION_Y", 0.0, 0.1)
R.con(rig, "plate_ctrl", "LIMIT_LOCATION", owner_space="LOCAL", use_transform_limit=True,
      use_min_y=True, use_max_y=True, min_y=0.0, max_y=0.1)
```

`key_action` keys rest on frame 1 and the pose on frame 10, sets LINEAR through the slot channelbag
(`bpy_extras.anim_utils.action_get_channelbag_for_slot`), fake user on, unlinks the action. Half the
control travel gave exactly half the rotation; driven plates stay hand-animatable. Hinges:
`rotation_mode='XYZ'`, `lock_rotation=(False, True, True)`, and `lock_ik_y/z` on IK bones. Verified:
`test_mechanical.py` (7/7).

## P13. Test character

```python
m = R.mannequin("Mannequin", height=1.8, pose="T"|"A", head_scale=1.0, eyes=True, shirt=True)   # dict body/eyes/shirt
m = R.mannequin("Raw", raw=True)       # intersecting primitives: bone heat fails on part of it
```

Body = primitives joined by `bx_sculpt.union_remesh` (one manifold shell, about 19k vertices), eyes
= two sphere islands, shirt = offset copy of the torso region (an overlapping garment). Real
production mesh for tests: Snow in `tests/fixtures/retopo_examples.blend` (CC-BY Blender Studio),
objects `snow_main`, `GEO-snow_shirt`, `GEO-snow_pants`, `GEO-rain_shoes.002`, `GEO-snow_eye_anim`,
hair and brows.

## P14. Rigify internals worth knowing when scripting

- Post-generation script: `meta.data.rigify_finalize_script = bpy.data.texts["postgen.py"]` (runs
  with the rig active; Demeter's cosmetic tweaks).
- Action slots on the metarig: `meta.data.rigify_action_slots`,
  `bpy.ops.object.rigify_action_create()`.
- Samples for custom metarigs (Edit Mode):
  `bpy.ops.armature.metarig_sample_add(metarig_type="limbs.arm")`; parent components with Keep
  Offset; at least one collection with `rigify_ui_row > 0`;
  `bpy.ops.armature.rigify_use_standard_colors()`.
- Face parameters: `pb.rigify_parameters.eyelid_follow_default` (default (0.2, 0.7)), `jaw_master`
  `jaw_mouth_influence` (default 1.0), `meta.data.rigify_force_widget_update` (default False).
- Generated control names (5.2.1): `upper_arm_fk.L`, `forearm_fk.L`, `hand_fk.L`, `hand_ik.L`,
  `upper_arm_parent.L` (props `IK_FK` 1 = FK, `IK_Stretch`, `FK_limb_follow`, `pole_vector`),
  `thigh_fk.L`, `shin_fk.L`, `foot_ik.L`, `thigh_parent.L`, `torso` (`neck_follow`, `head_follow`),
  `chest`, `hips`, `neck`, `head`, `shoulder.L`, `root`; deform bones all start with `DEF-`, ORG
  bones follow IK and FK. (From the rigify_studio digest probes, `archive/tests/rigify_probe/`, and
  this skill's tests.)

## P15. Loose garments: robust transfer and garment depth (test_live_transfer.py)

```python
R.transfer_weights(body, skirt, rig, mapping="ROBUST")    # or bind(..., garment_mapping="ROBUST")
skirt["bx_matched"], skirt["bx_inpainted"]                 # copied vs filled in, vertex counts
KNEE_LIFT = {"name": "knee_lift_90.L", "side": "L", "joints": ["hip.L", "knee.L"],
             "ops": [("fk",), ("aim", "thigh_fk.L", (0.05, -1.0, 0.0)), ("hinge", "shin_fk.L", 90, (0, 0, -1))]}
dep = R.garment_depth(rig, body, [skirt, sleeve], R.RIGIFY_POSES + [KNEE_LIFT], limit=0.005)
dep["fail"]                                                # [(pose, garment)] deeper than at rest
```

- **Robust transfer.** A vertex copies the closest skin point's weights only when that point is
  within `max_dist` (default 5% of the garment's bounding-box diagonal) and the normals agree within
  `max_angle` (35 degrees, either facing). Every other vertex is inpainted: it starts from the
  nearest copied vertex (over the garment's edges, else in space for a detached part), diffuses
  until no weight moves more than 1e-6, then 10 light smoothing passes run. Method: Abdrashitov et
  al., "Robust Skin Weights Transfer via Weight Inpainting", SIGGRAPH Asia 2023.
- **Errors.** No vertex passing both gates raises `ValueError` naming the closest gap: raise
  `max_dist` past it. A body with a live Mirror raises too, since its weights cover only the base
  half: apply the Mirror first.
- **When.** A tight piece copies whole either way, so one `bind(..., garment_mapping="ROBUST")`
  serves a shirt and a skirt. Use it on what hangs off the skin: skirts, coat tails, capes, hoods,
  loose sleeves. Neither route keeps a boot's inner wall off the other leg, which lies just as close
  and faces it.
- **Inpainted parts follow their copied band**, not the limbs under them. A leg that swings forward
  then passes through a skirt that only follows the hips: `garment_depth` reports it.
- **Auto-weighted bodies.** The skin under a waistband already carries thigh weight, so the copied
  band does too. Robust cuts the tear but lets the leg through. Gate with `garment_depth`, then add
  skirt bones or a corrective shape key.
- **Knee lift.** For skirts and coats, add `KNEE_LIFT` to the depth poses: `RIGIFY_POSES` has no
  knee lift, the pose that drives a leg deepest through a skirt.
- **Garment depth.** Per pose, how much deeper each garment vertex sits inside the body than at
  rest; overlap already present at rest is not counted. `weight_report` and `deformation_report`
  read one mesh at a time, so they pass a garment sunk into the body. The body's normals must face
  out (`model_check`). A live Mirror on the body is measured whole. A pose naming controls the rig
  lacks raises, since the body would stay at rest.

Verified: test_live_transfer.py on Blender 5.2.1. A hip cylinder and two legs, a 1,008-vertex skirt
hanging from the hips, a sleeve 1 cm off the left leg, the left leg swung 50 degrees forward.
Nearest-face: 244 skirt vertices led by the left thigh and 242 by the right, 51 edges outside the
0.5 to 1.6 stretch band, worst stretch 13.3. Robust: 338 copied, 670 inpainted, all 1,008 led by the
hips, 0 edges outside the band, worst 1.0, sums 1.0. A hoop below the hem with no edge to the skirt
followed the hips too. The sleeve copied whole (0 inpainted) and stayed under 5 mm. `garment_depth`
failed both skirts where the leg passes through: 34 robust vertices over 5 mm (worst 6.8 cm), 7
nearest-face ones (worst 3.7 cm).

Field check (skill validation on PR 359, Blender 5.2.1): the A-pose mannequin with Rigify basic and
auto weights, plus a 1,536-vertex flared skirt 2 to 10 cm off the legs. Robust copied 620 and
inpainted 916, yet 1,273 vertices stayed led by a thigh bone. At `leg_forward.L` the worst stretch
fell from 19.2 (nearest-face) to 1.9, with 30 edges still outside the band. `garment_depth` failed
`leg_forward.L` (63 vertices, worst 5.9 cm) and the 90 degree knee lift (140, worst 7.9 cm).

## P16. A body on an existing skeleton

When clips, an engine skeleton or other characters already share a skeleton, the body has to join it
before those clips play on it. It keeps its own rig and bind, then moves onto the shared skeleton's
names and hierarchy, not onto its proportions.

- **Map, per bone of the body's rig:** rename to the shared name; merge (add the weights into the
  target's group, re-parent the children); split a long segment into the shared one's parts, its
  weights shared by tent functions along the segment. Keep the map as data, one file per skeleton.
- **Extra bones.** The shared skeleton's other bones go in unweighted. An attachment bone (weapon,
  prop socket) sits at the shared skeleton's offset from its parent bone. Root and IK bones keep the
  shared skeleton's rest place, so clips keyed on them keep their meaning.
- **Keep the body's joint positions.** Each body keeps its own heads and tails; only names and
  hierarchy change.
- **Weights.** Every vertex group must end with a bone; no group may name a bone that is gone. Check
  sums, unweighted vertices and the influence count with `weight_report`.
- **Gate, before any influence cap.** Compare every vertex of the moved body against the source rig,
  in the rest pose and in a seeded sweep that turns each mapped unit by up to 25 degrees.
  - Set the source's B-bone segments to 1 first: an engine skeleton carries none.
  - Pose both rigs from one world-space delta per unit. Bones merged into one target turn together.
    Both parts of a split take their source's delta; never repeat a local turn down the chain.
  - The worst distance is then a rounding error, well under 0.1 mm. On a Rigify Basic body (5.2.1)
    it measured 0.0007 mm, against 21 mm with Rigify's B-bones, 29 mm with local turns on split
    parts and 96 mm with merged bones turned apart.
- **Cap.** Limiting to 4 influences moves vertices (16 mm in the same sweep): judge it with
  `deformation_report`, not with this gate.
- **Rest pose for shared clips.** A clip stores each bone's rotation from the shared rest. On a body
  with another rest direction or roll (an A pose under a T-pose skeleton), it plays a different
  pose.
  - When the shared clips must play unchanged (an engine skeleton), match the shared rest direction
    and roll in two moves. Posing the roll itself would twist the mesh.
  - First set each bone's edit roll so the swing to the shared direction lands on the shared roll:
    `align_roll` with the shared Z axis turned back by that swing. A roll change at rest moves no
    vertex.
  - Then pose each bone, root first, by that swing only, and run
    `R.apply_pose_as_rest(rig, meshes)`. It bakes the pose into each mesh's Basis and every shape
    key, then applies the pose as rest. The modifier stack stays as it was. Never apply and re-add
    the Armature modifier instead: `modifier_apply` refuses a mesh with shape keys, and a re-added
    modifier lands after Subdivision.
  - The swing bakes its skinning into the new rest mesh (15 mm at the shoulders on an A-pose body):
    look at the shoulders after it.
  - The body keeps its own rolls only when every clip is re-baked for it from per-bone pose deltas.
- **Export and read back.** Use `scenario-blender-export`'s skeletal preset with one override:
  `bxe.export(path, "unreal_skeletal", objects, use_armature_deform_only=False)` (or
  `"unity_skeletal"`). The extra bones carry no weights, and a deform-only export drops them.
  - The preset writes each clip as its own take. A raw call that bakes the scene take reads back one
    frame late (frames 2 to 25 for 1 to 24 on 5.2.1).
  - Read the file back and compare it with the scene body at the same poses: the file, not the
    scene, is what ships.
