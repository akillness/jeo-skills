# Expert notes: scenario-unreal-world-building

Principles and judgment by source, with timestamps. Distilled from `notes/world-building/`,
`notes/pcg/`, `notes/editor/` and the terrain notes in `notes/materials/`, plus
`sources/unreal-version-deltas.md`. [added] marks this skill's own reasoning. Disagreements carry
their deciding condition at the end.

## Sam Deiter, Epic, "Building Open Worlds in UE5" (EEf07ggFWRw, UE 5.1)

- Use the Open World template; hand-built setups miss checkboxes with cascading bugs [00:20:40]; the
  tools are a set (WP, OFPA, HLOD, Level Instancing, Data Layers, VSM, VT, Nanite) [00:35:59].
- Grid values are centimeters: 25,600 = 256 m cells, 76,800 = 768 m range in the template [00:14:57]
  [00:15:32].
- Streaming Source component where the player teleports, target grid named to match
  [00:16:39]-[00:19:31].
- Level Instance for content that changes with gameplay, Packed Level Actor to render static sets
  fast (37 rocks collapsed to ISM copies) [00:28:50]-[00:34:17].
- One HLOD layer per content family (foliage, roofs, walls, river stones); per layer decide material
  cost ("do we need a roughness map") [00:41:13] [00:42:18].
- Data Layers are also a platform scalability lever (Matrix Awakens rooftops) [00:06:41].
- Runtime hash legend: failed-to-load usually means cook or grid setup [00:46:37].
- [added from our U1 GREEN run, 2026-09-24] Z scale is derived from the heights you export, never
  from a declared relief: a 250 m relief on paper reached 314 m on the blockout and clipped 123,356
  pixels at Z 100. Z = span cm / 512 (Landscape doc), actor Z at the span midpoint, then a
  0-clipped-pixel gate.

## Epic docs, World Partition, OFPA, Data Layers, Level Instancing, HLOD (UE 5.8)

- One runtime grid; more grids hurt performance (Runtime Grid Settings). Level Blueprint references
  force Always Loaded (Using World Partition with Blueprint).
- Runtime Data Layers cost streaming when widely used assets sit in many of them; Editor Data Layers
  are free organization (Performance Concerns; Data Layer Type).
- Level Instances default OFPA and Embedded; non-OFPA instances level-stream at extra cost; Embedded
  loses non-OFPA actors such as the embedded World Settings; breaking cannot be undone.
- HLOD: Instancing for foliage, Merged Mesh for static dressing, Simplified when a single proxy is
  needed; Parent Layer chains; actors must be Static; rebuilds skip unchanged sources. Use Landscape
  Culling drops buried triangles; Merge Equivalent Materials can artifact with world-position color;
  Simplified Merge Distance closes doors and windows (Unresolved Geometry Color shows them); Allow
  Distance Fields off on far-only proxies saves memory; small Override Spatial Sampling Distance on
  large geometry costs a lot of memory (Mesh Merge and Proxy Settings). Hierarchical LOD Coloration:
  sources green, proxies blue (Visualizing HLODs).
- Minimap display needs virtual texture support (Generating a Minimap).
- OFPA changelists are submitted from the editor (partial submits leave dangling references).
- Commandlets: conversion (`-ReportOnly`, `-ConversionSuffix`, never `-DeleteSourceLevels` here),
  HLOD builder (`-SetupHLODs`, `-BuildHLODs`), `DataLayerToAssetCommandlet`, custom
  `UWorldPartitionBuilder` jobs.

## Epic docs, Landscape technical guide, materials, edit layers (UE 5.8)

- Valid sizes from quads per section, sections per component and component count; recommended table
  (2017 = 63 quads, 2x2, 256 components). Max 1024 components; each component costs render-thread
  time and each section is a draw call; 2x2 beats more 1x1 components.
- Z scale 100 = +/-256 m; Z = meters x 100 / 512 (Mauna Kea 821.68).
- Edit layers: Base, Sculpting Details, Paint Details, Splines, Patches; 8 by default; Splines and
  Patches layers are procedural only. Collapse All Layers is destructive.
- Material: layer names match target layers with Layer Info; a missing one weighs 0 forever;
  all-height-blend layers give black spots and invalid normals; keep Opaque and wire Opacity Mask so
  only hole components go masked (free with Nanite landscape); per-component instances discard
  unused layer subtrees; 4 layers per weightmap; mobile 3 layers, ES3.1 16 samplers.

## CD Projekt RED (Max) and Epic (Hugh), Runtime PCG in the Witcher 4 demo (icIFFlOyob4, UE 5.6, base PS5)

- Tiering: hero and key areas hand-placed, medium assets pre-baked with an offline PCG tool working
  on tiles, grass at runtime because "there are more grass instances here than all other foliage
  combined" [00:04:23]-[00:07:05].
- Hierarchical grids: unbounded (parameters, CPU, one-off), 128 m (landscape heights and grass
  maps), 32 m (scatter). Reading the landscape on the unbounded cell loads it all; on the finest
  cell repeats overhead [00:08:04]-[00:11:17].
- Two grass rings: dense to 128 m on 32 m cells, sparse to 256 m on 128 m cells with fewer, slightly
  larger instances; min and max draw distances hand over; far edge recolored to ground color
  [00:14:44]-[00:16:36].
- GPU graphs: yellow arrows mark uploads and readbacks; GPU backend on the Static Mesh Spawner, HLSL
  instead of the CPU Surface Sampler, Skip Readback to CPU, hoist parameter uploads to the unbounded
  grid [00:21:03]-[00:23:50]. Landscape heights cost about 0.5 ms game thread per 32 m cell; layer
  weights are not available on GPU; height RVT needs warm-up; 5.7 generates a height texture without
  VT [00:24:12]-[00:25:49].
- Budget 2 ms, lowered in the village, paused in the marketplace sequence; PCG subsystem 180 us
  average; GPU 71 us on generating frames; 10k to 20k instances per tile [00:26:24]-[00:30:59].
- Latency, not frame time, causes pop-in; balance camera speed, radius, cull distance, budget;
  record video, step frame by frame; Test and Shipping generate faster than Development
  [00:27:10]-[00:28:16].
- Placeholder entries keep order-keyed streams alive [00:12:42]; fuzz GPU memory regularly
  [00:33:02].
- Grass painting stays in landscape grass types set up with no meshes; Generate Grass Maps reads
  them because layer weights are not on the GPU; grass-map values bias the random layer pick so
  overlaps blend [00:13:36] [00:18:05] [00:24:12].
- Teleports make latency worse than continuous paths; a PCG generation source component can start
  generation at the target, not yet used much in production [00:36:44].

## Matt Oztalay, Epic, PCG introduction and production best practices (TbNZ4GKaTow, UE 5.7)

- "A tool to make tools to build worlds"; authored like materials: parameters, Graph Instances,
  overrides [00:01:28] [00:12:18].
- First graph on screen: Get Landscape Data > Surface Sampler > Attribute Filter (Grass > 0.5, Warn
  on Data Missing Attribute on) > Transform Points (yaw +/-180, scale 0.75 to 1.25) > Static Mesh
  Spawner [frames 00:10:47, 00:11:58]; exclusions with Spline Sampler > Extents Modifier into
  Difference [frame 00:14:55].
- Is Partitioned "pretty mandatory"; partitioned + hierarchical + runtime "can completely replace
  landscape grass types"; Treat Editor Viewport as Generation Source or nothing shows [00:22:34]
  [00:23:08] [00:23:40].
- Generate On Load means cook; tracking is editor-only; runtime generation is triggered explicitly
  and not stored on disk [00:24:13] [00:25:17].
- GPU-only instances are absent from the Lumen scene: small things only [00:24:45].
- Builders on CI or Horde; do not check in all generated content; preview locally, build centrally,
  HLODs after [00:26:23] [00:29:07].
- Assemblies: Level Instance > PCG Data Asset > Copy Points > spawner; tags become attributes
  (`name:number` values), set them with a widget and a fixed vocabulary, never typed
  [00:15:00]-[00:17:12] [00:29:42]; LEGO's STL tag snaps only tagged actors to the landscape
  [00:35:48].
- Shape grammar on splines (end, repeated modules, end) for fences and corridors [00:18:51];
  recursive pathfinding: each found path joins the goal set, so the next house connects to the
  nearest path, then the spline carves it [00:19:25]-[00:21:09].
- Taxonomy first and loud failures: Warn on Data Missing Attribute is on in the demo filter [frame
  00:10:47] [00:32:26].
- Construction-script scatter with collision: 170,000 bodies, 7-minute map open; use PCG [00:30:49].
  Decide what stays manual [00:32:26]. Copy Biome Core into the project [00:34:39].

## Epic PCG team, Advanced topics 5.5 (j3ke6MmcaeY)

- Data-driven kits: Level Instances carry module info, a module table exported to a PCG Data Asset,
  grammar strings on splines (`[ ]`, `{A:w, B}`, `*`, `+`) [00:04:54]-[00:15:14].
- Raycast placement without landscape needs spawner collision on [00:17:30]; Select Points fixed
  count for predictable totals [00:19:44]; one-to-one Copy Points [00:11:38].
- Bake procedural geometry once to Nanite static meshes [00:33:06]; GPU direct instancing: 5 million
  Nanite instances in under a second, no ray tracing on them [00:39:41] [00:45:08].

## Epic docs, PCG overview and node reference (UE 5.8)

- Density is a probability; `$` for built-in properties; spawner weights normalize over the sum (the
  overview states it inverted).
- Branch culls, Select does not; Density Filter and Distance are the efficient specialized nodes;
  Mesh and Volume Samplers are costly; Copy Points cost grows with attribute inheritance; Apply On
  Object changes are not reverted; Spawn Actor Attached streams with the parent, In Folder does not.
- Spawned actors inherit the PCG actor's Data Layer and HLOD Layer: assign the volume before
  generating, or baked forests miss the HLOD plan.
- Distance is the node for scaling or thinning trees at forest edges and near streams (supersedes
  Distance to Density).

## Sam Dark, Unknown Worlds, Subnautica 2 lessons (AalP65lrtpo, shipped 5.6)

- "Work with the engine, not against it"; prefer engine tools, extend them [00:12:16] [00:36:02].
- Runtime procedural resources gave players nothing ("3 ft to the left you're not going to notice")
  and were invisible in the editor, landing on dressed art [00:07:56]; overnight generation
  introduced bugs [00:10:40].
- WP and OFPA from day one at 100,000 actors; editor slowdowns found with Insights in the editor
  [00:19:20] [00:19:52].
- Moved the map with scripts, never Outliner drags; builder commandlets region by region [00:20:23]
  [00:20:55]. Data Layers underused for reworks [00:21:26].
- Gameplay data on meshes through Asset User Data, not 100,000 Blueprints, read component > root
  component > root mesh; aggregate ticks above 10 to 15 instances [00:23:04] [00:27:49] [00:28:22].
- Validators for Blueprints and data assets are quick to write and enforce what documents only
  request [00:23:04].
- Daily performance tour: scripted screenshots and traces per location, spikes traced to a
  changelist within a day [00:23:36]-[00:24:42]. Seams: MeshBlend (third party) where RVT, decals
  and skirts failed [00:13:44]-[00:15:51].

## Epic senior technical artist, Nanite Tessellation guide (6igUsOp8FdA, UE 5.4)

- Construction decides size: 250 MB vs 12 MB; porous interiors, hard-edge splits, seams and noisy
  vertex colors stop simplification [00:02:46]-[00:08:04].
- Tessellation is fully dynamic and costlier: use it for layered blending, massive repetition,
  landscapes [00:13:19]-[00:14:56].
- Audit construction in Triangles and Clusters views while dollying: a good asset swaps clusters, a
  bad one barely changes [00:05:52]; rebuild a porous kitbash rock wall as a connected base with a
  tiling texture [00:03:19]-[00:05:32].
- No collision: center 0.5 on ground, 1 on vertical rock; normalize heights 0..1, remap per layer
  with magnitude and offset; per-layer magnitudes (grass small, rock large), never one magnitude for
  all [00:20:46]-[00:26:52]; walk a character over displaced ground and rocks [00:21:19]. Dicing
  rate 2; worse below and above about 5 or 6 [00:29:53] [00:30:26].
- Foliage overdraw: opaque leaves and hidden blockers three or four trees deep [00:33:40]
  [00:35:17].

## Quixel team, Epic, Future of Nanite Foliage (aZr-mWAzoTg, UE 5.7 Experimental)

- Opaque modeled foliage [00:01:46]; Nanite Assemblies cut asset size to 5 to 10% [00:07:13], with
  more branch variants per zone since instances store only transforms [00:05:35]; wind on skeletons
  with a few hundred to 1,000 bones, tighter bounds than WPO [00:09:17] [00:09:51]; voxels keep
  volume where impostors do not [00:12:16]; whole forest scattered with PCG [00:14:52].

## Epic docs, Nanite overview (UE 5.8)

- Enable wherever supported; Opaque and Masked only; no distance culling, lighting channels,
  forward, MSAA; clamp WPO; 16 million streamed instances hard limit; skip lightmap UVs in Lumen
  projects. Per-instance cull distance and Min Screen Radius do not thin Nanite content (Rendering);
  Looman adds min/max draw distance and Cull Distance Volumes.

## Unreal Sensei, landscape material (5ju7wyvZGBI, UE 5.3)

- Mannequin in frame for every scale decision [00:25:10]; landscape grass only for small
  collisionless detail, trees by foliage tool or PCG [00:54:16]; RVT blending grounds props
  [00:45:01]; specular 0.02 on all layers against plastic grass [00:11:12]; anti-tiling per layer by
  Distance Blend or Cell Bombing (costlier, not everywhere) [00:11:46]-[00:14:30]; triplanar only on
  the cliff layer [00:15:36]; height maps HDR Compressed [00:31:32]; patches: Blend Mode Max, Zero
  Height Meaning Landscape Z [00:43:52]; RVT needs virtual texture support and padded volume bounds
  [00:47:11] [00:49:25].

## Epic Mesh Terrain team (QJwTTmNez3k, UE 5.8 Experimental)

- Heightmaps cannot do overhangs, tunnels, non-uniform resolution; one landscape works up to about
  8K x 8K [00:03:21]. Mesh Terrain matched Fortnite landscape performance but is Experimental, no
  RVT in 5.8, production target late 2027, artifacts built outside cook and checked in [00:38:50]
  [00:43:54] [00:45:46].

## Joel Burgess and Nate Purkeypile, Bethesda, Fallout 4 modular design (QBAM27YbKZg)

- Footprint = maximum extent; inset non-tiling edges; pivots frozen; one single and one double door
  width for all kits [00:06:14]-[00:08:23]. Core first, variants next, hero last; designers prove
  custom art with placeholders [00:22:34]-[00:27:54]. Granular pieces plus prefabs; plug and socket;
  swappable destruction halves [00:18:04] [00:44:37] [00:45:11].

## Ben Cloward, Terrain Shaders (materials notes, 2025-2026)

- Plan layers per chunk and push local effects (roots) to decals, which cost only where placed
  [-UZlUUQSGgQ 00:05:55]. Base layer Alpha, others Height; layer names from the Paint tab
  [0L5Azq6ugyo 00:12:33] [00:15:20]. RVT caches the heavy landscape shader, sized to the area that
  matters [ucuSaiDuqiM 00:21:05].

## Ari Arnbjörnsson, Epic, studio setup (102O0FOEzNY) and editor docs

- Validate only the submitted assets before commit; zero warnings; resave after upgrades with
  ResavePackages [00:10:13] [00:24:51]. Case-insensitive Perforce, typemap first; OFPA needs
  Perforce changelists (source control doc). Naming: pick Epic's (`SM_`) or Allar's (`S_`) prefixes
  once; fix redirectors before deletes.

## Disagreements and deciding conditions

- **Landscape vs Mesh Terrain:** Landscape unless the design needs overhangs or tunnels and the team
  accepts Experimental risk (QJw).
- **Grass source:** landscape grass types for small projects (Sensei); runtime GPU PCG for dense or
  custom distribution (Witcher 4, Oztalay); 5.8 puts GPU scatter in the landscape-grass performance
  range (rn58).
- **Trees:** persistent placement when collision or far visibility matters (Sensei; CDPR pre-bake);
  runtime only for dense collisionless detail.
- **Foliage rendering:** Nanite Foliage (Experimental) on Nanite platforms with experimental
  tolerance; otherwise opaque modeled foliage with blockers; mobile keeps cards and LODs.
- **Tessellation:** Sensei presents Nanite landscape displacement as nearly free; the Epic tech
  artist says pick where it earns its cost. Trust Epic and measure.
- **Runtime vs baked generation:** runtime for dense, collisionless, visual detail where disk
  matters (Oztalay); baked for gameplay or anything designers must see (Dark).
- **Where generation runs:** build machine only for deterministic, validated graphs with a local
  preview (Oztalay); else editor generation and commit (Dark's overnight bugs).
- **Seams:** RVT blending on landscape-dominant worlds with few prop types (Sensei); screen-space
  blend (MeshBlend, third party) for high-contrast mesh-to-mesh contacts (Dark).
- **Granularity:** granular during layout, packed (Packed Level Actors, HLOD, Nanite) for runtime
  (Fallout 4, WP doc).
- **PCG frame budget:** engine default 5 ms vs 2 ms in the demo: decided by camera speed and
  gameplay CPU load.
- **Grass ring handover on Nanite:** the Witcher 4 demo ran Nanite grass with min/max draw distances
  between rings; the Nanite doc and Looman say distance culling and draw distances do not apply to
  Nanite. Until the first run shows which holds in 5.8, plan ring edges by generation radius and
  verify frame by frame.
- **Landscape specular:** 0.02 (Sensei) vs 0.5 with cavity occlusion (Cloward): the materials owner
  decides under final lighting.
