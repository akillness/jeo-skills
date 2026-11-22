# Base model selection

The base architecture is the one training decision that cannot be undone: a LoRA is bound to the
base it was trained on, and that choice fixes the quality ceiling, generation speed, and per-image
cost of every future run. Interview the user first, then let `recommend_training` make the call. The
cheat sheet below is for discussing trade-offs in the user's terms, never for asserting a model id:
availability differs per team and the catalog moves, so the returned `type` is the only value to
build on.

## The interview

Ask (or extract from the brief) before recommending anything, and map each answer to a
`recommend_training` argument. Questions 1 and 2 are image-only: skip them for a video LoRA or a
voice clone, where `subject` and `style` do not apply.

1. **What must the model reproduce?** A character, a product or object, an environment, an overall
   style, or a transformation applied to existing images. Maps to `subject` (an overall style is
   `"style_transfer"`); a transformation means an edit LoRA, so also `dataset_shape: "image_pairs"`.
2. **Realistic, stylized, or mixed rendering?** Maps to `style`.
3. **What matters most: quality, speed, or cost?** Maps to `priority` (default `balanced`). Anchor
   it with expected volume: hero art and key visuals justify `quality`; thousands of assets or near
   real-time use justify `speed` or `cost`.
4. **What does the dataset look like?** Single images or before/after pairs; audio for voice;
   images, clips, or clips with their references for a video LoRA. Maps to `dataset_shape` (and
   `modality: "voice"` for cloning, covered in SKILL.md, or `modality: "video"`, covered in
   [video-lora.md](video-lora.md)).
5. **Any tie to an existing family?** Existing LoRAs to pair with or a pipeline pinned to an older
   base are the only reasons to set `legacy_ok: true`; the default excludes legacy families on
   purpose.

Then call `recommend_training` once, passing the user's original wording as `prompt` plus the
extracted arguments. It returns the family, the exact `type` for `model_create`, up to three
alternatives, and `dataset_requirements` to curate against (see
[dataset-curation.md](dataset-curation.md)).

## Family cheat sheet

Positioning of the current image families, as documented in the Scenario knowledge base
(help.scenario.com):

| Family                 | Positioning                                                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Flux 2 Dev             | Largest variant (32B): highest detail and prompt adherence; hero-quality work at the highest cost.                                                |
| Flux 2 Klein 9B        | The quality-speed sweet spot, faster than Dev; a strong default for production volume.                                                            |
| Flux 2 Klein 4B        | Smallest and fastest: near real-time generation and high-volume pipelines at the lowest cost in the family.                                       |
| Z-Image                | Strong training fidelity for character and style LoRAs at low cost; strong for photoreal characters and bilingual English/Chinese text rendering. |
| Z-Image Turbo          | The fastest, cheapest inference in the family but lower training fidelity: train on Z-Image, since the LoRA carries across the Z-Image variants.  |
| Qwen Image             | Strong text rendering (signs, UI, HUDs) and prompt adherence for complex scenes; cost-effective at volume; caption-sensitive training.            |
| Flux 2 Edit, Qwen Edit | Edit LoRAs trained on before/after pairs; Qwen Edit responds best to context-preserving instructions ("replace X with Y").                        |
| Flux.1, Flux Kontext   | Legacy families, excluded from recommendations unless `legacy_ok: true`.                                                                          |

Z-Image is the only family whose trained LoRA carries across its own variants; treat every other
version choice as final. That portability also settles a conflict the tool can create: with
`priority: "cost"`, `recommend_training` may recommend the Turbo variant, which trains worse; prefer
the plain Z-Image alternative from the same response and run the finished LoRA on Turbo. When the
user hesitates between quality and speed tiers, ask where the volume will be generated, not where
the training happens: training is a one-time cost, inference is forever.

## Confirm the cost

The training quote is computed server-side from the base version, image count, and configuration, so
never assert a price: `train` `action: "configure"` with `dry_run: true` returns the estimate
without starting anything, and `action: "start"` launches once the quote is approved, exactly as the
worked example in SKILL.md shows.
