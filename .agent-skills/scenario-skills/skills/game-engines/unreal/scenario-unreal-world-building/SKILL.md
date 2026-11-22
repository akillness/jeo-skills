---
name: scenario-unreal-world-building
description: 'Use when building or fixing an Unreal Engine 5 level or open world: World Partition, OFPA, Data Layers, Level Instances, Packed Level Actors, HLOD, landscape size, heightmap import or clipping, edit layers, terrain material rules, foliage and grass, a PCG forest or rock scatter, runtime GPU grass, Nanite and tessellation choices, modular kits, a river or village, streaming pop-in, cells not loading, landscape black spots, "PCG shows nothing in the editor", or a world too heavy to hand to lighting.'
license: MIT
---

# Unreal world building (levels, open worlds, landscape, PCG)

Expert level here means a world sized by rule, placed by tier of importance, streamed and budgeted
from the first map, and changed by script region by region, never by hand-selecting thousands of
actors. The environment artist decides what stays manual, what is baked and what is generated at
runtime, then proves every choice with a count, a trace or a screenshot. If a sibling skill named
here is missing from your available skills, load it with `skill_get` (Scenario MCP) or ask the user
to install it (https://github.com/scenario-labs/skills#install); unattended, proceed from tool
schemas and flag the gap.

**REQUIRED BACKGROUND:** scenario-unreal-expert (channels, review loop, 5.8 traps). Toolkit:
[`scripts/ue_world.py`](scripts/ue_world.py)
(`sys.path[:0] = ["<skills>/scenario-unreal-world-building/scripts", "<skills>/scenario-unreal-expert/scripts"]; import ue_world as W`)
with `ue_run`, `ue_review`, `ue_audit`, `ue_stat`. **Not yet run in Unreal:** the offline layer
passed `tests/code/unreal-world-building/test_world_offline.py`; [verify] names are resolved by
`W.probe()`. A written plan names the engine call behind each `W.*` step (procedures P0 table).

## Stance (the expert delta)

- **Start from the integrated setup, then measure.** File > New Level > Open World gives World
  Partition, OFPA, Data Layers, HLOD and outdoor lighting: "just use the template" (Sam Deiter,
  EEf07ggFWRw [00:20:40]). One runtime grid: more grids "can negatively impact performance" (World
  Partition doc). WP and OFPA from day one held 100,000 actors (Sam Dark, Subnautica 2, AalP65lrtpo
  [00:19:20]).
- **Place by tier of importance.** Hero assets and key areas by hand; shrubs to trees and rocks
  pre-baked; only grass-class detail generated at runtime on the GPU (CD Projekt RED and Epic,
  icIFFlOyob4 [00:04:23]-[00:07:05]). Collision and far visibility force persistent placement
  (Unreal Sensei, 5ju7wyvZGBI [00:54:16]). Bake what players do not perceive as varied; preview
  procedural output in the editor (Dark [00:07:56]). Decide what stays manual first (Matt Oztalay,
  TbNZ4GKaTow [00:32:26]).
- **PCG is authored like materials.** Template graphs with parameters, Graph Instances per use
  (Oztalay [00:12:18]); Is Partitioned is "pretty mandatory" [00:22:34]. Output inherits the PCG
  actor's Data Layer and HLOD Layer: assign them before generating (PCG doc). Grids: unbounded for
  parameters, 128 m for landscape reads, 32 m for scatter; every CPU to GPU transfer costs; layer
  weights do not exist on the GPU (icIFFlOyob4 [00:08:04] [00:23:16] [00:24:12]). Pop-in is
  generation latency, judged in Test builds [00:27:10] [00:27:44]. Bad data must be loud: Warn on
  Data Missing Attribute (Oztalay frame 00:10:47).
- **A landscape is sized, not picked.** Valid sizes (2017, 4033, never 2048), at most 1024
  components, 2x2 sections, edit layers (Landscape doc). Z scale and actor Z come from the exported
  heights (Z = span / 512, actor at the midpoint), never a declared relief: 250 m on paper reached
  314 m and clipped 123,356 pixels in our GREEN test [added]. The material contract, built by
  scenario-unreal-materials, is checked here: Opaque with Opacity Mask wired, one LB Alpha Blend
  base, a Layer Info per name (Landscape doc); triplanar only on the steep layer, anti-tiling on
  large layers, low specular (Sensei [00:11:12]-[00:15:36]).
- **Nanite by default, construction still matters.** "Enabled wherever possible" (Nanite doc), but
  porous kitbashes, hard-edge splits, seams and noisy vertex colors stop simplification: 250 MB vs
  12 MB, same look (Epic, 6igUsOp8FdA [00:02:46]-[00:08:04]). Distance culling does not apply to
  Nanite (Nanite doc). Tessellation has no collision: per layer, center 0.5 on ground, 1 on vertical
  rock; dicing rate 2 [00:22:58] [00:29:53]. Foliage opaque and modeled (Quixel, aZr-mWAzoTg
  [00:01:46]).
- **Streaming structure follows content.** One HLOD layer per family: Instancing for foliage, Merged
  Mesh for buildings, Simplified when merged is still heavy (doc; Deiter [00:41:13]). Level Instance
  when content changes with gameplay, Packed Level Actor for static sets [00:30:59]. Runtime Data
  Layers only for gameplay state (doc). Teleport targets need a Streaming Source and, for runtime
  PCG, a generation source (doc; icIFFlOyob4 [00:36:44]).
- **World-scale work is scripted, regional and validated.** Scripts, never Outliner select-and-drag;
  whole-map jobs as builder commandlets region by region (Dark [00:20:23] [00:20:55]). Builders
  generate, then HLODs; generated actors stay out of changelists (Oztalay [00:26:23] [00:29:07]).
  Rules that documents only request become validators (Dark [00:23:04]).
- **Kits are commitments.** Footprint is the maximum extent, pivots frozen, standard door widths,
  core pieces first, hero last (Burgess and Purkeypile, QBAM27YbKZg [00:06:14] [00:07:51]
  [00:22:34]). Village paths join the nearest built path (Oztalay [00:20:01]); fences follow a
  spline grammar [00:18:51].

## Establish first

| Input                                    | Changes                                                 | Default when silent                                                     |
| ---------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------- |
| Platform, frame budget                   | Nanite, foliage path, layers; PCG time, grass density   | PC and consoles, Nanite on, 60 fps (scenario-unreal-performance)        |
| Size, quad size, height source           | layout, Z scale, actor Z                                | `W.plan_landscape`, 1 m quads; Z fitted to the heights                  |
| Fastest traversal, teleports             | loading range, streaming and generation sources         | ask gameplay; recorded as unknown                                       |
| Terrain features, Experimental tolerance | Landscape vs Mesh Terrain; Nanite Foliage, PVE, FastGeo | Landscape; no Experimental feature for shipping                         |
| Manual vs procedural, source control     | graph scope, who commits generated PCG                  | hand: village layout, river, roads, hero areas; builders own generation |

## Workflow

Each stage is an `ue_run` job or a live call; code in procedures (P-numbers).

1. **Brief as a world spec** (P1), like `W.U1_EXAMPLE_SPEC`; `W.probe()` once per install. GATE:
   `W.check_world_spec(spec)["ok"]`, info findings answered.
2. **Map** (P2). `W.new_open_world_map(path)` from the template; old levels through
   `W.convert_args(..., report_only=True)` first. GATE: `W.wp_facts_check(W.world_facts())` clean;
   PIE screenshot with `wp.Runtime.ToggleDrawRuntimeHash2D`.
3. **Terrain** (P3, P4). DCC heightmap or the blockout `W.valley_heightmap`; `W.export_heightmap`
   fits Z and actor Z to the real range. Creation is one Landscape mode step (Location Z =
   `actor_z_cm`, Scale Z = `z_scale`) unless an MCP tool does it [verify]. Edit layers Base, Sculpt
   Details, Paint, Splines, Patches. River (Water Body River or a Splines-layer spline) before heavy
   painting. Then the landscape builder. GATE: `W.heightmap_clip_gate` empty (0 clipped pixels)
   before import; `W.landscape_facts()` matches plan, scale and location;
   `W.landscape_material_check` clean; Layer Debug, cliff close-up, grass in sun, mannequin at 2, 10
   and 100 m.
4. **Organization** (P5, P6). Editor Data Layers per family; HLOD layers from `W.hlod_plan`;
   Streaming Source components at teleport targets. GATE: `W.data_layer_check`, `W.hlod_actor_check`
   clean.
5. **Village and kits** (P7). `W.kit_piece_check`, `W.door_width_check`; houses as Level Instances
   or Packed Level Actors; clutter as tagged assemblies (`W.tag_actors`); paths by `W.village_paths`
   into landscape splines; fences by grammar strings. Version the map before breaking an instance.
   GATE: no kit errors; no z-fighting or obvious repetition from the paths.
6. **Nanite** (P8). `W.nanite_construction_check(W.obj_construction_stats(obj))` on DCC exports;
   `W.batch_nanite(paths, dry_run=True)`, read, run; `W.tessellation_check` with per-layer centers.
   GATE: no translucent Nanite mesh; Overdraw over the canopy; feet on displaced ground.
7. **Baked PCG: forest and rocks** (P9). Template graph (layer filter warning on missing data, slope
   density, Extents Modifier into Difference for paths, Distance thinning at banks, understory
   differenced against trees, Self Pruning, species table, collision on trunks only), checked by
   `W.pcg_graph_lint`; `W.spawn_pcg_volume(..., hlod_layer=, data_layer=)`. Debug one volume (D)
   first. GATE: `W.pcg_component_check` clean; counts against `W.expected_points`; top-down and
   gameplay-height shots, nothing on paths or curated areas.
8. **Runtime grass** (P10). `W.grass_rings()` (dense to 128 m on 32 m cells, sparse to 256 m on 128
   m cells, far edge recolored); mask from grass types without meshes through Generate Grass Maps; a
   placeholder in every asset array; editor viewport as generation source; landscape cache;
   `pcg.FrameTime` set. GATE: `W.runtime_grass_check` and `W.find_gpu_transfers` clean;
   `W.generation_lead_check` with latency measured on a Test build.
9. **Builds** (P11).
   `for name, args in W.build_pipeline(map, graphs): ue_run.run_commandlet(uproject, name, args)`:
   landscape, PCG, HLOD. GATE: exit 0 each; HLOD actors per layer counted; `W.changelist_check`,
   then submit from the editor.
10. **Review and handoff** (P12 to P14). `W.tour(...)` with `W.REVIEW_CONSOLE` passes,
    `ue_review.image_checks` on every shot, then look;
    `W.world_rules_check(W.world_census(), vocab)`; `W.budget_sheet`, `W.lighting_handoff`. GATE:
    critique rubric passes; nothing reported done without a capture.

## Numbers

| Value                   | Setting                                                 | Relative to / source                           |
| ----------------------- | ------------------------------------------------------- | ---------------------------------------------- |
| Landscape 2 km          | 2017 x 2017, 63 quads, 2x2, 256 of max 1024 components  | 1 m quads (Landscape doc)                      |
| Z scale                 | span cm / 512 x 1.02; actor Z at the span midpoint      | 16-bit heights (doc); headroom [added]         |
| Template grid           | cell 25,600 cm, range 76,800 cm                         | profile first (Deiter [00:15:32])              |
| PCG partition grid      | 25,600 cm                                               | PCG World Actor (Oztalay frame 00:23:16)       |
| Hierarchical grids      | unbounded, 128 m, 32 m                                  | runtime grass (icIFFlOyob4 [00:08:39])         |
| Grass rings             | dense to 128 m, sparse to 256 m                         | icIFFlOyob4 [00:15:30]                         |
| Instances per 32 m cell | 10k to 20k fine                                         | base PS5, 5.6 demo [00:30:26]                  |
| `pcg.FrameTime`         | 5 ms default; 2 ms in the demo                          | 5.6 notes; base PS5 [00:26:24]                 |
| Height upload           | about 0.5 ms game thread per 32 m cell                  | base PS5 [00:24:12]                            |
| Streamed instances      | 16 million hard limit                                   | Nanite doc                                     |
| Nanite construction     | 250 MB vs 12 MB, same look                              | 6igUsOp8FdA [00:02:46]                         |
| Nanite Assemblies       | 5 to 10% of asset size; 200 to 1,000 wind bones         | aZr-mWAzoTg [00:07:13] [00:09:51]              |
| Dicing rate             | 2; slower below 2 and above about 5 or 6                | 6igUsOp8FdA [00:29:53]                         |
| Displacement center     | 0.5 ground, 1 vertical rock, per layer                  | collision surface [00:22:58]                   |
| Terrain specular        | 0.02 (Sensei); 0.5 as a cavity-driven ceiling (Cloward) | 5ju7wyvZGBI [00:11:12]; 0L5Azq6ugyo [00:01:19] |
| Tick aggregation        | above 10 to 15 placed instances                         | Dark [00:23:04]                                |
| Mobile landscape        | 3 layers, 16 samplers                                   | ES3.1 (doc)                                    |

## Quality gates

- **Measurable:** the workflow checks (all `W.*_check`, `heightmap_clip_gate`, `pcg_graph_lint`,
  `find_gpu_transfers`); `ue_audit` on imports; builders exit 0; `stat unit`, `stat gpu` per
  viewpoint; PCG time in Insights on a Test build; `-trace=WorldStreaming`; `wp.Runtime.HLOD 0/1`
  A/B.
- **Visual:** runtime hash overlay without failed cells; Layer Debug without black spots; tiling
  against a mannequin; cliffs without stretching; no plastic sheen on grass in sun; feet on
  displaced ground; canopy overdraw; Hierarchical LOD Coloration and HLOD silhouettes; ring handover
  and pop-in on frame-by-frame video; nothing on paths, banks thinned; rocks grounded. Rubric:
  [`references/critique.md`](references/critique.md).

## Common mistakes

| Mistake                                                      | What it looks like                                     | Fix                                             |
| ------------------------------------------------------------ | ------------------------------------------------------ | ----------------------------------------------- |
| Z scale from a declared relief                               | plateaus and pits after import                         | fitted export, `W.heightmap_clip_gate`          |
| 2048 heightmap                                               | import refuses or resamples                            | 2017 or 4033                                    |
| All layers height-blended; layer without Layer Info          | black patches; layer never paints                      | base layer Alpha Blend; Layer Info, same name   |
| Second runtime grid                                          | streaming cost, no gain                                | one grid, HLOD for distance                     |
| Runtime Data Layers for tidiness; Level Blueprint references | hitches; actors always loaded                          | Editor Data Layers; Blueprint classes           |
| PCG volume without HLOD or Data Layer                        | baked forest missing at distance                       | assign both before generating                   |
| Runtime graph invisible in editor                            | artists see nothing                                    | Treat Editor Viewport as Generation Source      |
| Layer weights in a GPU graph                                 | empty grass mask                                       | grass types without meshes, Generate Grass Maps |
| Empty artist asset array                                     | grass streams collapse                                 | one placeholder per array                       |
| Cull or draw distance on Nanite                              | no thinning, rings do not hand over                    | HLOD, generation radius per ring                |
| GPU-only trees                                               | trees missing from Lumen                               | GPU-only for small things                       |
| One ever-larger grass radius                                 | instance explosion, visible edge                       | two rings, recolored edge                       |
| Porous kitbashed rocks                                       | huge assets, holes at distance                         | connected base, tiling texture                  |
| Construction-script scatter                                  | 170,000 bodies, 7-minute map open (Oztalay [00:30:49]) | PCG output, clutter collision off               |
| Generated PCG actors checked in                              | contention, stale data                                 | builders own generation                         |
| Select-all edits on a big map                                | editor stalls                                          | `W.region_batch` or a builder                   |

## Handoffs

- **Receives from scenario-unreal-pipeline-automation:** meshes passed by `ue_audit`, standard kit
  pieces, DCC heightmaps with their height range; construction failures go back (and to
  scenario-maya-expert, scenario-blender-expert).
- **Receives from scenario-unreal-materials:** the landscape instance and layer list (blend types,
  steep layer, anti-tiling), RVTs with bounds, grass type names, the rock RVT blend, opaque foliage.
  Specular is theirs; the world artist reports sheen from the sun capture.
- **Delivers to scenario-unreal-lighting-rendering:** the map, World Bookmarks or `tour_viewpoints`,
  `W.lighting_handoff` (template lights, GPU-only roles outside the Lumen scene, HLOD far-field and
  distance-field flags, Data Layer states).
- **Delivers to scenario-unreal-performance:** `W.budget_sheet` and the tour path.
- **Also:** scenario-unreal-gameplay (streaming and generation sources, Asset User Data, tick
  aggregation); scenario-unreal-pipeline-automation (world rules for its validators);
  scenario-unreal-cinematics (`pcg.FrameTime` pauses, icIFFlOyob4 [00:28:51]); scenario-unreal-vfx
  (water shading).

## UE 5.8 notes

- New WP maps use the runtime hash with partitions (5.4): read `world_facts()` before writing grid
  properties [verify].
- PCG on by default; PCG Python Data Processor, PCG Builder Volume; landscape cache opt-in since 5.6
  (runtime CPU reads fail without it).
- Edit layers mandatory (5.7); `landscape.ForceLayersFullUpdate` replaces `ForceLayersUpdate`;
  `WorldPartitionLandscapeBuilder` (5.7); water brushes force a global merge.
- HLOD: Build HLOD for Selection or Region, `bForceRayTracingFarField`, Custom HLOD actors (5.7);
  Approximate Mesh absent from the saved doc [verify].
- Experimental: Mesh Terrain, Nanite Foliage, PVE, FastGeo, World Streaming Insights. Mac: Nanite
  and VSM Beta on M2 or newer; cook platform `Mac`.

## References

- [`references/expert-notes.md`](references/expert-notes.md): judgment by expert, with timestamps.
- [`references/procedures.md`](references/procedures.md): P0 to P14, full code, engine calls behind
  the toolkit, tests, status.
- `references/critique.md`: the rubric for each gate.
- [`references/gui-paths.md`](references/gui-paths.md): editor menus for every procedure.
- [`references/sources.md`](references/sources.md): sources, credentials, URLs, timestamps, revision
  history.
