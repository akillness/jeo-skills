# Dataset curation

Read this before uploading training images, and whenever the task is to build or review a dataset.
Nearly every disappointing LoRA traces back to the dataset or its captions, not to hyper-parameters,
so spend the conversation here before touching `config`.

## Universal rules

- **Small and deliberate beats big and noisy.** 5 to 15 images is the sweet spot for most
  single-image LoRAs (styles tolerate up to about 20); a 12-image set with one clear intent
  outperforms 40 mixed pieces. Trimming also keeps you clear of the per-plan dataset ceiling
  described in SKILL.md.
- **Resolution floor.** Aim for 1024px or more on every side; upscale marginal images in-platform
  before training instead of feeding soft sources.
- **Consistency in the one thing being taught, variety in everything else.** Every image must
  reinforce the same target (same character, same artistic hand, same material). Everything the
  model should treat as variable (subject, pose, background, framing, lighting) should actually vary
  across the set.
- **Drop duplicates and near-duplicates.** Repetition teaches the repeated composition, not the
  concept. A set generated from one source image is the disguised case: twenty renders of the same
  face in new poses share one lighting, one camera distance, one expression range, and the model
  learns that render rather than the person. The symptom is a model that reproduces the same wrong
  face consistently while matching the caption text (hair, skin, age), because the captions carried
  more signal than the pictures. Rebuild the set from genuinely different shots, and where the only
  source is one image, shoot the variety deliberately (different lens distances, expressions,
  lighting, backgrounds) before treating any of it as a dataset.

## Composition by training type

| Type              | Sweet spot | Rules                                                                                                                                                                                                                                                             |
| ----------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Character         | 5-15       | Identical defining traits everywhere; at least 3 distinct poses even in a 5-8 image set; vary angle (front, profile, three-quarter), expression, and framing; mix backgrounds so the character does not learn to live in one room; crop out any second character. |
| Style             | 10-20      | One cohesive aesthetic; vary subjects, environments, and zoom so no subject becomes part of the style; never mix two styles in one dataset (train them separately).                                                                                               |
| Multi-character   | 8-15       | Every character appears in every image with its own constant traits; vary interactions and scenes.                                                                                                                                                                |
| Object or product | 5-15       | Constant geometry, material, and branding; vary angle, lighting, background, and scale.                                                                                                                                                                           |
| Environment       | 5-15       | Signature location elements constant; vary time of day, weather, and camera angle.                                                                                                                                                                                |
| Texture           | 10-15      | One material or pattern family; neutral ambient lighting keeps the result relightable; sources need not tile, the model handles tiling at generation time.                                                                                                        |
| Edit pairs        | 5-15 pairs | Counted in pairs: input, output, and a written instruction each; the transformation must be the same idea in every pair; drop pairs whose transformation diverges from the rest.                                                                                  |

## Captions decide constant versus variable

Every uploaded image gets an auto-generated caption; treat it as a draft, not an endpoint. The
single principle everything follows from: **describe what should vary, never what must stay.**
Whatever a caption names, the model learns to treat as promptable; whatever no caption names, it
absorbs as part of the concept.

- Character, object, environment: open every caption with the same invented trigger word (`KAEL_07`,
  `MYBRAND_X`), then the constant identity traits, then the per-image variables (pose, expression,
  setting, light). A trigger word is caption text, not a training parameter; use it in every caption
  or in none, and reuse it later in generation prompts.
- Style: never name the style ("watercolor", "anime"); the style is what the model learns
  implicitly, and naming it ties the look to a word instead. Describe subject and scene only. A
  trigger word is optional, and auto-captions are often close enough for styles.
- Edit pairs: instructions, not descriptions, with one uniform verb pattern across the whole set
  ("turn the photo into MYSTYLE watercolor"). Context-preserving phrasing ("replace X with Y")
  outperforms whole-scene phrasing on edit families.
- Family note: Qwen-based training weighs captions heavily; fifteen minutes of caption cleanup
  routinely beats parameter tuning there.

## Reviewing a dataset through MCP

Training consumes each image's asset `description` as its caption: a rewritten description wins, and
the auto-generated caption stays visible as `automaticCaptioning`, the fallback when no description
is set. Scenario-generated images are already assets, so their ids go straight to `upload_images`
with no upload step, and the `upload_images` response returns each attached image's auto-caption,
the natural starting point for review. For a dataset attached earlier, `model_get` (via
`scenario_tool_execute_read`) returns the training images with both fields; `asset_analyze`
(catalog, cost-bearing) inspects image content at scale ("is a second character visible", "does this
match the style of the others"). Fixes: rewrite a caption with `asset_update`
(`metadata: {"description": "..."}`), remove an image with `train` `action: "delete_image"`, replace
one with `action: "update_image"`. For a dataset still on disk, check dimensions and duplicates
locally before spending uploads.

## Audit before launch

- Every image sharp and at or above the resolution floor; no duplicates.
- One intent per dataset; anything off-concept cropped out or removed.
- Trigger word all-or-none and byte-identical; constants present in every caption; variables
  genuinely differ per image.
- Edit sets: whole pairs only, one verb pattern, an instruction on every pair.
- No generic auto-caption boilerplate left ("beautiful", "stunning").
- Then `train` `configure` with `dry_run: true` for the cost before launching with `start`.

## Parameters follow the dataset

Per-family defaults and ranges live on the `train` config schema; scale them by dataset size (per
the Scenario knowledge base):

| Images | learning_rate | epochs | nb_repeats |
| ------ | ------------- | ------ | ---------- |
| 5-10   | 5e-5          | 15-20  | 20-30      |
| 10-25  | 1e-4          | 10     | 15-20      |
| 25-50  | 2e-4          | 6-8    | 10-15      |

Underfit shows as the concept barely surfacing; overfit as training compositions reproduced
literally and prompt changes losing effect. Per-epoch previews are how you tell the two apart before
spending on generations: `config.sample_prompts` (at least one on any run with more than one epoch,
per-family cap on the `train` schema, edit families and the video Reference type also needing
`sample_source_images` in the same order) renders every prompt at every epoch, and without them the
trainer publishes no per-epoch checkpoints at all. Write them as off-dataset tests of the concept
(trigger word, new pose, new setting, new framing), then pick the epoch on the model page and
confirm with `model_run` on fresh prompts.
