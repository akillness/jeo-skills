# Directional character cycles

One character, several facings (isometric SE, SW, NE, NW by default, or side-view and top-down
facings), and a set of cycles (walk, run, idle, attack), each a looping 8-frame row on one
registered sheet. The route: an image model draws every facing as a still (from a description, or
from the user's own art), three shipped scripts handle the geometry, and one image-to-video clip per
facing and cycle supplies the motion. The scripts run locally because the finishing needs all of a
character's clips at once (one shared canvas so cycles register, one palette across every cycle);
the finished sheets are uploaded, so they become assets like any other output.

Authoring-time observations below come from a production run of five characters, 40 clips, on one
first-and-last-frame image-to-video member. Availability differs per team, so discover members with
`recommend` and read every schema with `model_schema_get`.

## Pick the situation first

| The user has                                                                     | Start at                                                                                |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| a question ("how many frames", "how do I import this")                           | Answer from the fundamentals below; spend nothing, then offer the route                 |
| an idea, no art                                                                  | Step 2, pose sheet                                                                      |
| their own art in one of the game's facings                                       | Step 3 on their art; step 2 draws only the missing facings, as turnarounds from it      |
| art in another view (3/4 art for a side-scroller)                                | Step 3 with `--facing ref`, upload it as `reference`; every facing becomes a turnaround |
| clips already (another tool, a 3D render) on a flat magenta, green or blue field | Step 5 with `"fig_frac": "auto"`                                                        |

Their art is the master: generated facings are drawn from it and checked against it, never restyled.

## The cast file

One JSON file drives all three scripts. Top level (all optional): `facings` (default `["se", "ne"]`;
8 directions `["s", "se", "e", "ne", "n"]`; side-scroller `["e"]`; top-down `["s", "n", "e"]`),
`camera` (`isometric`, `side`, `topdown`, or any camera sentence), `key` (`magenta`, `green` or
`blue`), `cycles`, `fig_frac` (0.58, the same value as the `--fig` given to the frame script, or
`auto` for clips made elsewhere), `style`. Per hero: `character` (text heroes), `who` and `pronoun`
(clip prompts), `back` and `back_view` (what stays visible from behind), `extra` (walk and run
detail), `walk_motion` and `run_motion` (the gait, two-legged by default: set them for a quadruped,
a flyer or a slithering hero), `idle` (one secondary motion), `attack` (one named move, start to
rest), `attack_body_only` (`true` when the attack throws something that detaches from the body),
`notes` (what must survive a redraw, such as the weapon hand), `height` (sprite px), `palette`
(colors), `pixel` (`false` for painted art), `ranges` (loop search override), `reference` and
`first_frames` (asset ids, filled in as you go).

Mirroring: SW, NW and W are flips of SE, NE and E, which halves the work and swaps sides. For an
asymmetric character (sword hand, eyepatch, one pauldron), list the mirrored facings so they are
generated, and say which hand in `notes`: the turnaround prompt then states where that hand sits on
screen for each facing.

## Steps

1. `collection_create` (tool catalog) and add every kept output as it lands. Write the cast with the
   user.
2. Stills. [cycle_prompts.py](../scripts/cycle_prompts.py) writes `requests.json`: one pose sheet
   per text hero (every facing side by side, so identity matches) or one turnaround per missing
   facing, drawn from the `reference_images` it lists. Discover with `recommend`: the pose sheet is
   a layout-heavy text-to-image need, a turnaround is reference-image editing that must keep the
   design. For the pose sheet, take the top-ranked general model over `specialty.model_id` when the
   specialty is the canvas-locked pixel model: it cannot hold every facing side by side. Map each
   request's fields onto the pick's schema, `dry_run`, `model_run`, `jobs_wait` on the job ids
   (re-called with `job_ids` set to any returned `pending_job_ids`), then `asset_display` both
   candidates (and, for turnarounds, the user's art beside them) and let the user pick. Check the
   facing each pose claims; everything downstream inherits the still.
3. First frames. `asset_download` the pick and run [cycle_frames.py](../scripts/cycle_frames.py)
   (`--facings se,ne` to split a sheet, `--facing sw` for one figure, `--flip` only for a symmetric
   character). It centers the figure at 58% of a 960 px square with the feet at 82%: full-frame
   stills lose a raised weapon off the top of the clip. It reads transparency or a flat backdrop
   (backdrop color is removed only where it connects to the border, so white armor on white
   survives), scales small pixel art by a whole number, and prints the pixel art's native height and
   color count for `height` and `palette`, plus the `--fig` value that places the generated facings
   at the same size. A pose sheet is split at the empty columns between figures. Use one `--fig` for
   every facing, lowered when a long side view does not fit (0.52 held a four-legged dragon) or when
   the attack reaches out (a breath, a lunge, a long slash): whatever leaves the video frame is cut
   off with a straight edge, and `attack_body_only` only drops what detaches. Its **key check**
   reports how much of the figure each key color would erase; on a warning, re-run with the
   recommended key and set `key` before writing clip prompts, since the key color is written into
   every prompt. Upload each frame (`upload_asset`, then `upload_asset_complete`, per the `scenario`
   skill) and fill `first_frames`.
4. Clips. Re-run the prompt script. `recommend` with capability `img2video`,
   `features: ["endImage"]` and the need in the user's own words (anchored on a first frame and a
   last frame, locked camera, a character staying in place), then pick a member whose schema has an
   end-image field, a negative-prompt field, a square aspect and durations near 3 and 5 s, and that
   is not deprecated: a member without an end frame cannot bring idle and attack back to rest or
   hold the S, N and back-view clips, and one that crops a square first frame to its own aspect
   breaks registration. `recommend` prices members at their defaults (often longer, with audio on),
   so `dry_run` the lane's own payload on each such candidate before ruling one out on cost: at
   authoring time the top-ranked family's standard tier priced 24 CU for a 3 s clip against a 55 CU
   `recommend` figure, while cheaper members that lacked those fields zoomed, cropped or drifted the
   backdrop. Then `model_schema_get` and map: `first_frame` and `last_frame` onto the start and end
   image fields (a `null` last frame means leave that field out), `negative_prompt` where the schema
   has one (otherwise leave it out: the prompt already names the facing), `duration_s` onto the
   nearest allowed value, square aspect, audio off. `dry_run` one payload per duration and quote the
   batch total before running anything. Launch a few clips at a time: at authoring time a burst past
   the team's concurrent-job limit came back as failed jobs with an internal error (refunded), not
   as a rate-limit refusal. Run one hero's clips first and read a contact sheet of each before the
   rest (`ffmpeg -i clip.mp4 -vf "fps=4,scale=240:-1,tile=5x4" -frames:v 1 sheet.png`): a turn can
   start mid-clip, which one frame misses.
5. Finish. `asset_download` the clips as `<hero>_<facing>_<cycle>.mp4` and run
   [cycle_sheets.py](../scripts/cycle_sheets.py) `cast.json --clips clips --out sheets --gif`. It
   keys the field (and the ground shadow the model adds anyway), searches each loop's start and
   period for the tightest seam relative to the window's own motion, takes the active window for
   attacks, samples 8 frames, crops every cycle to one canvas (the union of every kept frame, so a
   thrown projectile would widen every cell: `attack_body_only` keeps the largest blob, and the
   projectile ships as its own sprite), downscales, and for pixel art builds one palette and redraws
   the outline the downscale averaged away. It reads each clip's own frame rate and pads non-square
   clips rather than stretching them. Seam scores (seam over motion baseline): under 0.5 is clean,
   0.5 to 0.8 check the GIF, over 0.8 on walk or run usually means the stride outgrew the search
   window, so widen that hero's `ranges` before regenerating (one heavy character went from 1.08 to
   0.29). Idle often scores near 1.0 on tiny motion; accept it after a look. A no-motion warning
   means the model returned a still: its loop scores 1.0 even on idle, so regenerate it. A key
   warning means the backdrop drifted off the key color and stayed in the frame: regenerate that
   clip. A size warning means the figure walked toward or away from the camera during the clip: one
   shared scale would ship that row too big or too small, so regenerate that clip rather than
   widening its range.
6. Deliver. `upload_asset` each sheet and preview GIF and add them to the collection. `upload_asset`
   takes images, video, audio and 3D only, so `meta.json` ships beside the sheets rather than in the
   collection. `meta.json` carries what an engine needs: `cell` [w, h], `rows` (row order, SE, SW,
   NE, NW by default), `fps` per cycle and row (each facing loops at its own period; the preview GIF
   plays every row at the first facing's rate), and `pivot` [x, y] at the feet.

## Prompt rules (baked into the prompt script)

- Treadmill wording ("starts walking in place and keeps walking for the whole clip, stays centered
  and does not travel across the frame"), or the character walks out of frame.
- A facing sentence in every prompt, and a negative prompt that names the wrong angle for that
  facing: side and profile views for diagonals, front and three-quarter views for a side profile.
- Last frame pinned for idle and attack, which return to rest; left free for short diagonal and
  side-view walk and run clips, where a pinned end made the model start and stop the gait inside the
  clip, leaving standing frames and drift.
- Back-view runs (NE, NW, N) drifted into a side profile on every character while walks, idles and
  attacks held the angle. What held it: "runs away from the viewer toward the top-right corner",
  naming what stays visible, the last frame pinned, and the longer duration (5 s against 3 s), so
  the start and stop land at the ends and the loop comes from the middle.
- Straight front and back walks and runs (S, N) turned to a three-quarter view mid-clip on a
  four-legged dragon, and a golem's S run walked toward the camera and grew 1.45 times in the frame.
  The same pinned end frame and 5 s held the dragon's S walk, S run and N walk; the S prompt also
  says the character never comes closer. One golem S run on a model with no negative-prompt field
  still failed to loop after that, so read the contact sheet of every S clip.
- A flat key field and "no ground shadow". The model added a tinted shadow anyway; the key removes
  it.

## Fundamentals, for advice and hand-over

Frames and speed: walk 8 at 7 to 10 fps, run 6 to 8 at 9 to 12, idle 4 to 8 at 4 to 6, attack 6 to
10 at 8 to 12 played once. Genre decides the set: action games need run and attack, tactics games
move tile to tile and want idle, walk, attack, cast, hurt and death instead. Generated frames read
well from about 64 px tall; at 32 to 48 px they are usable but want a touch-up pass. Keep every cell
one size with the feet on one baseline, and display pixel art at whole-number zoom with nearest
filtering.

Engine import, numbers from `meta.json`. Unity: Sprite Mode Multiple, Filter Point (Bilinear for
painted art), Compression None, Sprite Editor Slice Grid By Cell Size, custom pivot (x / w, 1 minus
y / h). Godot 4: Canvas Textures default filter Nearest, Stretch Mode viewport with integer scale,
Snap 2D Transforms to Pixel; AnimatedSprite2D, add frames from a sprite sheet (8 across, rows down),
one animation per row, loop off for attack, `flip_h` for mirrored rows if you store only SE and NE.
Phaser: `pixelArt: true`, `load.spritesheet` with the cell size, frames `row * 8` to `row * 8 + 7`.
Engines mirror around the cell center, and these sheets are centered.
