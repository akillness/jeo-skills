# UniRig route-outs and troubleshooting

## Route out when UniRig is the wrong tool

| Situation | Better route | Why |
|---|---|---|
| New project, best skinning quality | [SkinTokens](https://github.com/VAST-AI-Research/SkinTokens) | Same lab's successor: skeleton + skinning unified in one autoregressive sequence with RL; reported 98–133% skinning and 17–22% bone-prediction improvements over UniRig |
| No NVIDIA GPU (macOS, CPU-only CI, most laptops) | Cloud GPU, or the hosted [Tripo](https://www.tripo3d.ai) rigging service | `spconv` / `flash_attn` / `torch_scatter` are CUDA-only; there is no CPU inference path |
| Standard biped, game-ready humanoid naming | Mixamo, AccuRig, Blender Rigify | Deterministic, artist-controlled bone names/hierarchies that animation retargeting pipelines already expect |
| Rig must match an existing animation library | Retarget onto that library's skeleton | UniRig predicts its own topology; conforming it afterwards costs more than authoring to the template |
| Only IK/constraints/control rig needed on an existing skeleton | Blender Rigify or a studio rig tool | UniRig outputs joints and weights, not control rigs |
| Cloth/hair simulation or physics attributes | Simulation tooling | Bone attribute prediction (stiffness, secondary motion) is still unreleased |
| Batch of thousands of assets on a deadline | Hosted API or a managed farm | Extract + AR generation per asset is minutes, not seconds |

Say the constraint out loud before proposing any of these. A blocking `scripts/doctor.sh` result is
information for the user, not a problem to work around silently.

## Install-time errors

**`ERROR: Could not build wheels for flash_attn`**
Expected on many machines; upstream warns about it. Install a prebuilt wheel matching your
torch/CUDA/Python ABI from the [flash-attention releases](https://github.com/Dao-AILab/flash-attention),
or build with `MAX_JOBS=4 pip install flash_attn --no-build-isolation` and a matching `nvcc`.
`scripts/install.sh` isolates this step so the rest of the environment still completes.

**`ModuleNotFoundError: No module named 'spconv'` or a runtime CUDA kernel error from spconv**
The wheel must match `python -c "import torch; print(torch.version.cuda)"`, e.g. `spconv-cu121` for
CUDA 12.1. Uninstall the wrong wheel first (`pip uninstall spconv spconv-cu118 …`) — several variants
can be installed side by side and shadow each other.

**`torch_scatter` / `torch_cluster` build takes forever or fails**
You are compiling from source because the wheel index did not match. Re-run with the exact index:
`-f https://data.pyg.org/whl/torch-<torch>+<cuda>.html`.

**`numpy` ABI errors after installing requirements**
Re-pin last: `pip install numpy==1.26.4`. `bpy==4.2` and `open3d` are built against numpy 1.x.

**`bpy` refuses to install**
`bpy==4.2` publishes wheels only for CPython 3.11 on the major platforms. A 3.10/3.12 interpreter is
the usual cause; `scripts/doctor.sh` flags the Python version for exactly this reason.

## Runtime errors

**`Unknown parameter: --foo`**
The upstream launch scripts parse a fixed flag list and exit on anything else. Check
[inference-pipeline.md](inference-pipeline.md) for the exact names (upstream uses `snake_case`,
`scripts/rig.sh` accepts `kebab-case` and translates).

**Skeleton output exists but the merged asset does not deform**
The merge source was the `*_skeleton.fbx`. Re-merge with the `*_skin.fbx`.
`python3 scripts/inspect_glb.py <output>.glb` fails loudly on this case (no `skins`, no
`JOINTS_0`/`WEIGHTS_0`).

**Missing bones (tail, wings, extra limbs), or weights bleeding across parts**
Skeleton quality problem, not a skinning problem. Re-sample with another `--seed`, or edit the
skeleton in Blender, then re-run `--stage skin` on the edited FBX.

**Stale results after changing the input file**
The extract stage caches npz files under `tmp/`. The skeleton stage defaults to
`force_override=false`, so it reuses that cache. Pass `--force-override true` through the wrapper or
delete `tmp/`.

**Hugging Face download fails / hangs**
Set `HF_HOME` to a writable path with space; pre-download with `huggingface-cli download
VAST-AI/UniRig`; behind a restrictive network try `HF_ENDPOINT=https://hf-mirror.com`.

**CUDA out of memory**
Lower `--faces-target-count` (default 50000), rig one asset at a time (`--num-runs 1`), and close
other GPU consumers. The AR skeleton stage is the memory-heavy phase.

**`pip install psutil` warning printed by the extract stage**
Upstream's `extract.sh` installs `psutil` on every run. On an offline machine the warning is
harmless when `psutil` is already installed.

## Reviewing an FBX result

`inspect_glb.py` only understands GLB/glTF. For FBX, open it in Blender, or from a UniRig
environment:

```bash
python -c "
import bpy, sys
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=sys.argv[-1])
arms = [o for o in bpy.data.objects if o.type == 'ARMATURE']
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
print('armatures:', len(arms), 'bones:', sum(len(a.data.bones) for a in arms))
print('meshes:', len(meshes), 'vertex groups:', sum(len(m.vertex_groups) for m in meshes))
" results/model_skin.fbx
```

Zero vertex groups means no skinning weights landed.
