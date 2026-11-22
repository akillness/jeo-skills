# Per-lane schema notes

Authoring-time observations from live catalog hits. Model availability differs per team and schemas
change, so treat every name and number here as a starting point and confirm with `model_schema_get`
before running.

## Purpose-trained animation models (pixel cycles and VFX)

Retro Diffusion Animation: a `style` enum picks the animation type and locks the canvas
(`four_angle_walking` and `walking_and_idle` 48px, `small_sprites` 32px, `vfx` 24 to 96px). A
requested 64px walk cycle is a schema violation, not a prompt problem: generate at the locked size
and upscale after on a pixel-preserving route per `scenario-game-assets`.

`returnSpritesheet` flips the output from animated GIF to spritesheet PNG. Set an explicit `seed` on
the preview run and repeat the identical payload with `returnSpritesheet` for the sheet, since a
seedless preview cannot be re-run to match.

Judge the preview from the downloaded file (`asset_download` with `format="gif"`): `asset_display`
shows a still, and the png default flattens it to one frame.

Never slice the GIF preview for engine frames: those come from the same-seed `returnSpritesheet`
re-run, sliced on the grid you counted. Verify row order and facing before naming frames.

The `image` reference is converted to RGB without transparency, so flatten a transparent sprite onto
a plain field deliberately.

Retro Diffusion Plus takes a reference palette image via `inputPalette` for palette-guided
generation. After generation, a shared palette is the Pixelate pass under Packaging pixel frames.

The style enum is the whole motion vocabulary: given an attack brief and a character reference
through `image`, `small_sprites` returned a 20-frame generic cycle (arms up, turn, walk, collapse)
at 150 ms per frame with the held weapon gone, and `walking_and_idle` returned a 44-frame
four-direction idle and walk set at 200 and 400 ms with outfit and prop kept. Both GIFs came back
transparent. Scripted beats, an exact frame count or a weapon-in-hand action belong to the
single-sheet lane below.

## Single sheet from a general image model

At authoring time `recommend`, given a 16-frame 4x4 grid spec under capability txt2img, returned
`ask_user` between the purpose-trained animation model, which it said does not honor an arbitrary
grid or frame count, and a top-ranked general image model whose tradeoff read that the pixel look is
emulated rather than native. The GPT Image family that pick belonged to exposed `width` and `height`
in steps of 16 (pick a canvas the grid divides evenly, 2048 over 4 being 512 px cells), `numOutputs`
for several candidate sheets in one run, `referenceImages` for an existing character, `quality`,
`background` (`auto`, `opaque`, `transparent`, no color value) and no `seed`. Size, quality and
sample count carry `cost_impact`, so `dry_run` the exact payload: the same 2048x2048 high-quality
sheet priced 15 CU on the family's two newest members and 59 CU on the member before them, against a
`recommend` quote of 12 CU taken at defaults. Those newest members, listed the day of the read, were
absent from `recommend` and present in `search`, so a member the user names is reached by name.
Confirm with `model_schema_get`.

The live run that grounds the lane: two candidates from one `numOutputs: 2` call both came back as
exact 4x4 grids on a near-white field (RGB 253; the snapper later flattened it to one value, 254,
253, 253, still not 255, so a brief that needs exact white has to accept near-white or be flagged)
with one consistent character, one weapon per frame and no grid lines or labels. One candidate
clipped its projectiles at two cell edges and the other kept every effect inside its cell, which is
why the sheet is read before slicing. In both, frames 13 to 16 were one held idle pose, and the
16-to-1 seam measured 1.06 times the largest in-cycle step, above the window's baseline, while a
13-frame window (3 to 15) closed within it: ship the full count when the brief fixes it and the
closing window beside it. Slicing 4x4 returned sixteen 512 px tiles in row-major order, each a
pixel-exact copy of its cell.

Position drift is the lane's jitter source. In that sheet the grounded feet sat at 487 px in the
first row, 447 in the third and 400 in the fourth, and the body's horizontal center wandered 59 px
(standard deviation 26 px), which reads as the character hopping about in the GIF. Two
generation-side fixes failed on the same model: anchoring language ("an invisible ground line at the
same height in every cell, feet on it in grounded frames") made the model draw the line itself, at a
different height per row (462, 422, 402), and a 4x4 layout template with ground and center lines
passed through `referenceImages` was honored for the grid and left out of the output as asked, yet
the rows still landed at 486, 461 and 420. Alignment in post fixed it: take the median
grounded-frame bottom per row as that row's baseline (an all-airborne row borrows its neighbor's, so
jump height survives), shift every tile of the row by the difference to one common baseline, center
each tile's body box horizontally (find the body as the widest run of columns whose occupancy clears
a few percent of the cell height, which skips thin projectiles), and do it on a wider canvas
(640x512 for 512 px tiles) so shifted projectiles do not clip. Center spread fell to 0.3 px and
grounded-baseline spread to 7 px. Re-lay the aligned tiles as a sheet, `upload_asset` it, slice on
the platform and assemble; the assembler scaled those 640x512 frames to 512x408, so expect a 512 px
wide GIF from wider inputs.

## Alpha and background removal

Native transparency is an image-lane property. On the still, prefer a model whose schema carries a
background option and read it (`recommend` with the transparent-background need in the user's own
words): at authoring time the GPT Image family exposed `background` with `auto`, `opaque`, and
`transparent`, the transparent value marked Preview, and the same discovery also surfaced a
dedicated transparent generator. Confirm with `model_schema_get` and check one frame before
committing a batch. A sheet generated with `background: transparent` would be the one route where
alpha reaches engine frames without a removal pass, if the slicer keeps it, which was not verified
at authoring time: read one tile's alpha before slicing the rest. The purpose-trained animation
model's GIFs came back transparent; the `returnSpritesheet` PNG that engine frames are sliced from
was not read for alpha at authoring time, so check one sheet before skipping the removal pass on
that lane.

No video lane observed at authoring time emitted alpha: every image-to-video and text-to-video
schema read exposed no transparency output, so on a video-derived sprite the removal pass is the
route rather than a fallback. Budget it from the start instead of hunting for a generator that skips
it, and confirm with `model_schema_get`. Two schema features read like alpha and are not. A
`background` parameter can composite a backdrop in rather than cut one out: on one avatar model it
takes `color`, `image`, or `video`. A `mov` container choice is about color fidelity unless the
schema says otherwise, since a `mov` carries alpha only with an alpha-capable profile such as
ProRes 4444.

Extract first, then run an image background remover on each frame: per-frame cutouts came back
cleaner than the video-level pass in live runs. The dedicated removers default to alpha out but
spell it differently (`preserveAlpha`, a `backgroundType` of `rgba`, or no control at all), so read
the schema rather than assuming. Discover them by tag (`search` with `target: "models"`, `filters`
`tags: ["remove-background"]`, and `public=true`) and read each hit's schema, because that tag also
returns the video removers and a background replacer, which swaps a backdrop instead of removing it.
A remover's HD mode silently no-ops below its input floor, so upscale past it for better mattes on
glows.

Removing at video level before extraction is the one-run alternative, and the container is the whole
decision. One video remover's schema states it outright: "Transparency (alpha): VP9 (.webm) and
ProRes 4444 (.mov). MP4 has no alpha. GIF: limited transparency only." Set the output format
explicitly, since one remover's description invites leaving it empty while its schema declares a
default and lists no empty value, and copy the token from `allowed_values` rather than from the
label, which read ProRes 4444 for a value spelled `mov_proresks`.

Whichever route, verify alpha on one downloaded frame before batching. A transparent request can
come back stored without it: one run asked for VP9 and the delivered asset carried no alpha, the
subject flattened onto black. The extractor's output format is not in its schema either, so check
one extracted frame, which is why the frame check in step 4 is not optional.

Assembly flattens what is left. Both runs that assembled transparent frames got an opaque preview
back, so treat that as expected rather than a defect to chase: the frames and the sheet carry the
alpha, and the preview is for motion review.

## Video lanes

The live hits were keyframe pinning on a 24fps grid (FLUX.3 Keyframes), start plus end frames with
an fps enum (LTX), and a style preset with a seed (PixVerse). Turn prompt rewriting off (expansion
and optimizer toggles) when exact wording carries the character or motion script.

## Reading a deprecation tag

A deprecation tag names a replacement (`deprecated:model_x`) or stands bare, and the pointer can
cross capabilities, so prefer the replacement only when its schema still covers the need.

## Packaging pixel frames

Snap each frame individually with the same color count and seed, never the assembled sheet: the
snapper collapses a sheet to one global grid and loses per-frame detail. The snapper is priced per
tile (5 CU at authoring time, so a 16-frame set is 80 CU): `dry_run` one tile and multiply before
committing the set.

A color count alone does not hold colors across frames: each frame is reduced to its own palette, so
a cloak's shade swaps from frame to frame and the cycle shimmers even when the grid holds. Lock one
palette for the whole set instead:

- Take the colors from every approved frame, not the key frame alone: download them and list the
  most-used colors across the set locally, or use the hex values the brief names. A custom palette
  restricts output to its colors, so a flash, projectile, or effect color that appears only in later
  frames must be in the list or it is remapped.
- Cover every material, thin props included: a most-used count under-weights a staff or a buckle (a
  wooden staff once came back gray). Check the probe frame for any part that changed color before
  running the set.
- Find the Pixelate tool model with `search` (`target: "models"`, `public: true`, `filters`
  `tags: ["tool"]`, `query: "pixel"`), then run it on every frame with that list as `colorPalette`
  (hex strings, an array) and one `pixelGridSize` for the set. `colorPaletteSize` is ignored once a
  palette is set.
- The snapper has no palette field, only a count, so never ship its output alone on an animated set.
  Run Pixelate on frames that already share one size: the sliced tiles, or the snapped frames after
  the common-size rescale below.
- Pick a `pixelGridSize` that divides that size evenly (128 on a 512 px tile gave exact 4x blocks).
  Output size is not always input size: a 96 px input came back 256 px on uneven blocks. Read one
  output's size with `asset_get` and check its blocks are whole pixels before running the set.
- Upscale only when that output is smaller than the delivery size, by one whole multiple (2x, 3x,
  4x): a fractional factor gives pixels uneven widths that crawl as the sprite moves. The resize
  tool below exposes no interpolation control, so check one scaled frame.

Skip the pass altogether when the frames already sit on the art's native grid. The snapper
re-detects a grid of its own, and on frames that were already pixel-native it regridded 384x288 down
to 69x52 and took the scene with it. Probe one frame before running the set. On emulated pixel art
the probe decides: one 512 px tile from a general image model came back 104 px at 32 colors with the
character intact, another collapsed to 23x23 and lost it. On a failed probe, skip the snapper and
let the Pixelate pass set the grid.

Where snapping does apply, the snapped frames land on their own native grids a few pixels apart and
need rescaling to one common size before assembly, since padding without rescaling leaves the
character pulsing in size across frames. Scenario Resize Image (`model_scenario-resize-image`) takes
`images` (an array, up to 10 per call, so a 16-frame set is two calls; a bare value is ignored),
`width`, `height`, and `fit`, and exposes no interpolation control, so check one rescaled frame
rather than assuming it snapped cleanly.

## Assembler timing

GIF frame delays quantize to 10ms, so any fps that is not a divisor of 100 is silently re-timed: a
12fps request lands at 100ms per frame, which is 10fps. Build the engine deliverable as mp4, which
holds exact timing, and treat the GIF as a preview. Count the frames that came back, because the
assembler trades frame accuracy to hold total duration and does it in both directions: one run
returned 7 frames from 8 inputs, another returned 20 from 16, duplicating frames and re-timing an
8fps request to 100ms each. The same 16 inputs at 10 fps came back as 16 frames at 100 ms, one to
one, so an fps on the 10 ms grid is what keeps the mapping.

## An aspect ratio the model ignored

A video model can ignore both `aspectRatio` and a resolution enum and snap to its own latent grid: a
4:3 720p request came back 1088x800, which is neither. Probing the delivered file is what catches
it.

The geometric fix is a resize: Scenario Resize Video (`model_scenario-resize-video`) for clips and
Scenario Resize Image (`model_scenario-resize-image`) for extracted frames take the same `width`,
`height`, and `fit` (their input fields differ, so read each schema; fixed first-party ids: each is
Scenario's single exact-dimension resize tool for its asset type). `fit: "cover"` scales the picture
to fill the box and center-crops the overflow, so 1088x800 lands on an exact 384x288 with nothing
squashed; `contain` (the default) fits inside the box without cropping, so the output can come back
smaller than the box, and `stretch` forces the box size at the cost of geometry. Confirm with
`model_schema_get`. There is no crop offset: the crop is centered, so a subject off to one side may
need the aspect picked at generation time instead. Scenario Padding Remover trims uniform borders
from images only. The reframe models recompose generatively instead of cropping, so they break
frame-to-frame consistency and do not belong inside a sequence.

So `cover` is the answer for an exact ratio. The fallbacks, for when the crop would cut into the
subject, are `stretch` with the distortion recorded (1088 against the 1066.67 that exact 4:3 wants
is 2.0%) or `contain`, which keeps the whole picture but does not land the ratio (no bars are added;
the output is simply smaller than the box). Either way, confirm the delivered canvas before any
downstream work: every stride and seam number depends on it.

## Sourcing the still for a scene loop

The loop lanes assume a still already exists. Where it does not, treat it as a separate job with its
own budget: it anchors every frame that follows, and no amount of animation work rescues a still
that misses the brief.

Discover a pixel-art image model (`recommend` with the pixel-art still need in the user's own words)
and read its ceiling before planning a canvas. At authoring time Retro Diffusion Plus capped `width`
and `height` at 384, so the largest exact 4:3 it delivers is 384x288, and `removeBg` defaults to
false. Confirm with `model_schema_get`.

Check subject-critical detail (counts, poses, who is holding what) against the brief before
animating. These models are weak at exact counts: a five-child campfire came back as four across
three prompting strategies (a count word, an explicit seating layout, then five children enumerated
by shirt color), and the platform's own auto-caption confirmed the miss independently. Where a count
or composition has to be exact, iterate the still per `scenario-refine-loop` and keep those attempts
on their own budget line rather than spending the animation allowance on them.
