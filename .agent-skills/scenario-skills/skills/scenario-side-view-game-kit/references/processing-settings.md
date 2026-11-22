# Processing settings

What the local scripts do, the settings of the build this skill comes from, and the numbers it
recorded. Everything here runs in a local shell after the renders and clips are downloaded; no model
is involved. Each runnable script prints its usage with `--help`.

## Reframe (`scripts/reframe_stills.py`)

- Input: the two-pose still, left pose on the left half, right pose on the right half, flat magenta
  field.
- Each pose is cut out, scaled so the figure is **58%** of a **960 px** square, and pasted centered
  with the feet on a line at **82%** from the top. The headroom leaves space for a raised weapon, a
  somersault or a slash trail.
- Outputs: the left pose as `<name>_rest.png` (the first frame of every ground clip) and the right
  pose as `<name>_action.png` (the hero's jump or the enemy's attack wind-up, and both frames of the
  air spin).
- It warns when a figure touches the center line or the image edge; regenerate the still with more
  space around each figure rather than reframing it, since a figure cut at the center line spoils
  both first frames.
- If you change `--size` or `--figure` here, pass the same values as `--canvas` and `--figure` to
  `side_sprites.py` (and `--baseline` if you moved the feet line), since the sprite scale and the
  anchor are computed from them.

## Sprite strips (`scripts/side_sprites.py`)

One facing only, one row per cycle. Clips are read as `<clips>/<name>_<cycle>.mp4`; `--cycles` lists
them as `NAME:MODE:FRAMES`. Clips must be square, like their first frame: the script stops on one
more than 2% off square. Resolution need not match: a clip returned at 1440 px from a 960 first
frame is rescaled to `--canvas` before anything else. It imports `sprite_cycles.py` from the same
folder for the key, loop search, active window, downscale, palette and outline. Run `--report`
first: it prints windows and seam scores and writes nothing.

### Key

Magenta to alpha: a pixel is background when red and blue both beat green by a margin and the color
is saturated, so the purple ground shadow and pink haze the video model adds go too; a despill pass
pulls the tint out of the kept edge. Anything pink or purple on the character goes with it.

### Windows

- `loop` cycles (run, walk, idle): every frame is shrunk to 120x120 and compared; the window
  `[s, s+P)` with the smallest seam (frame `s` against frame `s+P`) relative to the mean
  frame-to-frame motion inside it wins. Starts before frame 3 are skipped (`--skip`). Default period
  ranges in clip frames: walk 12 to 34, run 8 to 24, idle 24 to 66; any other loop name needs
  `--range`. Playback fps is `frames * clip_fps / P`, clamped to 5 to 14.
- `attack` cycles (every one-shot: attacks, lunge, shot, hurt, air spin): from the first to the last
  frame that differs from frame 0 by more than max(1.5, 12% of the largest difference), padded by
  two frames, sampled end to end, played at 8 to 12 fps. Pinning first = last frame makes the strip
  end back on the rest pose.
- A loop other than idle with a seam over **0.6x** its baseline is flagged. Widen the range first
  (`--range walk=12:48`); if that does not help, look at it in the game before paying for a new
  clip.

### Shared canvas and finish

- The crop is the union of every kept frame of every cycle, symmetric about the vertical center,
  padded by 8 px, and always extended down to the feet line (82%), so the air spin and the ground
  cycles share one anchor. The crop pads with transparency where it passes the frame edge.
- Scale: target height (`--height`) divided by the figure height in the first frame (58% of 960 =
  557 px). The build's heights (table below) are a starting point: 56 px for the hero, 66 px for an
  ordinary ground enemy, 78 px for a heavy one.
- Area average on premultiplied color, contrast and saturation lift 1.12 each, one median-cut
  palette of **28** colors per character (no dither) built from every frame and every static pose,
  then a 1 px inner outline (edge pixels darkened to 38%).
- `--drop CYCLE=I` leaves a sampled frame (0-based) out of the strip after the canvas and palette
  are fixed, which is how the build removed frames where a white slash trail or a dust cloud keyed
  into a solid block. Add `--force` to overwrite earlier outputs.
- Static poses: `--poses` splits a pose sheet by connected components (8-neighbor on a
  quarter-resolution mask, largest N kept, left to right) and scales each by `--pose-scale` (0.122
  in the build, tuned by eye against the strips); `--jump <name>_action.png` adds the reframed jump
  still at the strip scale. Both join the palette.
- Outputs: one strip per cycle (`<name>_<cycle>`), `<name>_pose_<pose>` for each `--poses` figure
  and `<name>_pose_jump` for `--jump` (same extension as the strips), plus `<name>_meta.json` with
  the cell size, the feet anchor, each cycle's frame count and fps, and the pose sizes. `--webp`
  writes lossless WebP instead of PNG.

### The build's numbers

| Character   | Height | Cell (w x h) | Feet anchor | Cycles (frames, fps)                                                                                                |
| ----------- | ------ | ------------ | ----------- | ------------------------------------------------------------------------------------------------------------------- |
| hero        | 56 px  | 98x81        | 49, 75      | run 8 at 10.1, idle 8 at 5.0, attack 1 6 at 8, attack 2 7, air spin 8, shot 7, lunge 6, hurt 5 (one-shots at 8 fps) |
| heavy enemy | 78 px  | 137x123      | 68, 111     | walk 8 at 6.9, attack 7 at 8, hurt 5 at 8                                                                           |
| armed enemy | 66 px  | 116x93       | 58, 92      | walk 8 at 5.0, attack 8 at 8, hurt 5 at 8                                                                           |

Loop seams: hero run **0.32x** baseline (period 19 frames), hero idle **0.28x** (63 frames),
armed-enemy walk **0.42x** (40 frames; `--range walk=12:48` reproduces it, the build's own argument
is not recorded). The first armed-enemy walk, which swung its weapon, closed at 1.44x at best. The
heavy-enemy walk closes at 1.03x (28 frames); the wider range found the same window, and it was kept
after review.

Frames dropped: hero attack 1, index 2 (7 to 6, the slash trail); heavy-enemy attack, index 5 (8 to
7, the dust cloud at impact). Static poses at scale 0.122: fall 45x68, wall cling 37x48, plunge
24x81, air dash 66x30; the jump still at strip scale 53x57.

Commands that reproduce strips of that shape:

```
python3 scripts/side_sprites.py --clips clips --name hero --height 56 --palette 28 \
    --cycles run:loop:8,idle:loop:8,atk1:attack:7,atk2:attack:7,spin:attack:8,shoot:attack:7,lunge:attack:6,hurt:attack:5 \
    --poses hero_poses.png --jump frames/hero_action.png --drop atk1=2 --out sprites
python3 scripts/side_sprites.py --clips clips --name heavy --height 78 \
    --cycles walk:loop:8,attack:attack:8,hurt:attack:5 --drop attack=5 --out sprites
python3 scripts/side_sprites.py --clips clips --name armed --height 66 \
    --cycles walk:loop:8,attack:attack:8,hurt:attack:5 --range walk=12:48 --out sprites
```

### In the game

- Anchor each sprite at the feet anchor from `<name>_meta.json`; mirror horizontally when the
  character faces left.
- Reuse before generating more: the build ran its wall run as the run cycle rotated 90 degrees
  against the wall, and drew the dash trail from the frame being shown, tinted.

## Environment layers (`scripts/process_env.py`)

Inputs are `<env>/bg<N>.png`, `mid<N>.png`, `tex<N>.png`, `ledge<N>.png` and `props<N>.png`.
`--levels` takes a count (`5` means levels 1 to 5) or a list (`2,4`; `2,` for level 2 alone).
`--file KIND=PATH` processes one explicit file instead; `--dry-run` lists outputs without writing;
`--force` overwrites.

| Layer      | Render                                              | Processing                                                                  | Output                       |
| ---------- | --------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------- |
| background | 1920x1152, opaque                                   | WebP quality 86                                                             | `env_bg<N>.webp`, 1920x1152  |
| midground  | 1920x1152, transparent                              | WebP quality 86, alpha kept                                                 | `env_mid<N>.webp`, 1920x1152 |
| texture    | 1024x1024, opaque                                   | edges cross-faded over 12% per axis, resized to 384x384, quality 90         | `env_tex<N>.webp`, 384x384   |
| ledge      | 1536x384 requested (1536x512 returned), transparent | trimmed to alpha above 24, scaled to 120 px high, quality 90                | `env_ledge<N>.webp`          |
| props      | 1536x1024, transparent                              | split by connected components, 3 largest, each scaled to 180 px, quality 90 | `env_prop<N>_<k>.webp`       |

- **Seamless texture**: for the first `k` pixels of each axis, `out = tail * (1 - t) + head * t`
  with `t` from 0 to 1, and the tail is cut off. The wrap edge then joins two pixels that were
  neighbors in the render. On the build's five textures the mean wrap-edge difference fell to the
  level of an ordinary neighboring-pixel difference, so no hard line shows. Tile it on a big wall to
  check before shipping.
- **Ledge, 3-slice**: the cap is 12% of the strip's width (at most 30% of the run), drawn 18 to 30
  px high.
- **Props**: the prompt's "wide empty gaps between them so they never touch" is what makes the split
  work; props that touch merge into one component and the script warns when it finds fewer than
  asked for (`--props`).
- The superseded first pass was 384x224 paintings and tiles.
