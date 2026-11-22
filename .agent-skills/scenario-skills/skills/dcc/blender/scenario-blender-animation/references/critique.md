# Critique rubric: how these animators judge a shot

Use at every gate. Each item: what the expert looks at (source), the measurable proxy (bx_anim
call), and what to look for in the renders. Measure first, then look; report which items were
measured and which were judged by eye.

## The review pack (render it, then open every image)

1. **Pose strip** of the key poses: `onion_skin(frames=key_poses, spread=300, view=...)` (the
   agent's version of flipping between poses; Alex Nagy, Hjalti Hjalmarsson flip extremes with arrow
   keys or markers).
2. **Shot-camera playblast** at the scene fps with dialogue: `bx_review.playblast` with
   `ffmpeg.audio_codec='AAC'`; pull a frame sheet with ffmpeg and look at it. Everything is judged
   from the shot camera when it is locked (Rik Schutte); add front, side and top orbit renders when
   the camera moves or may be re-framed (Leo Silly-Pelissier, Pierrick Picaut).
3. **Onion skin with tracks** on root or COG, hands, feet, head or nose: `onion_skin(track=[...])`
   (Pablo Fournier's arc check).
4. **Curve plot** of the main controls: `graph_image` (holds flat, eases where planned, face still
   stepped).
5. **Numbers**: `format_report(motion_report(...))` per tracked part, in world and in camera pixels
   (`to_camera(..., res=(w, h))`, `dims=2`), plus `hold_drift`, `overshoots`, `transitions`,
   `foot_slip`, `lowest_point`, `ballistic_fit`, `limb_extension`, `rotation_flips`,
   `balance_report`.
6. **Staging**: `format_staging(staging_report(subject, frames, shadow_frames=[airborne, contact]))`
   with the shot camera and render size, and two ffmpeg frame sheets from the playblast (every third
   frame; the frames around the hardest contact).
7. **Progression**: the stepped blocking, the previous version and the current one side by side (Rik
   plays blocking, earlier spline and current back to back, hnHemwjznPc [02:40:00]).

Preview speed: Simplify with max subdivision 0 (Tony Garcia: a production scene went from 5 to 24
fps, fbfODZ8PO4E [00:17:43]); polish review with subdivision back on (Rik).

## 1. Intent and staging (Block A)

| Look at                                                                        | Source                                                            | Measure                                                                                                                                                                 | See                                                                           |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Every beat present, in order; sub-beats (notice, react, realize, respond)      | Hjalti eOxVdBgoehk [00:13:40]; Rik NEZVF93fKsM [00:22:43]         | beat table vs key frames                                                                                                                                                | each beat has a distinct pose in the strip                                    |
| Pose reads from the camera: clear silhouette, no arm crossing the body         | Alex p8Bi7k60IS0 [00:36:38]; Rik hnHemwjznPc [01:28:36]           | none                                                                                                                                                                    | silhouettes in the strip, black shapes read without detail                    |
| Contrast between consecutive key poses; sizes vary (small, small, big, medium) | Alex [00:05:55], [00:27:55]                                       | COG and hand distance between key poses                                                                                                                                 | neighboring poses in the strip are clearly different                          |
| Leading part per beat (COG for mechanics, head or eyes for acting)             | Dillon Gu fbfODZ8PO4E [00:27:37]; Rik zhktftWbumE [00:05:43]      | `transitions` start frames: leading part moves first                                                                                                                    | the lead is visible in blocking                                               |
| Weight over the support foot, feet never twins                                 | Alex [00:30:06]-[00:34:26]; Joey Carlino nRtT7Gr6S2o [00:07:10]   | horizontal COG vs support-foot position per key pose                                                                                                                    | the body would not tip over                                                   |
| Shot starts in the middle of an action                                         | Rik zhktftWbumE [00:05:21]                                        | first 5 frames not a dead hold                                                                                                                                          |                                                                               |
| Reference used for beats and timing, not traced                                | Hjalti [00:01:45]                                                 |                                                                                                                                                                         | principles visible (squash, overshoot), not rotoscope-flat                    |
| Camera-only vs all directions                                                  | Rik zhktftWbumE [00:27:32] vs Leo fxz6p-QATfs [00:26:26]          |                                                                                                                                                                         | orbit renders only when the camera is not locked                              |
| The eye finds the subject: big enough, the frame used by the action            | Hjalti (previs notes: after each cut the eye must find one thing) | `staging_report`: `size_median` >= 0.12 of frame height (0.15+ for one subject), `action_w`/`action_h`, top of frame not empty for the whole shot (> 30% flags) [added] | the subject reads on the frame sheet without searching                        |
| An entering action enters                                                      | Rik (start mid-action) [added for entries]                        | `entry` off-screen or partial on frame 1; `edge_frames` empty after the entry; `end_margin` >= 3%                                                                       | first frame sheet image empty or cut by the edge; rest pose clear of the edge |
| Height and contact read on a ball or a jump                                    | [added, E3 run and baseline]                                      | shadow probe: visible in the air with a gap, visible and touching (gap 0) at the contact                                                                                | overhead key: shadow under the subject, gap closes on the contact frame       |
| Spin reads on a rolling object                                                 | [added, E3 baseline pinwheel]                                     | `roll_aliasing` ok: roll per frame under 360 / sectors                                                                                                                  | wedges turn forward on the frame sheet, no strobing                           |

## 2. Timing and spacing

| Look at                                                                             | Source                                        | Measure                                                                 | See                                    |
| ----------------------------------------------------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------- |
| Floaty, "too even", "too linear", slow drift                                        | Rik hnHemwjznPc [01:53:23], [02:18:07]        | `motion_report` moves with "constant spacing"; long moves with no holds | playblast feels driven by the computer |
| Holds read and stay put (6 frames to read an idea)                                  | Alex [00:32:48]; Rik [00:13:36]               | `hold_drift` ~0 on dead holds, small on moving holds                    | graph plateaus flat                    |
| Snaps: 2 to 3 frames after a hold; aggressive moves 4 frames, not 8                 | Rik [00:20:44]; Alex [01:03:42]               | `transitions` lengths                                                   |                                        |
| Reaction about 6 frames after its stimulus                                          | Rik NEZVF93fKsM [00:30:26]                    | key-frame difference                                                    |                                        |
| The part that should draw the eye moves fastest at the end of its move              | Alex [00:50:55]                               | `peak_at` near 1.0 for hands or face; `last_ratio` high                 |                                        |
| Snappiness survives splining                                                        | Hjalti fbfODZ8PO4E [00:39:15]                 | compare transition lengths blocking vs spline                           | progression side by side               |
| Spacing tricks felt, not seen (burst, chug); only after timing and weight are final | Raymond Luc fbfODZ8PO4E [00:04:19]-[00:05:36] | `format_report` spacing chart before and after                          |                                        |
| Unintended overshoot                                                                | Alex [00:42:54]                               | `overshoots` lists only wanted settles                                  | no bulge on holds in `graph_image`     |

## 3. Arcs and paths

| Look at                                                                 | Source                                    | Measure                                                                                                                                                                                                                                                                                                                                 | See                                       |
| ----------------------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Arcs on root, hands, feet, nose, in camera space                        | Pablo fbfODZ8PO4E [00:16:04]              | `motion_report(to_camera(..., res=(w, h)), dims=2)`: no `arc_wobble` inside a move (0..1 coordinates squeeze x and add false sharp turns at apexes, measured)                                                                                                                                                                           | tracks in the onion skin are clean curves |
| Starts and stops ("ticks right then down")                              | Rik hnHemwjznPc [00:55:08]                | `start_stops` empty inside intended moves                                                                                                                                                                                                                                                                                               |                                           |
| Sharp direction changes only at contacts and hits                       | [added]                                   | `sharp_turns` frames = contact frames                                                                                                                                                                                                                                                                                                   |                                           |
| Pops                                                                    | Rik sRYVR92FqSw [02:07:49]                | `pops` only where a snap is intended                                                                                                                                                                                                                                                                                                    |                                           |
| Silhouette aligned with the motion path; every part points the same way | Picaut yIPMxxTueIM [00:12:59], [00:10:14] | limb direction vs path tangent (dot close to 1) [added metric]                                                                                                                                                                                                                                                                          |                                           |
| Airborne body follows a parabola                                        | [added, physics]                          | `ballistic_fit`: `g_ratio` near 1 at real scale, small residual. `g_ratio` compares the ACCELERATION (9.81/fps^2 = 0.01703 m/frame^2 at 24 fps); a raw quadratic fit's leading coefficient is half of it (-0.00852): comparing that to g is a factor-2 false failure. On a ball, every flight has the same ratio (one gravity per shot) | the jump does not float                   |
| Arcs relative to the body for in-place motion                           | Nacho de Andres M2J_fQNLDfg [00:22:16]    | subtract the root path before `motion_report`                                                                                                                                                                                                                                                                                           | `onion_skin(spread=...)`                  |

## 4. Weight, contacts, physics

| Look at                                                | Source                                                   | Measure                                                                                                               | See                                |
| ------------------------------------------------------ | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Planted feet do not slide                              | Joey [00:29:16]; digest threshold about 1 mm             | `foot_slip` slide < 0.001 m                                                                                           |                                    |
| Planted feet on dense or retargeted clips              | [added]                                                  | `foot_contacts`, `foot_slip(ball=...)`, `slip_summary` p95 on the clip that ships (P19)                               | procedures.md P19                  |
| Contacts slide with the body, do not glue, do not lift | Rik hnHemwjznPc [00:28:00]-[00:30:12]                    | elbow or hand height vs surface, small slide allowed                                                                  |                                    |
| Rotation happens at the physical pivot                 | Rik [01:39:49]                                           | contact point displacement ~0 (`world_pose(pivot=...)`)                                                               | glass tips on its base             |
| Force fits the character's state (tipsy, not drunk)    | Rik [01:48:09]                                           |                                                                                                                       |                                    |
| Weight shift raises the loaded shoulder                | Rik [00:46:41]                                           |                                                                                                                       |                                    |
| Weight over the support foot on held poses             | Alex p8Bi7k60IS0 [00:30:06]-[00:34:26]; digest checklist | `balance_report`: margin >= 0 on held poses and settles (locomotion may be outside: the fall that drives the step)    | the body would not tip over        |
| Knees and elbows never snap straight                   | [added]                                                  | `limb_extension`: ratio < 0.99 while meant bent, never > 1.0 (IK stretch); fast bends near straight listed for review | no knee pop at push-off or landing |
| Body drops faster than it rises ("shark fin")          | Joey [00:40:15]                                          | frames from up to down < frames from down to up                                                                       |                                    |
| Landing is not a dead stop; hard contacts use VECTOR   | [added, measured]; Alex [01:09:31]                       | speed at the contact frame; foot's last gap before contact                                                            |                                    |
| No penetration                                         | Leo [00:15:56] (polish)                                  | `lowest_point` never below the floor                                                                                  |                                    |
| Limb stretch only if the camera shows it               | Rik [01:27:53]                                           | shoulder-to-wrist length vs rest, projected                                                                           |                                    |

## 5. Overlap, secondary, attention

| Look at                                                                       | Source                                 | Measure                                                | See                      |
| ----------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------ | ------------------------ |
| Parts offset, never twins; feet offset by a frame                             | Rik jLkc4EgHWj8 [00:31:30]; Alex       | child transitions start 1 to 2 frames after the parent |                          |
| Head never rotates on one axis only                                           | Rik NEZVF93fKsM [00:27:56]             | head rotation keys change more than one component      |                          |
| Fingers stiff: little overlap, no bounce                                      | Rik zhktftWbumE [00:29:24]             | no overshoot on finger channels                        | hands do not look broken |
| Secondary feels connected to the body                                         | Rik hnHemwjznPc [00:44:21]             |                                                        |                          |
| Nothing competes with the face (elbow, tongue, twitches)                      | Rik [00:53:58]; sRYVR92FqSw [02:06:08] |                                                        |                          |
| Ears, eyes, tails alive after the spline                                      | Leo [00:15:56]                         |                                                        |                          |
| Behavior matches the species (head dart, ears before head, tail up on a jump) | Leo [00:20:15]                         |                                                        |                          |

## 6. Squash, stretch, smears

| Look at                                                     | Source                                 | Measure                                 | See                      |
| ----------------------------------------------------------- | -------------------------------------- | --------------------------------------- | ------------------------ |
| Shape change reads, volume plausible                        | Rik jLkc4EgHWj8 [00:34:36], [00:44:13] | product of scales ~1 on squash controls |                          |
| Squash frame actually shown                                 | [added, measured]                      | contact on a whole frame                |                          |
| Smears 1 frame (2 at most), along the arc between the poses | Pablo [00:10:19]; Picaut [00:24:07]    |                                         | felt, not seen, at speed |

## 7. Face and lip sync

| Look at                                                                                       | Source                                             | Measure                                                     | See                            |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------- | ------------------------------ |
| Eyes dart in 1 to 2 frames, lead the head; head follows a little                              | Rik NEZVF93fKsM [00:05:43]; hnHemwjznPc [01:57:16] | `transitions` on eye controls                               |                                |
| Eye line hits the target on camera, not wall-eyed or cross-eyed                               | Rik NEZVF93fKsM [00:06:49], [00:33:19]             |                                                             | close-up still from the camera |
| Lids: resting on the iris relaxed, more white intense, never below half the iris when annoyed | Rik [00:21:36], [00:43:44]                         |                                                             | close-up still                 |
| Brows 3 to 10 frames, inner brow more than outer, on a diagonal                               | Rik [00:07:22], [00:01:43]                         | `transitions` on brow controls                              |                                |
| Straight lines read tension, curves relaxation                                                | Rik [00:13:38], [00:35:01]                         |                                                             | mouth and lid shapes           |
| Symmetric for involuntary expressions, asymmetric for voluntary ones                          | Rik [00:09:08]                                     | left/right control difference                               |                                |
| Jaw rhythm first; big opens only on accents                                                   | Rik sRYVR92FqSw [00:04:44]                         | `accent_frames`: big jaw opens clearly fewer than syllables | no chatter at speed            |
| Shapes prepared before the sound (F, OO, W, closures)                                         | Rik [00:25:12]                                     | shape reached at or before the phoneme start                |                                |
| M, B, P closed at least 2 frames, closed before the sound; milked a little                    | Rik NEZVF93fKsM [00:08:34]; sRYVR92FqSw [00:38:38] | `transitions`: closed hold >= 2 frames                      |                                |
| Corners never dead center; arc between shapes; asymmetry in small doses                       | Rik [01:34:56], [01:37:11], [01:42:45]             | corner controls never at rest during dialogue               |                                |
| Shapes not too big for connected speech; pops blend                                           | Rik [01:08:20], [02:07:49]                         |                                                             |                                |
| Tongue seen, not shown (N hidden, R back, T/L up)                                             | Rik [01:52:45]-[02:06:08]                          |                                                             |                                |
| Face stepped until the body is splined                                                        | Rik hnHemwjznPc [00:15:42]                         | face keys CONSTANT during body spline                       |                                |

## 8. Technical hygiene

- Slot assigned and named after the character (module talk ypWk6ZgQ-iM [00:07:35]);
  `ad.action_slot is not None`.
- Before approval all key poses CONSTANT and typed (EXTREME, BREAKDOWN, MOVING_HOLD); key types as a
  confidence map (Hjalti fbfODZ8PO4E [00:46:30]).
- No partial key columns on main controls (Rik keys every main control together, sRYVR92FqSw
  [01:48:55]).
- No Euler jumps over 180 degrees between keys, no quaternion sign flips between keys (digest
  checklist): `rotation_flips` empty, `fix_rotation_flips` repairs on keys; quaternion rigs keyed as
  quaternions.
- Cycles: Cycles modifiers on all cyclic channels, equal values at the seam, root REPEAT_OFFSET with
  LINEAR keys (Joey [00:32:39]).
- fps matches the medium (24 unless told otherwise); `use_simplify` on only for previews.

## Staging thresholds: calibration [added]

Measured with `staging_report` on the E3 evaluation scenes (heavy ball, 72 frames, 1280 x 720):

| Run                                                                                                                                                                                                                                                                                                                                                                                                                              | Subject size (median) | Action covers | Top empty | Entry      | Shadow airborne / contact                               |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ------------- | --------- | ---------- | ------------------------------------------------------- |
| E3 with skill (reviewer: weak staging)                                                                                                                                                                                                                                                                                                                                                                                           | 10.4%                 | 73% x 45%     | 34%       | partial    | faint (0.043 darkening) / hidden behind the ball (0 px) |
| E3 baseline (reviewer: better staging)                                                                                                                                                                                                                                                                                                                                                                                           | 9.8%                  | 74% x 49%     | 17%       | off-screen | visible, 71 px gap / visible, 0 gap                     |
| v2 ball shot (test_ball_shot.py)                                                                                                                                                                                                                                                                                                                                                                                                 | 17.2%                 | 73% x 55%     | 27%       | off-screen | visible, 104 px gap / visible, 0 gap                    |
| The E3 note "about 40 px" was the 50% playblast; at full size the with-skill ball was 75 px, the same size as the baseline's. What separated the two runs was the entry, the empty top of frame and a contact shadow hidden behind the ball, which is what the flags now catch. The 12% size floor sits just above both E3 runs so a single-subject shot is pushed to reframe; lower it for a wide establishing shot on purpose. |

## Severity and phrasing

- Order of importance: intent and staging, then timing, then arcs and weight, then overlap, then
  polish. Do not polish what is not approved (Rik: "animate drunk and edit sober", jLkc4EgHWj8
  [00:27:21]; Pablo: show broken work early, fbfODZ8PO4E [00:47:04]).
- Write notes the way these animators give them: a frame range, what the audience sees, the
  principle, the fix. Example: "f10 to f13, hand: sharp turns at 11 and 12 and a pop 11 to 12, reads
  as a jerk; the swing needs a breakdown through the bottom of its arc at f11 (`breakdown` with the
  hand favored late)". Rik's vocabulary: floaty, too even, starts and stops, pops, drift, connected,
  too big, lazy, early, late.
- When keys fight, delete down to the essentials and look at the clean interpolation before adding
  more (Rik hnHemwjznPc [01:05:47]).
- Report honestly: say which checks were measured, which were judged on renders, and what could not
  be verified (no audio, no reference, GUI-only feel).
