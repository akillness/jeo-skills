---
name: scenario-maya-animation
description: "Use when animating a character or prop in Maya through Python: a walk or run cycle, a jump or landing, a heavy lift, throw or punch, an acting or dialogue shot, lip sync, eye darts and blinks, stepped blocking, splining, polish, Graph Editor tangents, animation layers, mocap cleanup or retargeting, game clips and root motion, or reviewing a playblast. Also when motion looks floaty, weightless, mushy, poppy, posey, sliding or chattery, or feet slap or skate."
license: MIT
---

# Maya animation (animator)

Expert animation means every frame is a choice: poses that read as drawings from the camera, holds
and snaps placed on purpose, designed spacing, weight shown by resistance and a caught stop. Work
big to small (story, body, face, detail); never add detail to a stage that does not read yet. An
agent cannot scrub, so it measures (world and screen tracks, spacing, holds, contacts, a ballistic
fit, overlap lags), then looks at a playblast or a headless sheet before calling anything done. If a
sibling skill named here is missing from your available skills, load it with `skill_get` (Scenario
MCP) or ask the user to install it (https://github.com/scenario-labs/skills#install); unattended,
proceed from tool schemas and flag the gap.

**REQUIRED BACKGROUND:** scenario-maya-expert (execution channel, review loop, 2027 version traps).

Toolkit: [`scripts/mx_anim.py`](scripts/mx_anim.py). Its analysis and image layer is pure Python and
ran offline.

## Stance (the expert delta)

- **Pick the workflow per shot; blocking ends when the information is in.** Neistadt: pose to pose
  for acting, straight ahead or extremes for flow; blocking is done when all five key categories
  exist (main, anticipation, overshoot and follow-through, breakdown, hold). Elver splines physical
  shots from the start; Camporota proves timing on two boxes first.
- **Maya is "the worst in-betweener in the world" (Newman).** Feed it keys: ones on fast actions, 2
  to 4 frames apart on slow parts. Spline readiness is a test: spline the range, play; mush means
  back to stepped with more poses. Native Set Key reshapes neighboring curves (Wade): insert keys,
  prove it with a curve diff, and share keys across every control before splining.
- **Weight is resistance, then release, then a caught stop.** Wade: show what the character is up
  against (a delay, acceleration from rest) before its strength; strength is a frame count. Elver:
  more up and down reads as a balloon, not weight; weight is a fall caught abruptly, a bigger hold
  in the squash, residual jiggle. Heavy air is gravity-true [added physics]; Wade's weighted apex
  adds hang, for light or cartoony bodies.
- **Feet and spine sell every weight shift (jump, hop, landing, lift).** Camporota: animate the foot
  roll in every crouch, it sells the compression; in a big drop the spine drags behind the hips and
  only the arms drop; first passes overdo the anticipation, so dial it back; a touch-down goes flat
  "almost in one frame". Elver: on the first airborne frame the toe tip points back to where it left
  the ground.
- **Judge in camera space, at speed.** Elver: a motion trail can show a perfect 3D arc that fails on
  screen. Lazare: the eye goes to the biggest motion, so the non-focus character stays
  "appropriately still". Project tracks through the shot camera; read the playblast before any
  metric.
- **The base layer is the animation; mocap is precious.** Newman: a layer is a time-boxed experiment
  with marker keys and a protective key; never clean curves on it, merge with Smart Bake, then clean
  (Elver: only a late global note or an additive tremble, then bake). On mocap fix only the defect
  asked for, or the cascade ends "not hand key and not mocap"; after a merge, Euler filter, then
  delete keys down to extremes.
- **Lip sync animates sounds, not words.** Santos: jaw only first (the muppet pass), then the big
  five (jaw, two corners, top and bottom lip) for 90%; lead by place of articulation, bilabials on
  the frame. Lazare: shift every mouth key 1 to 2 frames earlier only when the whole line plays
  late.
- **Polish is triage; review is top down.** Elver ranks the notes, spends on the ones that pay, owns
  every contact frame. Newman grades Intent, Mechanics, Performance, Integration; a playblast does
  not prove game feel.

## Establish first

| Input                 | Why it changes the plan                                                                                                                              | Default when the brief is silent                               |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Style and destination | squash, stops, closeness to reference: cartoony pushes; live action needs pose squash and no dead stops (Elver); VFX stays near reference (Neistadt) | realistic feature quality                                      |
| Frame rate            | timing numbers, `currentUnit`                                                                                                                        | 24 fps (`film`)                                                |
| Weight and strength   | frames of resistance and of overcome (Wade: decide both numbers first)                                                                               | heavy: resistance beat of 2+ frames, no hang                   |
| Rig                   | control names, IK/FK, spaces, foot roll attribute (map once with `listAttr(keyable=True)`)                                                           | hands in IK, no IK/FK or space switches inside a shot (Newman) |
| Camera                | a locked shot camera is the only judge; games also need every angle and the engine                                                                   | build the shot camera, lock it                                 |
| Reference, audio      | landmarks (contacts, takeoff, apex, landing, blinks, darts) give rhythm, then push (Neistadt)                                                        | beat list from the brief                                       |
| Game metrics          | speeds and heights agreed in round numbers before animating (Newman); root motion or in place (Epic)                                                 | in place, metrics sheet requested                              |

## Workflow

1. **Plan in numbers.** Beats with frames, the leading part per beat, key categories, contacts,
   windows (crouch, push, air, impacts), style; `A.store_plan(plan)`. Physical shots:
   `A.air_frames(rise, drop)` budgets the air. Dialogue: phrases with subtext and an action verb,
   ruled sounds (M, B, P, F, V, L, T, D), 2 to 4 tentpoles (Santos, Wade). GATE: frame counts add
   up.
2. **Set up.** fps, range, sound, shot camera locked; query the tangent defaults (2027 notes). GATE:
   `mx_validate.validate(profile="shot", rules={"fps": 24})` has no fail.
3. **Proxy pass (big, fast or camera-bound moves).** `A.proxy_boxes()`, key translate and lean, air
   with `A.ballistic_keys()`, rotation 1 to 2 frames behind (Camporota). The first anticipation is
   usually too big: `A.scale_curve(root, "translateY", 0.8, rest_y, time=crouch)`. GATE:
   `A.evaluate_gates()` on the proxy (ballistic, catch, resistance, push_fastest);
   `proxy_curves.png` looked at.
4. **Blocking, stepped.** `A.set_key_defaults("blocking")`; `A.key_pose(pose, f, fill=ctrls)` keys
   every control on every pose; passes: main, anticipations, overshoots, breakdowns (favor a
   neighbor, never 50/50), holds (`A.key_hold()`); `A.share_keys(ctrls)`. Never act from the neutral
   rig pose (Neistadt). Crouch poses: foot roll keyed, spine dragging, arms hanging (Camporota).
   GATE: every key category present; stepped playblast (GUI) or `tracks.png`; write the story it
   reads, then check silhouettes.
5. **Spline pass 1, the core.** `snap = A.snapshot(ctrls)` (the buffer curve); `A.to_spline()` on
   COG, spine, legs only; face, eyes, fingers stay stepped (Camporota, Santos). Air gravity-true;
   broken tangent into a hard landing (Newman); planted feet flat. Mush: `A.restore(snap)`, add
   poses. Every later key: `A.insert_key()`, then `A.curve_diff()` on sampled snapshots is ok
   outside its two segments (P4). GATE: `A.run_gates(plan)` ballistic, hang, catch, slide,
   penetration, foot_roll, spine_drag, heel_to_flat pass; no `A.overshoots()` through holds.
6. **Spline pass 2, overlap.** Arms, head, secondary: correlated chains edited together first
   (Newman), then `A.offset_keys()` by 1 to 2 frames down the chain. GATE: `overlap` lags not all
   zero; `pose_to_pose_tell` low; tracks clean in camera.
7. **Face, if the shot has one.** Body first, then the mask (eyes, brows), then the mouth: muppet
   jaw keyed at `A.mouth_keys(phonemes)`, big five, tongue, connection by `A.copy_curve()` (nostrils
   1 frame behind the corners, dampened). Eyes linear, 2-frame darts; blinks close faster than they
   open. GATE: `A.jaw_report()`, `A.lip_lag()` against `A.audio_envelope()`, `A.blink_report()`,
   `A.transitions()`; close-ups on tentpoles.
8. **Polish, by triage.** Fix the top-ranked notes, one section at a time. Contacts and fast moves
   on ones; peel-off on every takeoff; impacts get a pushed squash and a bigger hold; pops become 3
   frames on an arc plus an overshoot; `A.retime()` tightens a section; moving holds; a
   motion-blurred render before final (all Elver). GATE: every gate passes (peel_off, impact_hold
   included), layers merged, no sub-frames, Euler filtered, critique.md on the final playblast.

**Variants.** Cycle: poses every 3 frames, loop with `A.cycle()` before polish, offsets inside the
cycle keep the period. Game clip: metrics, `A.cycle_speed()`, loop seam, root rules, then
scenario-maya-pipeline-scripting. Mocap: procedures P12; retarget: P13; heavy interactions: P9.

## Numbers

| Value                                                                                | Relative to            | Source                 |
| ------------------------------------------------------------------------------------ | ---------------------- | ---------------------- |
| Gravity 1.703 cm/frame^2 (981/576)                                                   | 24 fps, scene in cm    | physics [added]        |
| Walk keys every 3 frames: contact 1, down 4, pass 7, up 10, contact 13; loop 1 to 25 | 24-frame cycle         | Camporota              |
| Touch-down to flat foot about 1 frame, at most 2; walk arm offsets 0, 1, 2, head 1   | every step and landing | Camporota; body digest |
| Rotation 1 to 2 frames behind translation                                            | proxy and body         | Camporota              |
| Keys on ones on fast actions; 2 to 4 frames apart on slow ones                       | blocking               | Newman                 |
| Blink close 2 / open 4 (or 3 / 5; big eyes one more)                                 | frames                 | Elver                  |
| Eye dart 2 frames, linear; brows lead lids by 1 to 2, never 5                        | frames                 | Elver                  |
| Snappy move: 3 frames on an arc plus a small overshoot, never 1                      | frames                 | Elver                  |
| Global lip shift 1 to 2 frames earlier; opens near full on frame 1                   | when late at speed     | Lazare                 |
| Big five = 90% of lip sync; jaw plus corners 50 to 60%                               | controls               | Santos, Elver          |
| Game speeds: walk 2, run 4 to 6, sprint 12 to 15 m/s                                 | stylized player        | Newman                 |
| Playblast default scale 0.5: pass `percent=100`                                      | active view            | Maya 2027 Help         |

## Quality gates

**Measurable (`A.run_gates(plan)`; pure logic `A.evaluate_gates`), for any jump, hop, landing or
weight shift in the plan:** fps; heavy air g_ratio 0.8 to 1.25, hang excess at most 1 frame,
constant horizontal speed; catch (60%+ of the fall speed gone in 2 frames, decel shorter than
recovery), then a 3+ frame hold at the bottom; push fastest; heavy resistance beat of 3+ still
frames; every crouch: foot roll moves, spine lags the hips; touch-downs flat within 2 frames;
lift-off toe within 30 degrees of the takeoff spot; planted feet at most 0.2 cm/frame, penetration
under 0.5 cm; pre-landing stretch; no pops outside impacts; overlap lags; moving end hold; tell
under 90% after splining; no sub-frames; no layers at polish. [added] thresholds are toolkit
defaults. **Visual:** `A.review_images(plan, out)` (headless: `curves.png` stacked lanes,
`tracks.png` camera-space tracks with onion-skin poses); in the GUI `A.playblast_pack()` (shot
camera plus a no-lights silhouette) and a stepped-preview playblast. Read frames in time order;
write the first-view read before the numbers (critique.md).

## Common mistakes

| Mistake                                                                          | What it looks like                       | Fix                                                                      |
| -------------------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------ |
| Splining before the poses are in                                                 | mush, arms tweened through the body      | `A.restore(snap)`, add breakdowns stepped                                |
| Even spacing, whole body on the same frames                                      | floaty, "hitting poses"                  | favor neighbors, holds, `offset_keys` down the chains                    |
| First-pass anticipation kept                                                     | the crouch upstages the action           | `A.scale_curve(..., time=crouch)` about the rest value                   |
| Torso locked to the hips, arms swung back in the crouch                          | stiff, generic anticipation              | spine drags behind the hips, only the arms drop                          |
| Feet flat in the crouch, pointing forward at takeoff, slow to flatten on landing | weak compression, no push, slapping feet | foot roll; toe aimed back at the takeoff spot; flat within 1 to 2 frames |
| Stylized hang on a heavy body                                                    | floaty apex                              | `ballistic_keys`, flat apex, broken contact tangent                      |
| No resistance before the effort                                                  | styrofoam weight                         | 2+ frames of strain before the push                                      |
| Symmetric dip, or a bounce straight out of the squash                            | light landing                            | sudden catch, bigger hold, one overshoot, slow recovery                  |
| S or bare `setKeyframe` on a splined curve                                       | neighbors reshape, holds drift           | `A.insert_key`, then `A.curve_diff`                                      |
| Spline through a hold                                                            | drifting hold                            | `key_hold` pillars, flat or plateau sides                                |
| Arcs checked on a 3D trail                                                       | clean trail, broken arc on screen        | `camera_track` pixel tracks                                              |
| Lip sync keyed on the sound                                                      | late at speed                            | per-sound lead, then a global shift                                      |

## Handoffs

**Receives** from scenario-maya-rigging and scenario-maya-deformation: the rig referenced (never
imported), `validate(profile="rig")` clean, the control list with IK/FK, space and foot roll
attributes, a range-of-motion playblast. Rig problems (knee pop, flipping space) go back as a note
with frames. **Delivers** shots to scenario-maya-lighting-rendering: a new saved version,
`validate(profile="shot")` clean, layers merged, helpers deleted (`A.delete_helpers()`), `run_gates`
JSON with no fail, the final playblast the agent looked at, what was not verified. Game clips to
scenario-maya-pipeline-scripting: skeleton baked per clip, clip names and ranges (bookmarks), root
rule (in place or root motion), loop seam and speed reports.

## Maya 2027 notes

- Default tangent: Auto Span (Legacy) on one doc page, Clamped on another: query
  `keyTangent(q=True, g=True, itt=True)`. Lock/Free Tangent Weight is now Tangent Length;
  Butterworth is Smooth Filter (Butterworth).
- Time Slider > Enable Stepped Preview; `A.stepped_preview()` is the scripted twin. Dope Sheet Time
  Snap is off since 2025.1 and `scaleKey` leaves sub-frames: `A.snap_subframes()`.
- Ghost Editor and Motion Trail Editor sit under Visualize; ghosting a skinned mesh needs Cached
  Playback (disabled by motion blur, Trax, classic dynamics).
- Playblast needs a model panel (GUI via mx_bridge); in mayapy use `review_images` or Arnold stills.
- Sequencer (ex Camera Sequencer): lock every camera. HumanIK bakes from its own window, not Bake
  Simulation. Time Editor clips never mix with animation layers. Blue Pencil replaced Grease Pencil.

## References

- [`references/expert-notes.md`](references/expert-notes.md): principles and numbers by expert,
  timestamps, deciding conditions. Load to choose an approach or write notes.
- [`references/procedures.md`](references/procedures.md): the `mx_anim` API and full procedures with
  test paths. Load before writing code.
- [`references/critique.md`](references/critique.md): review rubric (first-view read, four buckets),
  director lingo, note format. Load at every gate.
- [`references/gui-paths.md`](references/gui-paths.md): menus, hotkeys, editor settings. Load for a
  computer-use agent or a human.
- [`references/sources.md`](references/sources.md): every source, credential, URL and best
  timestamp.
