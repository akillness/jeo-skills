---
name: scenario-ideogram
description: "Use when generating or editing images with Ideogram models on Scenario via MCP: posters, logos, menus, packaging, or signage with exact in-image text, editing an image in place while keeping its exact size, transparent PNG generation, background removal that keeps hair and glass edges, editable text layers for localization, or one consistent character from a reference. Keywords: Ideogram 4.5, Precise Edit, V4, V3, typography, aspect ratio, layerize, character reference, inpainting."
license: MIT
---

# Scenario Ideogram Image

## Overview

Ideogram's image family on Scenario is a set of single-purpose members, not one model with modes:
4.5 for generation where in-image text must read and for reference-guided edits, 4.5 Precise Edit
for changing one thing and leaving the rest alone, V3 Generate Transparent for native alpha output,
V3 Layerize Text for turning a flat graphic into editable text layers, Character for one identity
held across scenes, and Remove Background for cutouts. V4 still answers searches but was tagged
deprecated in favor of 4.5 at authoring time. The members agree on almost nothing mechanically: the
same concept changes name, casing, and allowed values between them, so discover each with `search`
and treat its `model_schema_get` as the contract.

Connection and the core loop: see the `scenario` skill in this repo; model-agnostic image work
(sizing families, reference cardinality, masks): the `scenario-image` skill; running a bake-off
against another family: `scenario-model-comparison`. If a sibling skill named here is missing from
your available skills, load it with `skill_get` (Scenario MCP) or ask the user to install it
(https://github.com/scenario-labs/skills#install); unattended, proceed from tool schemas and flag
the gap.

## Quick reference

Pick the member by the job (names from the live schemas, caps at authoring time):

| Member                  | Job                              | Inputs that matter                                                                                                                                                                                       |
| ----------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4.5                     | Text-heavy generation, ref edits | `prompt`, `referenceImages` (up to 5, the first is the source), `mask`, `aspectRatio` (auto, source, 25 ratios from 3:1 to 1:3), `resolution` (1K, 2K), `quality`, `magicPrompt`, `numOutputs` (up to 8) |
| 4.5 Precise Edit        | Change one thing, keep the rest  | `image` (output keeps its size), `mask`, `referenceImages` (up to 4 guides), `quality` (default medium), `numOutputs` (up to 8)                                                                          |
| V3 Generate Transparent | Native alpha output              | `prompt`, `negativePrompt`, `aspectRatio` (15 ratios), `renderingSpeed` (adds FLASH), `expandPrompt`, `numOutputs` (up to 8), `seed`                                                                     |
| V3 Layerize Text        | Flat graphic to layers           | `image`, optional `prompt`, `fontName*` or `fontFile*` per tier (H1, H2, Body, Small), `seed`                                                                                                            |
| Character               | Same character, new scenes       | `prompt`, `characterReferenceImage`, `styleType` (Auto, Fiction, Realistic), `aspectRatio` or `resolution`, `image` plus `mask`, `renderingSpeed` (Default, Turbo, Quality), `seed`                      |
| Remove Background       | Cutout to transparent PNG        | `image` (10MB cap)                                                                                                                                                                                       |

Nothing transfers between members. Masks flip between them: on 4.5 and Precise Edit white marks the
region to edit, on Character black repaints and white stays. Only V3 Transparent takes a
`negativePrompt`. `renderingSpeed` is uppercase on V3 Transparent and Title case on Character, whose
middle tier is Default.

## 4.5: tiers, sizes, and what they cost

`quality` is the price dial on both 4.5 members (very_low, low, medium, high; very_low needs an
input image, which Precise Edit's `image` satisfies and 4.5 takes as a `referenceImages` entry). At
authoring time `dry_run` quoted 7.75, 13.75, and 41.75 CU for low, medium, and high, Precise Edit's
very_low 3.75, and the same figure at 1K and 2K and for a 0.4 MP, 4.3 MP, or 8.3 MP source; billed
jobs came in 1.75 CU under each estimate. 4.5 defaults to high, its top and most expensive tier;
Precise Edit defaults to medium, and its high picks the best of several candidates at three times
the price. Tier names do not line up across families: Ideogram's high is its ceiling, while GPT
Image 2.5's high is its third tier of five and priced near Ideogram's medium. Compare families at a
matched price, never a matched tier name, and `dry_run` the exact payload.

2K output observed at authoring time: 2048 by 2048 (1:1), 2560 by 1440 (16:9), 2880 by 1440 (2:1),
2944 by 1152 (23:9), 3072 by 1024 (3:1), so the long edge tops out near 3072 and there is no 4K. 1K
is about 1 MP (16:9 returned 1280 by 720) and exists only for 1:1, 4:5, 3:4, 2:3, 5:8, 9:16, 1:2 and
their landscape counterparts; 3:1 at 1K passes `dry_run`, then fails at run time with a hint naming
the fix. A ratio outside the list (4:1) is a 400 listing the allowed values. A `mask` requires
`aspectRatio: "auto"`.

## Edits that keep the canvas

For an edit, `aspectRatio: "source"` on 4.5 and every Precise Edit run return the source's exact
pixel size, even one outside the ratio list: a 1326 by 313 (4.24:1) turnaround sheet came back 1326
by 313 from both, while `auto` rebuilt it as a full 3072 by 1024 scene. Use this when the edited
file must drop back into a layout, a sprite sheet, or a page template unchanged. A localized change
such as a headline swap needs no `mask` on Precise Edit: maskless at the medium default left the
rest of the scene untouched. The GPT Image family pads such a source with white bands instead (see
`scenario-gpt-image`).

In a single-sample bake-off at authoring time against GPT Image 2.5 on the same sources, the 4.5
members disturbed two to four times fewer pixels outside the edited region on a sign-text swap and
an add-and-remove-objects edit, and read closer to a requested painterly medium (a watercolor
restyle, a gouache landscape; hands-on use found the same for pencil sketches). GPT Image 2.5 led on
photoreal product shots, on following a character brief, and on material and color changes: asked
for burnished gold armor, both 4.5 members returned an olive brass, and Precise Edit also recolored
the sword the prompt said to keep. Route by the job, and say "keep everything else exactly the same"
plus the list of what must survive in every edit prompt.

## Exact text wants expansion off

The generators rewrite the prompt before generating by default, which helps a short exploratory
prompt and hurts the family's specialty: the rewrite can paraphrase the exact copy that must render.
When the image carries wording, disable it (`magicPrompt: "off"` on 4.5, `expandPrompt: false` on V3
Transparent), quote each piece of copy, and give it a place and a style ('the headline reads "GRAND
OPENING" in bold condensed capitals across the top'). `magicPrompt` applies to text-to-image only:
4.5 turns every edit into structured instructions regardless.

## Two routes to transparency

Native: V3 Generate Transparent writes the alpha channel directly, so icons, stickers, and UI
elements arrive compositing-ready. Cutout: generate on 4.5, then run Remove Background on the
result; it reconstructs edge pixels with partial transparency rather than segmenting, so hair, fur,
and glass survive. Go native when the asset is designed as an isolated element; go cutout when
typography or overall quality leads. 4.5 has no background field, so prompting "transparent
background" there yields an opaque image.

## Worked example: a localizable poster

1. `search` with `target="models"`, `query="ideogram"`, `public=true`. Members return as separate
   hits; match by name, e.g. `model_ideogram-v4-5` for typography (a live hit at authoring time:
   re-discover each session).
2. `model_schema_get` with that id: field names, allowed values, and defaults before anything else.
3. `model_run` with that `model_id`, `dry_run=true`, and
   `parameters={"prompt": "Retro travel poster, warm dusk palette. The headline reads \"KYOTO IN BLOOM\" in bold serif across the top; caption \"April 2027\" bottom right.", "aspectRatio": "9:16", "resolution": "2K", "quality": "high", "magicPrompt": "off", "numOutputs": 2}`
   for the cost estimate.
4. Repeat `model_run` with `wait=false`, then `jobs_wait` with the returned job id, re-called with
   `pending_job_ids` on timeout, never a second `model_run`.
5. `asset_display` the outputs and pick one.
6. To make the copy editable, discover the Layerize member the same way
   (`model_ideogram-v3-layerize-text` at authoring time), read its schema, and `model_run` with
   `parameters={"image": "<poster asset id>"}`: a generated asset's id feeds a file input directly,
   no re-upload. The output is a text-erased base plus text blocks with role, position, and content.
7. `jobs_wait`, then `asset_display` and `asset_download`.

## Common mistakes

- Carrying one member's block to the next: `magicPrompt` and `resolution` are 4.5's; V3 Transparent
  wants `aspectRatio` and `expandPrompt`; Precise Edit takes `image`, not `referenceImages`, for the
  source.
- Leaving 4.5 on its high default for drafts: low or medium first, high for the final.
- Leaving expansion on with exact copy in the prompt: the rewrite can change the words before the
  model sees them.
- Editing with `aspectRatio: "auto"` when the canvas must not change: use `source`, or Precise Edit.
- Prompting a transparent background on 4.5: generate on V3 Transparent or chain Remove Background
  instead.
- Inpainting on Character with `image` but no `mask`: they go together, `characterReferenceImage`
  stays required, and sizing fields are ignored while inpainting.
- Setting `fontNameH1` and `fontFileH1` together on Layerize: a tier's font comes from a font name
  or a font file, never both. `upload_asset` has no font kind, so with only a local font file use
  the font name route and flag the gap.
