---
name: gamefactory-3a
description: >
  Inspect, adopt, and operate OpenDCAI/GameFactory-3A at a pinned source revision. Use when building or improving games with 3AGameFactory across Unreal Engine 5, Unity, Godot 4, Blender, or Three.js; generating and verifying 3D assets, meshes, scenes, motion/rigging, audio, CG video, VFX, and game feel; or running its 5-step playable whitebox to asset QA workflow. Covers game_design, game-feel, asset_qa, code_gen, engine_context, and develop_harness. Not for generic game studios (use donchitos-game-studios or bmad-gds) or prompt-only design. Installing this guide does not download models or execute game engines.
allowed-tools: Read Glob Grep Bash
compatibility: Offline preflight requires Python 3.10+ with POSIX dir_fd and O_NOFOLLOW. Upstream engine workflows require Blender, UE5, Unity3D, Godot 4, or Node/three.js depending on the selected engine adapter.
metadata:
  version: "1.0.0"
  source: https://github.com/OpenDCAI/GameFactory-3A
  upstream_commit: f9e927c04ed6abd1dd6f805d52638f1ffe884798
---

# 3AGameFactory

## Purpose

Operate the open-source **3AGameFactory** framework (`OpenDCAI/GameFactory-3A`) to turn game requirements into production-ready game assets and engine-ready project code. The pinned source snapshot (`f9e927c04ed6abd1dd6f805d52638f1ffe884798`) provides asset generation, motion retargeting, narrative decomposition, and engine integration for **Unreal Engine 5, Unity, Godot 4, Blender, and Three.js**.

This catalog package contains an operator guide, technical audit references, evaluation scenarios, and an offline preflight helper. It does not bundle heavy model weights or run game engines directly.

## When to use this skill

- Plan and structure new 3A game generation tasks using the 5-step lifecycle.
- Generate or verify 3D objects, 3D scenes, skeletons/motion, concept images, audio, VFX, and CG videos.
- Integrate generated assets and gameplay mechanics into UE5, Unity, Godot 4, Blender, or Three.js.
- Enforce the playability anti-cheat review gate (verifying recorded gameplay against 7 structural failure modes).
- Route tasks to upstream child skills (`game-design`, `game-feel`, `game-cg-director`, `create-vfx-effects`).

For general multi-agent game studio collaboration without generative model pipelines, use `donchitos-game-studios` or `bmad-gds`. For standalone skill evaluation or CI scanner gating, use `nvidia-skill-evaluator`.

## Instructions

### 1. Run offline preflight inspection

Set `SKILL_DIR` to this installed guide's canonical absolute directory with no symlink components, then run the offline helper:

```bash
python3 "$SKILL_DIR/scripts/preflight.py" --json
# Optional: verify twelve selected public files in an existing GameFactory-3A checkout.
python3 "$SKILL_DIR/scripts/preflight.py" --repo /absolute/real/path/to/GameFactory-3A --json
```

This helper reads local files and checks tool availability (`python3`, `git`, `blender`, `node`, `claude`, `bash`) using zero network operations and zero subprocess executions. Exit `0` indicates inventory completion or exact source hash matching. Exit `1` indicates source mismatch; exit `2` indicates unsafe or invalid arguments.

### 2. Follow the 5-step game generation workflow

Every game creation task must proceed strictly in this order; never generate assets or code before completing the plan:

1. **Clarify the Brief**:
   - Identify: target engine, game genre, player loop, deliverables, visual style, budget, and acceptance criteria.
   - Select exactly one engine context; do not mix engine APIs.
2. **Plan the Game**:
   - Consult `agent_skills/game_design/SKILL.md`.
   - Structure narrative flow and chapter goals.
   - Establish dependency-aware task lists and maintain chapter-linked TODO records.
3. **Build a Playable Whitebox**:
   - Consult `agent_skills/engine_context/engine_overview.md` and the selected engine context.
   - Implement greybox geometry and placeholder mechanics first.
   - Build, launch, and play the core loop end to end before ordering production assets.
4. **Refine Assets in Whitebox**:
   - Apply the asset decision hierarchy:
     1. *Procedural Spec*: Exact geometry describable via code (`code_asset.py`) — zero GPU, instantaneous.
     2. *Asset Pack*: Licensed CC0 model packs (`asset_pack.py`) — download and verify license.
     3. *Generative Model*: Meshy / Tripo / TRELLIS.2 / Hunyuan3D — GPU-bound or paid cloud API.
   - Verify mesh facing, scale, and watertight geometry on 5-view orthographic preview sheets before importing.
5. **Validate, Play, and Iterate**:
   - Full acceptance pass; compilation or clean logs is **not** validation.
   - Record and review gameplay against the 7 failure areas below.

### 3. Select exactly one engine context

| Engine | Required Context Document | Reference Adapter | Transport Rule |
|---|---|---|---|
| `ue5` | `agent_skills/engine_context/ue5_api.md` | `engine_adapters/ue5/` | `UEClient` is the only host-side interface; no editor imports in host Python. |
| `blender` | `agent_skills/engine_context/blender_api.md` | `engine_adapters/blender/` | Python background script automation with headless rendering. |
| `unity3d` | `agent_skills/engine_context/unity3d_api.md` | `engine_adapters/unity3d/` | Copy `A3Game_VFX.cs` and C# scripts into project `Assets/`. |
| `godot` | `agent_skills/engine_context/godot_api.md` | `engine_adapters/godot/` | Godot 4 GDScript integration and built-in asset packs. |
| `three_js` | `agent_skills/engine_context/three_js_api.md` | `engine_adapters/three_js/` | Node web serving, browser canvas, and GLTF/GLB asset loading. |

### 4. Enforce the playability anti-cheat review gate

Never judge a game from source code or single screenshots. Capture a short gameplay recording exercising player locomotion, camera, primary action, damage, death/respawn, and UI, then inspect against these 7 areas:

1. **Image Quality**: Mesh silhouette artifacts, texture seams, LOD popping, missing floor collision.
2. **Lighting**: Light leaking through geometry, harsh missing shadows, exposure mismatches between assets.
3. **Style Match**: Shaders, palette, and post-processing match the requested aesthetic (cyberpunk, stylized, photoreal).
4. **Dynamic Effects**: VFX fire on the correct event socket and terminate cleanly without stuck loops.
5. **Facing While Moving**: Character faces movement direction; projectile leaves along forward vector.
6. **Combined Parts**: Weapons held at grip sockets (not in torso); wheels located under chassis wheel wells.
7. **Playability**: No falling through collision floors; camera does not clip walls; responsive controls with no inverted axes.
## Examples

### Example 1: Planning a new 3D action game
1. Clarify brief: target engine `godot`, genre `action-rpg`, visual style `low-poly`.
2. Map story beats in `agent_skills/game_design/SKILL.md` before generating assets.
3. Construct whitebox using primitive boxes to verify character movement and combat camera.
4. Replace whitebox props using CC0 Kenney asset packs; generate hero character using Meshy.
5. Capture 30-second gameplay video and verify against the 7 playability criteria.

### Example 2: Generating and verifying a hero weapon
1. Check `agent_skills/asset_qa/3d_object/SKILL.md` to see if procedural spec (`code_asset.py`) fits.
2. If custom fantasy mesh is needed, run `Gen3DObjectOperator.run_art_plan`.
3. Inspect the resulting 5-view orthographic sheet (`preview_sheet`) for watertight geometry and scale.
4. Mount mesh to character's weapon socket and verify in recorded animation that it does not clip the torso.

## Best practices

- **Never skip the whitebox phase**: Prove the player loop with greybox geometry before incurring generative model latency or costs.
- **Isolate engine code**: Keep engine scripts in `engine_adapters/<engine>/` or inside target project directories; never import editor modules into the host agent.
- **Record and watch gameplay**: Video evidence is mandatory; "it compiles" is never playability validation.
- **Fail fast on asset flaws**: Fix mesh facing and socket transforms in asset metadata rather than applying compensation rotations in gameplay code.


## References

- [3AGameFactory Upstream Operations](references/upstream.md)
- [Research and Evaluation Audit](references/research.md)
- [Source Manifest and Pinned Hashes](references/source.json)
- [Verification Record](references/verification.md)
- [Evaluation Scenarios](evals/evals.json)
