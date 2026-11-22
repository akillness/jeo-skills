---
name: scenario-roblox-environment
description: "Use when building or lighting a Roblox map: graybox or blockout, level layout, landmarks, doors and walls, parts versus unions (CSG), collision fidelity, terrain (generate, sculpt, paint, water, Part to Terrain), MaterialVariants, custom terrain materials, PBR textures from Scenario, skyboxes, Lighting, Atmosphere, Clouds, bloom, color correction, day or night moods, interior light, scattering rocks, bushes and trees, level of detail (SLIM, RenderFidelity), per-model streaming or a streaming test, collision overlays, invisible walls, or texture sizes. Also when a map looks flat, foggy, too dark or plastic, grass pokes through floors, a doorway blocks players, content pops in or never unloads, a custom material disappears, or the sun lights the wrong side."
license: MIT
---

# Roblox environment (builder, environment artist and lighter)

Target: Roblox Studio (October 2026 build) on macOS, driven through the scenario-roblox-expert
toolkit.

Expert environment work on Roblox means a graybox built from plain parts and composed from the spawn
camera, terrain and materials made from code with their silent failures checked, and light designed
from a mood with the sun aimed first and post effects last. This skill carries those rules from the
sources, corrected by live tests in Studio 0.743 on a village, terrain and interior built for the
purpose, plus kit modules that build, light, measure and audit a scene. If a sibling skill named
here is missing from your available skills, load it with `skill_get` (Scenario MCP) or ask the user
to install it (https://github.com/scenario-labs/skills#install); unattended, proceed from tool
schemas and flag the gap.

**REQUIRED BACKGROUND:** scenario-roblox-expert (channels, review loop, toolkit, current-Roblox
traps).

**Status (2026-10-19):** live run 2026-10-19 01:14 passed 14 of 14 in Studio 0.743; offline O1 to O9
pass. Scatter, the streaming test and the overlays are offline-tested only. A later run stalled on a
viewport that stopped drawing (see `references/procedures.md`).

## Stance (the expert delta)

1. **Graybox in plain parts, composed from the spawn camera.** Primitives, one grid MaterialVariant,
   folders with underscores, a ground color distinct from walls (Jalapeno, T--CNfkfBBQ [00:02:01 to
   00:02:35, 00:08:13]). Landmarks as loud placeholders at true size (RoBuilder, eRnnjqVOq7c
   [00:05:20]). Doorways and halls at least 10 studs wide, walls at least 10 tall (Roblox graybox
   tutorial). Compose from where players spawn and time the walk between landmarks (Gino,
   vWx8UTxsi0A [00:11:49, 00:12:21]).
   - Live: the template SpawnLocation faced away from the village, so the first view was a hillside.
     Turn the spawn toward the first landmark.
2. **Parts before CSG; test what collision does to openings.** Cut axis-aligned holes with parts,
   not unions (Kaiwala, x9jg8kjH3Vs [00:04:41]). Each distinct union is its own mesh and collision
   asset (Kaiwala, Ahn2P_4TDrU [00:20:40]). Pick fidelity by whether players pass through or touch
   the shape (Roblox collisions docs).
   - Kaiwala saw Default collision close a hole and switches to PreciseConvexDecomposition; Hull or
     Box are his cheap fix for simple shapes (Ahn2P_4TDrU [00:01:54, 00:02:28]).
   - Live: Hull and Box filled a 10 by 10 doorway; Default and PreciseConvexDecomposition kept it
     open. Probe every opening rather than trusting a fidelity name.
   - `GetPartBoundsInBox` reported every union door as blocked because it compares bounding boxes.
     Test passage with `GetPartsInPart` or a ray.
3. **Terrain from code, checked by reading the voxels.** Block out with parts, convert, then smooth
   (BONES, -DoOf32pkPo [00:04:34, 00:09:57]). Region calls need resolution 4, grid-aligned regions
   and at most 4,194,304 voxels each (Terrain reference).
   - Live: a `FillBlock` whose top sat at y 0 left the walkable surface near y 2.
     `TerrainKit.occupancy` places the surface exactly.
   - Live: a raycast right after a fill returned nothing. `TerrainKit.surfaceY` reads the height
     from the voxels instead.
   - Grass blades poke through parts; paint LeafyGrass there (SmartyRBX, CippiATeZ54 [00:01:40]).
     Live, they grew through every floor set on Grass; `TerrainKit.paintUnder` repaints under
     floors.
4. **Materials link by name, per base material, and terrain needs more.** A rename breaks every part
   using the variant (Roblox materials docs). Terrain uses a variant only through an override, one
   per material: Grass and LeafyGrass separately (SmartyRBX, CippiATeZ54 [00:05:13, 00:05:47]).
   - Live: creating a Basalt variant changed nothing until `SetBaseMaterialOverride`.
   - Live: the override still rendered near black because the terrain material color (Basalt 30,
     30, 37) multiplies the map. Brighten it with `Terrain:SetMaterialColor`, as SmartyRBX does by
     hand [00:02:44].
5. **Decide the mood, then aim the sun, then color.** Mood sentence first, ClockTime next
   (RingWorld, UlvSrWHESwA [00:01:06, 00:01:58]). Aim the sun so light lands where it matters
   (DatBoiEle, aq0Fi0R2FAY [00:02:11]; BONES uses GeographicLatitude as the direction control,
   zAoY8pxJM9c [00:08:36]).
   - Live: at the default latitude the spawn camera faced the sun and saw only shadow sides, tinted
     by Ambient. `Looks.aimSun` finds a ClockTime and GeographicLatitude for any direction, error
     under 1 degree.
6. **Warm light, cool shadow; contrast last, in small steps.** Ambient tints shadows and
   ColorShift_Top tints light; lowering EnvironmentDiffuseScale raises contrast (DatBoiEle
   [00:03:38, 00:05:48]). Realistic first; Atmosphere Density 0.3 to 0.4 with Offset 0; color
   correction last, for contrast (Develuper, vkEXLmRAQgs [00:00:27, 00:01:04, 00:02:16]). Move
   ColorCorrection in 0.05 steps (DatBoiEle [00:08:09]). His Bloom: Threshold about 0.03, a large
   Size, then Intensity lowered to taste [00:07:37].
7. **Night needs a focal light and silhouettes.** BONES' dark recipe works in a corridor: black
   Atmosphere Color and Decay, Density 0.495, Offset 0.25, Haze 5, Glare 0, environment scales 0,
   ExposureCompensation -0.4 (zAoY8pxJM9c [00:03:15 to 00:06:04]). Outdoors, RingWorld lowers
   Brightness, drops glare, tints blue and adds near and far lights (UlvSrWHESwA [00:06:44 to
   00:07:54]).
   - Deciding condition: does the player need the skyline? Live, the corridor recipe turned 96 to
     100 % of the far views black. `night_outdoor` kept every view readable.
8. **Interiors: windows must pass light, then fake the bounce.** Glass casting shadows blocks the
   sun shaft; turn CastShadow off (DatBoiEle [00:09:16]). For window-lit rooms BONES uses Brightness
   44, black ambients, environment scales 0. He adds a PointLight [234, 255, 254], Range 50, Shadows
   on, near the window (zAoY8pxJM9c [00:06:14, 00:07:14]). All three confirmed live.

## Establish first

- Camera and genre: third person (the default) needs larger doors and ceilings than first person.
- Target devices; mobile reach favors Soft lighting and the performance owner's budgets.
- Map size, StreamingEnabled, and which models must always exist on clients.
- One mood sentence per zone and two or three reference images.
- Asset sources: Scenario meshes, textures and skyboxes, or Roblox materials only.
- File pipeline: Rojo or Studio only. Several settings are file-only (Current Roblox notes).

Defaults: Realistic with PrioritizeLightingQuality, graybox grid variant at StudsPerTile 8, doors 10
by 10, the `day_fantasy` look aimed for the spawn view.

## Procedure

Setup: `import rbx_environment as E`, then
`E.run(studio, code, kit=["Graybox", "TerrainKit", "MaterialKit", "Looks", "EnvAudit"])` (it finds
the lead toolkit). Full code and recorded results:
[`references/procedures.md`](references/procedures.md).

1. **Readiness (P1).** Read LightingStyle, overrides and the file-only settings. **GATE:** values as
   intended; anything scripts refuse is set in the place file or the Properties panel.
2. **Graybox (P3).** `Graybox.house`, `wall`, `lantern`, `block` under `map_geo/<area>/<kind>`;
   landmark placeholders; spawn turned toward the first landmark. **GATE:** `Graybox.clearance`
   returns no findings; walk times reported; the spawn capture shows the landmark.
3. **Terrain (P2, P13, P4).** `TerrainKit.heightfield` with a height function, `water`, `fromParts`
   and `smooth`, then `paintUnder` for floors. **GATE:** the spawn ground (`groundY` after a frame,
   or `surfaceY`) sits at the design height; no grass through floors in the spawn and interior
   captures.
4. **Openings and collision (P5).** Openings from parts; any union keeps Default fidelity and the
   `Opening` attribute. **GATE:** a character-sized `GetPartsInPart` probe and a ray pass every
   doorway.
5. **Materials (P6).** `MaterialKit.kit`, `dress` by role, one override per terrain material,
   terrain material colors. **GATE:** `MaterialKit.links` returns 0 broken; each override reads
   back; the dressed captures judged with [`references/critique.md`](references/critique.md).
   - Foliage, rocks and trees: `Scatter.plan` and `Scatter.place`, with collision and LevelOfDetail
     per variant ([`references/foliage.md`](references/foliage.md)).
6. **Light (P7 to P10).** Snapshot, `Looks.apply`, `Looks.aimSun`, capture the same cameras before
   and after, `E.look_metrics`, one contact sheet. **GATE:** metric bands in Quality gates; the
   sheet judged against the mood sentence.
7. **Playtest (P11).** Client Stats, per-model streaming check, walk through a door. **GATE:** the
   character arrives inside; numbers go to the performance owner.
   - Checks that can fail beyond captures: streaming at radius 64, collision and invisible-blocker
     overlays, texture sizes and mesh groups
     ([`references/verification.md`](references/verification.md)).
8. **Audit and hand off (P12).** `EnvAudit.all(game)` in Studio, `E.lune_audit(place)` on the saved
   file. **GATE:** no error or warn.

## Numbers

| Value                               | Number                                                                                                    | Source                                     |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Doorway and hall width; wall height | 10 studs at least                                                                                         | graybox tutorial                           |
| Default WalkSpeed; JumpHeight       | 16 studs/s; 7.2 (the tutorial's 5 is stale)                                                               | Humanoid reference                         |
| One stud                            | about 28 cm; imports are not converted                                                                    | units guide                                |
| Grid variant tile                   | StudsPerTile 8                                                                                            | Jalapeno                                   |
| Terrain region calls                | resolution 4, 4,194,304 voxels                                                                            | Terrain reference                          |
| CSG result                          | 20,000 triangles at most                                                                                  | solid modeling docs                        |
| Light Range                         | clamped to 120 on write (live)                                                                            | deltas                                     |
| Atmosphere Density, Offset (day)    | 0.3 to 0.4, 0                                                                                             | Develuper                                  |
| Dark Atmosphere                     | Density 0.495, Offset 0.25, Haze 5, Glare 0                                                               | BONES                                      |
| ExposureCompensation                | -0.4, move by decimals                                                                                    | BONES                                      |
| Window-lit interior                 | Brightness 44; fake GI [234, 255, 254], Range 50                                                          | BONES                                      |
| ColorCorrection steps               | 0.05; Contrast 0.1                                                                                        | DatBoiEle                                  |
| Streaming baseline                  | MinRadius 64, TargetRadius 1024, PauseOutsideLoadedArea, Opportunistic, Improved                          | streaming docs                             |
| Per-view budget on 2 GB phones      | 500 draw calls, 500k triangles                                                                            | McNeill, cWDNVvOh4o0 (performance owns it) |
| Script clamps (live)                | Atmosphere Glare and Haze 10, Density and Offset 1, ShadowSoftness 1; Brightness and Bloom Size unclamped | Studio 0.743                               |

## Quality gates

Measured (lower half of each capture with `skip_top=0.45`, so the sky does not dominate):

- Day looks: `crushed` under 0.05 in every view; spread wider than the neutral capture.
- Outdoor night: `crushed` under 0.5 in every view; a lit focal point near spawn.
- Interior with sun: the floor patch clips (`clipped` above 0.05) and the fake bounce lifts
  `mean_luma` while the patch stays.
- `Graybox.clearance`, `MaterialKit.links`, `EnvAudit`: zero findings at error or warn.
- Playtest: 60 fps on the dev machine; draw calls and triangles reported per view.

Judged by eye on the contact sheet ([`references/critique.md`](references/critique.md)): mood
matches the sentence; value structure reads in gray; light faces seen from spawn; landmark contrasts
with its background; no plastic or near-black materials; distance haze leaves silhouettes.

## Common mistakes

| Mistake                                                        | Fix                                                                                                                       |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `Lighting.Technology = Future` in a script                     | `LightingStyle` plus `PrioritizeLightingQuality`; write `Technology` only in the place file                               |
| Streaming radii or `Terrain.Decoration` set by script          | file-only: Rojo `$properties` or Properties panel (live: "not a valid member")                                            |
| `LevelOfDetail = StreamingMesh` with a small radius            | SLIM for static models; StreamingMesh only with TargetRadius 1000 or more (Andrew, Wwj8EkMWFhI)                           |
| 4 by 8 doors                                                   | 10 by 10 at least                                                                                                         |
| A union door with Hull or Box                                  | parts, or a union with Default fidelity                                                                                   |
| A variant with BaseMaterial Grass, expecting terrain to change | `SetBaseMaterialOverride` for Grass and LeafyGrass, then check the terrain material color                                 |
| Renaming a variant after applying it                           | keep names; audit with `MaterialKit.links`                                                                                |
| ShadowSoftness tuned under Soft, then judged in Realistic      | judge in the style you ship; captures per style                                                                           |
| Tuning colors before the sun is aimed                          | `Looks.aimSun` first                                                                                                      |
| Judging bloom in an Edit capture                               | Bloom at Intensity 3 changed a capture no more than two identical captures differ (live); judge it in play or on a device |
| One far point light                                            | two lights, near and far; Range stops at 120                                                                              |
| Glass with CastShadow on                                       | CastShadow off                                                                                                            |

## Handoffs

| To or from                               | What                                                                                                                                                                          |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| scenario-3d, then scenario-roblox-assets | Scenario meshes are imported and checked there (triangles, collision, SurfaceAppearance); this skill places them, sets fidelity and LevelOfDetail, and lights them            |
| scenario-textures                        | tileable PBR sets become MaterialVariants here (color, normal, roughness, metalness; OpenGL normals); one-mesh texture sets go to scenario-roblox-assets as SurfaceAppearance |
| scenario-skyboxes                        | six faces into `Sky.SkyboxBk/Dn/Ft/Lf/Rt/Up`; uploading needs the user's go; judge the sky with the look, since it colors the scene                                           |
| scenario-game-assets                     | decals and signage placed on surfaces here; UI art goes to scenario-roblox-ui                                                                                                 |
| scenario-roblox-performance              | streaming settings, budgets and device tests: send the P11 Stats and the EnvAudit counts                                                                                      |
| scenario-roblox-vfx-audio                | particles, beams, ambience; send the mood sentence and the light positions                                                                                                    |
| scenario-roblox-gameplay                 | collision groups, hitbox geometry, NPC navigation through the graybox                                                                                                         |
| scenario-roblox-tooling                  | Rojo projects carrying the file-only settings                                                                                                                                 |

## Current Roblox notes

- `Lighting.Technology` is superseded by `LightingStyle` (Soft or Realistic) and
  `PrioritizeLightingQuality`; scripts cannot read Technology.
- Script-refused, file-only (live): `StreamingTargetRadius` and the other streaming settings except
  `StreamingEnabled`, `Terrain.Decoration`, `GrassLength`, `MaterialService.<Material>Name`. Rojo
  7.7.1 writes them all (Lune read-back).
- A place built by Rojo starts with engine defaults: GlobalShadows off, environment scales 0, gray
  ambients, no Sky or Atmosphere (live).
- `GeometryService:SubtractAsync` and siblings replace `BasePart:SubtractAsync`; results come back
  unparented; a `CollisionFidelity` write reads back after the next yield (live).
- `ReadVoxelChannels` returns `Size` on the result table, `ReadVoxels` on the materials array
  (live).
- Terrain `Clouds` live under `Workspace.Terrain` and can be created by script (live).
- `ClockTime` does not advance by itself in a running game (live).

## References

- [`references/procedures.md`](references/procedures.md): P1 to P13, the code the live tests run,
  with results.
- [`references/critique.md`](references/critique.md): how to judge a capture; the findings from this
  skill's own captures.
- [`references/expert-notes.md`](references/expert-notes.md): the expert claims by source,
  agreements, disagreements and live corrections.
- [`references/gui-paths.md`](references/gui-paths.md): GUI-only tools, their code substitutes and
  menu paths.
- [`references/foliage.md`](references/foliage.md): scatter, leaf cards, collision, RenderFidelity
  and LevelOfDetail.
- [`references/verification.md`](references/verification.md): streaming test, overlays, texture and
  batching audit.
- [`references/sources.md`](references/sources.md): every source with its public URL.
- Kit: [`Graybox`](scripts/agentkit/environment/Graybox.luau),
  [`TerrainKit`](scripts/agentkit/environment/TerrainKit.luau),
  [`MaterialKit`](scripts/agentkit/environment/MaterialKit.luau),
  [`Looks`](scripts/agentkit/environment/Looks.luau),
  [`EnvAudit`](scripts/agentkit/environment/EnvAudit.luau),
  [`Scatter`](scripts/agentkit/environment/Scatter.luau),
  [`WorldCheck`](scripts/agentkit/environment/WorldCheck.luau),
  [`lune_env_audit`](scripts/agentkit/environment/lune_env_audit.luau),
  [`rbx_environment.py`](scripts/rbx_environment.py).
