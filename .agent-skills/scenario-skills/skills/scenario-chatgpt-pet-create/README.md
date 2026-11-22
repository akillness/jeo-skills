# scenario-chatgpt-pet-create: maintainer notes

Not read at runtime. How the skill was built and why it makes its choices.

## What it targets

OpenAI's Pets page (learn.chatgpt.com/docs/pets) documents the web upload: a transparent PNG or
WebP, exactly 1536x1872, at most 20 MiB, under Settings > Personalization > Pet, and says pets made
in Codex desktop stay on that computer. The 8 by 9 grid of 192x208 cells and the 11-row v2 layout
were read off sheets ChatGPT produced; the Codex folder (`pet.json` plus the sheet under
`${CODEX_HOME:-~/.codex}/pets/<id>/`) was confirmed by installing a v2 pet in Codex desktop. The
11-row v2 layout (1536x2288, rows 9 and 10 holding sixteen look directions) is the default here
because Codex desktop loads it (verified with a real v2 pet) and rows 0-8 of a v2 sheet are exactly
a v1 sheet, so the package always carries both: the v1 file costs one crop.

## Why the work is split this way

- **Generation on MCP, geometry local.** Every image comes from `model_run`; cutting, assembly,
  validation, GIFs and packaging run in the shipped scripts because the deliverable is a file for
  ChatGPT or Codex and no MCP tool assembles a pet sheet. The sheet and GIFs are uploaded into the
  pet's collection so the team can reach them.
- **One row per generation.** Image models do not draw an 8x11 grid to the pixel. Each row is one
  strip; `pet_frames.py extract` finds the poses by connected shapes (never by equal slots) and
  `pet_build.py` places them.
- **One pet height across rows.** Separate generations draw the pet at different sizes. The build
  scales every row so the pet's height matches idle, using the frame the prompts keep in the idle
  stance (last for `jumping`, first for `failed`, the median elsewhere), keeps each frame's lift
  above its row's ground (a jump stays a jump), and pins the planted lower body (the bottom 28%
  centroid) to one x. `pet_check.py` measures the same quantities, so what the build aims for is
  what the check enforces.
- **Edge cleanup once, on rebuilt cells only.** A hard key cut leaves key-tinted edges; one
  edge-local pass recolors them from solid neighbors. Kept cells of an update are never touched,
  which is what lets `--base-sheet` promise byte-identical rows.
- **No layout guide images, no labeled sheets as references.** A drawn template passed as a
  reference image did not hold sprite alignment in `scenario-sprite-animation`'s runs, and anything
  with labels, outlines or a grid invites the model to copy them. The prompts carry the frame count
  and spacing; the references are the clean base on its key, earlier strips, and the approved
  cardinals.
- **Direction verdicts are written by the agent.** Whether a pose looks up or right is a visual
  judgment; `pet_check.py` only enforces that sixteen verdicts with evidence exist and that the
  cardinals pass.

## Model ids

The body names `model_openai-gpt-image-2-5-sunburst` and `model_google-gemini-nano-banana-2-1`, and
falls back to `recommend` only when both are blocked for the team. This is a deliberate exception to
the repository rule against naming generative models, decided for this skill: both keep one
character across a row of eight poses from a reference image, and a pet run is 13 generations where
a weaker pick shows up as identity drift between rows. When a newer generation of either family
ships, update the ids in `pet_prepare.py` (`SUNBURST`, `NANO_BANANA`), both SKILL.md bodies (the
create Quick reference and the update Overview) and this file. `model_pixel-snapper` is named as
Scenario's tool for the pixel-perfect mode.

## Probes (October 2026)

- Sunburst, one eight-pose run cycle from a single identity reference, asked for `width` 3584 and
  `height` 512 (7:1): it returned 3584x1200, about 3:1, with eight separated poses on a flat
  background, all faces screen-right; extraction passed with no errors. `dry_run` quoted 14.75 CU;
  `jobs_wait` reported a `cuCost` of 13, and `usage` showed the other 1.75 CU charged to the
  project's Quality Gate, so the quote is the real price. `pet_prepare.py` now asks for a height of
  at least a third of the width.
- Pixel Snapper (`colors` 32) on a 435x640 identity image returned 78x115 with 32 colors; keyed, the
  pet was 55x93 and `pet_prepare.py pixel` chose a 2 px grid. `dry_run` quoted 6.75 CU, billed 5 CU.
- The generated strip, extracted and rebuilt into an existing v2 sheet with `--base-sheet`, changed
  only that row; `pet_check.py` measured the new row at 1.003 of the idle height.
- Live application test (October 2026, a separate Claude Code process with only `scenario` and this
  skill installed): a pixel-perfect v2 pet from text met every file and quality criterion (checked
  v2 sheet, v1 cut, both GIFs, one 2 px grid and palette, nothing installed) but spent 213.5 CU
  against a 200 CU budget, because the tester tracked `cuCost` and the body quoted billed rather
  than quoted prices; one rejected working row (the model added tools) was the only repair. Fixed
  from it: the body budgets from `dry_run` quotes; `pet_prepare.py pixel` drops key-blend colors the
  snapper makes from the outline (two purple shades had reached 22k outline pixels of a green pet);
  `extract` warns only about key-like pixels inside the pet, not edge fringe; the working-row prompt
  asks for gestures without objects; one-sided details keep their side in look rows and rule out
  mirroring; `pet_check.py` reports pixel-mode metrics.

## Pixel-perfect mode

Snapping every frame costs one call per frame (73 on v2) and lands frames on different grids, so the
pet changes size between frames. The mode snaps only the approved base: its grid and palette become
`pixel.json`, the enlarged snapped base becomes every row's reference, and the build puts each
placed frame on the sheet's grid (best sub-grid offset, block average, nearest palette color, on/off
alpha). Grid 1 covers pixel art drawn at cell resolution: palette and on/off alpha without block
enlargement.

## Scripts

Python 3 with Pillow and NumPy, no other dependency (connected components are labeled by row runs
rather than with SciPy). `tests/scenario-chatgpt-pet-create/` builds synthetic pets and covers key
choice, the job graph and request sizes, extraction order and errors, equal height across rows, the
shared ground line, jump lift, mirroring, byte-identical kept rows, pixel mode, the edge cleanup,
every structural and quality check, GIF timing and backgrounds, the v1 cut and the install backup.

A real v2 sheet made with ChatGPT (not committed) passed `split`, the full `pet_check.py` (every row
within 2.4% of idle height, jump lift 41 px, look-row drift 0.7 px), the previews, `--clean`
(byte-identical output), `--reregister jumping` and a rename through `pet_package.py make`.
