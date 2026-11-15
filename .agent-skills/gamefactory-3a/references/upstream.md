# 3AGameFactory Upstream Operations Reference

Source: [OpenDCAI/GameFactory-3A](https://github.com/OpenDCAI/GameFactory-3A)
Commit: `f9e927c04ed6abd1dd6f805d52638f1ffe884798` (2026-11-15)
License: Apache License 2.0

## 1. Core End-to-End Workflow

Every game production task must adhere to the 5-step sequence in `agent_skills/setting_overview.md`:

1. **Clarify the Brief**: Identify target engine (`ue5`, `blender`, `unity3d`, `godot`, `three_js`), genre, player loop, deliverables, visual style, budget, and acceptance criteria.
2. **Plan the Game**: Read `agent_skills/game_design/SKILL.md`. Map story beats, chapter entry/exit conditions, required props/characters/audio/VFX, and UI layouts before generating art.
3. **Build Playable Whitebox**: Assemble core loop using procedural greybox geometry and placeholder cues. Test, launch, and prove the loop before replacing placeholders.
4. **Refine Assets in Whitebox**: Follow asset decision hierarchy:
   - Route 1: Procedural code specification (`code_asset.py`) — zero GPU, instantaneous.
   - Route 2: Licensed CC0 asset packs (`asset_pack.py`) — license-checked, seconds.
   - Route 3: Generative models (Tripo / Meshy / TRELLIS.2) — GPU-bound or paid API.
5. **Validate, Play, and Iterate**: Full acceptance pass; "it compiles" or "no log errors" is explicitly rejected as evidence. Requires gameplay video recording and review against the 7 failure areas.

## 2. Supported Engine Contexts

| Engine ID | Context Path | Reference Adapter | Key Interface Boundary |
|---|---|---|---|
| `ue5` | `agent_skills/engine_context/ue5_api.md` | `engine_adapters/ue5/` | `UEClient` is the only host-side interface; no editor imports in host scripts. |
| `blender` | `agent_skills/engine_context/blender_api.md` | `engine_adapters/blender/` | Python background script automation with headless rendering. |
| `unity3d` | `agent_skills/engine_context/unity3d_api.md` | `engine_adapters/unity3d/` | Copy `A3Game_VFX.cs` and C# scripts into project `Assets/`. |
| `godot` | `agent_skills/engine_context/godot_api.md` | `engine_adapters/godot/` | Godot 4 GDScript integration and built-in asset packs. |
| `three_js` | `agent_skills/engine_context/three_js_api.md` | `engine_adapters/three_js/` | Node web serving, browser canvas, and GLTF/GLB asset loading. |

## 3. Seven Visual and Playability Review Areas

Before declaring a game deliverable complete, inspect the gameplay recording against these failure modes:

- **Image quality**: Silhouette, topology artifacts, texture resolution, material seams, LOD popping, missing collision floors.
- **Lighting**: Light leaking through geometry, harsh missing shadows, lightmap artifacts, exposure mismatch between characters and world.
- **Style match**: Color palette, contrast, and shaders must match requested genre (cyberpunk, stylized low-poly, photoreal).
- **Dynamic effects**: VFX triggers fire on event and terminate cleanly; correct scale, socket attachment, and audio synchronization.
- **Facing while moving**: Character faces movement direction; animation forward axis agrees with controller input. Projectiles leave along forward vector.
- **Combined parts**: Weapons held at grip sockets, not inside torso; vehicle wheels positioned under wheel wells and touching ground; feet on floor without clipping.
- **Playability**: No jitter or falling through floors; camera framing avoids wall clipping; responsive controls with zero inverted axes; UI readable and bound to live game state.
