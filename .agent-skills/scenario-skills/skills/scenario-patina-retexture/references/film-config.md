# Film configuration and commands

`film.py` drives Blender and ffmpeg locally and makes no Scenario calls. Requirements: Blender 4.2
or newer with EEVEE ray tracing (written against 5.x), Python 3 with Pillow (10.1 or newer when no
`.ttf` is configured and no system font is found) and numpy, ffmpeg and ffprobe with libx264.

```sh
python3 scripts/film.py config.json pilot
python3 scripts/film.py config.json run
python3 scripts/film.py config.json status
python3 scripts/film.py config.json assemble
```

`--blender PATH` overrides the config `blender` key; that key, then the `BLENDER` environment
variable, is used when set and may be an executable path or a command name looked up on `PATH`; a
set value that names a missing file is an error rather than a fallback, and a directory (a macOS
`Blender.app` bundle) is rejected with a message pointing at `Contents/MacOS/Blender`; when neither
is set, `blender` on `PATH` and then the macOS application bundle are tried.

## Modes

- `pilot` renders the first and last frame of every shot for both passes at half resolution, writes
  `Pilot Contact.jpg` (before above after, per shot), and a `pilot_estimate.json` whose time figure
  scales the pilot by the pixel ratio and includes process startup: a rough estimate, not a promise.
- `run` renders every source frame at native resolution in bounded Blender batches, skipping frames
  that already exist and decode, saves `Original Camera Animation.blend` and
  `Patina Camera Animation.blend` (the editable scenes), then assembles and verifies.
- `assemble` repeats the assembly and verification after an interrupted encode.
- `status` writes and prints `status.json`: stage, frames rendered per pass, frames required, run
  folder.

## Configuration

Copy [example-config.json](example-config.json) and replace everything that describes the asset.
`project_root` is relative to the JSON file; `before`, `after`, `output`, `environment`, `font`, and
`bold_font` are relative to `project_root` (absolute paths are kept as given). Both scenes must hold
the same mesh geometry, transforms, and object names (only the materials differ): `pilot` and `run`
each compare a geometry hash, a camera hash, and the render settings between the two passes, but
only once both passes have rendered, so a mismatch costs a few endpoint frames in `pilot` and the
whole native render in `run`.

| Field                                  | Default                                                       | Effect                                                                                                                                                                                        |
| -------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `before`, `after`                      | required                                                      | The two packed `.blend` scenes                                                                                                                                                                |
| `shots`                                | required                                                      | Ordered list, see below                                                                                                                                                                       |
| `title`, `before_label`, `after_label` | `PBR MATERIAL STUDY`, `Original materials`, `PATINA textures` | Header text, and the two labels drawn after fixed `BEFORE  /  ` and `AFTER  /  ` prefixes (do not repeat before/after in a label); the footer IDENTICAL GEOMETRY / CAMERA / LIGHTING is fixed |
| `width`, `height`                      | `2368`, `1332`                                                | Native panel resolution; the stacked master adds padding and captions (2560x3200 at these)                                                                                                    |
| `fps`, `source_fps`                    | `24` (fixed), `12`                                            | Delivery cadence, always the integer 24 (`24.0` or any other value fails validation), and rendered cadence, 12 or 24: 12 is interpolated to 24, 24 renders every frame                        |
| `shot_seconds`, `transition`           | `5.5`, `0.5`                                                  | Raw shot length and crossfade overlap; the crossfade must last at least one source frame (`1/source_fps`, 0.0833 s at 12 fps) and less than `shot_seconds`; hard cuts (`0`) are rejected      |
| `samples`                              | `24`                                                          | EEVEE render samples                                                                                                                                                                          |
| `workers`                              | `1`                                                           | Simultaneous Blender processes, 1 or 2; two only with measured memory headroom                                                                                                                |
| `rig_scale`, `rig_origin`              | `1`, `[0, 0, 0]`                                              | Scale and ground-level center of the light rig: the asset's height divided by about ten, and its footprint center                                                                             |
| `environment`                          | Blender's bundled studio HDRI                                 | Path to a local HDRI for reflections; its content enters the run fingerprint and a missing file fails before Blender starts                                                                   |
| `output`                               | `video/automatic`                                             | Parent of the fingerprinted run folders                                                                                                                                                       |
| `font`, `bold_font`                    | first found system font                                       | Caption fonts for Pillow                                                                                                                                                                      |
| `blender`, `ffmpeg`, `ffprobe`         | see above, `ffmpeg`, `ffprobe`                                | Executables; none of the three enters the run fingerprint                                                                                                                                     |

Final duration is `shots x shot_seconds - (shots - 1) x transition`: twelve default shots make 60.5
seconds.

### Shots

Each shot has `name`, `start`, and `end`; `name` labels the timeline marker and the contact sheets,
and the master carries only `title`, `before_label`, and `after_label`. An endpoint is
`[target_xyz, viewing_direction_xyz, visible_width]`: the point the 85 mm camera looks at, the
direction from the target toward the camera (not normalized), and how wide the frame is at the
target in scene units. Target and width ease smoothly between the endpoints; the viewing direction
rotates at constant angular speed, and exactly opposite start and end directions arc overhead
through world +Z, so a 180-degree turnaround is a legal shot. A narrow reflection strip light sweeps
across the subject during every shot, blending from its wide to its close-up preset as the visible
width moves from 7 down to 5 rig units, so roughness and normal response move on screen; a
straight-down or straight-up view sweeps it around the rig's front side.

Take targets from `inventory.json` bounds; check both endpoints on the pilot sheet for clipping and
occlusion. The example plan opens wide, spends ten shots on one material each (glazed ceramic,
brass, roof tiles, timber, plaster, canvas, a mixed shopfront, paving, painted metal, signage), and
closes with a pullback. Its coordinates were framed for one public street diorama and fit nothing
else.

## Fast preset and its cost

The scripts set EEVEE with ray-traced reflections at half resolution, denoised, one shadow ray and
six shadow steps, AgX view transform, no depth of field, a packed studio environment plus a warm
grazing key, a cool rim, a soft fill, and the moving strip. The rig replaces the input scenes' own
setup rather than adding to it: every light object is deleted, the world node tree is rebuilt around
the packed environment, and a fresh camera named `Synchronized Comparison Camera` (85 mm on a 36 mm
sensor, horizontal sensor fit, zero shift, no parent or constraints, depth of field off, clip 0.01
to at least 1000 units) becomes the scene camera while the source camera stays in the file unused;
render border and crop, pixel aspect, stamp, motion blur, Freestyle, multiview, compositing,
sequencer, simplify, and any color-management override are switched off, with display device sRGB,
AgX with the Medium High Contrast look, exposure 0 and gamma 1. The `before` and `after` files are
never written to; the rig lives only in the two saved `Camera Animation.blend` scenes. Rendering 12
fps sources for slow moves and interpolating to 24 fps halves render time at the price of motion
detail; keep `source_fps` 24 for fast motion. Fewer samples leave more noise in close-ups, so read
the sweep sheet before delivery.

## Run folder and resume

The run folder name is a fingerprint of the two input files and the configured HDRI by content, the
scripts, and the config (minus `workers`, executables, `output`, and `project_root`; file keys under
`project_root` enter as relative paths and those outside it as resolved absolute paths, so moving or
renaming a project keeps its run folder, while renaming an input file or editing the HDRI in place
starts a new one). Resume works only while nothing in that set changes; a packed `.blend` is what
makes texture edits part of the fingerprint. Each pass records a contract (`<mode>_contract.json`,
with the render settings, the camera, and the Blender version); a resume into a folder whose
contract differs lists every differing key with both values, and a Blender version difference alone
does not block it. Partial or corrupt frames, clips, review stills, and contact sheets are moved to
an `archive/` folder next to the replaced file, never overwritten in place; only `review/sweep/` is
deleted and re-extracted when `Sweep Contact.jpg` is missing or any sweep frame fails to decode.
Every `assemble` decodes every review still and sweep frame and verifies each joined pass right
after encoding.

Outputs in the run folder: `PATINA Comparison.mp4` (stacked master), `PATINA Comparison Share.mp4`
(1440 wide), `Original Matched Camera.mp4` and `Patina Matched Camera.mp4` (the two landscape
passes), the two editable scenes, `review/` (one mid-shot still per shot, `Sweep Contact.jpg`
sampled at 2 fps across the master, `Final Contact.jpg`), `verification.json` (frame counts and
durations from ffprobe for every movie, and the sweep path), and the frame and clip caches.

Keep the movies, scenes, source assets, textures, manifests, and verification files. When asked to
clean up, move `frames/`, `clips/`, `sequence/`, pilots, and old runs to an archive outside the
delivery folder; archiving keeps files, it frees nothing, so say so.
