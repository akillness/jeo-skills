# UniRig training, validation, and datasets

Only enter this reference when the user explicitly wants to train, fine-tune, reproduce paper
numbers, or inspect the dataset format. Inference needs none of it — the published checkpoint is
fetched automatically.

## Released status (upstream)

- ✅ Code for skeleton and skinning prediction
- ✅ Checkpoint trained on [Articulation-XL2.0](https://huggingface.co/datasets/Seed3D/Articulation-XL2.0)
- ✅ Rig-XL and VRoid datasets (31 broken training models were filtered out)
- ✅ Training code
- ⏳ Full Skeleton+Skinning checkpoints trained on Rig-XL/VRoid (paper's main results)
- ⏳ Bone attribute prediction (e.g. stiffness for secondary motion)

Upstream itself notes the training code "may be a bit messed up" — expect to read configs.

## Rig-XL dataset

Processed data: <https://huggingface.co/VAST-AI/UniRig/tree/main/data/rigxl>.

Apart from the VRoid models, everything is selected from
[Objaverse-XL](https://huggingface.co/datasets/allenai/objaverse-xl). If Objaverse is already
available locally, download only `mapping.json`: each entry carries the model `id`, a `type`
category, and a `url` identical to Objaverse's `fileIdentifier`. Train/validation splits live in
`datalist/`.

Place the dataset under `dataset_clean/` at the repo root.

### `raw_data.npz` schema

All models are converted into world space; **all floats are stored as `float16`**.

| Key | Shape | Meaning |
|---|---|---|
| `vertices` | `(N, 3)` | vertex positions |
| `vertex_normals` | `(N, 3)` | vertex normals (Trimesh-processed) |
| `faces` | `(F, 3)` | triangle indices, 0-based |
| `face_normals` | `(F, 3)` | face normals |
| `joints` | `(J, 3)` | armature joint positions |
| `skin` | `(N, J)` | per-vertex skinning weights |
| `parents` | `(J,)` | parent index per joint; `parents[0]` is `None` (root) |
| `names` | `(J,)` | joint names |
| `matrix_local` | per bone | local bone axes, Y-up, Blender-consistent |

Inspect or re-export a sample:

```python
from src.data.raw_data import RawData

raw_data = RawData.load("dataset_clean/rigxl/12345/raw_data.npz")
raw_data.export_fbx("res.fbx")
```

## Preparing custom data

Set `input_dataset_dir` (source models) and `output_dataset_dir` (npz destination) in
`configs/data/rignet.yaml`, then:

```bash
bash launch/inference/preprocess.sh --config configs/data/<yourdata> --num_runs <threads>
```

The loader expects `<output_dataset_dir>/<relative path in datalist>/raw_data.npz`.

## Config layering (skeleton AR training)

| Layer | File | Controls |
|---|---|---|
| data | `configs/data/rignet.yaml` | where/how the dataloader reads npz |
| transform | `configs/transform/train_rignet_ar_transform.yaml` | augmentations (`src/data/augment.py`) |
| tokenizer | `configs/tokenizer/tokenizer_rignet.yaml` | skeleton tree tokenization |
| system | `configs/system/ar_train_rignet.yaml` | training loop, sampling, result export cadence |
| model | `configs/model/unirig_rignet.yaml` | base transformer; `n_positions` must exceed conditional embedding length + max skeleton tokens |
| task | `configs/task/train_rignet_ar.yaml` | integrates all of the above plus loss/optimizer/scheduler, `trainer` (GPU/node), `wandb`, `checkpoint` |

Optimizer/scheduler construction lives in `src/system/optimizer.py` and `src/system/scheduler.py`.
`wandb` and `checkpoint` sections can be commented out when logging or final checkpoints are not
needed. Checkpoints are written to `experiments/<experiment_name>/`.

```bash
python run.py --task=configs/task/train_rignet_ar.yaml
```

Reported reference run: best results around epoch 120, ~18 hours on 4× RTX 4090. Lower validation
CE loss does **not** reliably mean better skeleton generation in AR training — evaluate generated
skeletons, not just the loss curve.

To use a freshly trained checkpoint, copy an inference task config (e.g.
`configs/task/rignet_ar_inference_scratch.yaml`) with `mode: predict` and
`resume_from_checkpoint: experiments/train_rignet_ar/last.ckpt`.

## Rignet validation (academic reproduction)

Download the processed Rignet dataset
(<https://huggingface.co/VAST-AI/UniRig/blob/main/data/rignet/processed.zip>), extract into
`dataset_clean/`, then:

```bash
python run.py --task=configs/task/validate_rignet.yaml
```

Set `record_res: True` in `configs/system/ar_validate_rignet.yaml` to export skeletons and meshes
alongside the metrics.
