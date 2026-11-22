# Foliage, rocks and trees: scatter, reuse and LOD

Dress a finished blockout with rocks, bushes and trees by script. Plant them on terrain and on
ground parts with rays, reuse a few meshes, and choose collision and level of detail per variant.
The kit module is [`Scatter`](../scripts/agentkit/environment/Scatter.luau). Meshes come from
scenario-3d through scenario-roblox-assets; this page places them.

**Test status:** `Scatter.plan` and `Scatter.place` passed 7 Lune tests offline (O1, 2026-10-19),
with a ground function standing in for the ray. `Scatter.ray`, Model templates (`ScaleTo`,
`PivotTo`) and the capture review are queued as live test L14 (2026-10-19), result pending.

## Rules from the sources

**Placement:**

- Place large rocks first, then layer smaller ones around them (BONES, -DoOf32pkPo [00:17:53 to
  00:22:19]).
- Rotate rocks so all four faces show, and use flat stubby rocks as transitions (same video).
- Put bigger rocks toward the cliff, and avoid repeating one shape close to itself (same video).
- Vary scale and rotation on every copy (videos digest consensus, -DoOf32pkPo).

**Batching:**

- One mesh plus one material is one draw call. Copies still batch when their color, size and
  rotation differ (McNeill, cWDNVvOh4o0 [00:10:35, 00:11:20]).
- A tree mesh with two materials costs two draw calls (same talk [00:19:35]).
- RDC 2024 batching tiers [00:18:50]:
  - S: Color3, SurfaceAppearance Color3, CFrame and Size changes.
  - A: meshes, SurfaceAppearances and materials.
  - B: parts and lights. C: unions.
  - D: textures, decals and transparency (sometimes).
  - F: beams, trails, particles and adornments.
- Roblox instances identical meshes that share the same texture asset ids. A scene imported as one
  file breaks this (Improve performance doc).

**Stylized leaves (DatBoiEle, 0_lkryX-CgM):**

- Build leaf cards as planes with a white leaf texture on a transparent background. Use a
  `SurfaceAppearance` with `AlphaMode` Transparency on a `DoubleSided` MeshPart [00:04:05 to
  00:04:37].
- Tint the leaves with the SurfaceAppearance color. A white `RoughnessMap` gives the flat, unshiny
  look [00:06:54 to 00:07:26].
- Change the look of every bush by pasting a new `ColorMap` into all leaf SurfaceAppearances
  [00:11:08 to 00:12:12].
- Give a tree a light rig: a PointLight in the leaf color inside an invisible anchored part at the
  top, and a weaker blue light underneath with a small range [00:09:32 to 00:11:08].
- Keep light ranges small (same video). Light Range is clamped to 120 on write (live, P8).

**Level of detail (Andrew, Roblox Learn, Wwj8EkMWFhI):**

- Leave `RenderFidelity` at Automatic. Set Precise only where quality visibly suffers, or on hero
  parts [00:01:44].
- Automatic gives the highest detail under 250 studs, medium from 250 to 500 and the lowest beyond
  500 (RenderFidelity enum doc). The Improve performance doc also lists `Performance`.
- With streaming on, `Model.LevelOfDetail` picks what shows outside the radius:
  - Disabled (Automatic equals it today): the model is gone. This saves the most and suits small
    objects [00:02:23].
  - StreamingMesh: a crude impostor. Use it only with a target radius of 1,000 studs or more
    [00:03:24].
  - SLIM: generated meshes by distance, "sweet spot in many situations" [00:03:51].
- SLIM fits static models only: no runtime changes, no animation, no Humanoid. Keep each model's
  extent under about 64 studs (Streaming techniques doc; SLIM doc).
- SLIM appears only in a published place with Team Create. It needs one to two minutes of cloud
  transcoding (SLIM doc, Troubleshooting). An unpublished test place cannot show it.
- Use Persistent only for gameplay needs, never for looks [00:04:27, 00:05:00]. Per-model streaming
  modes (Atomic map root, Persistent spawns) are set by scenario-roblox-architecture
  (`references/project-setup.md`).

**Collision and shadows on small foliage:**

- Decoration gets `CanCollide` false and `CanTouch` false (Collisions doc).
- Set `CanQuery` false only when rays should pass through. It takes effect only with `CanCollide`
  false (BasePart.CanQuery reference).
- Use Box or Hull fidelity on non-colliding meshes: their collision geometry is still stored
  (Collisions doc).
- Turn `CastShadow` off on small parts where shadows are unlikely to show, especially far from the
  camera. It can leave shadow artifacts (Improve performance doc).

## Deciding conditions

| Choice                  | Pick     | When                                                                                            |
| ----------------------- | -------- | ----------------------------------------------------------------------------------------------- |
| Collision on a bush     | off      | players should walk through it                                                                  |
| Collision on a bush     | on, Box  | the bush shapes the route or hides an exit by design                                            |
| LevelOfDetail on a cell | Disabled | small props nobody looks at from afar                                                           |
| LevelOfDetail on a cell | SLIM     | silhouettes seen across the map, such as trees on a ridge; check them in a published test build |
| RenderFidelity          | Precise  | a hero asset that smudges at distance (Andrew [00:01:03])                                       |

## Procedure

1. **Templates.** Put one template per variant in a library folder, for example
   `ServerStorage.Foliage`. Set each template's pivot at its base. Imports, triangle counts and
   SurfaceAppearance checks belong to scenario-roblox-assets.
2. **Plan.** `Scatter.plan` throws points per layer, keeps each item's footprint free across layers,
   and keeps each layer in its zone. It picks a variant with no twin inside `repeatGap`. Rock layers
   turn by quarter turns.
3. **Place.** `Scatter.place` grounds each point with a ray onto terrain and the parts you include,
   skips floors, paths, water and steep slopes, clones the template and sets the variant's flags. It
   groups clones into 64-stud cell Models that carry `LevelOfDetail`.
4. **Check.** Read the counts, then capture the spawn and overview cameras before and after
   (`E.capture_set`, `E.sheet`). Look for repeats, floating rocks on slopes, foliage through floors
   and trees hiding the route or a landmark. Batching numbers come from the audit in
   [`verification.md`](verification.md).

<!-- test: L14 -->

```lua
-- Edit. The densities, spacings, scales, slope and tint below are example values [added];
-- the 0.8 to 1.4 rock scale and the quarter turns follow the videos digest's draft procedure for BONES' rules.
local library = game:GetService("ServerStorage"):WaitForChild("Foliage") -- RockL1, RockL2, RockS1, Bush1, Bush2, Tree1
local function zoneAt(x: number, z: number): string?
	local y = TerrainKit.surfaceY(x, z) -- terrain height from the voxels (a ray right after fills can miss)
	if not y then
		return nil
	end
	if y > 30 then
		return "cliff"
	end
	return "meadow"
end
local plan = Scatter.plan({
	min = { -256, -196 },
	size = { 512, 512 },
	seed = 7,
	zoneAt = zoneAt,
	layers = {
		{ zone = "cliff", per1000 = 3, spacing = 14, variants = { "RockL1", "RockL2" }, scale = { 0.8, 1.4 }, yawStep = 90, repeatGap = 30 },
		{ zone = "cliff", per1000 = 8, spacing = 4, variants = { "RockS1" }, scale = { 0.8, 1.2 }, yawStep = 90, repeatGap = 12 },
		{ zone = "meadow", per1000 = 6, spacing = 6, variants = { "Bush1", "Bush2", "Tree1" }, scale = { 0.9, 1.3 }, repeatGap = 16 },
	},
})
local include: { Instance } = { workspace.Terrain }
local blockout = workspace:FindFirstChild("map_geo")
if blockout then
	table.insert(include, blockout) -- ground parts too; floors and paths are skipped by their GrayboxRole
end
local placed = Scatter.place(plan.items, {
	library = library,
	parent = Graybox.folder(workspace, "map_dressing/foliage"),
	include = include,
	maxSlope = 35,
	variants = {
		RockS1 = { collide = false, shadow = false, sink = 0.5 },
		Bush1 = { collide = false, query = false, shadow = false, tint = 0.08 },
		Bush2 = { collide = false, query = false, shadow = false, tint = 0.08 },
	},
	lod = "SLIM",
	seed = 7,
})
return { planned = #plan.items, byLayer = plan.byLayer, placed = placed }
```

- Result shape: `planned`, then per layer `candidates` and `placed`; `placed` holds `placed`,
  `missed`, `retried`, `skipped` (role, material, slope, template), `cells` and per-variant counts.
- Offline, Lune 0.11 on 2026-10-19 (O1): pass. On a 256 by 256 fixture with three layers and seed 7,
  the plan kept 313 items of 1,114 candidates in 6 ms:
  - 631 candidates fell outside their zone and 170 failed spacing;
  - 35 large rocks were placed before 94 small ones;
  - 0.6 % of same-variant pairs sat inside their repeat gap.
- `place` with a stand-in ground placed 3 of 7 points:
  - it skipped a floor, a water hit and a missing template;
  - it planted one point on the retry after a first miss, and missed one twice;
  - it set the flags and made two 64-stud cells with SLIM.
- Run in Studio: queued as live test L14 (2026-10-19), result pending.

## Judge

- **Counts:** `missed` near 0 once terrain has settled. A high `skipped.role` means the plan covers
  built areas.
- **Batching:** the scatter adds about one mesh group per variant and look. Read `drawGroups` from
  the audit in [`verification.md`](verification.md).
- **Eye:**
  - no shape repeated side by side;
  - no rock floating on a slope (raise `sink`);
  - no bush through a floor;
  - the landmark still reads from spawn;
  - leaf edges free of dark fringes at distance (DatBoiEle [00:04:37]).
- **Play:** client draw calls before and after in a playtest (P11). Walk through a bush with
  collision off.
