# Expert notes: environment building and lighting

Claims grouped by topic, each with its source and timestamp, then what Studio 0.743 showed when this
skill tested it ("Live", 2026-10-18 and 2026-10-19, code in [procedures.md](procedures.md)). Full
source list: [sources.md](sources.md). Lines marked [added] are this skill's own synthesis.

## Graybox and layout

- **Jalapeno, Roblox Learn (T--CNfkfBBQ).**
  - Start with the folder tree: `map_geo`, then areas, then kinds [00:02:01].
  - Underscores, not spaces, in folder names so code can reach them [00:02:35].
  - One grid MaterialVariant at StudsPerTile 8 for every graybox part [00:02:35].
  - A cottage is a cube and two wedges; a lantern is a post plus a Neon part [00:03:21 to 00:04:26].
  - The ground color must differ from walls and terrain so the path reads [00:08:13].
  - Acceptance: a legible route through vista points, landmarks visible, doors and ceilings
    oversized for a third-person camera [00:06:13 to 00:09:49].
  - Live: `Graybox.house` and `lantern` build exactly this: 67 parts for three houses, two ground
    slabs, a tower and 11 lanterns.
- **Creator Docs, graybox tutorial.** Doorways and halls at least 10 studs wide, walls at least 10
  studs tall, so two avatars pass and nobody jumps a wall.
  - Live correction: the tutorial cites a jump height of 5 studs; the Humanoid default is JumpHeight
    7.2. A 10-stud wall still holds.
- **Gino Roy, RDC 2024 (vWx8UTxsi0A).** Compose the first view from the spawn and time the walk to
  each landmark [00:11:49, 00:12:21].
  - Live: the place template's SpawnLocation faced away from the village, so the first view was a
    hillside. Straight-line walk times were 5.8 s to House_West, 8.2 s to House_North and 11.3 s to
    the tower at WalkSpeed 16.
  - Live: a playtest `character_navigation` walk into House_West through its door took 7.3 s and
    arrived inside.
- **RoBuilder (eRnnjqVOq7c).** Plan big maps in order: reference, asset list, full-size base plate,
  height layers, pink placeholders for landmarks only [00:03:02 to 00:06:16, placeholders 00:05:20].
- **BONES (EAtKeffHRRI).** Keep whole-stud sizes and zeroed orientations, and build next to a rig
  for scale [00:02:27, 00:07:33].
- **Coke (MdyCUSaCDr8).** Do not detail what the camera never sees [00:09:13].

## Parts, unions and collision

- **Kaiwala (Ahn2P_4TDrU, March 2025).**
  - Parts are cheapest: two triangles per face, nothing to download [00:26:57].
  - Each distinct union is its own mesh and collision asset; duplicate one union rather than
    rebuilding it [00:20:40].
  - Default collision can close a hole players should fall through; switch to
    PreciseConvexDecomposition, or Hull and Box when cheaper [00:01:54, 00:02:28].
  - Far from the origin (61,000 studs in his map) parts drift and gaps open [00:08:32].
- **Kaiwala (x9jg8kjH3Vs, August 2025).**
  - "Never using unions to cut holes": cut axis-aligned openings with resized parts [00:04:41,
    00:05:13].
  - The 2025 CSG engine makes fewer triangles, but only for new operations [00:12:41].
- **Creator Docs, solid modeling and collisions.** Use `GeometryService` async methods; results
  above 20,000 triangles are simplified; pick fidelity by how players touch the shape.
- Live (P5):
  - A 10 by 10 doorway cut with `GeometryService:SubtractAsync` stayed open under Default and
    PreciseConvexDecomposition, and closed under Hull and Box (ray and character-sized probe).
  - Each subtraction took 14 to 16 ms and produced 28 triangles.
  - `GetPartBoundsInBox` reported every union doorway blocked, because it tests bounding boxes.
    `GetPartsInPart` and a ray gave the true answer.
  - A `CollisionFidelity` write read back as the old value until the next yield.
  - `EnvAudit` flags a union with Hull or Box that carries an `Opening` attribute
    (`opening-filled`).

## Terrain

- **BONES (-DoOf32pkPo).**
  - Block out with wedges and blocks, convert with Part to Terrain, then normalize with Sculpt,
    Smooth, Flatten and Paint [00:04:34, 00:09:57].
  - Part to Terrain takes blocks, wedges, cylinders and balls, not unions [00:02:13].
  - Water behaves like glass: decals and particles under it vanish when not fully visible
    [00:24:02].
  - Final pass: check the Atmosphere and the terrain colors together [00:25:11].
  - Live (P13): four shapes converted (308 cells added, 1,647 smoothed). The 8-stud log came out
    about 4 studs high by voxel read. A ray with no retry missed; retried, it hit at 2.7.
- **SmartyRBX (CippiATeZ54, 2023).**
  - Paint LeafyGrass where grass blades would poke through parts [00:01:40].
  - Paint steep sides with Basalt or Rock, and brighten them through the terrain material color
    [00:02:44].
  - One variant per terrain material: duplicate the Grass variant and set its base to LeafyGrass;
    use the Organic pattern on terrain [00:05:13, 00:05:47].
  - Live: grass decoration grew through every floor and the spawn pad set on Grass terrain.
    `TerrainKit.paintUnder` now repaints Grass as LeafyGrass under floors and paths.
  - Live: the default Basalt material color (30, 30, 37) made the overridden hills near black;
    `SetMaterialColor` fixed them, which matches his color advice.
- **Creator Docs, Terrain reference.** Region calls take resolution 4, grid-aligned regions and at
  most 4,194,304 voxels.
  - Live: `WriteVoxels` on 1040 by 256 by 1024 studs failed with "Region is too large". `FillRegion`
    with an unaligned region did not error.
  - Live: a `FillBlock` with its top at y 0 left the walkable surface at 1.87 (Rock) to 2.0 (Grass).
    The surface sits at the top filled voxel's center plus 4 times its occupancy [added model,
    matched live within 0.01 stud].
  - Live: a raycast right after `WriteVoxels` can miss; wait a frame. In P13 a ray cast right after
    four fills returned nothing, so the kit reads heights from the voxels (`TerrainKit.surfaceY`).
  - Live: the first `paintUnder`, built on `Terrain:ReplaceMaterial` over each floor's region, left
    blades on the spawn pad and Grass under the plaza. A one-column `ReplaceMaterial` worked in a
    later run; the cause was not found. The kit now reads and writes the voxels and counts what it
    changed.

## Materials

- **Creator Docs, materials.** Parts link to a variant by name and base material; a rename breaks
  the link silently. Terrain uses a variant only through `MaterialService` overrides.
  - Live: renaming a variant left 10 parts on the plain material; `MaterialKit.links` and `EnvAudit`
    (`variant-missing`) find them.
  - Live: a Basalt variant changed nothing until `SetBaseMaterialOverride`.
  - Live: `GetBaseMaterialOverride` returns the material's own name when nothing is set, and ""
    after an explicit "".
  - Live: `MaterialService.<Material>Name` is file-only for scripts ("not a valid member"); the
    override set in the place file read back as "FileGrass".
- **BONES (5DxfMG-kDfw).** Roblox wants OpenGL normal maps; a variant with a BaseMaterial overrides
  every part of that material once set as the override [00:06:10, 00:08:04].
- **Roblox Studio in a Minute (MWAIZuV70EQ).** Re-assign the variant after changing its base
  material [00:01:34, 00:03:43]. The 1K texture limit it mentions is now 4K.

## Lighting: order of work

- **RingWorld (UlvSrWHESwA).** Write the mood first, then set ClockTime (14 for a happy day), then
  Lighting, Atmosphere, post effects and sound [00:01:06, 00:01:58].
- **DatBoiEle (aq0Fi0R2FAY).**
  - Decide the scenario from references; warm light, cool shadow [00:00:00 to 00:01:38].
  - Aim the sun before any setting, with the Sun Adjuster plugin [00:02:11].
  - Ambient tints shadows, ColorShift_Top tints light [00:03:38]; lowering EnvironmentDiffuseScale
    raises contrast [00:05:48].
  - Frames of his first scene: Ambient about [0, 89, 145], ColorShift_Top about [223, 190, 28],
    EnvironmentDiffuseScale 0.45, OutdoorAmbient a neutral [70, 70, 70] [00:06:23, 00:07:08].
    Afternoon is subtle, sunset strong [00:03:38].
  - Bloom recipe, repeated in both scenes: Threshold very low (about 0.03), Size very high, then
    Intensity lowered to taste. It reads as a soft blend over the frame, not a glow on neon
    [00:07:37, 00:18:29].
  - His frames show Intensity 1, Size 24 and Threshold near 0 before he pulls Intensity back; the
    final Intensity is not shown [00:07:41, 00:18:44].
  - Color correction in 0.05 steps, Contrast 0.1 as an example [00:08:09].
  - Glass with CastShadow on blocks the sun shaft [00:09:16].
- **Develuper (vkEXLmRAQgs, 2026).** Realistic first; Atmosphere Density 0.3 to 0.4 with Offset 0;
  color correction last, for contrast [00:00:27, 00:01:04, 00:02:16].
- **BONES (6zSe8cuBB_I, 2025).** Soft and Realistic replace Technology; Soft for stylized outdoor
  and mobile, Realistic for PBR interiors [00:00:17, 00:01:06]. Raise Editor Quality Level to judge
  in Studio [00:03:09].
- Live:
  - At the template's latitude 41.7 and ClockTime 14, the sun sat toward +Z, behind the village seen
    from spawn, so every wall showed its shadow side. `Looks.aimSun` searched about 9,000 time and
    latitude pairs in 12 ms and aimed within 1 degree.
  - Soft and Realistic differed little outdoors (client draw calls 134 Realistic and 146 Soft; 126
    to 146 across three runs). Soft without PrioritizeLightingQuality rendered brighter with lighter
    shadows.
  - ShadowSoftness changed Soft captures about as much as Realistic ones, although the lighting doc
    ties it to Realistic.
  - Bloom at Intensity 3 and Threshold 0 changed an Edit capture by 0.012 mean luma; two captures
    with no change differed by 0.013 (wind on the grass). A gray ColorCorrection took saturation
    from 0.42 to 0.
  - Script clamps: light Range 120; Atmosphere Glare and Haze 10, Density and Offset 1;
    ShadowSoftness 1. Brightness, ExposureCompensation, Bloom Size, ColorCorrection and SunRays take
    any value.

## Night

- **BONES (zAoY8pxJM9c).** Dark corridor: lights halved and tinted to the walls, black Atmosphere
  Color and Decay, Density 0.495, Offset 0.25, Glare 0, Haze 5, environment scales 0,
  ExposureCompensation -0.4 [00:02:11, 00:03:15 to 00:06:04]. The speech says Glare and Haze "5 or
  10"; the frames show 10 first, then Glare 0 and Haze 5.
- **RingWorld (UlvSrWHESwA).** Outdoor night: lower Brightness, darken Ambient, drop glare, tint
  toward blue, and add a near light plus a far light with more range [00:06:44 to 00:07:54].
- Disagreement and deciding condition: does the player need the skyline?
  - Live: BONES' recipe applied outdoors (`night_horror`) turned 96 to 100 % of the far views black,
    which suits a corridor horror game.
  - Live: the tuned `night_outdoor` kept crushed pixels at or under 2.5 % in every view, so routes
    and silhouettes stay readable.

## Interiors

- **BONES (zAoY8pxJM9c).** Window-lit room: Brightness 44, black ambients, environment scales 0, sun
  about 45 degrees into the room [00:06:14]. Fake the bounce with a PointLight [234, 255, 254],
  Range 50, Shadows on, near the window [00:07:14]. Parts above Transparency 0.75 lose their shadow
  [00:02:44].
- **Gino Roy (vWx8UTxsi0A).** Two or three placed bounce lights where light enters, never everywhere
  [00:20:45].
- Live (P9, glass at Transparency 0.6):
  - The sun patch reached the floor with glass CastShadow off (clipped 0.098).
  - With CastShadow on, the patch went (clipped 0.061, the rest is the bright exterior).
  - The fake GI light raised the room's mean luma from 0.22 to 0.61.

## Streaming (settings owned by scenario-roblox-performance, per-model modes by scenario-roblox-architecture)

- **Andrew, Roblox Learn (Wwj8EkMWFhI).** SLIM for static models; StreamingMesh only with
  TargetRadius 1,000 or more; Persistent ignores StreamingMesh [00:02:23, 00:03:24, 00:04:27].
- Live (P11): at join, Persistent models 600 studs away existed on the client while Default and
  Atomic ones did not (TargetRadius 256). `RequestStreamAroundAsync` brought them in 0.066 s.
- Live: streaming radii and integrity mode are file-only for scripts; Rojo writes them and Lune
  reads them back.
- Streaming techniques doc: test at TargetRadius 64, walk and teleport across the map, revisit, and
  watch Output for `attempt to index nil with`. The test this skill runs is in
  [`verification.md`](verification.md).

## Agreements

- Block out first with plain shapes, judge from the player camera, then replace (Jalapeno, BONES,
  RoBuilder, Gino Roy).
- Parts before unions for anything axis-aligned (both Kaiwala videos, docs).
- One main color story across Ambient, Atmosphere and color correction (RingWorld, DatBoiEle,
  Develuper).
- Sun direction first, post effects last (DatBoiEle, RingWorld, BONES).

## Disagreements and deciding conditions

| Topic                        | Positions                                                                                                                       | Deciding condition                                                                                                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Unions                       | "Fine in moderation" (Ahn2P_4TDrU) versus "use parts where possible" (x9jg8kjH3Vs)                                              | Large or mobile maps: parts and meshes; prototypes: unions are fine                                                                                                |
| Terrain or meshes for ground | Terrain plus overrides (SmartyRBX, BONES) versus PBR rock meshes (Coke)                                                         | Walkable ground with cheap collision: terrain; hero screenshots: meshes                                                                                            |
| Soft or Realistic            | Soft for stylized and mobile, Realistic for PBR interiors (BONES 6zSe8cuBB_I); Realistic first (Develuper)                      | Target devices and material style; live, the outdoor difference was small                                                                                          |
| Dark night                   | BONES' black Atmosphere versus RingWorld's readable blue night                                                                  | Does the player navigate by the skyline?                                                                                                                           |
| Light count                  | "As many as necessary" (Gino Roy) versus two or three bounce lights (same talk) and device budgets                              | Device class; send counts to scenario-roblox-performance                                                                                                           |
| Bloom threshold              | About 0.03 with a large Size and low Intensity (DatBoiEle); the kit's looks use 0.9 [added], so only lamps and bright sky bloom | A soft painterly blend over the whole frame: low threshold. Glow only on lights and neon at night: high threshold. Judge both in play, not in Edit captures (live) |
| Collision on foliage         | Off for decoration (Collisions doc) versus kept on large rocks and trunks                                                       | Does the shape guide the route? See [`foliage.md`](foliage.md)                                                                                                     |
| LevelOfDetail                | SLIM as the sweet spot versus Disabled for the biggest saving (Andrew, Wwj8EkMWFhI [00:02:23, 00:03:51])                        | Silhouettes seen across the map: SLIM, checked in a published build; small props: Disabled                                                                         |
