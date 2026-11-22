# Procedures: scenario-maya-rigging (Maya 2027, Python)

**Status of every block below: not yet run in Maya.** Maya 2027 was not installed when this was
written (2026-09-24). Each procedure names the test that exercises it; the tests are mx_run jobs
under `tests/code/maya-rigging/`, run all with `run_all.sh` (probe first), results in
`archive/tests/maya-rigging/<stamp>/results/`. Only the pure-Python math of `scripts/mx_rig.py` ran
(offline, python3): `test_rig_offline.py`, 68 checks passed on 2026-09-24 (48 before the M3
refactor; the 20 new ones cover the blendMatrix and parentMatrix models, rotation paths, the
secondary-axis guard, static curves and GPU Override eligibility). After the first Maya run, replace
"not yet run in Maya" by "verified on Maya 2027.x" only for blocks whose test passed, and correct
every [verify] the probe answers (`test_rig_probe.py`).

Setup (every procedure):

```python
import sys
sys.path.insert(0, "<skills>/scenario-maya-rigging/scripts")
sys.path.insert(0, "<skills>/scenario-maya-expert/scripts")
import maya.cmds as cmds
import mx_rig as R
```

Headless:
`python3 <skills>/scenario-maya-expert/scripts/mx_run.py --scene in.ma --save-as out/v002.ma job.py`.
GUI: `mx_bridge.Bridge().run(code)` (one undo chunk per call). Everything here is headless-safe
except P12's playblast.

Conventions used by `mx_rig` (Maya 2027 Help, transform and joint nodes): matrices are 16 floats
row-major as `getAttr` returns them; Maya post-multiplies, so
`world = local * offsetParentMatrix * dagParentWorld`; the joint matrix is
`S * RO * R * JO * IS * T`; jointOrient is XYZ whatever rotateOrder says [verify:
`test_rig_skeleton` checks it for all six orders]; angles in degrees; scene in cm.

---

## P1. Model intake (before any joint)

Test: `test_rig_model.py`. Sources: antCGi e74KphYwMww (whole video).

```python
import mx_validate
rep = mx_validate.validate(profile="model", roots=["body_geo", "eye_l_geo", "eye_r_geo"])
gate = R.model_gate(["body_geo"], height=180, eyes=["eye_l_geo", "eye_r_geo"])
print(rep["summary"], gate["problems"], gate["info"]["height"])
```

`model_gate` checks cm, lowest point at y = 0, center at x = 0, height within 5% of the spec, frozen
transforms, eye transforms without rotation and eye pairs mirrored. What it cannot see (look at a
wireframe sheet from `mx_review.review(targets, out, modes=("wire",))`): loops at knuckles, elbows
and knees, triangles in deforming zones, a mouth bag, arms raised enough to paint under, eyes
modeled dead ahead. Problems go back to scenario-maya-modeling as a list; never edit a client model
without permission (antCGi [00:13:48]).

## P2. Joint positions without the Joint Tool

Test: `test_rig_model.py`. Sources: antCGi fGacyVzJGIU [00:05:10] (Snap to Projected Center),
[00:13:11] (on loops).

```python
c = R.projected_center("body_geo", (9.0, 50.0, 6.0), direction=(0, 0, 1))   # middle of the limb along Z
e = R.edge_loop_center("body_geo", 1234)                                   # centroid of the loop through edge 1234
knee = (c[0], c[1], c[2] + 2.5)                                            # then pre-bend: knee forward, elbow back
```

`projected_center` casts one line through the guess (`MFnMesh.allIntersections` [verify return
layout]) and keeps the entry and exit around it; `edge_loop_center` averages the loop's vertices
(`polySelect(edgeLoop=, asSelectString=True, noSelection=True)` [verify]). Write the result as a
dict name to (x, y, z) and keep it: it is the guide data the rig is rebuilt from (Miquel Campos,
rDHTdhzKpvI [00:06:42]).

## P3. Skeleton: build, orient, mirror, rotate orders, preferred angles

Test: `test_rig_skeleton.py` (and `_rig_test_util.build_biped`, the full fixture).

```python
B = {...}   # name -> (x, y, z) from P2
root = R.joint_chain([("root", (0, 0, 0))], up=(0, 0, 1), up_axis="y", world=["root"])[0]
spine = R.joint_chain([(n, B[n]) for n in ("pelvis", "spine_01", "spine_02", "spine_03", "neck", "head", "head_end")],
                      parent=root, up=(0, 0, 1), up_axis="y")               # X up the spine, Y to the front
clav = R.joint_chain([("clavicle_l", B["clavicle_l"])], parent="spine_03", up=(0, 1, 0), up_axis="y",
                     end_aim=B["upperarm_l"])
arm = R.joint_chain([(n, B[n]) for n in ("upperarm_l", "lowerarm_l", "hand_l", "hand_end_l")], parent=clav[0],
                    up="plane")                                             # X down the bone, Z = bend axis, +Z flexes
leg = R.joint_chain([(n, B[n]) for n in ("thigh_l", "calf_l", "foot_l", "ball_l", "toe_l")], parent="pelvis",
                    up="plane")
R.mirror_chain("clavicle_l", ("_l", "_r"), behavior=True)                  # limbs: behavior
R.mirror_chain("thigh_l", ("_l", "_r"), behavior=True)
R.orient_to_world("head")                                                   # antCGi: head, eyes, feet world oriented (games)
R.set_rotate_orders(["lowerarm_l", "lowerarm_r"], R.rotate_order("x", "z"))   # twist inner, bend outer
R.set_preferred_angles("root")
rep = R.rig_check(joints=cmds.ls(type="joint"))
assert rep["ok"], rep["errors"]
```

What `joint_chain` does, in raw cmds, per joint (top-down, so the parent's world matrix is final):

```python
cmds.select(clear=True)
j = cmds.joint(name=name)
j = cmds.parent(j, prev, relative=True)[0]                  # joint parent: scale -> inverseScale ensured
pw = R.world_matrix(prev)
cmds.setAttr(j + ".rotate", 0, 0, 0)
cmds.setAttr(j + ".jointOrient", *R.joint_orient_from_frames(frame, R.m_rot3(pw)))   # frame from R.orient_frames
cmds.setAttr(j + ".translate", *R.m_point(world_pos, R.m_inverse(pw)))
```

Conventions, keyed to the brief:

- Default [added]: `aim_axis="x"`, limbs `up="plane", up_axis="z"` (one normal per limb so the hinge
  axis is shared; the sign makes positive Z flex elbows and knees), spine and neck
  `up=(0, 0, 1), up_axis="y"`.
- antCGi game convention (FN05iGspldI [00:02:54]): `aim_axis="y", up_axis="z", up=(0, 0, 1)`; his
  rotate orders: `R.ROTATE_ORDERS_ANTCGI_Y` (default yxz, hinges yzx, twist and feet zxy, head and
  eyes xyz). His claim that Y has fewer Euler flips in Unreal is uncited [00:03:01].
- Engine animation reuse: copy the engine skeleton's names, hierarchy and axes (antCGi [00:01:52];
  the UE4 mannequin is X down the bone).
- Eyes and face: mirror with orientation, not behavior (`behavior=False`), or duplicate and negate
  translateX (antCGi [00:13:20]).
- End joints copy their parent (antCGi [00:07:16]).

## P4. Orient Joint through cmds (existing skeletons, auto-rigger fit joints)

Test: `test_rig_skeleton.py` (the trap section).

```python
ends = R.orient_with_cmds("upperarm_l", oj="xyz", sao="yup")    # T-pose arm: world +Y lies across the bone
ends = R.orient_with_cmds("thigh_l", oj="xyz", sao="zup", children=False)   # leg and spine: +Z, never +Y
R.orient_with_cmds("calf_l", oj="xyz", sao="zup", children=False)
R.orient_with_cmds("ball_l", oj="xyz", sao="yup", children=False)          # forward toes: +Y, never +Z
# = cmds.makeIdentity(j, apply=True, rotate=True)          freeze rotations into jointOrient first
#   cmds.joint(j, e=True, oj="xyz", sao="zup", ch=True, zso=True)
#   end joints: cmds.setAttr(end + ".jointOrient", 0, 0, 0)
```

The secondary world reference must lie across every bone it orients: within 30 degrees [added] of
the bone the secondary axis is ill-defined and neighboring joints come out with opposite Y axes
(antCGi's toes, FN05iGspldI [00:06:44]; the M3 grade caught a hardcoded 'yup' on legs).
`orient_with_cmds` raises before touching the joints when that happens (`R.sao_conflicts` is the
pure check; `min_angle=0` disables it). Test: `test_rig_skeleton.py` (a leg refused with 'yup',
oriented with 'zup'), `test_rig_offline.py`. The trap (2027 cmds.joint): `-orientJoint` is ignored,
silently, when the joint has non-zero rotations, has no child joint, or `-o`/`-so` is also passed.
After manual LRA edits run `joint -e -zso` (antCGi FN05iGspldI [00:09:43]). World orientation on a
parented joint: `R.orient_to_world(j)` instead of unparent, orient, reparent (antCGi [00:03:25]).
Negative primary axes (`oj="xyzNeg"`) work from 2027.1; `autoOrientSecondaryAxis=True` exists since
2025 (the probe records both).

## P5. Controls at zero: offsetParentMatrix placement, bake, world matching, follows

Test: `test_rig_controls.py`.

```python
c = R.control("hand_l_fk_ctrl", "circle", 4.0, axis="x", match="hand_l", parent="controls_grp")
#   placement in offsetParentMatrix, translate/rotate 0, rotate order copied from the joint,
#   side color, controller tag, scale and visibility locked
g = R.control("cog_ctrl", "square", 20, "y", "pelvis", "controls_grp", offset="group")   # classic offset group
R.bake_to_opm("old_ctrl")                  # "move the values down": world kept, TRS (and jointOrient) zeroed
R.set_world_matrix("hand_l_ik_ctrl", target16)                                 # through OPM, parent, jointOrient
grp = R.follow_group("arm_l_fk_ctrl_grp", driver="clavicle_l", parent="controls_grp")      # constraint-free follow
R.follow_with_offset("arm_l_settings_ctrl", "clavicle_l")                                 # = maintain offset
R.follow_with_offset("elbow_lock_loc", "hand_l", pick=("translate",))                    # point-constraint-like
```

Raw matrix follow (Maya Learning Channel JOYMV-bQdlM [00:05:20], [00:09:15]):
`driver.worldMatrix[0]` into `offsetParentMatrix` is right only when the driven node's DAG parent is
world or identity; otherwise multMatrix `[driver.worldMatrix[0], parent.worldInverseMatrix[0]]`;
with a stored offset `[offset, driver.worldMatrix[0], parent.worldInverseMatrix[0]]`,
`offset = drivenWorld * driverWorld^-1`. Zero the driven node's channels first or the pose doubles.
Relative drives use `.matrix`, never `worldMatrix`.

The composition rule behind all of it (2027 transform node):
`world = local * offsetParentMatrix * dagParentWorld`, post-multiplied, and a transform's
`parentMatrix` already equals `offsetParentMatrix * dagParentWorld`. Three cases:

- driver's `worldMatrix[0]` straight into OPM: only when the driven node has no DAG parent, a parent
  that never moves, or `inheritsTransform` off;
- otherwise multMatrix `[driver.worldMatrix[0], drivenParent.worldInverseMatrix[0]]` (with a
  constant offset first to keep the current pose);
- `.matrix` (local TRS only) for a relative, parent-like drive between siblings (MLC's finger
  compounds [00:09:51]). After connecting, translate, rotate and jointOrient must be zero (antCGi's
  leg rotated backwards from a forgotten jointOrient, yls25bV-IZU [00:18:08]). Gate:

```python
oa = R.opm_audit("rig")            # {'doubled': {node: leftover values}, 'world_into_parent': {node: source plug}}
assert not oa["doubled"] and not oa["world_into_parent"], oa
```

`rig_check(root=...)` reports the same (doubled = error, world_into_parent = warning). Test:
`test_rig_check.py` (a naive follow flagged, `follow_with_offset` clean).

## P6. RP IK limb with a drift-free pole

Test: `test_rig_ik.py`.

```python
ik = R.control("arm_l_ik_ctrl", "box", 4, match=R.wpos("hand_ik_l"), parent="controls_grp", lock=("s",))
pv = R.control("arm_l_pv_ctrl", "diamond", 2, match=R.wpos("lowerarm_ik_l"), parent="controls_grp", lock=("r", "s"))
res = R.ik_limb(["upperarm_ik_l", "lowerarm_ik_l", "hand_ik_l"], ik, pv, "arm_l", pole_distance=40.0)
print(res["pole"]["drift"], res["pole"]["report"], res["rest_error"])     # both below 1e-3
```

Inside: `ikHandle(sj, ee, sol="ikRPsolver")`, the handle parented under the control,
`R.pole_vector_position(start, mid, end, d)` = `mid + unit(mid - proj) * d` with `proj` the mid
joint projected on the start-end line, `poleVectorConstraint`, the drift measured and refused above
1e-3 cm, `orientConstraint(ctrl, end, mo=True)`. antCGi's by-hand version (yls25bV-IZU [00:06:35]):
two locators 30 units behind the elbow, one parented to the IK elbow, nudge the pole until they
meet. A straight chain has no plane: `pole_vector_position` raises; pre-bend and rebuild. One solver
per character: Maya shares one solver node per type between every handle in the scene, so editing it
changes every rig, and handles exported with a character bring solver nodes that conflict when
several characters are loaded (2027 IK solvers doc; Fragapane rfLEBgOEW1A [00:34:43], "can make a
mess"). Pass `own_solver="heroA_ikRPsolver"` to `ik_handle`, `ik_limb` and `ikfk_limb`
(`createNode("ikRPsolver")` then `solver.message -> handle.ikSolver` [verify]);
`rig_check(root=...)` errors when one solver drives handles inside and outside the rig and warns
when the rig's handles use the scene-wide default. Test: `test_rig_ik.py`, `test_rig_check.py`.
Quadruped leg: `R.ik_handle(hip, foot, "ikSpringSolver")` loads the solver first (the 2027 ikHandle
page lists only RP, SC and spline); antCGi drives an RP (hip to calf) and an SC (calf to foot) from
a spring driver chain, RP fallback if unstable (yls25bV-IZU [00:12:56] to [00:18:08]).

## P7. IK/FK limb with seamless matching

Test: `test_rig_ikfk.py`.

```python
rig = cmds.createNode("transform", name="rig")
nt = cmds.createNode("transform", name="rig_noTouch", parent=rig)
ct = cmds.createNode("transform", name="rig_controls", parent=rig)
arm = R.ikfk_limb(["upperarm_l", "lowerarm_l", "hand_l"], "arm_l", rig_parent=nt, ctrl_parent=ct,
                  pole_distance=35.0)                                   # method="constraint" (default, FBX-safe)
leg = R.ikfk_limb(["thigh_l", "calf_l", "foot_l"], "leg_l", rig_parent=nt, ctrl_parent=ct, pole_distance=45.0,
                  extra=["ball_l", "toe_l"], orient_end=False)          # reverse foot next (P11)
assert R.neutral_switch_test(arm["switch"], ["upperarm_l", "lowerarm_l", "hand_l"]) < 1e-3
R.ikfk_match(arm["meta"], to="ik", key=True, time=12)    # IK snaps to the FK pose, switch to 1, keys stepped
R.ikfk_match(arm["meta"], to="fk")                       # FK snaps to the IK pose, switch to 0
```

What it builds: FK and IK duplicate chains under `<name>_joints_grp` (follows the bind parent
through offsetParentMatrix, hidden), FK controls driving FK joints by a direct rotate connection
(exact because each control's OPM is the joint's rest local matrix and the rotate orders match
[added]), IK control world-oriented at the wrist, pole on the chain plane, a settings control with
`ikFk` (0 FK, 1 IK) on the limb's parent space (not on the hand: Miquel Campos NfYAaK3wtQs
[00:12:51]; `settings_follow="end"` gives antCGi's point-constrained holder), visibility per mode, a
`network` meta node with the rest offsets (Bungie U_4u0kbf-JE [00:23:10]). Bind blend options:

- `method="constraint"`: `parentConstraint(fk, ik, bind)` with weights from `ikFk` and a reverse,
  `interpType` 2 (Shortest [verify], antCGi's flip fix jXmK0Vl5iYA [00:32:51]), constraint nodes
  moved into the joints group so the export hierarchy stays joints only. Game default.
- `method="matrix"`: `blendMatrix(fk.worldMatrix, ik.worldMatrix)` times the bind parent's
  `worldInverseMatrix` into each bind joint's `offsetParentMatrix`, bind TRS and jointOrient zeroed.
  Fewer nodes; use on film rigs, or on game rigs only once `test_rig_game.py` shows the FBX round
  trip keeps the animation. The bind joints' rotate channels then stay at 0: tell
  scenario-maya-deformation, whose pose readers must read `dagLocalMatrix`.

Mid-blend flips. antCGi's fix (interpType Shortest, jXmK0Vl5iYA [00:32:51]) is a constraint setting;
it says nothing about blendMatrix, whose rotation interpolation the notes do not document. Measure
both:

```python
cmds.setAttr(arm["fk_ctrls"][1] + ".rotateZ", 90)                  # FK and IK posed apart first
cmds.setAttr(arm["ik_ctrl"] + ".translate", -10, 15, 12)
sweep = R.blend_sweep_test(arm["switch"], ["upperarm_l", "lowerarm_l", "hand_l"], steps=20)
assert sweep["ok"], sweep["joints"]      # path within max(1 deg, 5%) of the direct angle [added]
```

A flip or a long-way blend makes the summed step angles exceed the direct angle between the two ends
(`R.rotation_path`, offline-tested). Test: `test_rig_ikfk.py` (both methods, recorded as soft until
Maya runs it). Matching maths (antCGi 7R_0omGY-Ms, done with stored offsets instead of helper
locators [added]): FK control = `offset_i * IKjointWorld_i`,
`offset_i = FKctrl_rest * FKjoint_rest^-1`; IK control = `ikOffset * FKendWorld`; pole =
`pole_vector_position(FK start, mid, end, rest distance)`; a straight FK arm keeps the pole where it
is (reported). Euler angles are chosen closest to the current ones so keys do not jump
(`R.closest_euler`).

## P8. Space switching (blendMatrix into offsetParentMatrix)

Test: `test_rig_space.py`.

```python
R.space_switch("arm_l_ik_ctrl", [None, "cog_ctrl", "chest_ctrl", "head_ctrl"], attr="space",
               names=["world", "cog", "chest", "head"])
R.space_switch("arm_l_pv_ctrl", [None, "arm_l_ik_ctrl"], "follow", ["world", "hand"], pivots=True)  # animatable pivots
R.switch_space("arm_l_ik_ctrl", 2, key=True, time=40)   # no pop: world kept, enum changed, TRS re-solved
rows = R.space_test("arm_l_ik_ctrl", "space", [None, "cog_ctrl", "chest_ctrl", "head_ctrl"])
assert all(abs(r["moved"] - r["expected"]) < 1e-3 for r in rows)
```

Network per control (antCGi BFCggv0SV0s): `blendMatrix.inputMatrix` = first space (world: the rest
matrix, set as a value: connecting then disconnecting leaves nothing [00:03:36]); each other space =
multMatrix `[restWorld * spaceWorld^-1 (constant), space.worldMatrix[0]]` (or an offset locator
under the space with `pivots=True`, [00:05:18], [00:06:58]) into `target[i].targetMatrix`;
`condition` Equal on the enum, true 1, false 0, into `target[i].weight` (0/1 switching, [00:11:35];
one condition per target replaces the video's master condition [added]); output times the control's
DAG parent `worldInverseMatrix` into `offsetParentMatrix`. The control's TRS must be zero first
(`bake_to_opm`). Why 0/1 weights work: blendMatrix is "not a weighted average, but an ordered blend,
where each successive matrix overrides the preceding matrices" (2027 Help), so with one weight at 1
and the later ones at 0 the output is that target. Continuous blends are where the order bites:

```python
R.ordered_blend(base, [a, b, c], [1, 1, 1])                        # = c: the last target wins
R.ordered_blend(base, [a, b, c], R.ordered_blend_weights(3))       # 1, 1/2, 1/3: equal thirds, input overridden
R.ordered_blend(a, [b, c], R.ordered_blend_weights(2, include_input=True))   # 1/2, 1/3: input counts as a share
R.normalized_blend([a, b, c], [1, 1, 1])                           # parentMatrix: weights normalized
```

(translation models of the two nodes, offline-tested; predict before wiring). For a control that
should follow several spaces at once, a parentMatrix node (2025+) is the normalized choice:
per-target Weight, Target Matrix and Offset Matrix, Initialize Target Offset (the object sits at the
Input Matrix when that target alone drives it) and Snap Target Offset (it stays where it is) (2027
Help; attribute names in `test_rig_probe` [verify]). Spread a value along a chain (twist, ribbons)
with blendMatrix weights computed by `ordered_blend_weights`, never typed as equal numbers.

## P9. Spline IK spine

Test: `test_rig_spine.py` (the function `spline_spine` there is this block verbatim).

```python
def spline_spine(joints, name="spine", twist="advanced", ctrl_parent=None, size=12.0):
    """Spline IK spine driven by start, mid and end controls. Joints: X up the chain, Y to the
    front (mx_rig.joint_chain(..., up=(0, 0, 1), up_axis="y"))."""
    pts = [R.wpos(j) for j in joints]
    crv = cmds.curve(degree=3, editPoint=pts, name=name + "_crv")
    h = cmds.ikHandle(startJoint=joints[0], endEffector=joints[-1], solver="ikSplineSolver", curve=crv,
                      createCurve=False, parentCurve=False, name=name + "_ikHandle")[0]
    picks = (("start", joints[0]), ("mid", joints[len(joints) // 2]), ("end", joints[-1]))
    ctrls, drivers = [], []
    for label, src in picks:
        m = R.m_normalized(R.world_matrix(src))
        c = R.control("%s_%s_ctrl" % (name, label), "circle", size, "x", m, ctrl_parent, lock=("s", "v"))
        cmds.select(clear=True)
        d = cmds.joint(name="%s_%s_drv" % (name, label))
        d = cmds.parent(d, c, relative=True)[0]              # driver rides its control, TRS zero
        ctrls.append(c)
        drivers.append(d)
    cmds.skinCluster(drivers, crv, toSelectedBones=True, maximumInfluences=2, name=name + "_crv_skin")
    if twist == "advanced":
        cmds.setAttr(h + ".dTwistControlEnable", 1)
        cmds.setAttr(h + ".dWorldUpType", 4)                  # Object Rotation Up (Start/End) [verify]
        cmds.setAttr(h + ".dForwardAxis", 0)                  # Positive X [verify]
        cmds.setAttr(h + ".dWorldUpAxis", 0)                  # Positive Y [verify]
        cmds.setAttr(h + ".dWorldUpVector", 0, 1, 0)
        cmds.setAttr(h + ".dWorldUpVectorEnd", 0, 1, 0)
        cmds.connectAttr(drivers[0] + ".worldMatrix[0]", h + ".dWorldUpMatrix")
        cmds.connectAttr(drivers[-1] + ".worldMatrix[0]", h + ".dWorldUpMatrixEnd")
    else:                                                     # antCGi: twist = end - start, roll = start
        md = cmds.createNode("multiplyDivide", name=name + "_twist_md")
        cmds.setAttr(md + ".input2X", -1)
        cmds.connectAttr(ctrls[0] + ".rotateX", md + ".input1X")
        cmds.connectAttr(ctrls[0] + ".rotateX", h + ".roll")
        pma = cmds.createNode("plusMinusAverage", name=name + "_twist_pma")
        cmds.connectAttr(ctrls[-1] + ".rotateX", pma + ".input1D[0]")
        cmds.connectAttr(md + ".outputX", pma + ".input1D[1]")
        cmds.connectAttr(pma + ".output1D", h + ".twist")
    cmds.setAttr(h + ".visibility", 0)
    return {"curve": crv, "handle": h, "controls": ctrls, "drivers": drivers}
```

Rules behind it: build your own degree-3 curve through the joints (antCGi KiqpzKUJKt0 [00:05:40]:
auto curves shift joints; the 2027 page says joints move to align with the given curve, so the test
measures the shift), drive it with skinned control joints rather than clusters [00:07:50], never
parent the curve under the start joint (2027 Tips: dependency loop), twist is not read from curve
controls and must be wired [00:10:49]. Mid-spine twist on ribbon joints with falloff 1, 0.5, 0.25
[00:19:45]; ribbons today pin joints with `uvPin` rather than follicles (2027 matrix doc). mGear's
alternative (Miquel Campos rDHTdhzKpvI [01:11:16]): IK spine riding on FK, both always active, no
switch.

## P10. Global scale and normalized stretch

Test: `test_rig_scale_precision.py` (the function `stretchy_ik` there is this block verbatim).

```python
def stretchy_ik(joints, ik_ctrl, start_space, global_scale_plug, name):
    """Two-bone stretch normalized by global scale. joints: start, mid, end with X down the
    bone. start_space: a transform that carries the start joint's position and the rig scale
    (the joints' follow group). Returns the nodes; the IK stays solved by the RP handle."""
    rest_len = R.v_dist(R.wpos(joints[0]), R.wpos(joints[1])) + R.v_dist(R.wpos(joints[1]), R.wpos(joints[2]))
    loc = cmds.spaceLocator(name=name + "_stretch_start")[0]
    loc = cmds.parent(loc, start_space, relative=True)[0]
    R.set_world_matrix(loc, R.m_compose(None, R.wpos(joints[0])))
    cmds.setAttr(loc + ".visibility", 0)
    dist = cmds.createNode("distanceBetween", name=name + "_stretch_dist")
    cmds.connectAttr(loc + ".worldMatrix[0]", dist + ".inMatrix1")
    cmds.connectAttr(ik_ctrl + ".worldMatrix[0]", dist + ".inMatrix2")
    base = cmds.createNode("multiplyDivide", name=name + "_stretch_base")      # rest length * global scale
    cmds.setAttr(base + ".input1X", rest_len)
    cmds.connectAttr(global_scale_plug, base + ".input2X")
    ratio = cmds.createNode("multiplyDivide", name=name + "_stretch_ratio")
    cmds.setAttr(ratio + ".operation", 2)                                      # divide
    cmds.connectAttr(dist + ".distance", ratio + ".input1X")
    cmds.connectAttr(base + ".outputX", ratio + ".input2X")
    cond = cmds.createNode("condition", name=name + "_stretch_cond")
    cmds.setAttr(cond + ".operation", 2)                                       # Greater Than
    cmds.connectAttr(ratio + ".outputX", cond + ".firstTerm")
    cmds.setAttr(cond + ".secondTerm", 1.0)
    cmds.connectAttr(ratio + ".outputX", cond + ".colorIfTrueR")
    cmds.setAttr(cond + ".colorIfFalseR", 1.0)
    lens = cmds.createNode("multiplyDivide", name=name + "_stretch_len")
    cmds.setAttr(lens + ".input1X", cmds.getAttr(joints[1] + ".translateX"))
    cmds.setAttr(lens + ".input1Y", cmds.getAttr(joints[2] + ".translateX"))
    cmds.connectAttr(cond + ".outColorR", lens + ".input2X")
    cmds.connectAttr(cond + ".outColorR", lens + ".input2Y")
    cmds.connectAttr(lens + ".outputX", joints[1] + ".translateX")
    cmds.connectAttr(lens + ".outputY", joints[2] + ".translateX")
    return {"locator": loc, "distance": dist, "base": base, "ratio": ratio, "condition": cond, "lengths": lens}
```

Structure in the test: `rig > root_ctrl > (IK and pole controls)`, `rig > skeleton_grp` following
`root_ctrl` through its offsetParentMatrix (scale included), joints under `skeleton_grp`, skinned
meshes under `rig > geo` with `inheritsTransform` off. antCGi's rules (DO6RztqbwzA [00:02:38] to
[00:07:36]): scale only groups that do not already inherit the root (else double scaling); multiply
every stretch base length by the root's scaleY (one attribute, height is the usual reference); IK
spine joints need a world-pivot scale group because segment scale compensate blocks propagation.
Check:

```python
for f in (1.24, 1.6):
    assert R.scale_test("root_ctrl", arm_joints, f)["max_error"] < 1e-3     # neutral, then a stretched pose
```

Uses `multiplyDivide`, `plusMinusAverage` and `condition`, untouched by the 2026 rename;
`addDoubleLinear` and `multiplyDoubleLinear` from old tutorials are `addDL` and `multiplyDL` now.

## P11. Reverse foot (antCGi's node network)

Test: `test_rig_foot.py`.

```python
piv = R.foot_pivots_from_mesh("body_geo", "foot_l_ik", "ball_l_ik", "toe_l_ik", ground=0.0)   # heel, toe, inner, outer
foot = R.reverse_foot(leg["ik_ctrl"], leg["handle"], "foot_l_ik", "ball_l_ik", "toe_l_ik", name="foot_l",
                      heel=piv["heel"], toe=piv["toe"], inner=piv["inner"], outer=piv["outer"])
for r in range(-40, 81, 5):                 # sweep: heel planted below 0, ball to 25, toe tip above
    cmds.setAttr(leg["ik_ctrl"] + ".footRoll", r)
```

Hierarchy (all transforms with their placement in offsetParentMatrix, so every channel rests at
zero; oriented Y up, Z heel to toe): IK control > outer > inner > heel > toe tip > {ball (leg RP
handle), toe tap (toe SC handle)}, ball SC handle (ankle to ball) under the toe tip. Network
(jXmK0Vl5iYA [00:17:58] to [00:27:29]): `condition` Less Than 0 for the heel; Greater Than 25
choosing `2*25 - roll` (plusMinusAverage subtract) or roll for the ball, clamped at 0 by a Less Than
condition; Greater Than 25 giving `roll - 25` for the toe; bank split by sign to the outer and inner
pivots' rotateZ (positive footBank rolls onto the outer edge [added]); heelTwist and toeTwist on
rotateY; toeTap (positive lifts the toes [added], antCGi translates the toe handles instead
[00:31:50]). Limits footRoll -40..80, footBank -60..60 (DO6RztqbwzA [00:24:19]). Set driven keys are
the alternative when an artist must shape the curve (antCGi finds them "quite limiting" [00:16:14]):
`setDrivenKeyframe` at 0, 25, 50 plus linear tangents and infinity. Reverse pivots must line up in
top view or the roll wobbles [00:08:56]; the heel pivot sits on the floor at the back of the heel.

## P12. Range of motion and review

Tests: `test_rig_eval.py` (`rom_keys`), `gui_rig_playblast.py` (GUI, bridge).

```python
rom = R.rom_keys([("upperarm_l_fk_ctrl", "rotateZ", [70, -40]), ("lowerarm_l_fk_ctrl", "rotateZ", [130]),
                  ("hand_l_fk_ctrl", "rotateX", [90, -90]), ("leg_l_ik_ctrl", "footRoll", [-30, 20, 60])],
                 start=1, step=8)
# headless: one Arnold sheet per pose (scenario-maya-expert mx_review), then open them
sheets = R.pose_review(["body_geo"], [p[0] for p in rom["poses"]], "/abs/out/rom")
# GUI (bridge): mx_review.playblast("/abs/out/rom/arm", start=1, end=rom["end"], display={"wireframeOnShaded": True})
```

Each test starts and ends at the rest value so poses stay isolated (AdvancedSkeleton's Animation
Tester, mTB9Yh_sWKc [00:19:50]). Weight fixes found here go to scenario-maya-deformation (its
`mx_skin` has the deformation metrics); rig behavior fixes stay here.

## P13. Lockdown and the rig gate

Test: `test_rig_check.py`.

```python
ctrls = R.find_controls("rig")                       # controller-tagged, else curve transforms with open channels
R.lockdown("rig", ctrls)                             # every non-control channel locked and hidden
R.lock_hide("lowerarm_l_fk_ctrl", ("rx", "ry"))      # FK hinge keeps its bend axis only (antCGi [00:17:55])
cmds.addAttr("leg_l_ik_ctrl.footRoll", edit=True, minValue=-40, maxValue=80)
cmds.sets(ctrls, name="all_controls")
audit = R.lockdown_audit("rig", ctrls, allowed={"lowerarm_l_fk_ctrl": ["rotateZ"]})
rep = R.rig_check(root="rig", joints=bind_joints)
assert rep["ok"] and not audit["open_internal"], (rep["errors"], audit)
```

Headless from the shell:
`python3 mx_run.py --scene rig.ma mx_rig.py -- --check rig --json out/rig_check.json`.

## P14. Evaluation: census and correctness before speed

Test: `test_rig_eval.py`.

```python
rom = R.rom_keys(tests, start=1, step=10)   # FIRST: curves with different values on every used control attribute
census = R.eval_census("rig")          # untrusted expressions, Python nodes, script nodes, ikMCsolver, FBIK,
                                       # legacy dynamics, driven frozen/nodeState, deep attribute hosts,
                                       # census["curves"] (animated, static, unkeyed), census["evaluators"]
ab = R.eval_ab(bind_joints, ["body_geo"], frames=[p[0] for p in rom["poses"]])   # DG vs EM Serial vs EM Parallel
assert not census["errors"] and ab["ok"], (census["errors"], ab["max_diff"])
prep = R.prepare_eval_graph(root="rig")   # tag untagged controls; curve manager forceAnimatedCurves=controller
gpu = R.gpu_override_census(["body_geo", "head_geo"])      # per mesh: eligible, reasons, vertices, chain; notes
```

Why curves first (Fragapane _0mb4wIZi80 [00:20:14] [01:16:10]; Using Parallel Maya 2027, Graph
Invalidation and Curve Manager Evaluator): the Evaluation Graph excludes static curves (one key, or
equal keys), so a keyless rig barely enters the graph and profiles unrealistically fast; the first
differing key then rebuilds it, which is the stutter animators feel on first keys. Remedies from the
paper: two keys with slightly different values on attributes used often, lock static channels, tag
controllers and tick Include controllers in evaluation graph (tags are saved in the rig; the
preference is the animator's), or the curve manager evaluator (`forceAnimatedCurves` none,
controller, keyed, all; static curves plus curve manager gives middle playback speed, parallel
manipulation and no rebuild on keying). Evaluator settings last for the session only. Do not
flat-key 20,000 attributes either (Fragapane [01:16:44]).

GPU Override eligibility (Using Parallel Maya 2027, GPU Override; `R.gpu_eligibility` is the pure
rule, offline-tested): a mesh needs over 2000 vertices on NVIDIA or 500 on AMD
(`MAYA_OPENCL_DEFORMER_MIN_VERTS`, 0 sends every supported chain); every node in its chain must be a
supported type (blendShape, cluster, deltaMush, ffd, morph, nonLinear, proximityWrap, sculpt,
skinCluster, softMod, solidify, tension, tweak, wire and the pass-throughs); animated
weightFunction, animated deltaMush smoothing attributes, animated original geometry (deltaMush,
morph, proximityWrap, solidify, tension), animated topology, legacy Maya Catmull-Clark smooth
preview, polySmoothFace divisions above 0, a non-relative tweak, wire holder curves, back-face
culling and unsupported display streams keep it on the CPU; a deformer shared by several geometries
drops them all if one cannot go. Since 2024 a uvPin or follicle no longer pulls a character off the
GPU. The GUI truth: Evaluation HUD with a non-zero k count; "Enabled (0 k)" means nothing is on the
GPU, then `deformerEvaluator -meshes`. Maya 2027.2 known issue: crash when scrubbing with GPU
Override on. Apple GPUs are not described by the paper [verify on this Mac]. Tests:
`test_rig_eval.py` (census, curves, prepare_eval_graph, GPU census), `test_rig_probe.py` (evaluator
and attribute names), `test_rig_offline.py`. Order (Using Parallel Maya 2027): make DG, Serial and
Parallel agree first; if Serial fixes a difference suspect threading, if not the graph (Analysis
Mode, `dbtrace -k evalMgrGraphValid`, Serial only). Then profile in the GUI (Windows > General
Editors > Profiler; no tested snippet: see gui-paths.md), save dated profiles and compare (Miquel
Campos NfYAaK3wtQs [00:05:26]), test with three referenced characters, GPU Override on and off.
Whether mayapy runs the Evaluation Manager is recorded by `test_rig_probe.py`.

## P15. Game skeleton contract

Test: `test_rig_game.py` (run with `--plugins fbx`).

```python
rep = R.game_skeleton_check("root", ["body_geo"], max_influences=4, budget=80,
                            required=["root", "pelvis", "spine_01", "spine_02", "spine_03"])
assert rep["ok"], rep["problems"]
```

Checks: one root joint at the origin, world oriented (Unreal: the root is the skeletal mesh pivot);
only joints below it (helpers and constraints elsewhere, antCGi 7R_0omGY-Ms [00:05:04]); unique
names without namespaces (antCGi fGacyVzJGIU [00:17:15]); count within budget; required names; scale
1; influences per vertex within the limit and weights normalized (Unity default 4). The same test
probes whether constraint-driven and offsetParentMatrix-driven bind joints keep their animation
through an FBX round trip; until it passes, game rigs blend by constraint. The export itself (FBX
version 2020.2, one clip per file for Unreal, triangulation in Maya) belongs to
scenario-maya-pipeline-scripting.

## P16. Precision far from the origin

Test: `test_rig_scale_precision.py`.

```python
dev = R.precision_test("rig", ["body_geo"], distances=(1e3, 1e5, 1e6))   # cm deviation per distance
```

Fragapane (rfLEBgOEW1A [01:41:55] to [01:53:38]): skinning happens in world space, so a rig 1e5 to
1e6 units from the origin flickers whatever the joint orients; gate at the distance the shots use.
Fix when it matters: localize the skinCluster (multMatrix of each influence's world matrix with the
rig group's worldInverseMatrix into `skinCluster.matrix[i]`, bind pre-matrices recomputed, mesh
under the group); it breaks the paint tools, so switch back to world space for painting [01:53:38].
No tested snippet for the localization yet: build it with scenario-maya-deformation and test before
shipping.

## Auto-riggers (no tested code yet)

- **Quick Rig and HumanIK:** Rigging menu set > Skeleton > Quick Rig; One-Click, then delete the
  QuickRigCharacter and redo Step-By-Step: Imperfect Mesh, resolution 256, guides fixed and
  mirrored, T-Stance Correction on for A-stance models, Skeleton and Control Rig, Geodesic Voxel
  skin (Maya Learning Channel c538zkwxgTQ [00:01:52] to [00:04:21]). The Python source is
  `maya/app/quickRig/quickRigUI.py` (`computeJointOrients()` holds the orientation logic, 2027
  Help); `test_rig_probe.py` records whether it imports headless and which HumanIK MEL procedures
  exist. HumanIK contract: 15 required nodes, no numbering gaps, strict T-stance (faces +Z, left arm
  +X, palms down), Reference locator, segment scale compensate off; `R.tstance_check(positions)`
  tests the stance numerically.
- **mGear Shifter:** guide template plus custom steps plus data (`.jSkin` packs, RBF, SHAPES)
  rebuilt every time; order: gimmick joints and face before skin import (mGear docs). Python entry
  points (`mgear.core.skin.importSkinPack`, `mgear.rigbits.addBlendedJoint`, facial riggers'
  `rig_from_file`) are from the docs [verify on the installed mGear]; the probe notes whether mGear
  is installed.
- **AdvancedSkeleton:** MEL; read `AdvancedSkeleton5.mel` for the procedures behind Build, Toggle
  Fit, Rebuild and Convert to BlendShapes Only [verify]; fit joints carry behavior through joint
  labels and extra attributes (mTB9Yh_sWKc [00:08:18]).
