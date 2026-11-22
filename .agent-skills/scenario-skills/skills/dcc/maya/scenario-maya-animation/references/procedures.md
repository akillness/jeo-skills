# Procedures (maya.cmds and mx_anim), with their tests

The pure-Python parts of `mx_anim` (physics, analysis, gates, images, lip timing) **ran offline**
with python3 3.14 in `test_mx_anim_offline.py` (101 hard checks passed on 2026-09-24 after the
body-mechanics refactor; logs in `tests/code/maya-animation/logs/`). Run `test_00_anim_probe.py`
first once Maya is in: it answers every [verify] below.

Import, in mayapy, a mx_run job or the GUI bridge:

```python
import sys
sys.path[:0] = ["<project>/skills/scenario-maya-animation/scripts", "<project>/skills/scenario-maya-expert/scripts"]
import maya.cmds as cmds
import mx_anim as A
```

Headless job:
`python3 <project>/skills/scenario-maya-expert/scripts/mx_run.py --scene shot_v003.ma job.py -- args`
(see scenario-maya-expert). GUI: `mx_bridge.Bridge().run(code)`; playblasts only there.

## P0. mx_anim API (one line each; docstrings carry the details)

Pure (no Maya, offline-tested):

- `gravity_per_frame(fps, unit)` 1.703 cm/frame^2 at 24; `air_frames(rise, drop)`;
  `solve_jump(y0, y1, frames)`; `parabola_values(t0, t1, y0, y1)`.
- `motion_report(points, frames, contacts=)` spacing, holds, moves, pops (local outliers), sharp
  turns, constant spacing; `format_report()`.
- `ballistic_fit(heights, frames)` g_ratio, apex, hang excess;
  `landing_catch(heights, frames, contact)` catch, overshoots, `bottom_hold` (frames held at the
  deepest compression).
- `contact_spans(heights, frames, ground, offset=)`, `foot_slide()`, `penetration()`; ground may be
  `[[start, end, height]]`.
- `foot_pitch(heel, toe)` heel-to-toe pitch per frame (foot roll seen from the joints);
  `foot_events(spans, frames, heel, ball, tip=)` touch-downs with frames to flat, lift-offs;
  `peel_angle(ball, toe, takeoff)` degrees between the toe line and the takeoff spot.
- `curve_diff(before, after, ignore=)` what a keying pass changed (keys, tangent types and angles,
  sampled curve) outside the spans you meant to edit.
- `lag_frames(a, b)`, `overlap_report(signals, chain)`, `peak_order(signals, frames)`, `holds()`,
  `dead_holds()`.
- `pose_to_pose_tell(key_times)`, `tween_fractions(times, values)`, `extreme_indices()`,
  `double_beats()`, `overshoots()`, `hold_drift()`, `key_density()`.
- `transitions()`, `blink_report()`, `jaw_report()`, `mouth_keys(phonemes)`, `audio_envelope(wav)`,
  `lip_lag(env, jaw)`.
- `loop_seam()`, `rotation_flips()`, `cycle_speed()`; `project_point()`, `fit_view()`.
- `curve_lanes_png(path, curves, keys, spans, marks)`,
  `tracks_png(path, tracks, frames, size, bones, pose_frames, image=)`, `Canvas`.
- `evaluate_gates(samples, plan)`, `format_gates()`.

Maya:

- keys: `set_key_defaults()`, `restore_key_defaults()`, `key_pose(pose, f, stepped, fill)`,
  `key_hold()`, `insert_key()`, `share_keys()`, `key_times()`, `plug_keys()`, `subframe_keys()`.
- curves: `snapshot(nodes, attrs, samples=)`, `restore()`, `stepped_preview()`, `set_tangents()`,
  `to_spline()`, `break_tangent()`, `weighted_hang()`, `ballistic_keys()`, `cycle()`,
  `offset_keys()`, `retime()`, `snap_subframes()`, `scale_curve(node, attr, factor, pivot, time=)`,
  `copy_curve()`, `keep_extremes()`, `euler_filter()`.
- sampling: `sample_matrices()`, `sample_world()`, `sample_attrs()`, `sample_curves()`,
  `camera_track()`.
- helpers: `cog_proxy()`, `proxy_boxes()`, `delete_helpers()`, `store_plan()`, `load_plan()`.
- layers and mocap: `layer_audit()`, `layer_try()`, `layer_offset()`, `merge_layer()`,
  `bake_track()`.
- review: `run_gates(plan)`, `review_images(plan, out)`, `playblast_pack(out, s, e, cameras)` (GUI),
  `main()` (mx_run CLI).

## P1. Shot setup and plan

Tests: `test_00_anim_probe.py` (defaults), `test_sequencer_sound_blur.py` (sound, cameras),
`test_sampling_contacts.py` (plan round trip).

```python
cmds.currentUnit(time="film")                                   # 24 fps; games: "ntsc" 30, "ntscf" 60
cmds.playbackOptions(minTime=1, maxTime=72, animationStartTime=1, animationEndTime=72)
print(cmds.keyTangent(q=True, g=True, inTangentType=True), cmds.keyTangent(q=True, g=True, outTangentType=True))
cmds.sound(file="/abs/audio/line.wav", offset=1, name="dlg")    # dialogue; the envelope: A.audio_envelope(path, 24, 1)
cam = cmds.camera(name="shotCam", focalLength=35)[0]
cmds.xform(cam, worldSpace=True, translation=(520, 140, 45), rotation=(0, 90, 0))
for a in ("tx", "ty", "tz", "rx", "ry", "rz"):
    cmds.setAttr(cam + "." + a, lock=True)                     # lock once framed (Newman SGjxnw6c-IQ 00:08:33)
plan = {"name": "M4 heavy jump", "range": [1, 72], "fps": 24, "style": "heavy", "stage": "blocking",
        "cog": "hips_jnt", "feet": {"L": ["L_heel_jnt", "L_ball_jnt", "L_toe_jnt"], "R": ["R_heel_jnt", "R_ball_jnt", "R_toe_jnt"]},
        "ground": [[1, 44, 0.0], [45, 72, 100.0]], "rest_frame": 1, "air": [33, 45], "push": [27, 33], "crouch": [8, 27],
        "impacts": [45], "foot_roll": ["L_foot_ctrl.footRoll", "R_foot_ctrl.footRoll"], "spine": "chest_jnt",
        "chain": ["chest_jnt", "neck_jnt", "head_jnt"], "track": ["hips_jnt", "head_jnt", "L_wrist_jnt"],
        "controls": ["COG_ctrl", "chest_jnt", "neck_jnt", "head_jnt", "L_foot_ctrl", "R_foot_ctrl"],
        "camera": "shotCam", "poses": [1, 8, 16, 24, 27, 30, 33, 36, 39, 41, 44, 45, 47, 50, 57, 64, 66, 69, 72],
        "bones": [["hips_jnt", "chest_jnt"], ["chest_jnt", "neck_jnt"], ["neck_jnt", "head_jnt"]]}
A.store_plan(plan)                                               # network node mxAnim_plan, string attribute
```

Plan fields read by `run_gates`: range, fps, style (heavy, realistic, cartoony, acting), stage
(blocking, spline, polish), cog, feet [heel, ball, toe], ground, rest_frame or foot_offsets, air
[takeoff, landing], push, crouch (one window or a list: every anticipation that goes down), impacts
(every landing, default air[1]), foot_roll (rig plugs; without them the heel-to-toe pitch is read),
spine (default chain[0]), chain, track, controls, camera, poses, bones. Map the rig's controls once
with `cmds.listAttr(ctrl, keyable=True)`; the foot roll attribute name is rig-specific (the
Animation Mentor rig has Foot Roll and Foot Break on the IK foot control, ynXadXE9UjU f_00045). A
walk, a hop or a lift uses the same fields: the foot gates run on every touch-down and lift-off in
the range.

**Worked frame plan for M4** (a synthesis [added] built on Camporota's jump anatomy, Wade's
resistance beat and Elver's catch; the gates were tuned on it offline):

| Frames   | Phase                                                                                                                                                            | Rule                                                                                  |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 1 to 8   | settle, look at the box                                                                                                                                          | moving hold                                                                           |
| 8 to 24  | crouch, slow ease in, not overdone; foot roll keyed (gate `foot_roll`); spine drags behind the hips, only the arms drop (gate `spine_drag`)                      | Camporota FA7fPB7qUhE 00:03:46, 00:07:55, 00:08:28                                    |
| 24 to 27 | resistance beat, near stillness with strain                                                                                                                      | Wade ZYKAMCZq2UI 00:03:05                                                             |
| 27 to 33 | push, fastest vertical section; force core outward; toes leave last                                                                                              | Camporota 00:01:18; Wade 00:07:39                                                     |
| 34       | first airborne frame: toe tip aimed back at the takeoff spot (gate `peel_off_*`)                                                                                 | Elver 00:10:32, 00:11:04                                                              |
| 33 to 45 | air, gravity-true, apex near 41, legs reach on the last key                                                                                                      | `air_frames(60, 10)` about 12 frames; Camporota 00:02:32                              |
| 45 to 50 | catch on the box: most fall speed gone in 2 frames, one overshoot; balls land, heels flat by 46 (gate `heel_to_flat_*`); hold at the bottom (gate `impact_hold`) | Elver 00:58:46, 00:14:29; Newman TIBzcsOt2FU 00:13:56; Camporota ynXadXE9UjU 00:09:26 |
| 50 to 64 | slow heavy recovery                                                                                                                                              | Wade 00:03:05                                                                         |
| 64 to 72 | small overshoot, moving hold, no dead stop                                                                                                                       | Elver 00:54:54                                                                        |

## P2. Proxy boxes pass (Camporota)

Test: `test_m4_jump.py` (step 2).

```python
px = A.proxy_boxes(hip_height=96.0)            # root at hip height (the lean pivot), body and head boxes, tagged
root = px["root"]
for f, (y, z) in sorted(path.items()):         # path: {frame: (height, forward)} from the plan, air from solve_jump
    cmds.setKeyframe(root, attribute="translateY", time=f, value=y)
    cmds.setKeyframe(root, attribute="translateZ", time=f, value=z)
for f, v in LEAN.items():
    cmds.setKeyframe(root, attribute="rotateX", time=f, value=float(v))
A.offset_keys([root], 1, attrs=["rotateX"])    # rotation 1 frame behind translation (FA7fPB7qUhE 00:04:58)
pw = A.sample_world([root], list(range(1, 73)))
pg = A.evaluate_gates({"frames": list(range(1, 73)), "fps": 24.0, "unit": "cm", "up": 1, "world": pw},
                      dict(plan, cog=root, feet={}, chain=[], track=[root]))
print(A.format_gates(pg))
A.curve_lanes_png("/abs/out/proxy_curves.png", A.sample_curves([root], range(1, 73)), spans=[(33, 45, "air")])
```

Cartoony option: fewer frames on takeoff and landing,
`cmds.scaleKey(root, time=(24, 33), timeScale=0.75, timePivot=33)`, then `A.snap_subframes([root])`.
Heavy: keep the gravity-true air (`A.ballistic_keys(root, "translateY", 33, 45)`). First passes
overdo the anticipation (Camporota 00:03:46): after the proxy playblast, dial the crouch depth back
without touching the takeoff, `A.scale_curve(root, "translateY", 0.8, pivot=96.0, time=(8, 27))`,
re-run the gates (resistance and push_fastest must still pass), compare the two playblasts. Test:
`test_keys.py` (range-limited scale_curve).

## P3. Stepped blocking with key categories (Neistadt, Newman)

Tests: `test_keys.py` (pose columns, holds, share keys, stepped insert), `test_m4_jump.py` (step 3).

```python
prev = A.set_key_defaults("blocking")          # in linear, out step; returns the old defaults
for f in plan["poses"]:
    pose = {"COG_ctrl": {"translateY": path[f][0], "translateZ": path[f][1], "rotateX": LEAN[f]},
            "L_foot_ctrl": {"translateY": 8.0, "translateZ": 0.0}}          # per pose, from the plan
    A.key_pose(pose, f, stepped=True, fill=ctrls)   # every control keyed on every key pose
A.key_hold(ctrls, 24, 27)                      # closing key of a hold: the pose at 24 kept to 27
A.share_keys(ctrls)                            # union of key times on every control, inserted (no reshaping)
A.restore_key_defaults(prev)
kt = A.key_times(ctrls)                        # check against the plan's key categories
```

Pass order: main keys, anticipations, overshoots and follow-through, breakdowns, holds (GMTet6nd_iM
00:29:08). Crouch and landing poses carry the feet and spine: foot roll keyed on the IK foot
control, the chest a frame behind the hips on the way down, the arms hanging (Camporota FA7fPB7qUhE
00:07:55, 00:08:28). Breakdowns favor a neighbor: set the value from `prev + (next - prev) * 0.7` or
0.3, never 0.5 (t-YsIXaPvEg 00:05:07; check with `A.tween_fractions`). Fast sections on ones
(`A.key_density(times, speeds, frames)` flags gaps). Insert single keys with
`A.insert_key(node, attr, f)`, never a bare `setKeyframe` on a shaped curve.

## P4. Spline readiness and spline pass 1 (the core)

Tests: `test_keys.py` (snapshot and restore, to_spline through holds, stepped preview, ballistic
keys, broken tangent), `test_m4_jump.py` (step 4).

```python
snap = A.snapshot(ctrls)                                  # the buffer curve, JSON-serializable
A.to_spline(["COG_ctrl", "L_foot_ctrl", "R_foot_ctrl"], tangent="auto")    # flat sides on equal-key holds
A.copy_curve("mxAnim_proxy", "translateY", "COG_ctrl", "translateY")      # trust the proxy spacing (Camporota)
A.ballistic_keys("COG_ctrl", "translateY", 33, 45)       # or: gravity-true air keyed per frame
A.set_tangents(["COG_ctrl"], "linear", "linear", time=(33, 45), attrs=["translateZ"])   # nothing pushes in the air
A.break_tangent("COG_ctrl", "translateY", 45, in_angle=-70.0, out_angle=-20.0)       # hard landing [angles by eye]
# readiness: sample, look, decide
pts = A.sample_world(["head_jnt", "L_wrist_jnt"], range(1, 73))
res = A.run_gates(plan)
if not res["ok"]:
    A.restore(snap)                                       # back to stepped, add poses (TIBzcsOt2FU 00:07:00)
```

**Keys added after splining (breakdowns, contact fixes).** Native Set Key reshapes neighboring
curves (Wade TMSpauVphNs 00:01:45; G49wexNmQ-Q 00:06:22). Insert, then prove nothing else moved.
Test: `test_keys.py` (insert vs a bare key, a breakdown edit, all soft rows until 2027 answers).

```python
fr = [45 + i * 0.25 for i in range(89)]                     # quarter frames 45..67 around the edit
before = A.snapshot(["COG_ctrl"], ["translateY"], samples=fr)
A.insert_key("COG_ctrl", "translateY", 54)                  # recovery keys at 50, 57, 64; setKeyframe(insert=True)
crv = cmds.keyframe("COG_ctrl", attribute="translateY", query=True, name=True)[0]
cmds.keyframe(crv, edit=True, time=(54, 54), absolute=True, valueChange=158.0)   # breakdown favoring the low key
d = A.curve_diff(before, A.snapshot(["COG_ctrl"], ["translateY"], samples=fr), ignore=[(50, 57)])
if not d["ok"]:
    print(d["changed"], d["moved_samples"][:5])             # neighbors moved: lock them (fixed tangents) or restore(before)
```

`ignore` is the new key's two segments (previous key to next key); only their interior is ignored,
so the neighboring keys must not move. An insert on a weighted curve changes the neighbors' weights
to keep the shape: weights are not compared [added].

Tangent choice by stage: blocking step; core auto (2027 Auto Span family [verify token]); holds flat
or plateau (Plateau keeps extremes on keys); planted feet flat, linear or clamped with equal values
(Clamped fixes cycle slip, Maya 2027 Help); air per-frame keys or a flat apex; hard contact broken;
eyes linear; face stepped until its pass. Heavy bodies: never `A.weighted_hang` (it adds hang beyond
gravity; light or cartoony only).

## P5. Spline pass 2: overlap

Tests: `test_keys.py` (offset inside a cycle), `test_m4_jump.py` (step 5).

```python
A.to_spline(["chest_jnt", "neck_jnt", "head_jnt"], tangent="auto")
A.offset_keys(["neck_jnt"], 1)                  # chains 0, 1, 2 frames; head 1 (ynXadXE9UjU 00:22:33, 00:32:02)
A.offset_keys(["head_jnt"], 2)
sig = A.sample_world(plan["chain"], range(1, 73))
spd = {n: [A._dist(p[i + 1], p[i]) for i in range(len(p) - 1)] for n, p in sig.items()}
print(A.overlap_report(spd, plan["chain"], mode="value"))
print(A.pose_to_pose_tell(A.key_times(ctrls)))  # shared_fraction high = everything starts and stops together
```

Correlated controls (three spine controls) move together first, offsets after (TIBzcsOt2FU
00:16:58). Force chains: `A.peak_order({"pelvis": ..., "shoulder": ..., "wrist": ...}, frames)` must
come out core first (ZYKAMCZq2UI 00:07:39).

## P6. Gates and headless images (the agent's eyes without a viewport)

Tests: `test_sampling_contacts.py`, `test_m4_jump.py` (step 6, CLI). Pure gate logic:
`test_mx_anim_offline.py` (M4 good passes all 23 gates; floaty fails ballistic; a sliding foot fails
slide_R; no resistance fails resistance; a frozen end warns moving_hold; feet flat in the crouch
warn foot_roll; a chest locked to the hips warns spine_drag; a flat foot on the first airborne frame
warns peel_off; heels 4 frames to flat warn heel_to_flat; a bounce out of the squash warns
impact_hold, each without breaking another gate).

Body-mechanics gates, for any jump, hop, landing or weight shift (the plan fields decide where they
run):

| Gate                  | Reads                                                                        | Pass                                                  | Source                         |
| --------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------ |
| `foot_roll`           | every crouch window: `plan["foot_roll"]` plugs, else `foot_pitch(heel, toe)` | range above 0 (attribute) or 1 degree (pitch) [added] | Camporota FA7fPB7qUhE 00:07:55 |
| `spine_drag`          | every crouch window: `lag_frames(COG height, spine height)`                  | spine lags 1+ frame                                   | Camporota 00:08:28             |
| `heel_to_flat_<side>` | every touch-down from `foot_events`                                          | heel and ball planted within 2 frames                 | Camporota ynXadXE9UjU 00:09:26 |
| `peel_off_<side>`     | every lift-off: `peel_angle` on the first airborne frame                     | at most 30 degrees [added]                            | Elver jzuxAmadcm8 00:10:32     |
| `impact_hold`         | every `plan["impacts"]` frame: `landing_catch()["bottom_hold"]`              | 3+ frames [added]                                     | Elver 00:13:54, 00:14:29       |

```python
res = A.run_gates(plan)                          # samples with currentTime (robust with IK and constraints)
print(A.format_gates(res))
imgs = A.review_images(plan, "/abs/out/review_v003")   # curves.png (stacked lanes), tracks.png (camera space)
```

Shell, headless:

```
python3 <project>/skills/scenario-maya-expert/scripts/mx_run.py --scene /abs/shot_v003.ma \
    <project>/skills/scenario-maya-animation/scripts/mx_anim.py -- --plan /abs/plan.json --out /abs/out/review_v003
```

Open both PNGs with the image reader, every time. `tracks.png` draws a dot per frame (gaps are
spacing) and gray-to-black stick figures at `plan["poses"]` (an onion skin). Without a camera it
falls back to a schematic side view (`fit_view`). A trajectory can be drawn over any playblast
frame: `A.tracks_png(out, tracks, frames, (1280, 720), image=frame_png)`.

## P7. GUI review pack (playblasts through the bridge)

Test: `gui_playblast_review.py` (needs GUI Maya with `mx_bridge_server.start()`).

```python
b = mx_bridge.Bridge()
b.run("""
import mx_anim as A, mx_review as R
pack = A.playblast_pack("/abs/out/pb_v003", 1, 72, cameras=("shotCam",), silhouette=True, width=1280, height=720)
with A.stepped_preview(A.load_plan()["controls"]):        # Enable Stepped Preview, scripted and restored
    R.playblast("/abs/out/pb_v003/stepped", 1, 72, camera="shotCam", width=1280, height=720,
                display={"grid": False, "nurbsCurves": False, "joints": False})
result = pack
""")
```

Check the output: 72 PNGs per pass at 1280 x 720 (`mx_review.png_size`), then read them in time
order (every 2nd frame for the first-view read, every frame on flagged ranges). The silhouette pass
uses `displayLights="none"` [verify value]. Movie with sound for a human:
`cmds.playblast(format="avfoundation" or "qt", sound="dlg", ...)` [verify macOS format names with
`cmds.playblast(q=True, format=True)`]. Playblast defaults to half size: always pass `percent=100`
and an explicit size.

## P8. Walk cycle (Camporota) and game clip QA (Newman, Epic)

Tests: `test_keys.py` (cycle, offsets keep the period), pure seam and speed in
`test_mx_anim_offline.py`.

```python
start, step = 1, 12
frames = {start + s * step + i * 3: (p, side) for s, side in ((0, "L"), (1, "R"))
          for i, p in enumerate(("contact", "down", "pass", "up"))}
frames[start + 24] = ("contact", "L")                     # loop key: a copy of frame 1
# key feet and COG on these frames (legs first), then loop before any polish:
issues = A.cycle(["COG_ctrl", "L_foot_ctrl", "R_foot_ctrl"], travel=["COG_ctrl.translateZ"])   # cycleRelative on travel
A.scale_curve("COG_ctrl", "translateY", 0.6, pivot=rest_y)       # too much bounce: scale, do not re-key
A.offset_keys(["L_forearm_ctrl"], 1); A.offset_keys(["L_hand_ctrl"], 2); A.offset_keys(["head_ctrl"], 1)
```

Checks: side shift peaks between pass and up; supporting hip up on pass and up (ynXadXE9UjU
00:11:27); heel to flat in about 1 frame; `A.loop_seam(pose_at(1), pose_at(25))`; for games
`A.cycle_speed(root_track, frames)` equals the metric (cm/s), root at the origin on the first frame,
in-place clips keep the root still, root motion only on the root and no root Z for walking content
(UE 5.8). Bake the loop range before export so infinity becomes keys
(`cmds.bakeResults(ctrls, time=(1, 25), simulation=False)` [verify]), then
scenario-maya-pipeline-scripting.

## P9. Heavy interaction beat (lift, throw, punch)

Not yet run in Maya (keys as P3; gates pure and offline-tested).

- Plan both numbers: object weight and strength (1 to 5) [added scale]; resistance frames grow with
  weight minus strength, overcome frames shrink with strength (ZYKAMCZq2UI 00:09:03, mapping
  [added]).
- Resistance: contact, then 2+ frames where the object barely moves while the body loads
  (`A.holds()` on the object track); a tremble on a small additive layer, baked before polish (Elver
  00:50:56).
- Overcome: keys ordered back, shoulders, arms with 1-frame offsets; `A.peak_order()` core first;
  the object lags the hand in a throw (measure the hand-to-object distance along the motion); a
  punch leans in, then a short A to B.

## P10. Lip sync passes (Santos, Wade, Lazare) and the face

Tests: `test_sequencer_sound_blur.py` (sound node, muppet pass from `mouth_keys`, `jaw_report`,
`lip_lag`), `test_keys.py` (`copy_curve`), pure in `test_mx_anim_offline.py`.

```python
phon = [("M", 12), ("AA1", 14), ("N", 18), ("IY1", 20), ("P", 26), ("OW1", 28)]   # onsets from a forced aligner [added]
tent = {"AA1": 18.0, "OW1": 22.0}                     # 2 to 4 tentpoles per line; the rest subordinate
prev = A.set_key_defaults("blocking")
for m in A.mouth_keys(phon):                          # lead by place of articulation: bilabial 0, alveolar 1...
    v = -1.0 if m["class"] == "bilabial" else (tent.get(m["sound"], 4.0) if m["class"] == "vowel" else 3.0)
    cmds.setKeyframe("jaw_ctrl", attribute="rotateX", time=m["key_frame"], value=v, outTangentType="step")
A.restore_key_defaults(prev)
jv = [cmds.getAttr("jaw_ctrl.rotateX", time=f) for f in range(1, 49)]
print(A.jaw_report(jv, list(range(1, 49))))          # reversals per second (chatter), tentpole ratio, first-frame share
env = [v for _, v in A.audio_envelope("/abs/audio/line.wav", 24.0, 1)]
print(A.lip_lag(env[:48], jv))                        # lag > 0: the mouth is late; shift all mouth keys 1 to 2 earlier
A.copy_curve("L_mouthCorner_ctrl", "translateY", "L_nostril_ctrl", value_scale=0.3, time_offset=1.0)   # connection
```

Order: body, mask (eyes, brows), phrase pass, muppet (jaw only), big five (corners TX then TY, never
TZ; top and bottom lip for M, B, P, F, V), polish (tongue first, teeth anchored, breath,
connection). Global late fix (Lazare): `A.offset_keys(mouth_ctrls, -2)` or move the sound node 2
frames later. Eyes: `A.set_tangents(["eye_aim_ctrl"], "linear", "linear")`, darts of 2 frames
between locked holds, checked with `A.transitions()`; blinks with
`A.blink_report(lid, frames, closed=..., opened=...)` (closing frames under opening frames, first
closing frame under half the travel). Keys stay stacked until the face polish (Santos 00:48:59).

## P11. Layer protocol and merge (Newman, Elver, doc)

Test: `test_layers_mocap.py`.

```python
lyr = A.layer_try(["L_shoulder_ctrl", "R_shoulder_ctrl"], "try_idea", [18, 26, 34, 41, 50, 62])  # last = protective key
A.layer_offset(lyr, "L_shoulder_ctrl", "rotateZ", 26, 8.0)   # offsets only at marker frames [verify value semantics]
# playblast, review; time-box 30 to 40 minutes or N iterations, then:
print(A.layer_audit())                                       # layers, mode, mute, weight; flags
info = A.merge_layer(lyr, 1, 72)                             # bakeResults onto the base layer, smart [verify], Euler filter
```

Never block or clean on a layer; merge first (5RmqWjfU80s 00:07:24). An empty Override layer is
muted until keyed (doc). Use Additive for offsets and timing, Override plus an IK handle with IK
Blend 0, 0, 1 on linear keys to pin a mocap contact (doc: frames 0, 20, 27).

## P12. Mocap re-edit and a prop in the hand

Test: `test_layers_mocap.py`.

```python
A.euler_filter(ctrls)                                        # first, after any merge or bake (JzwfomndbMA 00:08:31)
cut = A.keep_extremes("L_elbow_ctrl", "rotateY", 120, 160)   # delete to extremes, then favor, hold, overshoot by hand
n = A.bake_track("knife_loc", "R_wrist_jnt", grab, release)  # constraint with offset over the held range only, baked
```

Guard the performance: compare untouched joints with the raw capture (RMS of world tracks,
`A.sample_world`); contacts must not move unless the note asks. Pops:
`A.motion_report(track, frames)["spikes"]`, judged by eye before deleting (some wobbles are
performance).

## P13. Retarget with HumanIK (outline) and the fallback

Outline only: HumanIK scripting is MEL procedures shipped with `mayaHIK`, names unverified (the
probe records `hikCreateCharacter`, `setCharacterObject`, `hikBakeCharacter`). Steps (Maya 2027
Help): definition for source and target, lock them; Character and Source menus; Custom Rig mapping
(IK effectors T and R, FK R only, up vectors translation only, offsets zero), saved as XML; Retarget
Specific attributes (Match Source off for a bigger target, Knee/Elbow Max Extension 50, Mass Center
Compensation 80); bake from the HumanIK Bake menu; mute or delete layers on the Control rig.
Fallback for matching skeletons: `parentConstraint(src, ctrl, maintainOffset=True)` per mapped pair
from a matched T-pose, `bakeResults(simulation=True)`, delete constraints, `A.euler_filter` (same
mechanics as `bake_track`, tested in `test_layers_mocap.py`). QA: stride ratio vs leg-length ratio
(tiny steps), no knee or elbow snapping at full extension, hips between the feet, `A.foot_slide` on
contacts.

## P14. Retime a section and snap sub-frames (Elver, Wade)

Test: `test_keys.py`.

```python
A.retime(ctrls, 134, 152, -2)       # keys inserted at both ends, section scaled, tail shifted, sub-frames snapped
A.snap_subframes(ctrls)             # after any scaleKey: collisions keep one key with the curve's value
```

## P15. Motion-blurred review render (Elver) and Sequencer shots (Newman)

Test: `test_sequencer_sound_blur.py` (with `--plugins mtoa`).

```python
cmds.setAttr("defaultArnoldRenderOptions.motion_blur_enable", 1)   # [verify attribute name]
cmds.file(rename="/abs/out/blur_review_v001.ma"); cmds.file(save=True, type="mayaAscii")
# shell: Render -r arnold -cam shotCam -s 40 -e 46 -x 960 -y 540 -rd /abs/out/blur /abs/out/blur_review_v001.ma
cmds.shot("shot010", startTime=1, endTime=34, sequenceStartTime=1, sequenceEndTime=34, currentCamera="cam1")  # [verify]
```

Look at the blurred frames around fast moves and contacts: two keys on adjacent frames with a big
jump blur badly; a half-frame key (`cmds.setKeyframe(ctrl, time=42.5)`) fixes it (00:39:35). Render
settings beyond this belong to scenario-maya-lighting-rendering. Sequencer checks: every shot has a
camera, cameras locked, shots contiguous per track, scaled shots listed.

## GUI-only techniques and their substitutes

| Technique                          | Why GUI            | Substitute the agent uses                                                                                                        | Test                               |
| ---------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Scrubbing, playback                | viewport           | playblast frames in time order; `tracks.png`                                                                                     | gui_playblast_review, test_m4_jump |
| Ghosts, onion skin                 | viewport drawing   | `tracks_png(..., bones, pose_frames)`                                                                                            | offline, test_m4_jump              |
| Motion trails                      | viewport, 3D only  | `camera_track` pixel tracks, `motion_report(dims 2)`                                                                             | test_sampling_contacts             |
| Graph Editor stacked view          | editor             | `curve_lanes_png`                                                                                                                | offline, test_m4_jump              |
| Buffer curves                      | editor             | `snapshot` / `restore` (JSON)                                                                                                    | test_keys                          |
| Enable Stepped Preview             | Time Slider toggle | `stepped_preview()` context                                                                                                      | test_keys, gui_playblast_review    |
| Drawover (Blue Pencil, SyncSketch) | tablet             | `tracks_png(image=playblast_frame)`                                                                                              | offline, gui_playblast_review      |
| Tween sliders, blend to neighbor   | slider             | value = prev + (next - prev) * t, `tween_fractions` check                                                                        | offline                            |
| Dope Sheet summary retime          | editor drag        | `retime()`                                                                                                                       | test_keys                          |
| Lights-off silhouette (hotkey 7)   | viewport           | `playblast_pack(silhouette=True)`; headless `mx_review.review(modes=("silhouette",))` at key frames [verify deformed duplicates] | gui_playblast_review               |
| Cached Playback real-time check    | viewport           | not needed: timing is judged from playblasts and numbers                                                                         | none                               |
| Temp pivot                         | manipulator        | world matrix math: `M_new = M * P^-1 * R * P`, written with `xform(ws=True, m=...)` [added]                                      | none yet                           |
