# Critique rubric: judging a previs like the experts

Use it at every Look gate: open the contact sheet (and the floor plan, the A/B sheet, frames pulled
from the MP4), run `P.audit`, then go through the list. Each item is pass, or a named fix. Report
what could not be judged (comic timing with sound, mood with a human audience).

## 1. Beats and structure (Hjalti)

- Every fact of the script is a numbered beat, one fact per line; every added beat is marked and
  justified. Measurable: `P.shot_list` accepted the grouping.
- Every beat is visible in some thumbnail. Put the beats list next to the contact sheet and tick
  them. A beat that exists only in the intent text is missing.
- Logistics hold: the distances characters cover fit the time the edit gives them (Jay cannot cross
  the room in 10 frames). An oversimplified version is too short by construction.
- Props read instantly (a snack reads as a snack from this camera; the sprinkle shaker did not).

## 2. Treatment and length (Hjalti)

- A theater version exists (or a reason for skipping it) and was judged for acting before cameras.
- Runtime is budgeted: cinematic about 2x theater, up to 3x; about 1.6 to 1.9 s per beat for a first
  cinematic cut [derived]. Too long means gags over-milked; too short means beats missing.
- Only the camera moves that carry meaning are animated; every other shot is one still. Measurable:
  `audit` flags a camera moving inside a still shot and keys between block starts outside live
  shots.
- Cost: Workbench grays, no mood lighting (a non-Workbench engine is an audit problem, lights a
  warning); mannequins unless the brief asks for Rigify (then `ensure_rigify` first).

## 3. Each shot

- **Intent written** for the shot (what the audience must feel or learn), and the camera choice
  follows from it. A non-eye-height camera without an intent is an audit problem.
- **Size fits the beat:** measured size (`size_measured`) close to the plan; the hero readable at
  thumbnail size. The robot at 0.55 m covered 0.15 of the frame height in the S6 wide: fine for a
  return-to-neutral, too small for a reveal.
- **One thing to look at** after the cut (Hjalti). Two comparable subjects in a reveal: restage one
  in front of the other.
- **Nothing blocks the hero:** audit `eye_visible` and `blockers`, then look (the ray only tests two
  points).
- **Extremes contained** in a locked-off frame: tallest pose, entrance path, widest travel (audit
  head/feet in frame over every block).
- **Cheats invisible:** no hovering feet, clipped props or giant furniture in frame; the neighboring
  shots unchanged (the cheat was keyed).
- **Pose readable from this camera:** a pose built from the front can vanish from a high angle (S6:
  arms forward hidden behind the head; arms out to the sides read).

## 4. Camera language and mood (Dillon, Hjalti)

- Neutral grammar where nothing is meant: eye level, medium lens, centered, static.
- Each statement matches the table in SKILL.md (low = hidden observer, top = pressure, dolly zoom =
  loss of control, long lens = informational or isolating, wide from far plus zoom = watched).
- A move ends on the intended subject (a tilt that ends on a cherry makes the cherry the subject).
- The emotional read survives the angle (Hjalti refused a side cut that turned menace into a
  silhouette).
- Mood survives each transition: no cut out of the space when tension is wanted; no two inanimate
  inserts in a row (audit flags the second).

## 5. Continuity

- One side of the action line for every camera that sees both subjects; POVs just off the line on
  the camera side (audit `side`).
- Over-the-shoulder on the shoulder the camera already occupies (Dillon).
- Screen direction per journey, reversed only when the character reverses (Charge; audit `travel`,
  per-shot override for a return).
- A jump cut in the same framing is a choice (elided routine time), not an accident.

## 6. Readability

- Grays, one pop color for the hero; opaque passepartout on every shot camera (audit), nothing
  outside the frame counts.
- Silhouettes separate from the background (Workbench outlines on). Where characters and set share a
  value, `fog_for_shot` behind the subjects; `values_at` hero vs backdrop before and after; the fog
  must not sit in front of the hero (the audit names it as a blocker) nor show in other shots.
- Stamped thumbnails legible: shot, lens, height class, size, seconds, intent.

## 7. Edit and timing

- The edit plays the shots in beat order; frames pulled from the MP4 match the cut list; burn-in
  version and clean version both rendered.
- Holds carry the joke (a freeze needs a hold); pushes and live shots land where the beat is.
- Sound, when used, sits on the beat frame; the length after sound is checked again (sound adds
  beats, Hjalti).
- Edit scene view transform equals the stills' (Standard), or the animatic drifts from the stills.
- A continuous action covered from several angles is a coverage run (one scene strip, soft cuts, a
  camera per piece); retime it with `retime_cut`, and the markers follow.

## 8. Hybrid boards (Spitfire, Renato, BouncyBrain)

- Drawings sit on the floor at contacts and read from the chosen camera.
- No carrier turns a flat drawing past about 70 degrees from the camera (`facing_report`) unless a
  redraw is planned.
- Parallax from separated planes reads; world effects stay in world space, only the followed hero
  rides the glass.

## 9. Honesty of the delivery

- The report states what was measured, what was looked at, what was cheated, and what remains a
  human call (comic timing, sound, performance nuance).
- Nothing overwritten: versioned stills, contact sheets, MP4s, scene pairs.

## What the numbers cannot judge

Whether it is funny, whether the mood lands on a human audience, whether a gag is milked too long,
whether the performance is right. The agent can prepare the evidence (contact sheet, animatic,
beat-aligned sound) but must say these are open.

## Worked example: S6 ("tired shopkeeper, robot steals a snack, freezes like a toy")

Built by `tests/code/blender-previs-storyboard/test_01_s6_end_to_end.py`. 15 beats (two added and
marked), a theater pass (10 blocks, one 35 mm camera at 1.03 m, the mean of the two eye heights,
11.8 s) and a cinematic cut (11 shots, 24.5 s = 2.1x the theater pass, 1.63 s per beat).

| shot  | beats | lens          | camera                   | intent                                                           |
| ----- | ----- | ------------- | ------------------------ | ---------------------------------------------------------------- |
| sh010 | 1-3   | 24            | eye 1.63 m               | neutral wide: door left, keeper right with his back to the floor |
| sh020 | 4-5   | 28            | robot eye 0.42 m         | the camera drops into the robot's world                          |
| sh030 | 6     | 50            | 0.6 m, over its shoulder | long lens: the snack is the goal                                 |
| sh040 | 7     | 28            | 0.55 m                   | irony two-shot: robot sneaks in front, keeper's back behind      |
| sh050 | 8     | 60            | 0.46 m                   | insert on the grab, snack cheated to 1.4x                        |
| sh060 | 9-10  | 50            | eye 1.63 m               | neutral MCU: he hears, starts to turn                            |
| sh070 | 11    | 35 to 50 zoom | POV 1.72 m, pitch -51    | live: the snap to a toy pose, quick zoom, handheld               |
| sh080 | 12    | 35            | 0.8 m, low               | he looms (cheated up to clear the counter)                       |
| sh090 | 13    | 60            | POV 1.72 m               | tighter POV, push on the still (1.12x)                           |
| sh100 | 14    | 24            | eye 1.63 m               | back to the neutral wide: he shrugs                              |
| sh110 | 15    | 24            | eye 1.63 m               | same frame, jump cut: robot tiptoes out, right to left           |

**What the review caught** (outputs of each run kept under `archive/tests/previs/skill_out_run1/`):

| Run | Seen on the contact sheet                                                  | Measured?                                                        | Fix                                                                  |
| --- | -------------------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------- |
| 1   | Keeper cut off at the edge of the wide                                     | no (his eye point was just inside)                               | camera back and re-aimed                                             |
| 1   | Door swinging inward hides the robot (sh020)                               | no                                                               | door swings out; occlusion gate added, now names "door"              |
| 1   | POV blocked by the counter and by the keeper's own head (sh070, sh090)     | no                                                               | POV cheated forward and up over the counter; gate names "counter"    |
| 1   | Over-the-shoulder from the far side (sh030)                                | yes: line crossed, wrong screen direction                        | camera moved to the audience side                                    |
| 1   | Insert too tight: two colored blocks, no hand                              | no                                                               | framed robot and snack together                                      |
| 1   | Push-in still shrank with black borders                                    | no (a test comparing frames flagged a change, not its direction) | multiply the FIT scale                                               |
| 2   | Robot out of frame in the new over-the-shoulder                            | yes: eye line out of frame                                       | camera further back                                                  |
| 2   | Toy pose unreadable from the high POV (arms hidden)                        | no                                                               | arms out to the sides                                                |
| 3   | All shots read; theater robot tiny (0.55 m at 6.6 m: 15 % of frame height) | yes (size)                                                       | expected: the reason the cinematic cut drops to the robot's eye line |

Lesson: the audit found the continuity errors; only the pictures found the occlusions, the cut-off
and the unreadable poses. Look at every sheet.
