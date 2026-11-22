# Critique rubric: how these animators judge a shot

Use at every gate. Supervisors judge what reads on first viewing (Lazare, m8YPvVtfLhw [00:13:36]),
so the agent looks first and measures second, then reports which items were measured and which were
judged by eye.

## 1. The review pack (render it, then open every image)

1. **Time-ordered frames through the shot camera.** GUI:
   `A.playblast_pack(out, s, e, cameras=("shotCam",))`, plus the stepped-preview pass in blocking.
   Headless: `tracks.png` from `A.review_images(plan, out)`. Read every 2nd frame for the whole
   shot, then every frame on flagged ranges.
2. **Silhouette pass** (no lights, black shapes; Camporota FA7fPB7qUhE [00:06:07], Elver jzuxAmadcm8
   [01:03:43]).
3. **Stacked curve lanes** `curves.png` (Wade TMSpauVphNs [00:03:55]): holds flat but not dead,
   eases where planned, face still stepped in body passes.
4. **Numbers**: `A.format_gates(A.run_gates(plan))`, plus
   `A.format_report(A.motion_report(track, frames))` on COG, head, hands, feet, in world and in
   camera pixels.
5. **Close-ups** for faces: frames on tentpoles and ruled sounds (M, B, P, F, V, L, T, D).
6. **Progression**: the previous version and this one side by side (never overwrite a playblast
   folder; version it).
7. **Rendered read** before final polish: motion-blurred low-resolution frames around fast moves
   (Elver [00:27:19]).

## 2. First-view read (write it before any metric)

Write three lines from the time-ordered frames alone: what happens, where the eye goes on each beat,
how many beats read. Then compare with the plan's intent sentence and beat count. A mismatch is an
Intent note and outranks everything below it (Newman 7r_Czt3-SKE [00:05:23]). "I caught it on the
second or third viewing" means restage, not more animation (Lazare [00:13:36]).

## 3. The rubric, in supervisor order

Each row: what the expert looks at, the source, the measurable proxy, what to look for in the
images.

**Intent and staging**

| Look at                                                          | Source                                             | Measure                                                                                  | See                                           |
| ---------------------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------- |
| The shot says what the brief says; story readable stepped        | Newman [00:05:23]; Neistadt GMTet6nd_iM [00:03:14] | plan beats vs key poses                                                                  | stepped pass tells the gist                   |
| Attention: the biggest motion is on the focus                    | Lazare [00:05:07]                                  | screen-space motion energy per character per beat (`camera_track` speeds summed) [added] | the non-focus character "appropriately still" |
| Lead with what should read (hand before body, head out of frame) | Lazare [00:14:09] [00:24:46]                       | `peak_order` of the leading part vs the body                                             | the lead is visible first                     |
| Key actions not occluded                                         | Lazare [00:43:58]                                  | [added] ID-color playblast pixel count, optional                                         | wings, hands, props in clear view             |

**Beats and timing**

| Look at                                                                      | Source                        | Measure                                            | See                             |
| ---------------------------------------------------------------------------- | ----------------------------- | -------------------------------------------------- | ------------------------------- |
| Holds exist and let the audience breathe                                     | Neistadt [00:31:14]           | `holds()` on COG and head per beat                 | poses register                  |
| One beat vs three: sub-poses held slightly                                   | Newman [00:10:49]             | hold count vs intended beats                       | each beat readable              |
| No double beats; progressions go further                                     | Lazare [00:08:28]             | `double_beats(values, frames)`                     | second hit bigger               |
| No hitching on every word; payoffs held long enough (6+ frames on the laugh) | Lazare [00:26:34] [00:34:25]  | beats per second; payoff hold length               | not crammed                     |
| Even spacing of poses is always wrong                                        | Neistadt [00:05:24]           | `motion_report()["constant_spacing"]` inside moves | no drift driven by the computer |
| Fast parts keyed densely in blocking                                         | Newman QiOGugW8Ips [00:15:27] | `key_density()`                                    | no mush when splined            |

**Body mechanics and weight**

| Look at                                                                           | Source                                          | Measure                                                                                  | See                                                      |
| --------------------------------------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| COG as a ball; chest and hips two balls                                           | Elver [00:02:44] [00:07:40]                     | `cog_proxy()` track, `motion_report`                                                     | the ball alone reads the move                            |
| Resistance before release; strength as frame count                                | Wade ZYKAMCZq2UI [00:01:49] [00:05:00]          | gate `resistance`; frames resistance to extension                                        | stone, not styrofoam                                     |
| Anticipation eases in, releases fast; not overdone (first passes usually are)     | Camporota FA7fPB7qUhE [00:03:11] [00:03:46]     | gate `push_fastest`; crouch depth vs the previous version                                | energy on the push; the crouch does not upstage the jump |
| Foot roll in every crouch sells the compression                                   | Camporota [00:07:55] [00:08:28]                 | gate `foot_roll`                                                                         | heels and toes working, not planks                       |
| In a big drop the spine drags behind the hips; only the arms drop                 | Camporota [00:08:28]                            | gate `spine_drag`                                                                        | bent over, arms hanging, not a rigid block               |
| Air: gravity for heavy bodies, hang only when stylized                            | physics [added]; Wade TMSpauVphNs [00:07:29]    | gates `ballistic`, `hang`, `air_horizontal`                                              | no float at the apex                                     |
| Landing: sudden catch, residual jiggle, one overshoot                             | Elver [00:58:46]; Newman TIBzcsOt2FU [00:13:56] | gate `catch`                                                                             | felt, "you don't really see it"                          |
| Impact: squash pushed, a bigger hold before the recovery                          | Elver [00:13:54] [00:14:29]                     | gate `impact_hold` (3+ frames [added])                                                   | the landing registers, no bounce straight out            |
| Legs reach before landing                                                         | Camporota [00:02:32]                            | gate `pre_landing_stretch`                                                               | stretch on the last air key                              |
| Momentum kept in camera space                                                     | Elver [00:06:01] [00:35:45]                     | camera-space speed near zero while world speed is not                                    | no stop-start on screen                                  |
| Line of action through hips, shoulders, neck, head; no flat shoulder or hip lines | Camporota [00:14:13]; Lazare [00:40:55]         | shoulder and hip line angle in camera space on key poses (under 2 degrees flags) [added] | curves, not flat lines                                   |
| Live action: pose squash, no dead stops                                           | Elver [00:45:32] [00:54:54]                     | gate `moving_hold`                                                                       | nothing freezes                                          |

**Contacts**

| Look at                                                                           | Source                                        | Measure                                                      | See                                     |
| --------------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------ | --------------------------------------- |
| Plants locked on every frame                                                      | Elver [00:41:45]                              | gates `slide_*` (0.2 cm/frame [added])                       | feet and hands do not skate             |
| No penetration of floor or box                                                    | Camporota ynXadXE9UjU [00:09:26]              | gates `penetration_*` (0.5 cm [added])                       | soles on the surface                    |
| Peel-off: on the first airborne frame the toe tip points back to the takeoff spot | Elver [00:10:32] [00:11:04]                   | gates `peel_off_*` (`peel_angle` at most 30 degrees [added]) | push sells, even with the leg stretched |
| Feet flat within 1 to 2 frames of every touch-down                                | Camporota ynXadXE9UjU [00:09:26]; body digest | gates `heel_to_flat_*` (`foot_events`)                       | no slapping or slow-rolling feet        |
| Hand plants splay on impact                                                       | Lazare [00:38:33]                             | none                                                         | fingers spread                          |

**Arcs, spacing, silhouette**

| Look at                                        | Source                                 | Measure                                                                         | See                                 |
| ---------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------- |
| Arcs judged on screen, not on 3D trails        | Elver [00:08:17]                       | `camera_track` + `motion_report` sharp turns                                    | smooth dotted paths in `tracks.png` |
| No one-frame pops; snappy = 3 frames on an arc | Elver [01:02:04]                       | gates `spikes_*` (local outliers)                                               | no jumps between dots               |
| Falls and pushes not evenly spaced             | Elver [00:09:55]                       | constant-spacing runs inside falls                                              | dots spread as speed grows          |
| Knee pops where the IK leg straightens         | Camporota [00:14:10]                   | hip-to-ankle distance over 98% of leg length with an acceleration spike [added] | no kink in the knee track           |
| Leg and body silhouettes clear                 | Elver [00:12:46]; Camporota [00:06:07] | none                                                                            | black shapes read                   |

**Overlap and chains**

| Look at                                    | Source                                           | Measure                                            | See                     |
| ------------------------------------------ | ------------------------------------------------ | -------------------------------------------------- | ----------------------- |
| Not everything on the same frames          | Neistadt [00:07:02]; Wade ZYKAMCZq2UI [00:09:34] | gates `pose_to_pose_tell`, `overlap`               | follow-through visible  |
| Force core outward                         | Wade [00:07:39]                                  | `peak_order` pelvis, chest, shoulder, elbow, wrist | the body pushes the arm |
| Secondary objects land 1 to 2 frames later | Lazare [00:32:07]                                | `lag_frames`                                       | weight in the follower  |

**Performance, face, lip sync**

| Look at                                                                 | Source                                                    | Measure                                                             | See                         |
| ----------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------- |
| Right level for the character; secondary quieter; consistent            | Newman [00:06:31]                                         | eye and brow key density per second ("eyes doing too much") [added] | reads as this character     |
| Eyes: linear darts of 2 frames, locked holds, no accidental camera look | Elver [00:19:29] [00:25:37]                               | `transitions()` lengths; eye aim to camera angle [added]            | sharp, not floating         |
| Blinks close faster than they open, small-then-big spacing              | Elver [00:20:02]                                          | `blink_report()`                                                    | cushioned blinks            |
| Brows lead lids by at most 1 to 2 frames; no drifting inner brow        | Elver [00:22:16] [00:30:43]                               | `lag_frames(brow, lid)`                                             | connected face              |
| Lip sync not late; opens punchy                                         | Lazare [00:19:33] [00:21:21]                              | `lip_lag()`, `jaw_report()["opens"]` first-frame share              | in sync at speed            |
| No chatter; 2 to 4 tentpoles per line                                   | Santos S1MRs3XJVPI [00:13:54] [00:34:28]                  | `jaw_report()` reversals per second, tentpole ratio                 | "a word, a word, a word"    |
| Closures on M, B, P, F, V; tongue on L, T, D, TH; teeth anchored        | Wade 5cIxEZwZmS4 [00:08:49] [00:37:24]; Santos [00:36:03] | lip distance on ruled frames [added]; tongue single-frame spikes    | shapes drawn and asymmetric |
| Corners flow, never TZ; width set by neighbors                          | Santos [00:48:24]; Wade [00:23:31]                        | corner TZ has no keys; direction changes inside a word              | no football mouth           |
| Face connected to the mouth and body                                    | Santos [00:19:24] [00:37:40]                              | `lag_frames(corner, nostril)` about 1                               | fleshy                      |

**Rendered read and integration**

| Look at                             | Source                      | Measure                                         | See                                    |
| ----------------------------------- | --------------------------- | ----------------------------------------------- | -------------------------------------- |
| Motion blur and fur change the read | Elver [00:27:51]            | adjacent keys with a big jump (half-frame fix)  | fast moves soft, not smeared wrong     |
| Game feel is judged in engine       | Newman [00:07:20]           | `cycle_speed` vs metrics, loop seam, root rules | mark done, implement, expect revisions |
| Plate integration, CFX follow-up    | Elver [00:44:28] [00:54:19] | gross interpenetration count [added]            | sits in the plate; cloth can simulate  |

**Technical hygiene (always)** Layers merged at polish (gate `layers`); no sub-frame keys (gate
`subframes`); no rotation flips (`rotation_flips`, Euler filter); scripted keys left their neighbors
alone (`curve_diff(before, after, ignore)` ok; Wade TMSpauVphNs [00:02:18]); face stepped until its
pass; helpers deleted (`delete_helpers`); scene fps equals the plan (gate `fps`).

## 4. What done means per stage

- **Blocking:** every key category present; stepped pass tells the story; silhouettes read; no
  Intent notes left.
- **Spline:** no mush (readiness passed), all mechanics gates pass, overshoots only where planned,
  face still stepped if it has its own pass.
- **Polish:** every gate passes; the top-ranked notes fixed; blurred render looked at; the final
  playblast looked at frame by frame on contacts and fast moves.

## 5. Writing notes (and reading human ones)

Format each note: bucket (Intent, Mechanics, Performance, Integration), frame range, what reads, the
concrete change, priority. Start with what works (Lazare [00:01:13]). Keep it about the work, never
the person (Newman [00:04:33]). Rank and fix only the top items per iteration (Elver [00:03:49]).
Store every human note in the project's notes file by character and action, and read it before
similar work (Newman [00:11:50]).

Director lingo, both ways (Newman [00:09:43] to [00:10:49]):

| They say                             | It means                             | The agent does                                      |
| ------------------------------------ | ------------------------------------ | --------------------------------------------------- |
| "The anticipation reads thin"        | not bold enough                      | bigger counter-move, longer hold before the release |
| "The eyes are doing too much"        | trying too hard on the face          | fewer eye and brow keys, smaller amplitude          |
| "One beat instead of two (or three)" | sub-actions blur together            | hold each sub-pose a few frames                     |
| "Floaty"                             | spacing driven by interpolation      | favor keys, add holds, gravity-true air             |
| "It feels like hitting poses"        | everything starts and stops together | offsets, overlap, break key columns                 |
| "Late" (lip sync)                    | shapes form on the sound             | per-sound lead, then shift 1 to 2 frames earlier    |

## 6. Calibration of the [added] thresholds

Tuned offline on a synthetic M4 jump (`tests/code/maya-animation/_m4_motion.py`): a physically
consistent version passes all 23 gates; half gravity fails `ballistic` (g_ratio 0.50); a 0.5
cm/frame planted slide fails `slide_R`; a crouch with no beat fails `resistance`; a frozen ending
warns `moving_hold`; flat feet in the crouch warn `foot_roll`; a chest locked to the hips warns
`spine_drag`; a flat foot on the first airborne frame (90 degrees) warns `peel_off_*`; heels taking
4 frames warn `heel_to_flat_*`; a bounce out of the lowest frame (hold 1) warns `impact_hold`. The
foot, spine and hold gates are warnings: they flag a detail to look at, the playblast decides. They
are starting values for a human-scale rig in cm at 24 fps: scale them with the rig and the style,
and record any change in the plan.
