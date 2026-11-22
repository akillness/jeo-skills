# Tested procedures (Blender 5.2.1 LTS, headless)

Every block here was run with `blender --background --factory-startup --python <test>` on 5.2.1.
Test scripts (kept, rerun them after any change):

- `tests/code/blender-animation/test_bx_anim.py` (58 checks: module, ball, measurement, layers,
  gravity units, flips)
- `tests/code/blender-animation/test_rigify_jump.py` (19 checks: generated Rigify human, jump
  blocking to spline, knee pop, flips, balance, renders)
- `tests/code/blender-animation/test_procedures.py` (15 checks)
- `tests/code/blender-animation/test_staging.py` (17 checks: world squash vs the v1 rig, one gravity
  per shot, projection, staging_report, Workbench light and floor traps, pinwheel aliasing)
- `tests/code/blender-animation/test_ball_shot.py` (11 checks: a full E3-style ball shot with the
  staging loop and the review pack)

Blocks marked "verbatim" are copied from `# --- Pn begin/end` markers in those scripts.

Renders from the last run are in `tests/code/blender-animation/out/` (ball onion skins, curve plots,
jump pose strips, playblasts; `out/staging/` shadow probes; `out/ball_shot/` the full shot:
playblast, contact sheets, onion skin through the camera, curve plot, .blend).

Import pattern:

```python
import sys
sys.path.append("<skills>/scenario-blender-animation/scripts"); sys.path.append("<skills>/scenario-blender-expert/scripts")
import bx_anim as A, bx_review
```

## bx_anim API (one line each; docstrings have the details)

| Function                                                                                                                        | Does                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ensure_action(idb)` / `channelbag(idb, create)` / `fcurves(idb, bones, exclude_bones, data_paths)`                             | slotted-action access; slot named after the ID; filter F-curves by bone or path                                                                                                       |
| `key_frames(idb, bones, keytypes)`                                                                                              | frames that carry keys (optionally only key poses: `A.POSE_TYPES`)                                                                                                                    |
| `key_pose(idb, pose, frame, keytype, interpolation='CONSTANT', handle)`                                                         | key a pose dict (object props, bone dicts, custom props, `{index: v}` single channels)                                                                                                |
| `capture_pose(obj, bones)`                                                                                                      | current local transforms as a pose dict (pose library as data)                                                                                                                        |
| `world_pose(obj, bone, translate, rotate, pivot, frame)`                                                                        | channel values for a world-space move or rotation about any pivot                                                                                                                     |
| `set_interpolation(idb, interpolation, frames, bones, data_paths, handle, easing, keytype)`                                     | per-key interpolation / handle / easing on a frame range                                                                                                                              |
| `fill_key_columns(idb, bones, frames, create_missing)`                                                                          | key every channel of the body on every key-pose frame                                                                                                                                 |
| `auto_holds(frames, transition, interpolate, transitions, all_frames)`                                                          | hold intervals `pose -> next - transition`                                                                                                                                            |
| `hold_copy(idb, holds, bones)`                                                                                                  | pillars: copy each pose to its hold end (never overwrites a key)                                                                                                                      |
| `spline(idb, bones, handle)` / `blocking_to_spline(idb, body_bones, holds, transition, interpolate)`                            | Bezier on the body only; the full Rik conversion                                                                                                                                      |
| `breakdown(idb, frame, prev, next, factor, bones, factors)`                                                                     | hand breakdown, per-bone favoring, quaternion slerp                                                                                                                                   |
| `ease_inbetweens(idb, a, b, frames, mode='slow_in'/'slow_out', ratio=0.8)`                                                      | Pablo's 20/80 rule                                                                                                                                                                    |
| `offset_keys(idb, frames, bones, data_paths)` / `add_cycles(idb, bones, data_paths, mode)`                                      | overlap offsets; Cycles REPEAT / REPEAT_OFFSET (replaces existing)                                                                                                                    |
| `push_layer(idb, name, blend='ADD')`                                                                                            | NLA base strip + additive action on top                                                                                                                                               |
| `hold_drift(idb, holds, bones)` / `overshoots(idb, bones)` / `transitions(idb, bones, data_paths)`                              | curve checks: dead holds, handle overshoot, move lengths between holds                                                                                                                |
| `sample_world(obj, frames, bone, point)` / `motion_path(obj, f0, f1, bone)`                                                     | world positions per frame (sampling or Blender's own path)                                                                                                                            |
| `lowest_point(objs, frames)` / `foot_slip(obj, bone, ranges, ball=...)`                                                         | floor contact and penetration; planted-foot slide and lift (`ball`: the toe, the smaller drift of the two)                                                                            |
| `foot_contacts(obj, bones, frames, height, min_frames, onset)` / `slip_summary(slips, tolerance)`                               | planted ranges read from dense keys; median, p95 and worst slide over many ranges (P19)                                                                                               |
| `to_camera(points, camera, res)`                                                                                                | camera-space projection; pass `res=(w, h)` for pixels before measuring angles (0..1 coordinates squeeze x by the aspect and invent sharp turns at apexes)                             |
| `motion_report(points, frames, dims)` / `format_report(rep, table)`                                                             | spacing, velocity, holds, moves with ease shape, sharp turns, arc wobble, pops, start-stops; ASCII spacing chart                                                                      |
| `ballistic_fit(points, frames)` / `gravity(fps)`                                                                                | parabola fit of an airborne path: `accel` (units/s^2), `accel_per_frame2`, `quad_coeff_per_frame2` (half the acceleration), `g_ratio`, residual; `gravity` gives the reference values |
| `limb_extension(obj, chain, frames, threshold=0.99)`                                                                            | knee or elbow pop: extension ratio and bend per frame, straight, stretched (> 1.0) and fast-bend-near-straight frames                                                                 |
| `rotation_flips(idb, bones)` / `fix_rotation_flips(idb, bones)`                                                                 | Euler jumps over 180 degrees, quaternion sign flips, turns over 90 degrees per frame; repair on keys                                                                                  |
| `balance_report(objs, frames, floor_z, contact_tol)`                                                                            | COG (volume centroid) against the support polygon per frame: margin, airborne, off-balance frames                                                                                     |
| `staging_report(objs, frames, camera, shadow_frames, out_dir)` / `format_staging(rep)`                                          | subject size in frame, action coverage, entry, end margin, cut frames, rendered shadow probe; plain-language `flags`                                                                  |
| `playblast_lighting(key_dir)` / `floor_slab(...)`                                                                               | Workbench MATCAP look with a world-space key converted to camera space; closed floor                                                                                                  |
| `rotation_texture(obj, sectors)` / `roll_aliasing(obj, frames, sectors)`                                                        | pinwheel with a marker wedge; wagon-wheel check                                                                                                                                       |
| `squash_modifier(obj)`                                                                                                          | world-aligned volume-kept squash and stretch (GN) on the object itself; keyable paths                                                                                                 |
| `audio_envelope(path, start_frame)` / `accent_frames(env, floor, min_gap, count)`                                               | per-frame loudness; syllable peaks and accents                                                                                                                                        |
| `onion_skin(out, frames, objects, camera, view, track, highlight, spread)`                                                      | onion-skin contact image with projected tracks and frame numbers                                                                                                                      |
| `graph_image(out, idb, bones, data_paths)`                                                                                      | curve plot with key-type colored keys (the agent's Graph Editor)                                                                                                                      |
| `bouncing_ball(obj, weight, start, end, contacts, height, rebound, travel, first_apex, fit, hold, burst, contact_handles, ...)` | one-object ball animation: one gravity, whole-frame contacts, odd or even flights, world squash, roll = distance / radius                                                             |

Conventions: a key's interpolation governs the segment after it. `key_pose` writes into the
channelbag directly (no 3D view, no preferences); on an ADD layer the values are deltas. Never keep
a Keyframe reference across an insert on the same F-curve.

---

## P1 Shot setup (verbatim, test_procedures.py)

```python
sc.render.fps, sc.render.fps_base = 24, 1.0          # film/series; games often 30
sc.frame_start, sc.frame_end = 1, 53
sc.camera.data.show_passepartout = True
sc.camera.data.passepartout_alpha = 0.99             # Alex Nagy: darken outside frame
se = sc.sequence_editor_create()
snd = se.strips.new_sound("dialogue", WAV, channel=1, frame_start=1)
snd.show_waveform = True
sc.use_audio_scrub = True                            # GUI sessions
sc.sync_mode = "AUDIO_SYNC"                          # Rik: real-time playback with sound
sc.render.use_simplify = True
sc.render.simplify_subdivision = 0                   # Tony Garcia: judge at real speed
sc.render.use_stamp = True
sc.render.use_stamp_frame = True                     # frame counter on review renders
sc.render.ffmpeg.audio_codec = "AAC"                 # playblast carries the dialogue
```

Verified on 5.2.1. A sound-only sequencer does not replace the 3D render; the playblast MP4 had both
a video and an AAC audio stream (ffprobe).

## P2 Stepped key-pose blocking on a rig (verbatim, test_rigify_jump.py)

Pose in world terms, compute every pose from the rest pose before keying anything (no compounding,
no stale evaluation), then key stepped with key type EXTREME. Forward is -Y for Rigify; `proxies`
are the meshes to render, `OUT` an output folder.

```python
X = lambda deg: Euler((math.radians(deg), 0, 0))    # world rotation about X (+ = lean forward)
POSES = {  # frame: (torso offset, lean deg, arm swing deg (+ = back), foot (y, z)); forward is -Y
    1: ((0, 0, -0.03), 0, 0, (0, 0)),                # stand, knees soft (rest legs are 99.6% straight)
    9: ((0, 0.05, -0.28), 22, 45, (0, 0)),           # anticipation: crouch, arms back
    13: ((0, -0.10, -0.01), 12, -120, (0, 0)),       # push-off: extended, just short of straight
    20: ((0, -0.35, 0.42), 0, -150, (-0.30, 0.52)),  # apex centered in the air time, knees tucked
    27: ((0, -0.60, -0.02), 10, -80, (-0.60, 0)),    # landing contact
    31: ((0, -0.58, -0.30), 25, -55, (-0.60, 0)),    # absorb, deeper than the anticipation
    39: ((0, -0.60, -0.01), -3, -12, (-0.60, 0)),    # recover with a small overshoot up
    45: ((0, -0.60, -0.03), 0, 0, (-0.60, 0)),       # settle, knees soft
}
pose_dicts = {}                                      # every pose from the REST pose, before keying
for f, (t, lean, swing, foot) in POSES.items():
    pose = A.world_pose(rig, "torso", translate=t, rotate=X(lean))
    for s, sign in (("L", 1), ("R", -1)):
        down = Euler((0, math.radians(70 * sign), 0)).to_matrix()   # T-pose arms down
        pose.update(A.world_pose(rig, f"upper_arm_fk.{s}", rotate=X(swing).to_matrix() @ down))
        pose.update(A.world_pose(rig, f"foot_ik.{s}", translate=(0, foot[0], foot[1])))
        pose[f"forearm_fk.{s}"] = {"rotation_quaternion": Euler((math.radians(-25), 0, 0)).to_quaternion()}
    pose_dicts[f] = pose
for s in ("L", "R"):
    A.key_pose(rig, {f"upper_arm_parent.{s}": {'["IK_FK"]': 1.0}}, 1, keytype="EXTREME")  # FK arms
for f, pose in pose_dicts.items():
    A.key_pose(rig, pose, f, keytype="EXTREME")      # stepped (CONSTANT) by default
A.onion_skin(os.path.join(OUT, "jump_blocking_poses.png"), sorted(POSES), objects=proxies,
             view="right", res=(420, 520), spread=300, highlight=sorted(POSES))   # pose strip
```

Verified: world_pose reproduced the offset between the stand and the anticipation exactly after
keying; the pose strip is `tests/code/blender-animation/out/jump_blocking_poses.png`. The Rigify
rest legs are 99.6% straight, so the stand and settle poses lower the torso 3 cm (soft knees); the
first draft raised it 2 to 6 cm and `limb_extension` measured the IK stretch at 1.18.

## P3 Blocking+ (verbatim, test_bx_anim.py)

```python
A.breakdown(r2, 5, 1, 9, factor=0.5, factors={"hand": 0.25})   # COG in the middle, hand delayed
fr = A.ease_inbetweens(ob, 1, 9, [3, 5, 7], mode="slow_in")    # 0.8, 0.96, 0.992 of the way
```

`mode="slow_out"` mirrors it (0.008, 0.04, 0.2). Verified: slow_in gave 8.0, 9.6, 9.92 on a 0 to 10
move, slow_out 0.08, 0.4, 2.0; in-betweens stay CONSTANT and are typed BREAKDOWN; the quaternion
breakdown is a true slerp (w = cos 22.5 deg at 0.25 of a 180 deg turn).

Handles, measured with `A.overshoots` on keys 0, 4, 4, 0 at frames 1, 9, 17, 25: AUTO_CLAMPED no
overshoot; AUTO overshoots the 9 to 17 hold by 1.0 (25%); VECTOR none. That AUTO bulge is what Alex
Nagy exploits for a pushed pose or a settle:
`A.set_interpolation(obj, frames=(f, f), handle="AUTO")` on the key inside a hold (same call as in
the test, per-key range).

Take-off breakdown on the jump (verbatim, test_rigify_jump.py):

```python
# Blocking+ (still stepped): after take-off the body is ballistic (about 2/3 of the rise in
# 3 of the 7 rising frames); the feet must follow or the IK legs stretch (limb_extension
# measured 1.10 without this key)
A.breakdown(rig, 16, 13, 20, factor=0.67, bones=body, factors={"foot_ik.L": 0.6, "foot_ik.R": 0.6})
```

Verified: without it the legs stretched to 1.10 over frames 14 to 17 (the torso splines up faster
than the flat-handled feet); with it and a VECTOR take-off (P4) the maximum is 0.992 at frame 14 and
nothing stretches.

## P4 Blocking to spline (verbatim, test_rigify_jump.py)

```python
# 13 -> 20 -> 27 -> 31 is one continuous move (push-off, air, landing, absorb): no pillars
holds = A.blocking_to_spline(rig, body, transition=3, interpolate={13, 20, 27})
A.set_interpolation(rig, frames=(27, 27), bones=["foot_ik.L", "foot_ik.R"], handle="VECTOR")  # hard contact
A.set_interpolation(rig, frames=(13, 13), bones=["foot_ik.L", "foot_ik.R"], handle="VECTOR")  # hard take-off
drift = A.hold_drift(rig, holds, body)                # dead holds: worst change ~0
over = A.overshoots(rig, body)                        # [] unless a settle is wanted
slip = A.foot_slip(rig, "foot_ik.L", [(1, 13), (27, 48)])   # planted: slide and lift ~0
face_stepped = all(k.interpolation == "CONSTANT" for fc in A.fcurves(rig, face) for k in fc.keyframe_points)
```

With `body` = torso, chest, hips, neck, head, both IK feet, FK upper arms and forearms, and the two
`upper_arm_parent` bones (IK_FK switch); face = `jaw_master`. Result: holds [(1, 6), (9, 10), (31,
36), (39, 42)], worst hold drift 0.0, no overshoot, feet slide and lift 0.0 m, face still CONSTANT.

Measured: with a pillar on the landing (`interpolate={13, 20}`) the torso's speed at contact was
0.007 m/frame, without it 0.101. Hand breakdowns (the take-off key at 16) stay breakdowns:
`fill_key_columns` gives a filled key its column's type, so `auto_holds` never pillars a breakdown
column (it did before v2). VECTOR on the foot contact raised the foot's last gap before contact from
0.030 to 0.117 m. On a toy rig (test_bx_anim.py) the naive whole conversion drifted 0.84 of the next
move across a hold; pillars kept 0.0 and the move completed in the 3 chosen frames (0, 0.259, 0.741,
1.0).

Subset splining in general: `A.spline(rig, bones=body)` leaves every other channel alone;
`A.set_interpolation(rig, "BEZIER", bones=face_bones)` splines the face after lip-sync sign-off.

## P5 Walk: planted heel and root travel (verbatim, test_procedures.py)

```python
# planted heel: its forward curve must be a straight line during contact (Joey Carlino)
A.set_interpolation(foot, frames=(0, 0), data_paths=["location"], handle=handle_on_contact)
A.set_interpolation(foot, frames=(20, 20), data_paths=["location"], handle=handle_on_contact)
A.add_cycles(foot)                                        # limbs: REPEAT
# root travels exactly the planted foot's distance, linear, repeating with offset
step = 0.6                                                # |y(0)| + |y(20)|
A.key_pose(root, {"location": {1: 0.0}}, 0, interpolation="LINEAR")
A.key_pose(root, {"location": {1: -step}}, 20, interpolation="LINEAR")
A.add_cycles(root, mode="REPEAT_OFFSET")
```

Foot keys (root space, walking toward -Y): (0, -0.3, 0), (20, +0.3, 0), (30, 0, 0.12), (40, -0.3,
0). Measured world slip in the second cycle's contact: VECTOR 0.0, AUTO_CLAMPED 5.8 cm. The planted
foot slides opposite to the travel in root space; the reverse makes the character moonwalk (Rik
fixes pasted keys with a Y scale of -1). Head lag: `A.offset_keys(rig, 2, bones=["head"])` with
Cycles wraps cleanly (verified: offset of 2 frames evaluated identically one cycle later).

## P6 Lip sync, jaw pass from audio (verbatim, test_procedures.py)

```python
env = A.audio_envelope(WAV, start_frame=1)                     # frame -> loudness 0..1
peaks = A.accent_frames(env, floor=0.2, min_gap=4)
BIG, SMALL = math.radians(18), math.radians(6)
A.key_pose(jaw, {"rotation_euler": {0: 0.0}}, 1)
first = peaks["syllables"][0]
A.key_pose(jaw, {"rotation_euler": {0: SMALL * 0.5}}, first - 3)  # open a little before the line (inhale)
for f in peaks["syllables"]:
    big = f in peaks["accents"]
    A.key_pose(jaw, {"rotation_euler": {0: BIG if big else SMALL}}, f - 1,   # shape just before the sound
               keytype="EXTREME" if big else "KEYFRAME")
    A.key_pose(jaw, {"rotation_euler": {0: SMALL * 0.3}}, f + 2, keytype="BREAKDOWN")
A.key_pose(jaw, {"rotation_euler": {0: 0.0}}, max(env) - 2)   # stepped (CONSTANT) until approved
```

Verified on a synthetic line with 8 syllables, 3 stressed: syllables [7, 11, 15, 20, 26, 30, 35,
41], accents [11, 26, 41]. The one-frame lead is a starting point [added]: Rik gives no global lead
and retimes per phoneme (F, OO, W and closures formed before the sound). Angles are placeholders;
use the rig's jaw range. Next passes (Rik): corners (in when the jaw opens, never dead center,
slight asymmetry), shapes from a library (P12) on the lower face minus the jaw, accents, tongue (one
middle control first), then spline the face. Phoneme timings need an external aligner (for example
Rhubarb Lip Sync or Montreal Forced Aligner) [added]; the envelope alone gives rhythm and accents,
not phonemes.

## P7 Facial timing check (verbatim, test_procedures.py)

```python
dart = A.transitions(eyes, data_paths=["location"])["location[0]"]
slow_darts = [t for t in dart if t[2] > 2]                     # Rik: eyes dart in 1 to 2 frames
brows = A.transitions(brow, data_paths=["location"])["location[2]"]
bad_brows = [t for t in brows if not 3 <= t[2] <= 10]         # brows change over 3 to 10 frames
```

Verified: darts [(20, 22, 2), (40, 41, 1)] pass; a 1-frame brow pop is flagged. Same call checks
snappy body transitions (2 to 3 frames) and plosive holds (closed for at least 2 frames).

## P8 Contact pin with animated influence (verbatim, test_procedures.py)

```python
pb = rig.pose.bones["elbow"]
pin = pb.constraints.new("COPY_LOCATION")                     # not Copy Transforms
pin.name, pin.target, pin.subtarget = "Pin", rig, "helper"   # helper keyed where the elbow rests
path = 'constraints["Pin"].influence'
A.key_pose(rig, {"elbow": {path: 0.5}}, 1, interpolation="BEZIER")   # 0.5 keeps a little give
A.key_pose(rig, {"elbow": {path: 0.5}}, 12, interpolation="BEZIER")
A.key_pose(rig, {"elbow": {path: 0.0}}, 16, interpolation="BEZIER")  # contact breaks
```

Verified: influence 0.5 held, 0 after frame 16, and the elbow returns to its own animation. Rik uses
this when manual keys keep fighting the IK pole and stretch.

## P9 Slots when reusing an action (verbatim, test_procedures.py)

```python
act = hero.animation_data.action
prop.animation_data_create()
prop.animation_data.action = act                      # does NOT animate yet: no slot picked
if prop.animation_data.action_slot is None:
    prop.animation_data.action_slot = act.slots.new(id_type="OBJECT", name=prop.name)
# or reuse one on purpose: prop.animation_data.action_slot = act.slots["OBHero"]
```

Verified: Blender picks a slot automatically only by name (the ID's name or its last used slot);
keep one slot name per character across takes (module talk, BCON25).

## P10 Layering in 5.2 (verbatim, test_bx_anim.py)

```python
A.key_pose(ob, {"location": (0, 0, 0)}, 1, interpolation="LINEAR")
A.key_pose(ob, {"location": (0, 0, 2)}, 11, interpolation="LINEAR")
lay = A.push_layer(ob, "noise", blend="ADD")          # COMBINE for quaternion rigs
A.key_pose(ob, {"location": {0: 0.0}}, 1, interpolation="LINEAR")
A.key_pose(ob, {"location": {0: 0.5}}, 11, interpolation="LINEAR")   # a delta on top
```

Verified: result at frame 11 = (0.5, 0, 2); `lay.layers.new()` raises "An Action may not have more
than one layer"; `ob.keyframe_insert` on the ADD layer stored the remapped delta (posed 2.5 over a
base of 2.0 stored 0.5).

## P11 Pose propagation on dense or baked keys (verbatim, test_procedures.py)

```python
def propagate(idb, frame, deltas, back=10, fwd=10, data_paths=None):
    """Nacho de Andres / Raymond Luc: change a pose on dense (baked, mocap) keys and
    spread the change over a range with a smooth falloff instead of re-keying."""
    for fc in A.fcurves(idb, data_paths=data_paths):
        d = deltas.get((fc.data_path, fc.array_index))
        if not d:
            continue
        for k in fc.keyframe_points:
            x = k.co.x - frame
            r = back if x < 0 else fwd
            if abs(x) < r:
                t = 1 - abs(x) / r
                w = t * t * (3 - 2 * t)                       # smoothstep
                k.co.y += d * w
                k.handle_left.y += d * w
                k.handle_right.y += d * w
        fc.update()


before = [A.channelbag(ob).fcurves[0].evaluate(f) for f in (20, 30, 40, 50)]
propagate(ob, 30, {("location", 2): -0.25}, back=10, fwd=10)
```

Verified: full delta at frame 30, untouched at 20 and 40 and beyond.

## P12 Pose library as data, partial blend (verbatim, test_procedures.py)

```python
def apply_library_pose(obj, pose, frame, factor=1.0, bones=None, keytype="KEYFRAME"):
    """Blend a stored pose onto a bone subset (Rik: lower face minus the jaw, then dial
    the shape back; a full F or M is too big inside a sentence)."""
    bones = bones or list(pose)
    bpy.context.scene.frame_set(frame)                # read the pose as it is at that frame
    cur = A.capture_pose(obj, bones)
    blended = {}
    for b in bones:
        if b not in pose:
            continue
        blended[b] = {}
        for prop, target in pose[b].items():
            now = cur[b][prop]
            blended[b][prop] = tuple(n + (t - n) * factor for n, t in zip(now, target))
    A.key_pose(obj, blended, frame, keytype=keytype)


apply_library_pose(face, LIB["F"], 12, factor=0.4, bones=["lip_up", "lip_low"])  # jaw excluded
```

Build library poses from an animation default pose, at maximum range, one side at 3/4 then mirrored,
hands included, never eyes or the head hinge (Pablo, Rik). Lerping quaternion tuples is fine for
small blends; slerp for large ones. `poselib.apply_pose_asset(blend_factor=...)` exists but needs an
asset context (not run headless).

## P13 Playblast with audio (test_procedures.py)

```python
sc.render.ffmpeg.audio_codec = "AAC"                  # with the P1 sound strip
mp4 = bx_review.playblast("/abs/out/shot.mp4", res_pct=50)   # Workbench, scene camera
```

Light it first so contacts read: `A.playblast_lighting(key_dir=(0, 0, 1))` (P18). Verified: ffprobe
shows video + audio. Then look at it:
`ffmpeg -i shot.mp4 -vf "select='eq(n\,12)+eq(n\,19)',tile=2x1" -frames:v 1 sheet.png` and open the
sheet.

## P14 Rotate about a contact point (verbatim, test_procedures.py)

```python
contact = rig.matrix_world @ rig.pose.bones["hand"].tail   # the point that must not move
tilt = Euler((0.0, 0.0, 0.0))
tilt.x = math.radians(30)
A.key_pose(rig, A.world_pose(rig, "hand", rotate=tilt, pivot=contact), 10, keytype="EXTREME")
```

Verified: the contact moved 1e-7 m while the wrist moved 8 cm. This is Rik's glass-on-the-table
pivot (3D cursor as pivot) without a viewport.

## P15 Measurement loop (verbatim, test_rigify_jump.py)

```python
frames = list(range(1, 49))
torso_pts = A.sample_world(rig, frames, bone="torso")
print(A.format_report(A.motion_report(torso_pts, frames)))
cam2d = A.to_camera(torso_pts, sc.camera, res=(1920, 1080))   # camera pixels: angles stay true
print(A.format_report(A.motion_report(cam2d, frames, dims=2)))
air = list(range(14, 27))                            # feet off the ground
bal = A.ballistic_fit([torso_pts[f - 1] for f in air], air)
low = A.lowest_point(proxies, frames)                # floor contact / penetration per frame
A.onion_skin(os.path.join(OUT, "jump_onion_side.png"), frames[::2], objects=proxies, view="right",
             res=(1000, 700), track=[(rig, "torso", "head"), (rig, "hand_fk.L", "tail"),
                                     (rig, "foot_ik.L", "head")], highlight=sorted(POSES))
A.onion_skin(os.path.join(OUT, "jump_spline_strip.png"), frames[::3], objects=proxies,
             view="right", res=(420, 520), spread=110, track=[(rig, "torso", "head")])
A.graph_image(os.path.join(OUT, "jump_graph_torso.png"), rig, bones=["torso"], data_paths=["location"])
mp4 = bx_review.playblast(os.path.join(OUT, "jump_playblast.mp4"), res_pct=50)
```

Reading `format_report` (real output, the P16 ball, world space):

```
move 1-47 (46 fr, dist 3.88): eases out of start and into end; peak spacing 0.2216 at f11 (23% through), first/last 0.29/0.02
   |oooo-oo-o--o-o--o--o---o-o-o-oooooooooo-o-o-o-ooooooooooooooo|
sharp turns: f12 (144.9 deg), f27 (139.6 deg), f37 (133.8 deg), f44 (81.3 deg)
arc wobble (curvature flips): f46
pops: 43->44
```

Sharp turns should sit exactly on contacts and hits; wobble inside a flight or a swing means a lumpy
arc (here only the settle jiggle after the last contact); the pop into f44 is the last impact
handing over to a slow roll, expected; a start-stop inside a move means a missing or misplaced
breakdown; "constant spacing" means mechanical motion. On the splined jump the hand showed sharp
turns at 8, 11, 12 and 20, a pop at 11 to 12 and a start-stop at 19: the arm swing needs breakdowns
through the bottom of its arc (still open in the worked example). `motion_path` returns the same
points as `sample_world` (verified for objects and bones, max difference < 1e-5 m). The default hold
threshold is 1e-3 x the path extent (3.5 mm on a 3.5 m path): pass `hold_eps` to see a small settle.
Camera space: with `to_camera(..., res=(1920, 1080))` the ball's sharp turns are exactly the
contacts; with 0..1 coordinates the same path also showed false turns at the apexes f32, f40, f41
(aspect squeeze).

## P16 Bouncing ball on one object (verbatim, test_bx_anim.py)

```python
res = A.bouncing_ball(weight=0.7, start=1, end=48, contacts=4, height=1.2, radius=0.15, travel=2.0)
ball = res["object"]                        # every channel lives on this one object
A.onion_skin(os.path.join(OUT, "ball_onion.png"), range(1, 49), objects=[ball], view="front",
             track=[(ball, None, "head")], highlight=res["contacts"])
```

Result: contacts [12, 27, 37, 44], flights 11, 15, 10, 7 frames (odd allowed), real apex heights
1.2, 0.549, 0.239, 0.115 m for 1.2, 0.546, 0.248, 0.113 requested, gravity_ratio 1.19 (fit=True
squeezes four bounces into 48 frames; use fit=False for real gravity). Channels, all on the one
object: location x, y, z, rotation_euler[1], and the Squash and Aim inputs of the `Squash` GN
modifier (`res["paths"]`). Verified: every flight is the analytic parabola of one gravity (residual
4e-7), contact bottoms exactly on the floor (9e-9), the evaluated mesh never below the floor at
quarter frames (2e-6), sharp turns exactly at the contacts. `burst=0.6` widened the last pre-contact
gap from 0.141 to 0.216 m and the path stayed on the arc (0.0 deviation); `contact_handles='VECTOR'`
deviates 0.09 m from a parabola; `weight='light'` vs `'heavy'`: second apex 0.78 vs 0.48 m, contact
squash 0.69 vs 0.88.

Measured against the v1 rig (root, aiming squash empty, rolling child; kept in
`skills/_versions/blender-animation v1 2026-09-24/`), test_staging.py, E3 inputs (drop 1.03 m,
rebound 0.405, heavy, real gravity):

|                            | v1                                 | v2                                                                 |
| -------------------------- | ---------------------------------- | ------------------------------------------------------------------ |
| Pattern twist from the aim | up to 55.3 degrees, over 36 frames | 0 (unsquash of the evaluated mesh = roll of the rest mesh, 3e-7 m) |
| Flights after the first    | 14, 8, 6 (even only)               | 14, 9, 6                                                           |
| Gravity ratio per flight   | 1.035, 1.312, 0.975                | 1.017, 1.017, 1.017                                                |
| Stretch axis vs velocity   | not aligned with the texture       | 0.03 degrees                                                       |
| Animated objects           | 3 (root, squash empty, mesh)       | 1                                                                  |

`obj=` animates an existing mesh (radius from its size, verified on a named `ANIM_ball`). The weight
mapping (rebound 0.7 to 0.35, squash 0.35 to 0.08, stretch 0.25 to 0.04, friction 0.9 to 0.7) is
[added]: the heavy end moved from 0.25 to 0.35 after the E3 run, where 0.25 left a 1.6 cm third hop
and about 0.4 read heavy but visible. The BOUNCE easing (two keys) was measured to place its
contacts between frames (lowest sampled heights 0.013, 0.013, 0.004), so no squash frame is ever
shown.

## P17 Knee pop, rotation flips, balance (verbatim, test_rigify_jump.py)

```python
legs = {s: A.limb_extension(rig, [f"ORG-thigh.{s}", f"ORG-shin.{s}"], frames) for s in ("L", "R")}
flips = A.rotation_flips(rig, bones=body)             # quaternion sign flips, Euler jumps, fast turns
bal = A.balance_report(proxies, frames)               # COG over the support polygon
```

Verified on the generated Rigify jump (proxy boxes plus heel-to-toe soles, so the support polygon is
the real footprint): legs peak at 0.992 of full length (frame 14, just after take-off), never
stretched; fast bends near straight at the push-off, the landing absorb and the recovery are listed
for review, not failures; no rotation flips; COG margin +3.9 cm standing and settled, +0.9 cm at the
push-off; frames 14 to 26 airborne. Deliberate faults were caught: the torso pushed 0.4 m forward
over planted feet gave a margin of -0.15 m; raised 0.25 m it gave an extension of 1.22 (straight and
stretched). In test_bx_anim.py a quaternion key stored with the wrong sign was found (sign flip plus
147 degrees per frame turns) and a 350 degree Euler key meant as -10 was found; `fix_rotation_flips`
repaired both and kept the pose. Thresholds 0.99 and 20 degrees per frame are [added]; the flip rule
and COG-over-support are digest checklist items (Alex Nagy builds COG then feet with the weight over
the support foot).

## P18 A ball shot staged and reviewed (verbatim, test_ball_shot.py)

```python
# 1. animation: real gravity (fit=False), enters already falling from off-screen left
res = A.bouncing_ball(name="ANIM_ball", start=1, end=72, contacts=4, height=0.95, rebound=0.42,
                      weight="heavy", radius=0.15, travel=2.4, origin=(-1.6, 0.0), first_apex=-3,
                      fit=False, hold=6, floor_plane=False)
ball = res["object"]
floor = A.floor_slab("floor", x=(-40.0, 40.0), y=(-2.5, 60.0))   # closed, starts before the camera
frames = list(range(1, res["end"] + 1))


# 2. staging: measure a camera, change it, measure again
def camera(name, loc, target, lens):
    cam = bpy.data.objects.new(name, bpy.data.cameras.new(name))
    sc.collection.objects.link(cam)
    cam.location, cam.data.lens = loc, lens
    cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    cam.data.show_passepartout, cam.data.passepartout_alpha = True, 0.99
    return cam


wide = camera("CAM_wide", (0.0, -6.94, 1.9), (0.0, 0.0, 0.85), 50)     # the E3 framing
sc.camera = wide
bpy.context.view_layer.update()
rep_wide = A.staging_report([ball], frames)
x_end = A.sample_world(ball, [res["end"]])[0].x
frame_w = 3.1                                   # frame width at the ball plane (m)
cx = x_end - 0.18 * frame_w                     # rest pose at about 68% of the width
shot = camera("CAM_shot", (cx, -frame_w * 35 / 36, 0.75), (cx, 0.0, 0.56), 35)
sc.camera = shot
bpy.context.view_layer.update()

# 3. playblast look: overhead key converted to Workbench's camera space, contact shadow
A.playblast_lighting(key_dir=(0.0, 0.0, 1.0))
c1 = res["contacts"][0]
rep = A.staging_report([ball], frames, shadow_frames=[c1 - 4, c1],
                       out_dir=os.path.join(OUT, "shadow"))
print(A.format_staging(rep))
```

Measured: the E3-like wide camera (50 mm, 6.9 m back, 1.9 m high) gave a subject of 10.4% of frame
height, the top 40% empty, the ball fully in frame on frame 1: three flags. The designed camera
(frame 3.1 m wide at the ball, rest pose at 68% of the width, 35 mm, 0.75 m high) gave 17.2% median,
action over 73% x 55% of the frame, off-screen entry (fully in at f7), end margin 18%, no flags;
shadow at f4 visible 104 px below the ball, at the f8 contact visible and touching (gap 0). Real
gravity: flights 11, 14, 9, 6, gravity ratio 0.94 on every flight. Camera-pixel sharp turns exactly
at the contacts 8, 22, 31, 37. Pinwheel of 8 wedges: 32 degrees per frame at most, under the 45
limit. Looked at: `out/ball_shot/contact_sheet.png` (every third frame), `contact_c1_sheet.png` (f5
to f10: stretch along the fall, squash meeting the shadow at f8, stretch leaving),
`onion_camera.png` (clean arcs, squash ellipses at the contacts, spacing opening into each contact,
labels not piling up), `playblast.mp4` (72 frames, ffprobe).

Traps measured on the way (test_staging.py): Workbench `display.light_direction` is camera-relative,
(0, 0, 1) lit from the camera and hid the shadow completely (0 px against 311 px converted);
`matrix_world` read right after setting a camera transform is stale until `view_layer.update()`, so
a conversion done too early silently used the identity. MATCAP `clay_studio.exr` kept a light floor
at 0.65 to 0.68 luminance from 2 to 30 degrees of camera pitch, STUDIO 0.41 to 0.55. With the
converted key, an open floor plane running behind the camera showed no stray shadow (0 px), unlike
the E3 run's camera-relative setting that threw a trapezoid; the closed slab stays the default. The
pinwheel is assigned per face, so wedge edges are stepped on a 48 x 24 sphere: fine for a playblast,
use a UV texture for a render.

## P19 Foot slip on dense clips (test_live_slip.py)

Baked, captured, generated and retargeted clips carry no typed contacts. Read them from the motion,
measure the clip that ships, and judge the spread over every range, not one range.

```python
frames = range(f0, f1 + 1)
slips = []
for ankle, ball in (("foot.L", "toe.L"), ("foot.R", "toe.R")):
    ranges = A.foot_contacts(rig, (ankle, ball), frames, height=0.03, onset=0.5)
    slips += A.foot_slip(rig, ankle, ranges, ball=ball)
print(A.slip_summary(slips))   # ranges, median, p95, worst, the ranges over the tolerance
```

- **Contacts.** A frame is planted when the ankle or the ball is within `height` of its own lowest
  point, so the floor must be flat. Ranges under 3 frames are dropped.
- **Onset.** `onset` starts a range at its first frame under that speed: a swing foot skimming the
  floor on its way down is not planted yet, and a range that never slows (a skim at the clip's end)
  is dropped. Report the slip with and without it, and the share of frames each stance takes. A late
  start can hide a skate. A height-only stance reads a skim as planted, and merges two steps into
  one false slide when the foot lifts less than `height` between them.
- **Two points.** Pass the toe as `ball`: a heel-to-toe roll moves the ankle while the ball holds.
- **The clip that ships.** Measure after the retarget, the bake and any blend between clips, never
  only on the source: each later step can move the feet, and transitions slip more than the clips
  they join.
- **The root.** When every planted foot drifts the same way, the root is wrong, not the feet. A
  retarget that scales the hip travel by one factor for every clip, while the legs take the target's
  proportions, does this. Rebuild the root: per frame, take back the planted points' mean ground
  travel; across a flight, where no foot is planted, interpolate the correction. The pose under the
  root stays as it is.

Verified: test_live_slip.py on Blender 5.2.4, a keyed two-point foot with a heel roll, a skim before
the contact, a sliding contact and a two-frame touch. Height-only contacts (1, 10), (19, 30); with
`onset=0.5` (1, 10), (21, 30); the touch dropped. Slide with the ankle alone 0.04 and 0.018 m, with
the ball 0.0 and 0.018; the same contact measured from the skim reads 0.063. Cut at frame 20, the
skim (19, 20) reads as a contact by height and is dropped with `onset`.

## GUI-only techniques and their substitutes

| Technique (expert)                                                     | Substitute here                                                                                                                                                                 |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Audio scrubbing, waveform reading (Rik, Alex)                          | `audio_envelope`, `accent_frames`; external phoneme aligner                                                                                                                     |
| Blend to Neighbor slider on one channel and axis (Rik)                 | `breakdown(..., bones=[b])` or a direct lerp on one F-curve index; `pose.blend_to_neighbor(factor, prev_frame, next_frame, channels, axis_lock)` needs explicit frames headless |
| Flipping between key poses (Alex, Hjalti)                              | `onion_skin(frames=keys, spread=...)` pose strip                                                                                                                                |
| Motion paths while posing, wormhole onion skins (Pablo, Picaut, Nacho) | `sample_world` + `motion_report`, `onion_skin(track=..., spread=...)`                                                                                                           |
| Graph Editor proportional editing (Raymond)                            | `propagate` (P11)                                                                                                                                                               |
| 3D cursor pivot, Active Element (Rik, Tony)                            | `world_pose(pivot=...)` (P14)                                                                                                                                                   |
| Mouse muppeting (Raymond)                                              | procedural rough path, then keys; or ask for a live session                                                                                                                     |
| Pose library drag with selection sets (Rik, Pablo)                     | pose dicts + bone lists (P12)                                                                                                                                                   |
