---
name: scenario-gpt-image
description: "Use when generating or editing images with OpenAI's GPT Image models on Scenario via MCP: text-to-image, edits from reference images, inpainting with an alpha mask, in-image text for logos and infographics, transparent cutouts, pixel sizing up to 4K, quality tiers up to xhigh and max, input fidelity for product or face detail, or choosing between Flare, Sunburst, GPT Image 2 and 1.5. Keywords: GPT Image 2.5, GPT Image 2, OpenAI, DALL-E, gpt-image, ChatGPT image, txt2img, img2img, background."
license: MIT
---

# Scenario GPT Image

## Overview

Every member of GPT Image, OpenAI's image family on Scenario, both generates and edits through one
`prompt`, with `referenceImages` carrying the image to edit and an optional alpha `mask` for
inpainting. Four members were live at authoring time: GPT Image 2.5 Flare (fast, everyday), GPT
Image 2.5 Sunburst (precision: dense copy, diagrams, edits that must hold geometry), GPT Image 2,
and GPT Image 1.5, the one member with a fidelity dial and ratio sizing. Discover members with
`search` and treat `model_schema_get` as the contract: the family agrees on prompt and references
and splits on sizing, quality tiers, and fidelity.

Connection and the core loop: see the `scenario` skill in this repo; model-agnostic image work: the
`scenario-image` skill. If a sibling skill named here is missing from your available skills, load it
with `skill_get` (Scenario MCP) or ask the user to install it
(https://github.com/scenario-labs/skills#install); unattended, proceed from tool schemas and flag
the gap.

## Quick reference

Shared shape at authoring time: `prompt` (required, cap 32000 characters), `referenceImages` (an
array even for one, up to 10), `numOutputs` (1 to 10 variations of one prompt), `quality`, and
`background` (`auto` and `opaque` everywhere, `transparent` on every member but GPT Image 2). The
splits:

| Contract        | 2.5 Flare and Sunburst              | GPT Image 2             | GPT Image 1.5                            |
| --------------- | ----------------------------------- | ----------------------- | ---------------------------------------- |
| Sizing          | `width` and `height`, 16 to 3840 px | same                    | `aspectRatio`: auto, 1:1, 3:2, 2:3       |
| Inpainting      | `mask` PNG                          | `mask` PNG              | no mask field                            |
| `quality`       | auto, low, medium, high, xhigh, max | auto, low, medium, high | high, medium, low (default high)         |
| Source fidelity | prompt wording only                 | prompt wording only     | `inputFidelity`: high locks, low reworks |

Routing: Flare and Sunburst share one contract and one price list, so the choice is speed against
quality. OpenAI describes Flare as the small model, built for speed with image quality comparable to
GPT Image 2, and Sunburst as the base model, with higher image quality than GPT Image 2: Flare for
everyday work, Sunburst when accuracy beats speed (packaging copy, dense numbers, exploded diagrams,
geometry-preserving edits). GPT Image 2's contract is the 2.5 contract minus the two top tiers, and
it prices its `high` at their `max`, so new work starts on 2.5. GPT Image 1.5 earns its place for
`inputFidelity: "low"`, which reworks a reference instead of reproducing it (only the first five
references keep the higher fidelity), and for 3:2 or 2:3 output without pixel math. Transparent
cutouts route to a 2.5 member: GPT Image 2 rejects the value, and 1.5 is the fidelity and ratio
member rather than the cutout one.

## Quality is the price dial

`quality` moves the price more than size does, and the same word does not price the same across
members. At authoring time a 1024 square priced 2, 3, 12, 20 and 45 CU across low, medium, high,
xhigh and max on both 2.5 members; GPT Image 2 priced low at 2, medium at 12 and high at 45; `auto`
resolved to 12 on all three; a 3840 by 2160 `max` run on Flare came to 69 CU. `dry_run=true` the
member you will run and read `creativeUnitsCost`; `referenceImages`, `numOutputs`, `quality`, and
sizing all carry `cost_impact`, so re-estimate after touching any. `xhigh` or `max` on GPT Image 2
is a 400 ("Input quality must be one of the following values") even on a dry run. Tier choice: low
for drafts, medium for everyday finals, high when small text or legends must stay legible, and
`xhigh` or `max` only when the tier below left a specific requirement unmet within your latency
budget: a higher tier does not guarantee a better result for every prompt.

Sizing on the pixel members follows OpenAI's published grid: each axis a multiple of 16, long edge
at most 3840, aspect between 1:3 and 3:1, total pixels between 655,360 and 8,294,400, above 2560 by
1440 experimental. The schema enforces only the 16-step range and `dry_run` prices any request, so
hold to the grid yourself: an off-grid request still succeeds but returns a different size with no
error. At authoring time 3840 by 960 and 3840 by 480 both came back 3840 by 1280 (clamped to 3:1),
960 by 3840 came back 1280 by 3840, 1000 by 1000 came back 992 by 992, and 3840 by 3840 came back
2880 by 2880 on Sunburst while Flare refused it at submission ("Error while running prediction").
Common picks: 1024 square (fastest), 1536 by 1024, 1024 by 1536, 3840 by 2160 for 4K, 2560 by 1088
for a true 21:9.

An edit source outside 1:3 to 3:1 comes back padded, not cropped: a 1326 by 313 (4.24:1) source
returned about 2132 by 738 on both 2.5 members with white bands above and below covering about a
third of the frame, and typing the source size returned 1408 by 480 padded the same way. Read
`width` and `height` from `asset_get` after every run. When the edited file must keep its exact
canvas, crop the bands off the result or route the edit to a member that keeps the source size (see
`scenario-ideogram`).

## Masks and transparency

The `mask` is a PNG the size of the first reference image, read through its alpha channel only:
transparent pixels are edited, opaque pixels preserved, RGB white or black ignored without alpha.
Export with transparency, never flattened, and convert a white-on-black mask's white region to
transparent. OpenAI treats the mask as guidance rather than a hard edge: when a region must stay
pixel-identical, composite the approved edit back over the original.

`background: "transparent"` returns real alpha on 2.5 Flare and Sunburst at every tier; GPT Image 2
rejects it. Two authoring-time observations on the 2.5 members: alpha peaks at 254, never 255, so a
check for fully opaque pixels reads the whole subject as semi-transparent; and the color data under
transparent pixels carries a halo, so any surface that drops alpha (JPEG flattening, a thumbnail
without transparency, a viewer compositing on black) shows the cutout glowing. On white or a
checkerboard it is clean. Prompt the cutout as a clean cutout with a crisp silhouette, fine edges
and label text preserved, no halos, no restyling, then inspect the alpha channel at hair, glass,
shadows, and object edges. Keep PNG or WebP and the alpha channel through every hop, previews and
downloads included.

## Prompting behavior

Position is weight: style, medium, subject, and mood open the prompt, then scene, details, lighting,
and text, in natural sentences rather than tag lists. Name the intended use (ad, UI mock,
infographic, key art) to set the polish level. For photorealism say "photorealistic" and name
concrete texture (pores, fabric wear, material grain); for people, describe framing, gaze, and what
the hands are doing. A detailed brief gets normalized, not embellished: augment only a generic
prompt, and never add characters, brands, slogans, or left-right placement the request did not
imply. Past roughly seven distinct requirements some quietly drop, so build a clean base, then one
targeted change per edit, passing the previous output back as the next reference.

When editing, say "change only X", list what must survive, and repeat that list on every iteration;
anything unmentioned is open to change. Not every input image is an edit target: references supplied
for style or mood make the run a generation with references. Give each reference a role by index
("image 1 is the product, image 2 the palette"); unassigned references blur together. `numOutputs`
yields variants of one prompt, which is what layout drafts of one brief are; distinct subjects need
distinct runs.

Text inside the image: quote the exact copy, spell tricky words letter by letter, brief the layout
(each element's zone, its size rank against the others, what stays empty), state type weight and
case, say how many times the copy appears, and append "no extra words, no duplicate text". Prompts
naming public figures are declined; describe an archetype instead. Complex prompts can run around
two minutes: wait through `jobs_wait` rather than re-running.

## Worked example: a product hero with headline text

1. `search` with `target="models"`, `query="gpt image"`, `public=true`. Read names rather than rank:
   new members rank below GPT Image 2 while their usage is young. Headline text wants Sunburst, e.g.
   `model_openai-gpt-image-2-5-sunburst` (a live hit at authoring time: re-discover each session).
2. `model_schema_get` with that id: `quality` allowed values, sizing bounds, mask presence, and
   defaults first.
3. `upload_asset` the product photo (see the `scenario` skill) for its asset id.
4. `model_run` with that `model_id`, `dry_run=true`, and
   `parameters={"prompt": "Editorial product photography, soft daylight. The exact bottle from image 1 on brushed concrete, label, shape, and color preserved. Headline \"DRINK GREEN\" in bold sans-serif, centered, appears once, no extra words, no duplicate text.", "referenceImages": ["asset_x"], "width": 1536, "height": 1024, "quality": "low", "numOutputs": 3}`
   for the draft price; then run it with `wait=false` and `jobs_wait` on the returned job id,
   re-called with `pending_job_ids` on timeout, never a second `model_run`.
5. `asset_display` the three drafts and pick a composition. Repeat step 4 with that prompt,
   `quality: "high"`, `numOutputs: 1`, `dry_run=true` first: the tier change moves the price.
6. `asset_display` the final and proofread the rendered text before batching; `asset_download` to
   save.

## Common mistakes

- Carrying `xhigh` or `max` to GPT Image 2 or 1.5: a 400 at validation; read allowed values off each
  member's schema.
- Routing cutouts to GPT Image 2: it rejects `background: "transparent"`; use 2.5 Flare or Sunburst
  (1.5 is the fidelity and ratio member).
- Carrying sizing across members: `width`/`height` on 2 and 2.5, `aspectRatio` on 1.5, never both.
- Trusting the requested size: past 3:1, past 8,294,400 pixels, or off the 16-pixel grid, the job
  succeeds at a different size, and an over-wide edit source gains white bands.
- Leaving `inputFidelity` at its high default on 1.5 when you wanted reinterpretation: drop it to
  low and re-`dry_run`.
