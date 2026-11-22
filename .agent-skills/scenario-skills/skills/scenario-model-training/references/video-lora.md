# Video LoRAs

Read this before training a video LoRA. The steps in SKILL.md still apply; this file holds what
differs. Every number and type id here is an authoring-time value: re-read it off the `train` schema
and the recommendation.

## Pick the type

Call `recommend_training` with `modality: "video"` and a `dataset_shape`. `subject` and `style` do
not apply; `priority` picks the variant. Use the `type` it returns as `model_create` `data.type`.

| Dataset                                    | `dataset_shape`         | Returned `type`       |
| ------------------------------------------ | ----------------------- | --------------------- |
| Images, clips, or a mix                    | `video_clips`           | `minimax-h3-lora`     |
| Images only                                | `single_images`         | see below             |
| Clips, each with the assets it was made of | `clips_with_references` | `minimax-h3-ref-lora` |

- With `modality: "video"`, `single_images` means images only. It returns `minimax-h3-lora`, or
  `minimax-h3-int8-lora` with `priority: "cost"` or `"speed"`.
- `minimax-h3-int8-lora` is cheaper per image. It refuses clips, so it learns no motion from
  footage.
- `minimax-h3-ref-lora` trains a Reference dataset: at least 5 pairs, each a clip plus its
  references.
- `dataset_requirements` carries the size bounds: 5 entries minimum, 20 to 50 for a first run.
- The three types are not interchangeable: a dataset change that needs another type means a new
  model.

## License

Tell the user, verbatim, before the go-ahead on the quote:

> Subject to the MiniMax H3 license (https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/LICENSE).
> Its outputs may not be used to train other AI models.

- Unattended, put the sentence in the report.
- Never train on a real person's face or likeness without their consent: the license forbids
  imitating a real person. Unattended with consent unstated, stop and report.

## Order of steps

1. `model_create` with the returned `type`.
2. `upload_asset` plus `upload_asset_complete` for every file: clips, images, and each reference
   asset of a Reference dataset.
3. `train` `action: "upload_images"` with all the asset ids.
4. Reference only: `train` `action: "set_pairs"`.
5. Captions: check every entry.
6. `train` `action: "configure"` with `dry_run: true` for the quote.
7. `train` `action: "start"`, only after the go-ahead.

## Clips

- Format: mp4, webm, or mov.
- Length of a training clip: 5.25 to 30 s. Only the first 5.3 s or so trains, so split a longer
  video into clips.
- Size: at most 400 MB per clip and 4 GB per dataset.
- `minimax-h3-ref-lora` also takes audio files, as references only. Reference videos follow the 2 to
  15 s rule below.

## Reference pairs

`set_pairs` takes
`image_data: {"body": [{"targetId": "...", "instruction": "...", "referenceIds": ["..."]}]}`.

- It replaces every pair. Send them all in one call.
- `targetId` is a clip, and each clip is the target of one entry only.
- `instruction` is that clip's caption. Without one, the clip's asset description is used.
- `referenceIds` holds 1 to 12 dataset assets, in order:
  - at most 9 images;
  - at most 3 videos, each 2 to 15 s;
  - at most 3 audio files;
  - at least one image or video. Audio alone is refused.
- A reference can serve several entries.
- References are dataset assets: attach them with `upload_images` before `set_pairs`.

## Captions

- `start` refuses a dataset when any entry has no caption.
- An uploaded clip already carries a `description`: a still-frame caption that names no motion.
- The training caption, which describes the motion, replaces it after `upload_images`: 40 s to 2
  min, longer in one run, and sometimes never.
- Check each clip's `description` with `asset_get` before the quote. While it names no motion, wait
  and re-check, or set your own.
- Set a caption with `asset_update` `metadata: {"description": "..."}`.
- A Reference pair with an `instruction` trains on it, not on the clip's `description`: make the
  `instruction` name the motion. To correct one, re-send every pair with `set_pairs`.

## Price after the last dataset change

- `configure` is a dry run. It prices the dataset as it stands. A quote does not mean the dataset is
  valid: `start` can still refuse it.
- Quote only after the last upload, deletion, or `set_pairs` call. Re-quote after any later change.
- A Reference dataset quoted before its pairs are set is priced far too low. One 20-pair dataset
  quoted about 70 CU before `set_pairs` and was charged roughly 3,570 CU.
- Video entries cost far more than images.

## Config

The size sweet spots, resolution floor, and parameter table in the dataset reference are image-only.

| Field                 | Default | Range                 | Note                                        |
| --------------------- | ------- | --------------------- | ------------------------------------------- |
| `epochs`              | 10      |                       | Cost scales linearly                        |
| `nb_repeats`          | 5       | clips × repeats ≤ 900 | Fewer repeats lower the quote               |
| `learning_rate`       | 1e-4    |                       |                                             |
| `rank`                | 16      | 8, 16, 32, 64         |                                             |
| `guidance_loss_scale` | 4       | 1 to 8                | Lower for a small dataset; 1 disables it    |
| `max_timestep`        | 1000    | 100 to 1000           | About 850 keeps base motion on a style LoRA |
| `attention_only`      |         | boolean               | Steadier motion, less style                 |
| `sample_width`        | 768     | multiple of 32        | Set with `sample_height`                    |
| `sample_height`       | 448     | multiple of 32        | 768x448 is also the largest area            |

- `nb_repeats` is also capped at 100, whatever the clip count.
- Previews are videos. The first 2 `sample_prompts` are free; each one past that costs 9 CU per
  epoch.
- `minimax-h3-ref-lora` needs `sample_source_images`: one image asset id per sample prompt, in the
  same order.

## Launch

- `start` is the only action that launches training.
- It is charged when the job is created and cannot be undone. `stop` refunds nothing.
- Get the user's explicit go-ahead on the quoted CU first.
- Unattended, launch only inside a budget or authorization the task states. Otherwise report the
  quote and stop.
