# UniRig environment and installation

Source of truth: [UniRig README](https://github.com/VAST-AI-Research/UniRig) (MIT).
Everything below mirrors upstream's stated requirements; nothing here is inferred.

## Hard requirements

| Item | Requirement | Why it blocks |
|---|---|---|
| Python | 3.11 | upstream pins `bpy==4.2`, which publishes wheels for cp311 |
| PyTorch | >= 2.3.1 (tested) | model + custom ops |
| GPU | NVIDIA + CUDA | `spconv`, `flash_attn`, `torch_scatter`/`torch_cluster` are CUDA builds |
| numpy | `1.26.4` | upstream pins it after installing torch; numpy 2.x breaks `bpy`/`open3d` |

There is no supported CPU or Apple-Silicon inference path. `scripts/doctor.sh` treats a missing
CUDA-enabled torch as **blocking** for that reason.

## Upstream install sequence

```bash
git clone https://github.com/VAST-AI-Research/UniRig
cd UniRig
conda create -n UniRig python=3.11 && conda activate UniRig   # or python3.11 -m venv .venv

python -m pip install torch torchvision
python -m pip install -r requirements.txt
python -m pip install spconv-{your-cuda-version}          # e.g. spconv-cu121
python -m pip install torch_scatter torch_cluster \
  -f https://data.pyg.org/whl/torch-{your-torch-version}+{your-cuda-version}.html --no-cache-dir
python -m pip install numpy==1.26.4
```

`scripts/install.sh` performs exactly this sequence with `--cuda`/`--torch` filling the two
placeholders, inside `$UNIRIG_HOME/.venv` unless `--no-venv` is passed.

### requirements.txt (upstream)

`transformers==4.51.3`, `python-box`, `einops`, `omegaconf`, `pytorch_lightning`, `lightning`,
`addict`, `timm`, `fast-simplification`, `bpy==4.2`, `flash_attn`, `trimesh`, `open3d`, `pyrender`,
`huggingface_hub`, `wandb`.

`flash_attn` sits inside `requirements.txt`, so a failure there aborts the whole requirements
install. `scripts/install.sh` installs the file with `flash_attn` filtered out first and then
attempts `flash_attn` separately, so one hard-to-build wheel cannot leave the environment
half-installed. The failure is reported, never hidden.

## The three dependencies that actually break installs

1. **`spconv`** — pick the wheel that matches the installed CUDA runtime
   (`spconv-cu118`, `spconv-cu120`, `spconv-cu121`, …). See
   [traveller59/spconv](https://github.com/traveller59/spconv). A mismatched wheel imports fine and
   fails at the first sparse-convolution call.
2. **`torch_scatter` / `torch_cluster`** — install from the PyG wheel index for the *exact*
   torch+CUDA pair: `https://data.pyg.org/whl/torch-2.4.0+cu121.html`. Building from source without
   matching wheels takes tens of minutes and often fails.
   Reference: [PyG installation](https://pytorch-geometric.readthedocs.io/en/latest/install/installation.html).
3. **`flash_attn`** — upstream explicitly warns that installation errors are likely; follow
   [Dao-AILab/flash-attention](https://github.com/Dao-AILab/flash-attention). Prebuilt wheels exist
   per torch/CUDA/ABI combination; otherwise a source build needs `ninja`, a matching `nvcc`, and a
   lot of RAM (`MAX_JOBS=4` helps).

Read the CUDA versions with `nvidia-smi` (driver's maximum) and
`python -c "import torch; print(torch.version.cuda)"` (what torch was built against). The second one
is what `spconv` and the PyG wheels must match.

## Model checkpoint

The skeleton/skin checkpoint lives at [VAST-AI/UniRig](https://huggingface.co/VAST-AI/UniRig) and is
downloaded automatically on the first inference run through `huggingface_hub`. For offline or
air-gapped machines, pre-populate the cache:

```bash
export HF_HOME=/path/to/hf-cache          # keep the cache off the system disk if space is tight
huggingface-cli download VAST-AI/UniRig
```

Behind a restrictive network, `HF_ENDPOINT=https://hf-mirror.com` is the usual mirror workaround.

## Optional: VRM import/export add-on

`.vrm` input/output needs the bundled Blender add-on (a modified
[VRM-Addon-for-Blender](https://github.com/saturday06/VRM-Addon-for-Blender)). From the UniRig repo
root:

```bash
python -c "import bpy, os; bpy.ops.preferences.addon_install(filepath=os.path.abspath('blender/add-on-vrm-v2.20.77_modified.zip'))"
```

`scripts/install.sh --vrm` runs this step and skips it with a warning when the zip is absent from
the checkout.

## Layout produced by `scripts/install.sh`

```text
$UNIRIG_HOME/                  # default ~/.cache/unirig/UniRig
├── .venv/                     # unless --no-venv
├── launch/inference/*.sh      # extract, generate_skeleton, generate_skin, merge
├── configs/{data,task,...}
├── run.py
└── tmp/                       # npz cache written by the extract stage
```

`scripts/rig.sh` auto-activates `$UNIRIG_HOME/.venv` when it exists; otherwise it uses whatever
`python` is already on `PATH`, so conda users must activate their environment first.
