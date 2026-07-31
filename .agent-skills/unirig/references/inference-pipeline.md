# UniRig inference pipeline (flags, defaults, artifacts)

All flags and defaults below are read from the upstream shell scripts in
`launch/inference/` on `main`. Run every command from the UniRig repo root.

## Stage map

```text
model.glb ──extract──▶ tmp/**/raw_data.npz ──skeleton──▶ model_skeleton.fbx
                                          ──skin──────▶ model_skin.fbx
model_skin.fbx + model.glb ──merge──▶ model_rigged.glb
```

`extract.sh` is not called directly in normal use: both `generate_skeleton.sh` and
`generate_skin.sh` invoke it first, writing the npz cache into `tmp/` (`npz_dir` is hard-coded to
`tmp` in those two scripts).

Supported input suffixes (default `require_suffix`): `obj,fbx,FBX,dae,glb,gltf,vrm`.

## 1. Skeleton — `launch/inference/generate_skeleton.sh`

```bash
bash launch/inference/generate_skeleton.sh --input examples/giraffe.glb \
  --output results/giraffe_skeleton.fbx
bash launch/inference/generate_skeleton.sh --input_dir <in_dir> --output_dir <out_dir>
bash launch/inference/generate_skeleton.sh --input examples/giraffe.glb \
  --output results/giraffe_skeleton.fbx --seed 42
```

| Flag | Default | Notes |
|---|---|---|
| `--config` | `configs/data/quick_inference.yaml` | extract-stage data config |
| `--require_suffix` | `obj,fbx,FBX,dae,glb,gltf,vrm` | comma list, no spaces |
| `--num_runs` | `1` | parallel extract workers |
| `--force_override` | `false` | re-extract when the npz already exists |
| `--faces_target_count` | `50000` | decimation target for the extract stage |
| `--skeleton_task` | `configs/task/quick_inference_skeleton_articulationxl_ar_256.yaml` | task config |
| `--add_root` | `false` | insert an extra root bone |
| `--seed` | `12345` | different seeds give different valid skeletons |
| `--input` / `--input_dir` | — | one file or a directory |
| `--output` / `--output_dir` | — | file or directory; FBX for the skeleton |

Internally: `bash ./launch/inference/extract.sh …` then
`python run.py --task=<skeleton_task> --seed=<seed> --input… --output… --npz_dir=tmp`.

## 2. Skin — `launch/inference/generate_skin.sh`

```bash
bash launch/inference/generate_skin.sh --input examples/skeleton/giraffe.fbx \
  --output results/giraffe_skin.fbx
bash launch/inference/generate_skin.sh --input_dir <in_dir> --output_dir <out_dir>
```

Same flag set as the skeleton stage, minus `--add_root`, plus:

| Flag | Default | Notes |
|---|---|---|
| `--force_override` | `true` | note: opposite of the skeleton stage |
| `--skin_task` | `configs/task/quick_inference_unirig_skin.yaml` | task config |
| `--data_name` | `raw_data.npz` | npz filename inside `tmp/` |

The input here is the **skeleton FBX** (ideally the hand-edited one), not the original mesh.
Upstream is explicit: results degrade badly when the skeleton is inaccurate — missing tail or wing
bones are the canonical example — so refine the skeleton before skinning.

## 3. Merge — `launch/inference/merge.sh`

```bash
bash launch/inference/merge.sh --source results/giraffe_skin.fbx \
  --target examples/giraffe.glb --output results/giraffe_rigged.glb
```

| Flag | Default | Notes |
|---|---|---|
| `--source` | — | predicted rig to copy **from** (`*_skin.fbx` for a real rig) |
| `--target` | — | the original asset to copy **onto** (keeps geometry/materials) |
| `--output` | — | final deliverable; extension decides the exporter |
| `--require_suffix` | `obj,fbx,FBX,dae,glb,gltf,vrm` | as above |

Merging a `*_skeleton.fbx` yields an armature **without skinning weights**. That is the single most
common "it looks rigged but nothing deforms" bug.

Internally: `python -m src.inference.merge --require_suffix=… --num_runs=1 --id=0 --source=… --target=… --output=…`.

## 4. Extract (called for you) — `launch/inference/extract.sh`

`python -m src.data.extract --config=… --require_suffix=… --force_override=… --num_runs=N --id=i
--time=<timestamp> --faces_target_count=… [--input|--input_dir] [--output_dir]`, forked `num_runs`
times. It `pip install psutil --quiet` on every invocation, so an offline machine prints a warning
here — harmless when `psutil` is already present.

## Wrapper mapping (`scripts/rig.sh`)

| Wrapper flag | Upstream flag |
|---|---|
| `--input` / `--input-dir` | `--input` / `--input_dir` |
| `--output` / `--output-dir` | `--output` / `--output_dir` |
| `--seed` | `--seed` |
| `--faces-target-count` | `--faces_target_count` |
| `--num-runs` | `--num_runs` |
| `--add-root` | `--add_root` (skeleton stage only) |
| `--skeleton-task` / `--skin-task` | `--skeleton_task` / `--skin_task` |
| `--source` / `--target` | `--source` / `--target` (merge stage) |
| `--stage skeleton\|skin\|merge\|all` | selects which scripts run |
| `--dry-run` | prints the commands, runs nothing |

In `--stage all` with `--input model.glb --output out/model_rigged.glb`, the wrapper derives
`out/model_skeleton.fbx` and `out/model_skin.fbx` (override with `--skeleton-out` / `--skin-out`)
and merges the skin file onto the original input.

## Runtime expectations

- First run downloads the checkpoint from Hugging Face; budget extra minutes and disk.
- The extract stage decimates to `faces_target_count` (50k) — very heavy meshes cost extract time,
  not model time.
- `tmp/` grows with every processed asset; it is a cache and safe to delete between projects.
- Batch mode (`--input_dir`) mirrors the input tree into `--output_dir`; keep them separate from
  the source assets so a re-run never overwrites originals.
