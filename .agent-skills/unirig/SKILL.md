---
name: unirig
description: >
  Automatically rig 3D models with UniRig (VAST-AI-Research, SIGGRAPH'25) — predict a skeleton,
  predict skinning weights, and merge the rig back onto the original mesh. Use when the user wants
  auto-rigging for .obj/.fbx/.glb/.gltf/.dae/.vrm assets, a skeleton or skin weights for a character
  or creature, a UniRig environment prepared on a CUDA machine, batch rigging of a model directory,
  or an honest comparison between UniRig, SkinTokens, Tripo, Mixamo, AccuRig, and Blender Rigify.
  Triggers on: unirig, auto rig, auto-rigging, 3D rigging, skeleton prediction, skinning weights,
  rig a character, armature generation, rigged glb, rigged fbx, bone weights.
allowed-tools: Bash Read Write Edit Glob Grep WebFetch
compatibility: Requires Python 3.11 and an NVIDIA CUDA GPU for inference (spconv, flash_attn, torch_scatter/torch_cluster). The routing, dry-run planning, and GLB inspection paths work on any machine.
license: MIT
metadata:
  tags: unirig, 3d-rigging, auto-rigging, skeleton-prediction, skinning-weights, blender, fbx, glb, vrm, character-animation, game-art, pytorch
  version: "1.0"
  source: https://github.com/VAST-AI-Research/UniRig
---

# unirig — automatic 3D rigging (skeleton → skin → merge)

> **Keyword**: `unirig` · `auto-rigging` · `skeleton prediction` · `skinning weights`
>
> Only rig assets the user is licensed to modify. UniRig is MIT-licensed, but its checkpoints,
> the Rig-XL/VRoid/Objaverse data, and the user's own models each carry their own terms.

UniRig is a two-stage autoregressive rigging framework: a GPT-like transformer predicts a
topologically valid **skeleton** from mesh geometry, then a bone-point cross-attention model
predicts per-vertex **skinning weights**. A third step **merges** the predicted rig back onto the
original (full-resolution, textured) asset.

The single most common failure is skipping the merge stage or merging the wrong file — see
Step 5. The second most common failure is an environment that silently lacks CUDA extensions.

## When to use this skill

- The user wants a static 3D character/creature/prop turned into a rigged asset
- The user needs a skeleton only, or skin weights for a skeleton they already edited
- The user needs UniRig installed and verified on a CUDA machine, or wants to know up front that
  their machine cannot run it
- The user wants to batch-rig a directory of models
- The user is choosing between UniRig, its successor SkinTokens, or classical/hosted riggers
- The user has a rigged output and wants to verify that joints and skin weights actually landed

## Instructions

### Step 1: Capture the intake packet and pick the stage

Collect four facts before running anything:

- **Asset**: file format (`.obj`, `.fbx`/`.FBX`, `.dae`, `.glb`, `.gltf`, `.vrm`), poly count, single
  model or directory, textured or not
- **Goal**: skeleton only, skin only, or a fully rigged deliverable
- **Hardware**: NVIDIA GPU + CUDA version, VRAM, OS (no CUDA ⇒ no inference; route out)
- **Constraint**: install budget (UniRig needs `spconv`, `flash_attn`, `torch_scatter`,
  `torch_cluster`, `bpy`), and whether hand-authored control over the skeleton is required

Routing rules:

1. Static mesh, no skeleton yet → **skeleton stage** (`--stage skeleton`)
2. Skeleton exists (predicted or hand-edited) → **skin stage** (`--stage skin`)
3. Deliverable must keep the original geometry/materials → **merge stage** (`--stage merge`)
4. All three in one shot → `--stage all` (the default of `scripts/rig.sh`)
5. No CUDA GPU, or the user needs artist-controlled naming/IK/constraints → route out
   (see [references/route-outs-and-troubleshooting.md](references/route-outs-and-troubleshooting.md))

### Step 2: Check the environment before installing anything

```bash
bash scripts/doctor.sh            # human-readable readiness report
bash scripts/doctor.sh --json     # machine-readable, for agent branching
```

`doctor.sh` reports Python 3.11, torch + CUDA availability, `spconv`, `torch_scatter`,
`torch_cluster`, `flash_attn`, `bpy`, `trimesh`, the UniRig checkout, its `launch/inference`
scripts, and Hugging Face reachability. It exits `1` when a **blocking** item is missing, so an
agent can stop before promising a rig that cannot run. Use `--unirig-home <path>` (or
`UNIRIG_HOME`) when the checkout is not at `~/.cache/unirig/UniRig`.

### Step 3: Install the skill and, when the machine qualifies, the upstream repo

```bash
npx skills add https://github.com/akillness/jeo-skills --skill unirig
```

```bash
bash scripts/install.sh --repo-only          # clone/update UniRig only
bash scripts/install.sh --cuda cu121         # clone + create venv + install deps
bash scripts/install.sh --cuda cu121 --torch 2.4.0 --vrm
```

The installer is deliberately conservative:

- it never installs CUDA-only wheels on a machine without `nvidia-smi` unless `--force` is passed;
- `spconv-<cuda>` and the PyG wheel index are derived from `--cuda`/`--torch`, matching the upstream
  README instead of guessing a single pinned wheel;
- `flash_attn` is attempted last and a failure is reported, not swallowed — see the troubleshooting
  reference for the source-build path;
- `--vrm` additionally registers the bundled Blender VRM add-on.

Full dependency detail lives in
[references/environment-and-install.md](references/environment-and-install.md).

### Step 4: Plan the run with a dry run, then execute

```bash
# print the exact upstream commands without executing them
bash scripts/rig.sh --input examples/giraffe.glb --output results/giraffe_rigged.glb --dry-run

# run the whole pipeline (skeleton → skin → merge)
bash scripts/rig.sh --input examples/giraffe.glb --output results/giraffe_rigged.glb

# one stage at a time
bash scripts/rig.sh --stage skeleton --input model.glb --output results/model_skeleton.fbx
bash scripts/rig.sh --stage skin --input results/model_skeleton.fbx --output results/model_skin.fbx
bash scripts/rig.sh --stage merge --source results/model_skin.fbx --target model.glb \
  --output results/model_rigged.glb

# whole directory (skeleton and skin stages only — upstream merge takes one file pair)
bash scripts/rig.sh --stage skeleton --input-dir assets/ --output-dir results/skeletons/
```

`rig.sh` is a thin, honest wrapper over `launch/inference/generate_skeleton.sh`,
`generate_skin.sh`, and `merge.sh`: it validates the input suffix, derives intermediate
`<input>_skeleton.fbx` / `<input>_skin.fbx` paths next to the final output (override with
`--skeleton-out` / `--skin-out`), runs the stages in order from `UNIRIG_HOME`, and fails when an
expected artifact is missing instead of reporting a rig that was never written. `--seed`,
`--faces-target-count`, `--num-runs`, `--add-root`, `--force-override`, `--skeleton-task`, and
`--skin-task` are passed straight through to upstream with upstream's own defaults.

### Step 5: Respect the two merge rules

1. **Merge the skin file, not the skeleton file.** `merge.sh --source <skeleton>.fbx` produces an
   armature with **no skinning weights**. Use the `*_skin.fbx` output for a deliverable rig.
2. **Fix the skeleton before skinning.** Skin quality collapses when bones are missing (tails,
   wings, extra limbs). Hand-edit the predicted skeleton in Blender, then re-run `--stage skin`
   on the edited FBX. Different `--seed` values produce different skeleton proposals — cheap to
   sample a few before committing.

Stage flags, defaults, config files, and the `tmp/` npz cache are documented in
[references/inference-pipeline.md](references/inference-pipeline.md).

### Step 6: Verify the deliverable, do not assume it

```bash
python3 scripts/inspect_glb.py results/model_rigged.glb
python3 scripts/inspect_glb.py results/model_rigged.glb --json
```

`inspect_glb.py` is stdlib-only (no torch, no Blender): it parses the GLB/glTF JSON chunk and
reports meshes, nodes, `skins`, joint counts, animations, and whether any mesh primitive carries
`JOINTS_0`/`WEIGHTS_0` attributes. It exits `1` when the file has no skin, which is exactly the
"merged the skeleton file by mistake" case. For FBX outputs, verify in Blender or with `bpy`
(see the troubleshooting reference) — FBX is binary and not parseable stdlib-only.

### Step 7: Training and datasets (only when asked)

Training, Rig-XL/VRoid data layout, the `raw_data.npz` key schema, and the Rignet validation task
live in [references/training-and-datasets.md](references/training-and-datasets.md). Do not start a
training run for a request that only needs inference — the published checkpoint is downloaded
automatically on first inference.

## Examples

### Example 1: "Rig this GLB character for me"
`doctor.sh` → `rig.sh --dry-run` to show the plan → `rig.sh` → `inspect_glb.py` to prove the
output has skins and joints.

### Example 2: "The tail has no bones"
Do not re-run skinning on the bad skeleton. Re-sample with another `--seed`, or edit the skeleton
FBX in Blender, then run `--stage skin` on the edited file and re-merge.

### Example 3: "I'm on a MacBook"
`doctor.sh` exits blocking. Say so plainly and route out to a CUDA machine/cloud GPU, the hosted
Tripo rigging service, or classical Mixamo/AccuRig/Rigify — do not pretend a CPU fallback exists.

### Example 4: "Which is better, UniRig or SkinTokens?"
SkinTokens is the same lab's successor (unified autoregressive skin tokens, RL-trained, reported
98–133% skinning and 17–22% bone-prediction gains). Recommend it for new work; keep UniRig when
the user needs its released checkpoint, its Rig-XL tooling, or an already-working environment.

## Checklist

1. Capture the asset/goal/hardware/constraint packet before touching a shell.
2. Run `doctor.sh` first; report a blocking environment instead of installing blindly.
3. Never install CUDA-only wheels on a machine without an NVIDIA GPU.
4. Dry-run the pipeline and show the exact upstream commands before a long GPU run.
5. Fix the skeleton before skinning; sample seeds when the topology looks wrong.
6. Merge the `*_skin.fbx`, never the `*_skeleton.fbx`, into the original asset.
7. Verify the deliverable with `inspect_glb.py` (GLB) or Blender (FBX) — never claim success from
   a command exit code alone.
8. Route out honestly to SkinTokens, hosted services, or classical riggers when UniRig is the
   wrong tool.

## References

- [references/environment-and-install.md](references/environment-and-install.md) — Python 3.11,
  torch/CUDA matrix, `spconv`/PyG/`flash_attn` pitfalls, checkpoints, VRM add-on
- [references/inference-pipeline.md](references/inference-pipeline.md) — every upstream flag and
  default for extract/skeleton/skin/merge, configs, `tmp/` npz cache
- [references/training-and-datasets.md](references/training-and-datasets.md) — Rig-XL/VRoid data,
  `raw_data.npz` schema, config layering, training and Rignet validation tasks
- [references/route-outs-and-troubleshooting.md](references/route-outs-and-troubleshooting.md) —
  when not to use UniRig, and the recurring install/runtime errors
- [scripts/doctor.sh](scripts/doctor.sh) — readiness report (`--json`, exits 1 when blocked)
- [scripts/install.sh](scripts/install.sh) — skill plugin + upstream clone/venv/deps
- [scripts/rig.sh](scripts/rig.sh) — stage-aware wrapper with `--dry-run`
- [scripts/inspect_glb.py](scripts/inspect_glb.py) — stdlib GLB/glTF rig verifier
- [UniRig repository](https://github.com/VAST-AI-Research/UniRig) ·
  [paper](https://arxiv.org/abs/2504.12451) ·
  [checkpoint](https://huggingface.co/VAST-AI/UniRig) ·
  [SkinTokens successor](https://github.com/VAST-AI-Research/SkinTokens)
