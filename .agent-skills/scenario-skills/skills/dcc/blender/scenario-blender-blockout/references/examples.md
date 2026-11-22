# Example library

Four worked scenes that span the levels: pace from still to fast, one character to five, interior to
wide exterior, photoreal to stylized. Each scene script builds the blockout headless, runs the
audits and writes stats, stills, a playblast and the `.blend`:

```bash
blender -b --factory-startup --python-exit-code 1 --python scripts/examples/ex1_watchmaker.py -- /tmp/ex_out both
```

The second argument is `stills`, `playblast`, `both` or `none` (audits and stats only); example 4
takes a third, the cast style (`capsule`, `featured`, `jointed`, `mannequin`). Shared setup and
finish live in [`ex_common.py`](../scripts/examples/ex_common.py). Read the script closest to the
brief before building: the patterns carry over, the numbers do not.

| #   | Scene                                                 | Pace   | Cast        | Space    | Look      | Density  | Elements | Shots |
| --- | ----------------------------------------------------- | ------ | ----------- | -------- | --------- | -------- | -------- | ----- |
| 1   | [Watchmaker](../scripts/examples/ex1_watchmaker.py)   | still  | 1           | interior | photoreal | simple   | 23       | 1     |
| 2   | [Salt flat](../scripts/examples/ex2_saltflat.py)      | fast   | 2 vehicles  | wide     | photoreal | medium   | 103      | 2     |
| 3   | [Salvage bridge](../scripts/examples/ex3_bridge.py)   | medium | 3 + 1 ship  | interior | sci-fi    | advanced | 162      | 3     |
| 4   | [Sky islands](../scripts/examples/ex4_sky_islands.py) | fast   | 5 + 1 whale | wide     | stylized  | expert   | 517      | 4     |

All four use shaped fidelity and category colors, and pass `K.audit_budget`, `B.audit_frames`,
`B.audit_cuts`, framing and occlusion with no finding. Examples 1 to 3 keep jointed figures, whose
seated and gesturing poses need limbs; example 4 blocks its runners as featured capsules
([cast](cast.md)), and passes the same audits in every cast style.

## 1. Watchmaker: still, one character, interior

Brief: 6 s at 24 fps. Dusk in an old workshop, an elderly watchmaker lifts a loupe to her eye and
leans over an open pocket watch. Rain on the window. One slow push-in, 40 mm.

- Room 6 x 5 m, mullioned window on the back wall with a street of `K.building` outside for depth.
- Bench top at 0.88 m and a tall stool (seat 0.62 m) with a footrest: a seated figure on a standard
  chair sinks below a raised bench and reads small in frame.
- Root height for a seated figure: `seat - 0.47 * height`.
- The loupe goes in the camera-side hand; in the other hand the head hides it. The lamp sits on the
  far side of the bench so the shade never crosses her face.
- Props held by a figure are parented to the forearm, so they follow the pose.
- Pose sign convention: negative X swings a hanging limb forward, positive X tips the torso or head
  forward.
- Audits dropped on purpose: `audit_intersections` works on bounding boxes and flags legs under the
  bench; the ground audit flags feet that rest on the footrest. Say so in the hand-off.

## 2. Salt flat: fast, two vehicles, wide

Brief: 8 s. A dirt bike races down a track across a salt flat, swerving around boulders, chased by a
blue pickup. Shot 1 camera car ahead, shot 2 high side tracking.

- Track along Y with ruts; mountains from `K.rock` at 400 to 900 m, with the camera `clip_end`
  raised to 3000 m.
- Telegraph poles every 25 m on one side and fence posts on the other give the model a speed cue.
- The bike is a custom part group with a jointed rider parented on the pegs. `K.movers` counts a
  child of an animated parent with its mover, so the rider does not add a hero.
- A lane function `lane_x(y)` drives the swerve; both vehicles keep one shared path so the chase
  reads as one line.
- Shot 1 is a camera car 7 m ahead at 1.1 m, 28 mm. A distant first shot loses the vehicles' scale.
- Shot 2 keys its camera LINEAR so the tracking speed matches the vehicles.
- White salt renders gray in Workbench; the prompt names the real color.

## 3. Salvage bridge: medium pace, three characters, interior sci-fi

Brief: 10 s, cuts at 3.5 s and 7 s. The captain walks to the front window, a derelict freighter
drifts past outside, the pilot swivels to face her as the engineer arrives with a tablet.

- Room 14 x 12 x 4 m: ribs, ceiling light strips, consoles, a map table, lockers, cables, a side
  door and a five-bay open front window (frames only, no glass, so the playblast sees through).
- Outside: the derelict as a `K.Parts` hull drifting about 170 m, 32 debris pieces as extras and a
  planet sphere.
- The pilot's seat is parented to the pilot, so the swivel moves both and the seat is not a hero.
- Shot 2 is over the shoulder: the framing audit targets the captain's head, not her root.
- Shot 3 is a reverse from beside the far console; check the camera is not inside a console.
- Engineer and pilot beats are timed inside shot 3, where the camera can see them.
- Advanced needs 150 or more elements: set dressing (vents, floor lights, cases) fills the budget
  without adding movers.

## 4. Sky islands: fast, five characters, wide stylized

Brief: 12 s, four shots. Five young adventurers run across a sagging rope bridge between two
floating islands while a giant sky whale with a village on its back glides beneath.

- Islands are top discs at z = 0 with a cone underside; 80 to 90 bushes, trees and houses each, a
  windmill with turning blades (extra) and 12 far islands.
- The bridge deck follows a catenary `deck_z(x)` with a 0.8 m sag; planks every 0.45 m, posts,
  lanterns and rope segments.
- The five runners are featured capsules in the identity palette at distinct heights (1.18 to 1.78
  m), two or three features each: goggles and scarf (the leader), hair and backpack, hood and cape,
  hood and coat (the smallest), hair, coat and staff (the tallest). Capsules lean 7 degrees forward;
  jointed runners and mannequins pose the torso instead. Stride is 0.72 x height.
- Each runner's z curve is set from `deck_z` after the walk is keyed, so feet stay on the sag.
- Extras: 60 birds, 20 villagers (8 waving), 3 airships, 40 clouds.
- Shots: wide establish at 28 mm, side tracking at 35 mm, a camera backing away ahead of the leader
  at 28 mm, and a crane down at 24 mm.

## Render pass results

Tested October 2026; prices and models change, so quote them live. Same 6 s window (frames 1 to
144), same style frame, same cast and prop sheets, about 720p. The style frame is a still made from
the blockout's first frame with the cast and prop sheets.

| Model                            | Inputs used                               | Time     | Cost per 6 s |
| -------------------------------- | ----------------------------------------- | -------- | ------------ |
| Seedance 2.5, 720p               | playblast + style frame + cast + props    | ~3.5 min | 332 CU       |
| MiniMax H3 Max 3D to Video, 768P | playblast + style frame + cast + props    | ~1.5 min | 371 CU       |
| LTX 2.3 Render to Real, 720p     | playblast + style frame (one image input) | ~5 min   | 48 CU        |

What held and what broke:

- All three kept the camera path, framing, cut points and every trajectory on all four scenes.
- Seedance gave the richest finish and followed the push-in most closely. With five similar figures
  it reordered the runners; naming each proxy color and the running order in the prompt is the fix
  to try first.
- Full-length 1080p Seedance passes (6 to 12 s, the whole playblast) with the color mapping and
  running order written out ("red figure in front = the leader ... purple, the tallest, last in
  line") kept all five runners in order across four cuts, and hands, faces and foot contact held.
  Write that mapping into every multi-character prompt.
- H3 matched Seedance on layout and was the fastest. On the five-runner scene it also mixed some
  identities.
- LTX kept the proxy color order exactly but left some proxy shapes visible (ball-topped posts, cone
  islands) and has no slot for cast sheets, so identities come from the first frame only. At about a
  seventh of the price it is the right choice for look tests and iteration; the final pass goes to
  Seedance or H3.

These passes used jointed figures. Rebuilt with featured capsules, the same scene came back running
naturally on Seedance where the jointed runners had kept a stiff, walk-like stride; the cast-style
test and its per-model results are in [cast](cast.md).

Seedance prompt shape used (the H3 version replaces the tags with "reference image 1, 2, 3"):

```text
@video1 is the 3D layout of this exact shot: follow its camera moves, framing, cuts, timing,
character positions and motion exactly, frame for frame. @image1 is the first frame and the look
reference for the whole clip; never cut or dissolve back to it. @image2 shows the characters,
@image3 the props and set. <proxy color = character mapping> <scene, shot list with cut times,
light, lens>. Keep identities consistent, natural weight and contact, no morphing, no text.
```
