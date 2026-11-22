---
name: scenario-blender-previs-storyboard
description: "Use when turning a script or story into previs, layout, storyboards or an animatic in Blender: beats to shot list, camera and lens per shot, staging, camera height, 180-degree rule, screen direction, shot sizes, when to cut, camera moves, timing stills in the Video Sequencer, markers bound to cameras, Story Tools, Grease Pencil or 2D/3D hybrid boards. Also when an animatic shows the wrong frame, blocking keys are not stepped, Rigify operators are missing, or viewport render fails headless."
license: MIT
---

# Previs, layout and storyboarding

Expert previs conveys an idea well enough to be judged, as cheaply as possible: one fact per beat,
every shot designed for what the audience must feel, timing found in the edit from stills. The
camera is the audience's body; where it stands, how high and through which lens decides the emotion,
so every non-neutral choice needs a stated reason. If a sibling skill named here is missing from
your available skills, load it with `skill_get` (Scenario MCP) or ask the user to install it
(https://github.com/scenario-labs/skills#install); unattended, proceed from tool schemas and flag
the gap.

**REQUIRED BACKGROUND:** scenario-blender-expert (execution channel, review loop, 5.2 API changes).

Toolkit: [`scripts/bx_previs.py`](scripts/bx_previs.py) (tested on 5.2.1):
`import sys; sys.path += ["<this skill>/scripts", "<scenario-blender-expert>/scripts"]; import bx_previs as P`.

**Which skill.** This one: story previs and animatics judged by a director and an editor. Out of
scope: a playblast that guides a render-to-real video model (Seedance). It follows other rules
(saturated color identities, no lens jump on a cut, eased moves, a hand-off sheet) that the workflow
and `P.audit` below do not apply or check, so do not hand a director's animatic to a video model as
is: rebuild it with scenario-blender-blockout, where characters usually become colored capsules the
video model animates itself. Shared: metric Z-up, roots at the feet, one camera per shot bound to a
marker, `to_track_quat('-Z','Y')` look-at. Strokes: scenario-blender-grease-pencil. Animation after
layout: scenario-blender-animation. Real rigs: scenario-blender-rigging.

## Stance (the expert delta)

- **Hjalti Hjalmarsson: write the beats-of-information list before any shot.** One fact per line,
  because a viewer takes in one thing at a time. Group consecutive beats into shots; a new treatment
  re-orders the same facts. A missing beat means the idea never gets a fair test.
- **Hjalti: theater first, then cinematic; shots cost time.** A locked-off version judges the
  acting; the same beats told in shots ran about 2x (up to 3x) because every cut must be read
  (13/22/25 s vs 47/40 s). The oversimplified version is always too short and hides logistics (a
  character cannot cross the room in 10 frames).
- **Charge recipe (Hjalti): treat every frame as a storyboard drawing.** 10 frames per shot, keys
  CONSTANT, an A/B alternative on the next frame, the winner on the decade frame, stills exported
  with versioned names, timing done in a separate edit.
- **Hjalti: when in doubt, eye height; lock the lens early by A/B.** Two characters: split their eye
  heights. Low or high is a statement. Poses built for one lens do not survive a lens change.
- **Dillon Gu: composition and focal length are separate decisions, and cuts can kill a mood.** The
  audience stands where the camera is. Leaving the space removes the danger; two inanimate inserts
  in a row lower tension.
- **Cheat for the camera, but key before you cheat** (Hjalti, Charge, Renato Roldan). Resize, float,
  swap props per shot; in a shared timeline an unkeyed cheat breaks the earlier shots.
- **Previs is the cheapest version that still conveys the idea** (Hjalti, Charge). Animate only
  shots whose camera move is the storytelling; everything else is one still, push-ins faked on the
  still in the edit. Grays in Workbench, no mood lighting, mannequins before rigs. `P.audit` refuses
  a camera moving inside a still shot, keys between block starts and a non-Workbench engine.
- **After each cut the eye must find one thing** (Hjalti). Restage a character in front of a
  competing subject; keep the angle that preserves the emotion (he refused a side cut that turned
  Rex into a silhouette).

## Establish first

| Input                  | Changes                                   | Default when silent                                                                                                                                                                 |
| ---------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Format                 | every composition (Charge: lock it first) | 1920x1080, 24 fps, stills at 50 %                                                                                                                                                   |
| Treatment              | shot count, runtime                       | theater pass, then cinematic                                                                                                                                                        |
| Method                 | agent has no tablet                       | 3D previs with mannequins; drawn boards only on provided art; Rigify proxies only on request (`P.rigify_proxy`, Rigify is off under `--factory-startup`: `P.ensure_rigify()` first) |
| Mood or director style | lens, height, motion per shot             | neutral grammar, deviations stated per shot                                                                                                                                         |
| Runtime budget         | durations                                 | about 1.6 to 1.9 s per beat for a cinematic cut (derived from Hjalti's slide: 25 beats, 8 shots, 40 to 47 s)                                                                        |
| Journeys               | screen direction                          | out left to right, back right to left (Charge)                                                                                                                                      |
| Deliverable            | outputs                                   | shot list, contact sheet, floor plan, animatic MP4 clean plus burn-in, versioned .blend                                                                                             |

## Workflow

1. **Script to beats.** Asset list, then numbered beats, one fact each; mark every beat you add.
   GATE: `P.shot_list(BEATS, SHOTS)` raises on a missing, duplicated or reordered beat.
2. **Set and proxies.** `P.setup_scene` (format, Workbench, grays, Standard view transform);
   `P.prop` for real-scale set pieces; `P.mannequin` for characters (root at the feet with
   `eye_height`, four pivot controls as the layout subset). Grays, one pop color for the hero
   (Renato: red). GATE: scale reads next to a door (2.1 m) and counter (1.0 m).
3. **Theater pass.** One locked-off camera (`cam` shared, `fit="all"`, 35 mm, mean eye height)
   framing the action's extremes; one block per beat group. GATE: in the `P.audit` rows every
   subject's `head_in` and `feet_in` is true at every block; theater edit timed.
4. **Cinematic plan.** List several openings, re-order beats, group them into shots with `intent`,
   `size`, `lens`, `height`, `dur`. `P.floor_plan` with the action line and journey paths before
   judging cameras. GATE: one side of the line; journeys follow the direction rule.
5. **Blocking.** For each block: `sc.frame_set(f)` (holds the previous pose), set only what changes,
   `P.key_block(all_movables, f)`; cheats go through the same keys; then `P.make_stepped`. GATE:
   `P.stepped_report == {}`; the cheat check at neighboring shots.
6. **Cameras.** `P.build_shots` places each camera from size, lens and eye height (or explicit
   `loc`/`aim`), sets an opaque passepartout (Charge: see only the composition; `P.passepartout(sc)`
   for other cameras) and binds a marker at its first frame. `P.ab_lens` on key shots before posing
   further. GATE: `P.audit(...)["problems"] == []`.
7. **Look.** `P.contact_sheet` and open it. Characters merging with a dim set:
   `P.fog_for_shot(sc, t, chars)` (Hjalti: depth fog for readability, not lighting; behind the
   subjects, keyed to that shot), `P.values_at` hero vs backdrop. GATE: the visual list under
   Quality gates (in S6 only the pictures caught the occlusions and the cut-off wide).
8. **Edit.** `P.render_stills`, then `P.animatic` (image strips held `dur` seconds, `push` on
   stills, `live` shots as scene strips, sounds, `burn_in`). One continuous action from several
   angles (Pablo, Story Tools): a `live` shot plus `cover=True` shots become one scene strip
   soft-split per camera; retime with `P.retime_cut` (the marker follows), never by moving keys.
   GATE: runtime within budget; frames pulled from the MP4 match the cut list.
9. **Iterate** in a new scene pair (`02_blend`/`02_edit`) and new version numbers; nothing
   overwritten.

## Numbers

| Value                                                                          | Relative to                                | Source                                                |
| ------------------------------------------------------------------------------ | ------------------------------------------ | ----------------------------------------------------- |
| 10 frames per shot block, 20 only when justified; starts on 10, 20, 30         | previs timeline                            | Charge                                                |
| Shots named in tens (sh010, sh020)                                             | markers                                    | Hjalti on screen                                      |
| 35 mm theater frame; about 60 mm for an isolating key shot                     | 36 mm sensor                               | Hjalti                                                |
| F-stop 5.6, clip 0.01 to 200 m on the camera rig                               | Hjalti's rig                               | Hjalti                                                |
| 13 / 22 / 25 s theater vs 47 / 40 s cinematic                                  | same script                                | Hjalti slide 00:46:01                                 |
| 3 poses for an anger burst (anticipation, overshoot, settle)                   | one beat                                   | Hjalti                                                |
| 6 fps boarding, retimed in the edit                                            | board scene                                | BouncyBrain                                           |
| Eye tolerance 0.15 m; drawing breaks past 70 degrees from camera               | audit thresholds                           | [added]                                               |
| Visible height = subject height x 4 / 2 / 1.15 / 0.8 / 0.6 / 0.4 / 0.25 / 0.12 | ews, wide, full, mws, medium, mcu, cu, ecu | [added]                                               |
| Distance = visible height x lens / sensor height (20.25 mm at 16:9)            | lens swap at equal size: d2 = d1 x f2 / f1 | [added]                                               |
| Handheld NOISE 0.010 to 0.018 rad, 18 to 26 frame scale                        | camera rotation                            | video guides; measured peak-to-peak = 0.66 x strength |

## Camera language

| Choice                                                                          | Reads as                                                          | Source                   |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------ |
| Eye level, medium lens, centered, static                                        | neutral; the start for every A/B                                  | Dillon, Hjalti           |
| Low or tucked in a corner                                                       | hidden observer                                                   | Dillon                   |
| Wide lens from far, then a quick zoom in                                        | being watched; someone fixing on a target                         | Dillon                   |
| Extreme wide lens close up                                                      | "not okay", distortion                                            | Dillon                   |
| Long lens                                                                       | informational, flat, isolates, intensifies a two-character moment | Dillon, Hjalti, Spitfire |
| Top view; dolly zoom (linear keys)                                              | pressure from above; loss of control                              | Dillon                   |
| Off-center from behind                                                          | isolation                                                         | Dillon                   |
| Side-on movement                                                                | the most neutral screen motion                                    | Dillon                   |
| Tilt or move ending on a detail                                                 | that detail becomes the subject                                   | Hjalti                   |
| Faceless framing, longer shots, significant object at the edge carried by sound | routine                                                           | Dillon                   |

**Moves that feel physical** (Dillon): handheld noise when a watcher or a groggy body holds the
camera, a camera operator's quick zoom, the camera dropping with the character's shoulders, less
motion for laziness, more for urgency; a product shot is the stillest shot. Hjalti pulls focus
across a handoff (`dof.focus_object`). **Cuts:** one side of the action line; an over-the-shoulder
uses the shoulder the camera already occupies, and a jump cut can mean elided routine time (Dillon);
a POV sits just off the line on the camera side [added, S6].

## Quality gates

**Measurable:** `P.audit(sc, table, chars, line=(a, b), travel={name: "right"}, stepped=movables)`:
marker switch at each shot frame and not one frame before, main subject's eye line in frame and not
blocked (ray cast names the blocker, fog included), measured vs intended size, height class with an
intent for every non-eye camera, one side of the action line (POV and `cross` exempt), screen
direction per journey, block length, two inserts in a row, non-constant keys outside live blocks,
opaque passepartout, cost gates; `warnings` lists lights. Plus the edit runtime, `ffprobe` streams
and duration, and for live shots an edit frame rendered against the previs frame.

**Visual** (open each image): contact sheet (every beat visible, one focal point per shot, hero
readable, cheats and occluders invisible, pose readable from this camera), floor plan (camera side,
journeys), A/B sheet (isolation vs context), frames pulled from the MP4 (order, burn-ins, push,
live-shot content). Comic timing and sound stay a human call (Hjalti).

## Common mistakes

| Mistake                                             | Looks like                                              | Fix                                                                                                            |
| --------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Shots sprinkled over a finished performance         | generic coverage, wrong framings                        | design each shot from its beats (Hjalti)                                                                       |
| Wide framing that ignores the extremes              | the tallest pose or entrance clips                      | `fit="all"` and the extremes audit                                                                             |
| POV from the true eye point                         | the counter or the character's own head blocks the view | cheat the POV forward and up (S6: 0.6 m forward, 1.72 m high, over the counter); the audit reports the blocker |
| Door or prop between camera and hero                | hero hidden in the key frame                            | swing it away or move the camera; the contact sheet catches it                                                 |
| Over-the-shoulder from the far side                 | line crossed, hero out of frame                         | stay on the camera side; audit eye line                                                                        |
| Unkeyed cheat                                       | earlier shot changes                                    | `key_block` every movable at every block                                                                       |
| 6 fps board scene as a scene strip in a 24 fps edit | plays 4x fast                                           | export stills or retime                                                                                        |
| Every shot animated, mood lighting, full rigs       | slow, the edit fights the moves, nothing judged sooner  | stills plus `push`, `live` only when the move is the meaning, Workbench grays, mannequins                      |
| Coverage as separate strips or moved keys           | cuts drift from the action                              | `cover=True` run, `P.retime_cut`                                                                               |
| Fog world-aligned or in front                       | hero tinted, fog in every shot                          | `P.fog_for_shot` (behind the subjects, one shot)                                                               |

## Blender 5.2 notes

- `bpy.ops.render.opengl` fails in `--background`; use Workbench `render.render` (headless) or a
  camera-locked viewport in a live session.
- `keyframe_insert()` ignores the new-key interpolation preference (keys stay BEZIER) though "Only
  Insert Available" is on: call `P.make_stepped`.
- `frame_set` on a scene that is not the window scene leaves transforms stale, and a `write_still`
  render of such a scene uses the window scene's frame: `P.activate`, `P.render_frame`.
- VSE: `strips`, `left_handle`/`right_handle`, `content_start`; `SceneStrip.frame_start` and
  `frame_final_*` warn (removal in 6.0). `Strip.split(frame, split_method='SOFT')` splits from data.
  New scenes default to AgX: set the edit scene to the source view transform.
- `marker.camera = cam` binds headless; `bpy.ops.marker.camera_bind` needs a timeline context.
- Rigify is off under `--factory-startup`: `bpy.ops.object.armature_basic_human_metarig_add` raises
  "could not be found" until `P.ensure_rigify()`.
- Selection Sets, Storypencil and Grease Pencil Tools are not bundled; use a bone collection
  `layout`. The Storyboarding app template ships an Edit scene with sync on and auto-key off in Edit
  (pin off in its Storyboarding workspace).
- GP v3 strokes render in a headless Workbench still.

## References

- [`references/procedures.md`](references/procedures.md): tested code for every stage (with and
  without the module) and the trap tests; load before writing code.
- [`references/expert-notes.md`](references/expert-notes.md): each expert's principles,
  disagreements and deciding conditions, with timestamps; load when choosing a treatment, lens or
  cut.
- [`references/critique.md`](references/critique.md): the review rubric and the S6 findings; load at
  every Look gate.
- [`references/sources.md`](references/sources.md): the seven source videos, what each is best for,
  best timestamps.
