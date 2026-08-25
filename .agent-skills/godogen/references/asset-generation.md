# Godogen asset generation

Verified against upstream commit `05cebffc8b10c5817e8a3db495b82e7b6004ab84`.
Provider prices and model names can change. Re-read current upstream and the provider before a
real spend.

## Published tool locations

```bash
# Claude publication
ASSET_GEN_DIR=.claude/skills/asset-gen

# Codex publication
ASSET_GEN_DIR=.agents/skills/asset-gen
```

Run tools from the generated game repository root. Godot and Bevy runtime assets belong under
`assets/`; Babylon runtime assets belong under `src/assets/`.

## Pinned price table

| Operation | Pinned model or quality | Cost |
|---|---|---:|
| Grok image | `grok-imagine-image` | 2 cents |
| Gemini image | 512 | 5 cents |
| Gemini image | 1K | 7 cents |
| Gemini image | 2K | 10 cents |
| Gemini image | 4K | 15 cents |
| Grok video | `grok-imagine-video`, 1-15s | 5 cents/second |
| Tripo static GLB | default | 30 cents |
| Tripo static GLB | `--quality hd` | 60 cents |
| Tripo rig | default model plus rig | 55 cents |
| Tripo rig | HD model plus rig | 85 cents |
| Tripo retarget | each clip | 10 cents |

A common full 3D asset is 37 cents: Gemini 1K reference (7) plus default GLB (30). A
rigged character with walk, idle, and attack is about 92 cents: Gemini 1K reference (7),
default rig command (55), and three retargets (30).

Estimate a complete plan offline before the first call:

```bash
python3 .agent-skills/godogen/scripts/cost-estimate.py \
  --grok-images 4 \
  --gemini-1k 2 \
  --video-seconds 6 \
  --glb 2 \
  --rig 1 \
  --retarget 3
```

Get explicit user approval for the shown operation counts and cost ceiling. A modified plan
needs a new estimate and approval.

## Image generation

```bash
python3 "$ASSET_GEN_DIR/tools/asset_gen.py" image \
  --prompt "the full prompt" \
  --model grok \
  --size 1K \
  --aspect-ratio 1:1 \
  -o assets/img/object.png
```

- default model: Grok
- Gemini sizes: `512`, `1K`, `2K`, `4K`
- Grok sizes: `1K`, `2K`
- image-to-image: add `--image reference.png` and describe only the change
- Grok is inexpensive and visually strong but can ignore precise constraints
- Gemini is preferred for references, characters, layouts, and exact prompt following

Review every PNG before paying for a GLB or rig. For small sprites, generate a kit and slice
it rather than downscaling one detailed 1K object:

```bash
python3 "$ASSET_GEN_DIR/tools/grid_slice.py" kit.png \
  -o assets/sprites --grid 2x2 --names "a,b,c,d"
```

## Background removal

Never prompt for a transparent background. Image generators can bake a checkerboard into the
pixels. Prompt a solid color and matte it afterward:

```bash
python3 "$ASSET_GEN_DIR/tools/rembg_matting.py" input.png -o output.png
python3 "$ASSET_GEN_DIR/tools/rembg_matting.py" --batch frames/ -o clean/
```

Read the published `rembg.md` before choosing `auto`, `trust`, `adapt`, or `color` mode. The
pinned requirements use GPU-oriented ONNX/CUDA packages, so verify the machine before
installing or running the matting stack.

## Animated sprite recipe

1. Generate one reviewed Gemini 1K reference in a neutral pose on a solid background.
2. Create each action pose image-to-image from that reference.
3. Generate video from the pose:

   ```bash
   python3 "$ASSET_GEN_DIR/tools/asset_gen.py" video \
     --prompt "walk cycle" --image pose.png --duration 2 --resolution 720p \
     -o walk.mp4
   ```

4. Extract frames:

   ```bash
   ffmpeg -i walk.mp4 -vsync 0 frames/%04d.png
   ```

5. For a looping walk or idle, identify the loop boundary:

   ```bash
   python3 "$ASSET_GEN_DIR/tools/find_loop_frame.py" frames/
   ```

6. Delete frames after the chosen loop point and batch-matte the remainder. Skip loop trimming
   for one-shot attacks or deaths.

Reuse one reference for all actions. If chaining one action's last frame into the next action,
keep the chain at two steps or fewer because visual drift compounds.

## GLB and rigging

```bash
# Static GLB, 30 cents default or 60 cents with --quality hd
python3 "$ASSET_GEN_DIR/tools/asset_gen.py" glb \
  --image reference.png -o assets/glb/model.glb

# Rigged biped, 55 cents default or 85 cents with --quality hd
python3 "$ASSET_GEN_DIR/tools/asset_gen.py" rig \
  --image character.png -o assets/glb/rigged.glb

# One retargeted clip, 10 cents
python3 "$ASSET_GEN_DIR/tools/asset_gen.py" retarget \
  --rigged assets/glb/rigged.glb \
  --animation preset:biped:walk \
  -o assets/glb/walk.glb
```

For Tripo image-to-3D input:

- use a three-quarter elevated view;
- use a solid white or gray background;
- prefer matte finish and opaque glass;
- include one centered subject;
- **do not remove the background** before Tripo conversion.

`rig` is biped-only. Use plain `glb` for quadrupeds. Reuse one rigged model for multiple
retarget operations and inspect actual imported clip names before wiring playback.

## Tripo timeout recovery

Tripo jobs can remain at 99 percent with no output for minutes. A timeout does not prove server
failure. The tool writes the task id to `<output>.tripo.json` before polling.

Do not resubmit. Resume the existing task at no extra cost:

```bash
python3 "$ASSET_GEN_DIR/tools/asset_gen.py" resume -o assets/glb/model.glb
```

The resume command is safe to repeat and no-ops when complete. Deleting the sidecar forces a
cold start and can lead to another bill, so preserve it while diagnosing.

## Output contract

Every provider command writes one JSON object to stdout:

```json
{"ok": true, "path": "assets/img/car.png", "cost_cents": 7}
```

Progress goes to stderr. Keep normal context clean and inspect the log only on failure:

```bash
_log=$(mktemp)
result=$(python3 "$ASSET_GEN_DIR/tools/asset_gen.py" image \
  --prompt "..." -o assets/img/item.png 2>"$_log") || tail -20 "$_log"
printf '%s\n' "$result"
```

Independent image calls can run in parallel only after the total spend is approved. Never
start a second Tripo attempt for an output that already has a pending sidecar.

## Asset manifest

Track generated assets in the game repository's `README.md`:

| Name | Description | In-game size | Path | Cost |
|---|---|---|---|---:|
| car | sedan with spoiler | 4m long | `assets/glb/car.glb` | 37 cents |

Use meters for 3D assets, tile size for textures, pixel dimensions and behavior for
backgrounds, and display pixels for sprites.
