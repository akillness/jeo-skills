# AGENTS.md: preparing a rig with `rig_preprocess`

For a coding agent helping a user animate their own rigged asset with UniMate. Usage and every option are in [README.md](README.md). Run from the repository root in the `unimate` environment, write only under the output directory you choose, and do not change files under `dataset/`.

The model was trained on skeletons whose joints carry labels from one shared vocabulary and whose forward direction comes from a pair of joints. Your job is to make the user's asset look like that training data: the closer the labels and the facing pair follow the conventions below, the better the generated motion.

## Workflow

```bash
# 1. label the joints (an LLM when DEEPSEEK_API_KEY is set for the default model, else rules) and stop for review
python -m data_process.rig_preprocess run --input <asset.glb|.gltf|.fbx> --output_dir outputs/rig/<name>
# 2. read outputs/rig/<name>/REVIEW.md and annotation_preview.png, correct outputs/rig/<name>/annotation.json
# 3. build the asset from the corrected file (same command, plus --annotation)
python -m data_process.rig_preprocess run --input <asset> --output_dir outputs/rig/<name> \
    --annotation outputs/rig/<name>/annotation.json
# 4. check summary.json and preview.png, then sample and animate
python -m unimate.inference.sample --exp_dir outputs/unimate_uniml3d_f60_v3 --asset outputs/rig/<name> \
    --prompt "An object walks forward." --num_repetitions 3 --output_dir outputs/samples/<name>
bash scripts/run_animate_motion.sh outputs/samples/<name>
```

`REVIEW.md` gives, under *Continue*, the exact command that continues (it keeps the first run's options); use it. For another LLM pass `--model gpt-…` with `OPENAI_API_KEY`, or a local model. If a build is refused, fix what the message names and rerun the same command; `annotation.json` is never deleted.

## Correcting `annotation.json`

Edit only each joint's `label` and the `face_pair` fields (`right`, `left`, `body_axis`). Keep every `raw` name, the joint order and the JSON structure: the file is matched to the skeleton by raw name, and a changed raw name is refused.

### Joint labels

- **Use the training vocabulary.** `annotation.json` lists it under `vocabulary`; prefer a label from it. A label outside it is kept with a note, but the model has never seen it and treats it as an unknown part.
- **Sides are a prefix**: `Left` / `Right` from the asset's own point of view (its left is on the +X side when it faces +Z). Joints on the midline have no side (`Spine`, `Neck`, `Head`, `Tail`, `Jaw`).
- **Name the bone segment, not the joint.** Legs are `Thigh`, `Shin`, `Foot`, `Toe`; arms `Shoulder`, `Upper Arm`, `Forearm`, `Hand`; the root of a body is `Hips`. Use `Knee`, `Elbow`, `Ankle`, `Wrist` only when the rig really has an extra joint there.
- **Repeat a label along a chain**: several spine joints are all `Spine`, several tail joints all `Tail`, several neck joints all `Neck`.
- **Fingers and toes**: `Thumb Finger`, `Index Finger`, `Middle Finger`, `Ring Finger`, `Pinky Finger`, each repeated along its chain; toes are `Toe`.
- **Leaf tips** (an end bone with nothing below it) take the parent's part plus `End`: `Head End`, `Left Toe End`, `Left Hand End`.
- **Four-legged animals** label the hind legs like human legs (`Thigh`, `Shin`, `Fetlock` if present, `Foot`, `Toe`) and the forelegs like arms (`Shoulder`, `Upper Arm`, `Forearm`, `Hand`), as in the Horse row below. Use `Front` / `Back` (`Left Front Thigh`) only for robot legs whose bones are coded that way (`FR_hip`, `RL_calf`). Insects and spiders with more legs use `Front Leg`, `Middle Leg`, `Hind Leg`.
- **Other body plans** use the plain part name: `Wing`, `Feather`, `Fin`, `Pectoral Fin`, `Dorsal Fin`, `Tentacle`, `Antenna`, `Ear`, `Eye`, `Mane`, `Claw`, `Pincer`, `Stem`, `Leaf`.
- **Machines and objects**: label by the body part a joint plays (a robot's hip link is `Left Thigh`, its gripper `Left Hand`); a part with no anatomical role gets a short plain name (`Wheel`, `Lid`, `Arm`).
- **Unknown or helper bones** (IK targets, controls, props) are `Bone`.

Examples from the training data:

| Body | Labels (in joint order, abridged) | Facing pair (right / left) |
|---|---|---|
| Humanoid | `Hips`, `Spine`, `Spine`, `Spine`, `Neck`, `Head`, `Head End`, `Left Shoulder`, `Left Upper Arm`, `Left Forearm`, `Left Hand`, `Left Thumb Finger` … | `Right Thigh` / `Left Thigh` |
| Horse | `Hips`, `Tail` ×5, `Spine`, `Right Thigh`, `Right Shin`, `Right Fetlock`, `Right Foot`, `Right Toe`, …, `Left Shoulder`, `Left Upper Arm`, `Left Forearm`, `Left Hand`, … `Mane` | `Right Thigh` / `Left Thigh` |
| Bird | `Hips`, `Tail`, `Spine`, `Right Thigh`, `Right Shin`, `Right Fetlock`, `Right Foot`, `Right Toe` …, `Left Wing` … | `Right Thigh` / `Left Thigh` |
| Shark | `Root`, `Spine`, `Head`, `Jaw`, `Left Pectoral Fin`, `Right Pectoral Fin`, `Dorsal Fin`, `Spine` ×3, `Left Pelvic Fin`, `Right Pelvic Fin`, `Tail` ×4 | `Right Pectoral Fin` / `Left Pectoral Fin` |
| Snake | `Hips`, `Tail` ×13, `Spine` ×6, `Neck`, `Head`, `Jaw`, `Tongue` | head-end joint / tail-end joint, `body_axis: true` |

### Facing pair

The pair defines where the asset faces; the model generates motion relative to it. Pick, in this order:

1. the two **thighs** (`Right Thigh` / `Left Thigh`), for any body with legs, including birds and robots;
2. otherwise two other mirrored joints near the body's centre: shoulders, upper arms, front legs, wings, pectoral fins;
3. a body without mirrored limbs (snake, worm, fish without fins): a joint at the head end as `right`, one at the tail end as `left`, and `body_axis: true`.

`right` must be the asset's right-hand joint. The two joints must be side by side in the rest pose (not one above the other); a pair without horizontal separation is refused. Leave both empty only if the asset has no front at all. Check the arrow in `annotation_preview.png`: it must point where the asset looks.

## Before sampling

Read `summary.json` and `preview.png`:

- `model_joint_limit.fits` must be true: the models take at most 71 joints (trained on up to 70). A larger rig (full fingers, face bones) must be simplified first.
- `notes` lists what the model cannot reproduce. If it says the rest pose is upside down or lying, add `--rest_rotation x180 --overwrite` (or another rotation) to the `--annotation` command and rebuild until the preview stands upright and faces +Z.
- In `preview.png` the asset should stand on the ground, upright, facing +Z, like the training skeletons.

## Prompts

Write prompts in the style of the training captions (`dataset/features/<dataset>/captions*.json` after downloading UniML3D): start with "An object", describe one motion, not the character ("An object flaps its wings.", not "A golden eagle flaps its wings in the sky."). Short captions that already occur in the training data for similar skeletons work best. Generate several samples (`--num_repetitions`) and try a few phrasings; left / right in a prompt is followed unreliably.

## If you change this package

Keep `rig_preprocess` a driver of the dataset pipeline's own functions (export, annotation, feature extraction, canonical bake) so an asset is prepared exactly like the training data; never copy pipeline code into it. The output directory is what `unimate/inference/assets.py` reads (`cond.npy` with one entry, `summary.json`, `<name>.glb`, `motions/`); keep those names stable. After a change, run `python -m py_compile data_process/rig_preprocess/*.py`, process one training asset with `--annotate dataset --profile <dataset>` and check it with `python -m data_process.rig_preprocess verify --output_dir <out>` (the canonical GLB must be `identical`, the cond `identical` or `equivalent`).
