---
name: scenario-blender-animation
description: "Use when animating characters or objects in Blender through Python, a bouncing ball, walk or run cycle, jump, acting shot, lip sync, eye darts or facial animation, blocking in stepped keys, splining, polish, timing and spacing, arcs, overlap, squash and stretch, graph editor handles, slotted actions or NLA layers, staging a playblast, or when animation looks floaty, stiff, slides, pops, chatters, the subject is too small in frame, or a knee pops and needs an expert review."
license: MIT
---

# Blender animation (character and object)

Expert animation means every frame on screen is a choice: key poses the audience reads, holds and
snaps placed by hand, spacing designed, arcs checked. The Blender Studio stance is to block stepped,
spline late and in parts, and judge from the shot camera at real speed. An agent cannot scrub, so it
measures instead: per-frame positions, spacing charts, arc checks, framing, an onion-skin image, a
curve plot, and a playblast it actually looks at. If a sibling skill named here is missing from your
available skills, load it with `skill_get` (Scenario MCP) or ask the user to install it
(https://github.com/scenario-labs/skills#install); unattended, proceed from tool schemas and flag
the gap.

**REQUIRED BACKGROUND:** scenario-blender-expert (execution channel, review loop, 5.2 API changes).
Shot planning, cameras and animatics belong to scenario-blender-previs-storyboard; building the rig
to scenario-blender-rigging. A clip that guides a render-to-real video model belongs to
scenario-blender-blockout: the model copies keyed limbs as they are, so its cast styles often hand
it a limbless stand-in and let it animate the gait.

Toolkit: [`scripts/bx_anim.py`](scripts/bx_anim.py) (keying, blocking-to-spline, curve checks,
measurement, staging, playblast light, knee-pop, flip and balance checks, onion-skin and curve
images, one-object `bouncing_ball`; API in procedures.md, tested on 5.2.1) and
`bx_review.playblast`.

## Stance (the expert delta)

- **Stay stepped long ("Blocking+").** Hjalti Hjalmarsson: juniors spline too early; computer
  in-betweens are "unintentional interpolated poses" that make notes hard. Keep adding hand-made
  breakdowns while stepped; splining is short and late.
- **Never convert the whole blocking to Bezier.** Rik Schutte: key every main control on every key
  pose, copy each pose to the end of its hold ("pillars"), then spline the body only; face and
  fingers stay stepped until their own pass. Measured on 5.2.1: the naive conversion drifted 84% of
  the next move across a hold, the pillars held at exactly 0.
- **Snaps are authored.** Rik: hold, then change pose in 2 to 3 frames; only big deliberate moves
  are left to interpolation. [added, measured] A contact inside continuous motion (a jump landing)
  is not a hold: pillaring it cut the body's speed at impact from 0.101 to 0.007 m per frame, a
  floaty landing.
- **Odd frames, even gaps; breakdowns shape arcs and steer the eye.** Alex Nagy: key poses on odd
  frames with even spacing so a true middle frame exists. The breakdown sets the arc first, the
  timing second; favoring it late leaves more travel for the last frames, and the fastest part draws
  the eye.
- **The handle type is a timing decision.** AUTO_CLAMPED keeps holds flat; AUTO overshoots between
  two equal keys (Alex uses it to push a pose or cushion a settle); VECTOR for hard hits, contacts
  and take-offs (Alex, Dillon Gu); FREE for burst spacing and exact arcs (Raymond Luc, Joey
  Carlino).
- **Lead with one part, layer the rest.** Rik blocks a torso-only rhythm pass first; Dillon leads
  body mechanics with the COG and acting with the head or eyes. Overlap goes into the blocking, and
  a head never turns on one axis only (Rik).
- **Lip sync is rhythm before shapes.** Rik: jaw first, stepped, opened big only on accents;
  off-sync is a missing preparation, not a global offset; M, B, P closed at least 2 frames and
  closed before the sound.
- **Spacing is felt, arcs are checked, the shot must read.** Raymond: the audience should feel
  spacing tricks, not see them. Pablo Fournier: arcs are the most important check (root, hands,
  feet, nose), in camera space. Hjalti (in scenario-blender-previs-storyboard): after each cut the
  eye must find one thing, so a subject lost in an empty frame fails however good the curves are.

## Establish first

| Input             | Why it changes the plan                                                                                                                                                                                                                                                                | Default when silent                                                      |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Medium, fps       | Film 24 (Hjalti); games often 30 with fixed hit or release frames (Picaut)                                                                                                                                                                                                             | 24 fps                                                                   |
| Camera            | Locked acting shot: judge only through the camera (Rik). Moving, re-framable or gameplay camera: poses work from every direction (Leo Silly-Pelissier, Picaut)                                                                                                                         | locked camera                                                            |
| Style             | Stepped on twos and never splined (Sprite Fright shots, Rik) vs splined; stylized vs naturalistic (Leo)                                                                                                                                                                                | splined, stylized                                                        |
| Rig               | Control names, IK/FK, rotation modes. Generated Rigify [verified]: `torso`, `hips`, `chest`, `head`, `foot_ik.L`, `upper_arm_fk.L`, `jaw_master`; `["IK_FK"]` on `upper_arm_parent.L` (0 IK, 1 FK); legs have `IK_Stretch` 1.0; rest legs are 99.6% straight; main controls QUATERNION | FK arms when arcs matter, IK when hands touch things (Joey, Tony Garcia) |
| Named object      | A brief that names the animated object expects every channel on it                                                                                                                                                                                                                     | one object, `bouncing_ball(obj=...)`                                     |
| Audio, transcript | Beats, accents, phoneme preparation                                                                                                                                                                                                                                                    | beats from the brief                                                     |
| Reference         | Timing and beats, never a trace (Hjalti)                                                                                                                                                                                                                                               | none: write a beat list                                                  |
| Budget            | Rik: about 3 s a week in big studios, 5 to 6 s on his acting shot; Flow: 2 s per animator per day                                                                                                                                                                                      | state what the budget buys                                               |

## Workflow

1. **Plan.** Beat list with frames: every acting beat in order (Hjalti counts about 8 per shot),
   sub-beats notice, react, realize, respond (Rik), the leading part per beat. With audio,
   `audio_envelope` + `accent_frames`; hit a pose just before its audio peak (Alex). Start
   mid-action (Rik). GATE: beat table written.
2. **Set up and stage the shot** (P1, P18): fps, range, sound, passepartout 0.99, Simplify for
   previews. Place the camera, then `staging_report(subject, frames)` with the real render size:
   subject height, how much of the frame the action covers, entry, final pose margin. Playblast
   look: `playblast_lighting(key_dir=(0, 0, 1))` (overhead key converted to Workbench's camera
   space: the shadow sits under the subject, the gap is its height, contact is where they meet),
   `floor_slab`, `rotation_texture` on anything that rolls. GATE: `flags` empty; `shadow_frames`
   visible in the air and touching at a contact; camera stills looked at.
3. **Block A, key poses stepped.** Strongest, longest-held pose first (Alex). Build each pose COG,
   feet (weight over the support foot, feet never twins, knees soft), hips, chest, head, arms. Pose
   in world terms with `world_pose` (rig axes are arbitrary), key with
   `key_pose(..., keytype='EXTREME')`, CONSTANT, all main controls. GATE: pose strip
   `onion_skin(frames=keys, spread=...)` shows clear silhouettes and contrast; `balance_report`
   margin >= 0 on held poses.
4. **Blocking+ (still stepped).** `breakdown` at the middle frame with per-part `factors` (COG dips,
   extremities delayed at 0.2 to 0.3, directed part favored late; after a take-off the body is
   ballistic, about 2/3 of the rise in 3 of 7 frames, and the feet must follow); `ease_inbetweens`
   for 20/80 (Pablo); overshoots and settles; overlap offsets; key types as a confidence map
   (Hjalti). GATE: stepped playblast approved; notes on intent stopped (Leo: none after Block B).
5. **Spline the body** with `blocking_to_spline(rig, body_bones, transition=3, interpolate={...})`:
   big moves and continuous contacts in `interpolate`; VECTOR on foot contacts and take-offs. GATE:
   `hold_drift` < 1e-5, `overshoots` only wanted settles, face still CONSTANT, `motion_report`
   without unintended constant spacing, `ballistic_fit` on the airborne COG with `g_ratio` near 1.0
   and a small residual, `limb_extension` never above 1.0.
6. **Re-inject energy** (Leo: splining softens): timing accents, overshoots, desynchronized parts,
   `offset_keys` 1 to 2 frames per chain link (Dillon), head lag 2 to 3 frames in cycles (Joey),
   contacts that slide rather than glue (Rik). Fingers: little overlap, no bounce. GATE: arcs clean
   in camera pixels (`to_camera(..., res=(w, h))`, `motion_report(dims=2)`).
7. **Face and lip sync, stepped** (P6, P7): jaw rhythm, corners (never dead center), shapes from a
   pose library on the lower face minus the jaw, accents and asymmetry in small doses, tongue last,
   then spline the face. Eyes dart in 1 to 2 frames and lead the head; brows 3 to 10 frames (Rik).
   Keys an engine or capture app reads by name (ARKit, visemes): scenario-blender-rigging's
   `shape_report` before keying. GATE: `transitions` meets those counts; accents clearly fewer than
   syllables.
8. **Polish.** `foot_slip` under 1 mm (dense keys: `foot_contacts`, P19), `lowest_point` for
   penetration, `rotation_flips` empty (`fix_rotation_flips`), `limb_extension` under 0.99 wherever
   the leg should stay bent, smears 1 frame (Pablo), burst spacing only now (Raymond), subdivision
   on. GATE: critique.md rubric passes on the final playblast, onion skin and graph image.

**Variants.** Bouncing ball (P16, P18):
`bouncing_ball(obj=ANIM_ball, first_apex=-3, fit=False, ...)` keys ONE object: exact parabolas under
one gravity through whole-frame contacts, odd or even flights so small hops keep their height,
squash on the contact frame and stretch along the velocity through a world-aligned squash modifier
(the roll is never twisted), roll = distance / radius, constant-deceleration roll, a 6-frame hold.
`first_apex` before `start` throws it in from off-screen. Weight mapping is [added]: tune by render.
Walk (Joey, 30 fps): contact 0, down 5, passing 10, up 15, 40-frame cycle; heel curve straight
during contact, root linear with REPEAT_OFFSET (P5). Jump:
`tests/code/blender-animation/test_rigify_jump.py` is the worked example (Rigify human, blocking to
spline).

## Numbers

| Item                              | Value                                                                                                 | Source                             |
| --------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Snappy pose change                | 2 to 3 frames after the hold                                                                          | Rik                                |
| Aggressive change                 | 4 frames instead of 8                                                                                 | Alex                               |
| Hold to read an idea              | 6 frames                                                                                              | Alex                               |
| Settle                            | 1 to 2 frames, 4 soft                                                                                 | Alex                               |
| Reaction after stimulus           | about 6 frames                                                                                        | Rik                                |
| Eye dart / brow change            | 1 to 2 / 3 to 10 frames                                                                               | Rik                                |
| Ease rule                         | 80% of the remaining way per in-between (slow-in); mirror 20%                                         | Pablo                              |
| Smear                             | 1 frame, sometimes 2                                                                                  | Pablo                              |
| Micro-anticipation                | last 1 to 2 frames before hit or release pushed to an extreme                                         | Picaut                             |
| Head lag in a cycle / foot offset | 2 to 3 frames / 1 frame                                                                               | Joey / Rik                         |
| Real gravity at 24 fps            | acceleration 0.01703 m/frame^2; a quadratic fit's leading coefficient is half (-0.00852). `gravity()` | physics [added]                    |
| Subject size in frame             | 12% of frame height minimum, 15% or more for a single subject                                         | [added] E3: both runs measured 10% |
| IK leg extension                  | under 0.99 of full length while meant bent; above 1.0 = IK stretch                                    | [added]                            |
| Pinwheel on a rolling object      | roll per frame under 360 / sectors degrees                                                            | [added] wagon-wheel                |

## Quality gates

**Measurable:** slot named after the character; key poses CONSTANT and typed before approval;
`hold_drift` ~0; `overshoots` only on settles; `foot_slip` < 1 mm; `lowest_point` never below the
floor (sample sub-frames); `transitions` for darts, brows, snaps, plosives; `ballistic_fit` g_ratio
near 1 at real scale; `motion_report`: sharp turns only at contacts, no arc wobble or start-stops
inside a move; `staging_report` flags empty with shadow frames visible; `limb_extension`,
`rotation_flips`, `balance_report` as above; `roll_aliasing` ok. **Visual** (open every image): pose
strip, onion skin through the shot camera with tracks, `graph_image`, playblast frame sheets
(subject size, entry, shadow gap closing at contacts, spin readable), orbit views when the camera is
not locked.

## Common mistakes

| Mistake                                  | What it looks like                                                           | Fix                                                           |
| ---------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Whole blocking to Bezier                 | "floaty spaghetti"                                                           | `blocking_to_spline` with pillars, body only                  |
| Pillar on a continuous contact           | body brakes before impact                                                    | put that frame in `interpolate`; VECTOR on the foot           |
| AUTO handles on a hold                   | hold drifts past the pose                                                    | AUTO_CLAMPED; AUTO only for a settle                          |
| Heel curve eased during contact          | foot slides (5.8 cm per step measured)                                       | VECTOR or zero-length FREE handles                            |
| Jaw open on every syllable               | chattering mouth                                                             | big opens on `accent_frames` only                             |
| BOUNCE easing for a ball                 | no squash frame ever shows                                                   | `bouncing_ball` or keyed whole-frame contacts                 |
| Squash on a parent that also aims        | pattern twists on stretch frames (55 degrees measured on the old rig)        | `squash_modifier` (world axes) on the object itself           |
| Flights rounded to even frames           | hops lose or gain height, gravity changes per bounce (0.98 to 1.31 measured) | whole-frame contacts, odd flights allowed, one gravity        |
| Framing the whole set                    | subject 10% of frame, top 40% empty                                          | move in or shorten the travel until `staging_report` is clean |
| `display.light_direction` read as world  | shadow hidden behind the subject (0 px)                                      | `playblast_lighting(key_dir=...)`                             |
| Arcs checked in normalized camera coords | false sharp turns at apexes (aspect squeezes x)                              | `to_camera(..., res=(w, h))`                                  |
| Legs straight at stand or push-off       | IK stretch lengthens the leg (18% in the first jump draft)                   | soft knees, feet breakdown after take-off, VECTOR take-off    |

## Blender 5.2 notes

- `action.fcurves` is gone: channelbags via `bpy_extras.anim_utils` (`bx_anim.channelbag`).
  Assigning an action animates only if a slot matches; otherwise set `ad.action_slot`.
- One layer per action (`layers.new` raises); layer with the NLA plus an ADD or COMBINE action
  (`push_layer`).
- `keyframe_points.insert` gives BEZIER AUTO_CLAMPED; a Keyframe reference dies at the next insert
  on that curve.
- Headless: `anim.keyframe_insert` fails; `pose.breakdown` and `pose.blend_to_neighbor` need
  explicit `prev_frame`/`next_frame`; `render.opengl` refuses, so playblasts are Workbench renders.
- Workbench `scene.display.light_direction` is camera-relative; `matrix_world` is stale until
  `view_layer.update()`, so convert after it.
- GN modifier inputs key at `modifiers["X"].properties.inputs.Socket_n.value`.
- Playblast audio: sound strip plus `render.ffmpeg.audio_codec = 'AAC'`.
- Keymap: Up = previous key, Down = next (5.0). Not in 5.2: action layers, paste-pose blending,
  range world-space copy (5.3).

## References

- [`references/expert-notes.md`](references/expert-notes.md): principles, numbers and disagreements
  by expert, with timestamps; load when choosing between approaches or writing notes.
- [`references/procedures.md`](references/procedures.md): full tested code for every procedure
  (setup, blocking, spline, walk, lip sync, facial timing, contact pin, slots, layers, pose library,
  playblast, measurement, ball, staging, knee/flip/balance); load before writing code.
- [`references/critique.md`](references/critique.md): the review rubric per stage, staging
  thresholds and their calibration, how these animators phrase notes; load at every gate.
- [`references/sources.md`](references/sources.md): the 14 source videos, what each is best for,
  best timestamps.
