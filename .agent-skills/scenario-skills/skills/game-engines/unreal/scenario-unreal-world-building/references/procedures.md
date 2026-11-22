# Procedures: scenario-unreal-world-building (Editor Python, commandlets, ue_world)

**Status of every Unreal call below: not yet run in Unreal** (UE 5.8 was not installed when this was
written, 2026-09-24). "In editor" lines read **pending** until the first run replaces them with the
engine version from the job result. What did run: the offline layer of `scripts/ue_world.py`
(landscape sizing, Z scale fit and clipping gate, PNG16 and r16 writers, valley generator, terrain
material contract, World Partition, Data Layer, HLOD, PCG component, graph and grass checks, village
paths, Nanite construction and tessellation, kit, region, world-rule and spec checks, handoff
sheets, builder arguments, CLI) and the in-editor plumbing against a fake `unreal` module, in
`tests/code/unreal-world-building/test_world_offline.py` with python3 3.14 (passed 2026-09-24,
refactor pass). Names marked [verify] are listed in `W.API_CANDIDATES`; `W.probe()` records which
exist, and every editor function records misses in `W.MISSING` instead of guessing silently.

Rules from scenario-unreal-expert apply to all of it: one job per stage, results as `UE_RESULT`
JSON, never point a saving commandlet at a project an open editor has loaded, save a new map version
before destructive steps (copy to `versions/vN YYYY-MM-DD label/`), never delete source levels.

## P0. Imports and channels

```python
import sys
SKILLS = "/abs/path/skills"                                   # adjust
sys.path[:0] = [SKILLS + "/scenario-unreal-world-building/scripts", SKILLS + "/scenario-unreal-expert/scripts"]
import ue_world as W, ue_run
UPROJECT = "/Users/Shared/UEProjects/Valley/Valley.uproject"  # a path without spaces (Allar; version deltas)
```

- Headless job: `ue_run.run_python(UPROJECT, "job.py", args={...}, map="/Game/Maps/L_Valley")`
  (commandlet, no level loaded unless `map=`; no rendering).
- Full editor, no ticks: `mode="editor"` (map creation, asset edits that want the whole editor).
- Ticks needed (screenshots, PIE): `mode="latent"` with a generator `main` (P13).
- Builders: `ue_run.run_commandlet(UPROJECT, name, args)` with the tuples from `W.*_args` (P11).
- Live editor: Epic's MCP server first, else Python remote execution. `PythonRemote.call` only
  imports from scenario-unreal-expert's scripts folder, so pass this skill's folder:
  `rx = ue_remote.PythonRemote(); rx.open(); rx.exec(ue_remote.call_code("ue_world", "world_facts", scripts_dir=SKILLS + "/scenario-unreal-world-building/scripts"))`.
  Test: `TestBuilders`, `TestInEditorFake`. In editor: pending.

**Engine calls behind the toolkit.** A written plan names these next to each `W.*` step, so a reader
without the toolkit can still execute it (all not yet run in Unreal; [verify] names are probed).

| Toolkit call                                   | Engine call or command line                                                                                                                                                                                                                                                                                          |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `new_open_world_map`                           | `LevelEditorSubsystem.new_level_from_template(path, template)` or `new_level(path, is_partitioned_world=True)`, then `save_current_level()` (Python reference)                                                                                                                                                       |
| `world_facts`, `landscape_facts`               | `UnrealEditorSubsystem.get_editor_world()`, World Settings `world_partition` > `runtime_hash` [verify]; `EditorActorSubsystem.get_all_level_actors()`, `LandscapeProxy.get_components_by_class(LandscapeComponent)`, `get_actor_location()`                                                                          |
| `console(cmd)`                                 | `SystemLibrary.execute_console_command(world, cmd)`                                                                                                                                                                                                                                                                  |
| `create_data_layer_asset`, `assign_data_layer` | `AssetToolsHelpers.get_asset_tools().create_asset(name, folder, DataLayerAsset, DataLayerFactory())` [verify]; `DataLayerEditorSubsystem.create_data_layer_instance(params)`, `add_actors_to_data_layer(actors, instance)` [verify]                                                                                  |
| `create_hlod_layer`                            | `create_asset(name, folder, HLODLayer, HLODLayerFactory())`, `set_editor_property("layer_type", ...)`, `("parent_layer", ...)` [verify]                                                                                                                                                                              |
| `set_streaming`                                | actor `set_editor_property("hlod_layer" / "runtime_grid" / "is_spatially_loaded", value)` [verify]                                                                                                                                                                                                                   |
| `batch_nanite`                                 | `EditorAssetLibrary.list_assets`, `load_asset`, `StaticMesh.get_editor_property("nanite_settings")`, `set_editor_property("enabled", True)`, `save_loaded_asset`                                                                                                                                                     |
| `spawn_pcg_volume`, `set_graph_params`         | `EditorActorSubsystem.spawn_actor_from_class(PCGVolume, location)`, `get_component_by_class(PCGComponent)`, `set_graph(gi)`, `set_editor_property("generation_trigger", PCGComponentGenerationTrigger.GENERATE_ON_DEMAND)`, `generate(True)`; `PCGGraphParametersHelpers.set_double_parameter(gi, name, v)` [verify] |
| `dump_pcg_graph`                               | `PCGGraph.get_nodes()`, `node.get_settings()`, `settings.get_editor_property(...)` [verify]                                                                                                                                                                                                                          |
| `region_batch`                                 | `WorldPartitionBlueprintLibrary.get_intersecting_actor_descs(box)`, `load_actors(guids)`, `LevelEditorSubsystem.save_all_dirty_levels()`, `unload_actors(guids)` [verify]                                                                                                                                            |
| `tour`                                         | `UnrealEditorSubsystem.set_level_viewport_camera_info(loc, rot)` [verify], `AutomationLibrary.take_high_res_screenshot(w, h, path)` or `HighResShot`                                                                                                                                                                 |
| `register_world_validator`                     | `@unreal.uclass()` subclass of `EditorValidatorBase` with `k2_can_validate_asset` / `k2_validate_loaded_asset`, `EditorValidatorSubsystem.add_validator(v)` [verify]                                                                                                                                                 |
| `landscape_builder_args`                       | `UnrealEditor-Cmd <uproject> <Map> -run=WorldPartitionBuilderCommandlet -Builder=WorldPartitionLandscapeBuilder -AllowCommandletRendering` (5.7)                                                                                                                                                                     |
| `pcg_builder_args`                             | `... -run=WorldPartitionBuilderCommandlet -Unattended -AllowCommandletRendering -Builder=PCGWorldPartitionBuilder -IncludeGraphNames=PCG_Forest;PCG_Rocks` (5.4 form)                                                                                                                                                |
| `hlod_builder_args`                            | `... -run=WorldPartitionBuilderCommandlet -Builder=WorldPartitionHLODsBuilder -AllowCommandletRendering [-SetupHLODs / -BuildHLODs]` (WP doc)                                                                                                                                                                        |
| `convert_args`                                 | `... -run=WorldPartitionConvertCommandlet <Map>.umap -AllowCommandletRendering -ReportOnly`, then `-ConversionSuffix`                                                                                                                                                                                                |

## P1. World spec, probe, brief

```python
spec = json.load(open("valley_spec.json"))      # start from W.U1_EXAMPLE_SPEC and edit
res = W.check_world_spec(spec)                   # {"ok", "counts", "findings", "derived"}
for f in res["findings"]:
    print(f["severity"], f["rule"], f["detail"], f["source"])
```

Job `job_probe.py`: `def main(args): import ue_world as W; return W.probe()`. Run it once per
install and paste the misses into the facts-to-verify list of scenario-unreal-expert. Answer every
`info` finding (speed unknown, frame time unset, streaming margin unmeasured) or write it into the
report as an assumption. CLI: `python3 ue_world.py check-spec valley_spec.json` exits 1 on errors.
Test: `TestRegionsSpec.test_u1_spec_clean`, `test_broken_spec`, `TestBuilders.test_cli` (passed). In
editor (probe): pending.

## P2. Map: template or conversion

```python
# job_map.py, run with mode="editor"
import ue_world as W
def main(args):
    print(W.template_candidates())               # the Open World template path is [verify]
    out = W.new_open_world_map(args["map"], args.get("template"))
    out["facts"] = W.world_facts()
    out["findings"] = W.wp_facts_check(out["facts"])
    return out
```

`new_level_from_template` and `new_level(asset_path, is_partitioned_world=True)` are in the 5.8
Python reference. Without the template, add sky atmosphere, sky light, directional light, height
fog, volumetric clouds and set Enable Streaming (games templates ship it off, WP doc). Converting a
UE4-era level, dry run first, keep the source:

```python
name, args = W.convert_args("/Game/Maps/L_Old.umap", report_only=True)
print(ue_run.run_commandlet(UPROJECT, name, args)["log"]["summary"])
name, args = W.convert_args("/Game/Maps/L_Old.umap", report_only=False)   # writes L_Old_WP, keeps L_Old
```

GATE: `wp_facts_check` returns no error; one grid; PIE screenshot with
`wp.Runtime.ToggleDrawRuntimeHash2D` (P13). Test: `TestWorldPartition.test_facts`,
`TestBuilders.test_args` (passed). In editor: pending.

## P3. Landscape plan and heightmap (offline)

```python
plan = W.plan_landscape(size_m=2000, quad_m=1.0)
b = plan["best"]    # 2017 vertices, 63 quads/section, 2x2, 16 x 16 = 256 components
v = W.valley_heightmap(b["vertices"], b["extent_m"], relief_m=250, river_width_m=14, river_depth_m=2.5,
                       pads=[{"x_m": 820, "y_m": 900, "radius_m": 90, "falloff_m": 40}])   # village plot
hm = W.export_heightmap("/abs/out/HM_Valley.png", v["heights"])   # z_scale="fit": Z and actor Z from min/max
gate = W.heightmap_clip_gate(hm)                                     # [] required: 0 clipped pixels, valid size
assert not gate, gate
json.dump({"z_scale": hm["z_scale"], "actor_z_cm": hm["actor_z_cm"], "min_m": hm["height_min_m"],
           "max_m": hm["height_max_m"]}, open("/abs/out/HM_Valley.import.json", "w"))
json.dump(v["river_points_m"], open("/abs/out/river_points.json", "w"))   # world meters, unaffected by the actor Z
```

**Why the fit.** Z scale and actor Z come from the real height range, never from a declared relief.
The v1 procedure passed `relief_m=250` to `plan_landscape`, which kept Z 100 (+/-256 m); the
blockout reached 314.3 m (the valley profile keeps rising toward the corners, plus noise), and
123,356 pixels clipped (U1 GREEN run). `fit_heightmap_z(min_m, max_m)` gives Z = span cm / 512 x
1.02 (doc formula, 2% headroom [added]) and puts the actor at the midpoint: here Z 63.68, actor
+15,443 cm, 0 clipped (the GREEN agent's 63.95 also passes). Heights are exported relative to that
actor Z, so world heights, river points and later placement stay in world meters. Use
`mode="keep100"` to keep Z 100 and only move the actor when later sculpting needs the extra range
(0.78 cm steps instead of 0.49 cm) [added]. A DCC heightmap already normalized to 0..65535 over its
own range: `fit_heightmap_z(dcc_min_m, dcc_max_m, headroom=0)`, and
`heightmap_clip_gate(res, values)` counts samples stuck at 0 or 65535. The generator is a blockout
[added]; a DCC heightmap (World Machine, Gaea) replaces it when art direction exists. For RAW:
`raw=True` writes r16 plus the JSON sidecar the importer reads (key `bbp` as the doc prints it
[verify]). Spec level: give `terrain.height_min_m`, `height_max_m`, `actor_z_cm`; `check_world_spec`
errors with `landscape.heightmap_clips` and prints the fitted values. CLI:
`python3 ue_world.py plan-landscape --size-m 2000`; `python3 ue_world.py heightmap out.png` (fits Z,
exits 1 when the gate fails). Test: `TestLandscape`, `TestHeightmapFit` (reproduces 123,356 clipped
at Z 100 and 0 after the fit; passed). In editor: import pending.

## P4. Landscape creation, material, edit layers, river, build

1. **Create.** Landscape mode > Manage > New > Import from File with the plan's numbers (Section
   Size 63x63 quads, Sections Per Component 2x2, Number of Components 16 x 16, Overall Resolution
   2017, Location Z = `actor_z_cm`, Scale 100, 100, `z_scale` from `HM_Valley.import.json`), because
   no documented Python call creates a landscape with this layout. If the MCP toolset or `W.probe()`
   shows a landscape creation tool, use it [verify]. Scripted re-import later:
   `landscape.landscape_import_heightmap_from_render_target(rt, False)` [verify] (landscape note
   candidates).
2. **Check.**

```python
# job_land.py, commandlet with map=
import ue_world as W
def main(args):
    facts = W.landscape_facts()
    want = args["plan"]                       # plan best + the import json (z_scale, actor_z_cm)
    ok = (facts and facts[0]["components"] == want["components"]
          and abs(facts[0]["scale"][2] - want["z_scale"]) < 0.01
          and abs(facts[0]["location_z_cm"] - want["actor_z_cm"]) < 1.0)
    return {"facts": facts, "ok": bool(ok)}
```

3. **Edit layers** (doc hierarchy): Base, Sculpt Details, Paint, Splines, Patches. 5.8 exposes edit
   layers and names to Blueprint, so Python likely follows [verify]; patches can target a layer by
   name through the LandscapePatchComponent function added in 5.8.
4. **Material.** `W.assign_landscape_material(landscape_actor, "/Game/Env/Landscape/MI_Valley")`
   with the instance from scenario-unreal-materials, then:

```python
f = W.landscape_material_check(
    layers=[{"name": "Soil", "blend": "Alpha", "large_area": True, "anti_tiling": "distance_blend"},
            {"name": "Rock", "blend": "Height", "steep": True, "projection": "triplanar"}, ...],
    layer_infos=["Soil", "Rock", ...], blend_mode="Opaque", opacity_mask_wired=True,
    specular=0.02, specular_from_cavity=False)
```

What the contract checks, and why: Opaque with Opacity Mask wired, one Alpha base (all-height blends
give black spots), a Layer Info per name (LANDdoc); the steep layer triplanar or side-projected with
Landscape Layer Coords XZ/YZ, never top-down on cliffs (Sensei [00:15:36]; LANDdoc Layer Coords);
anti-tiling on large layers, Distance Blend or Cell Bombing (costlier, not on every layer) (Sensei
[00:11:46]-[00:14:30]); specular: Sensei sets 0.02 on all layers against plastic-looking grass
[00:11:12], Cloward keeps 0.5 as a ceiling driven by a cavity map and warns that 0 kills sky
reflections (0L5Azq6ugyo [00:01:19] [00:01:53]). The materials owner builds it; the world artist
decides on the sun capture of grass. Layer Info assets: Paint tab > + per layer (5.5+: target layers
are added explicitly, "Add" or "Populate from materials"). 5. **River.** Hand-placed course
(placement tier "hand"). Water plugin: spawn a Water Body River and set its spline from
`river_points_m` (cm = m x 100):

```python
import unreal
eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
river = eas.spawn_actor_from_class(unreal.WaterBodyRiver, unreal.Vector(0, 0, 0))        # class name [verify]
spline = river.get_component_by_class(unreal.SplineComponent)
pts = [unreal.Vector(x * 100, y * 100, z * 100) for x, y, z in river_points]
spline.set_spline_points(pts, unreal.SplineCoordinateSpace.WORLD)                       # [verify]
```

Width, depth and velocity per point live in the water spline metadata [verify]. Rivers carve the
landscape only with edit layers, and water brushes force a global merge (5.6 notes), so edit the
river before heavy painting. Without the Water plugin: a spline on the Splines edit layer carves the
bed, the surface is a spline mesh (scenario-unreal-vfx owns water shading). 6. **Build.**
`ue_run.run_commandlet(UPROJECT, *W.landscape_builder_args("/Game/Maps/L_Valley"))`. Force a merge
in a live editor with `W.console("landscape.ForceLayersFullUpdate")`. GATE: components, Scale Z and
Location Z equal the plan; Layer Debug view screenshot (View > Landscape Visualizers); mannequin
shots at 2, 10, 100 m (tiling); cliff close-up (no stretching); grass in sun (no plastic sheen); no
black spots. Test: `TestLandscape.test_landscape_material`,
`TestMaterialTessNanite.test_material_contract` (passed). In editor: pending.

## P5. Data Layers

```python
# job_datalayers.py, mode="editor", map loaded
import ue_world as W
def main(args):
    out = []
    for name in ("DL_Forest", "DL_Rocks", "DL_Village", "DL_River"):
        out.append(W.create_data_layer_asset(name, "/Game/Env/DataLayers", runtime=False))
    return {"assets": out, "missing": dict(W.MISSING)}
```

Assign: `W.assign_data_layer(actors, asset)` (creates the instance in the world if needed). Runtime
layers only for gameplay state (quests, destruction states); check with
`W.data_layer_check(layers)`. Make Current Data Layer before scripted spawns so new actors
auto-assign (doc). PCG actors on a Data Layer and HLOD Layer pass both to what they spawn (PCG doc).
Test: `TestWorldPartition.test_data_layers` (passed). In editor: pending (factory names [verify];
GUI fallback in gui-paths).

## P6. HLOD layers and streaming sources

```python
plan = W.hlod_plan(["trees", "rocks", "buildings"])     # HLOD_Trees Instancing (trees+rocks), HLOD_Buildings Merged -> HLOD_Far Simplified
# job_hlod.py, mode="editor"
def main(args):
    made = {}
    for l in reversed(args["plan"]):                      # parents first
        parent = made.get(l["parent"]) if l["parent"] else None
        made[l["name"]] = W.create_hlod_layer(l["name"], "/Game/Env/HLOD", l["layer_type"], parent)
    return made
```

Assign actors per layer (`W.set_streaming(actor, hlod_layer=layer)`), per Data Layer default, or
World Settings default; PCG volumes get their layer before generating (P9). Actors must be Static
(`W.hlod_actor_check`). Merge and proxy settings from the doc: Use Landscape Culling on merged
layers; no Merge Equivalent Materials with world-position color; Simplified Merge Distance closes
doors and windows (Unresolved Geometry Color shows what closed); Allow Distance Fields off on
far-only proxies saves memory, once the lighter confirms Lumen far field does not need it; Override
Spatial Sampling Distance small on large geometry costs a lot of memory. 5.8 per-layer options:
editor loading behavior, `bForceRayTracingFarField` (decide with the lighter). Review: View Mode >
Level of Detail Coloration > Hierarchical LOD Coloration (sources green, proxies blue as the camera
leaves), then the `wp.Runtime.HLOD 0/1` A/B (P13). Streaming sources: add a World Partition
Streaming Source component where the game teleports, wait for Is Streaming Completed, then disable
it (doc; Deiter [00:16:39]). Runtime PCG needs its own PCG Generation Source at the target (P10).
Test: `TestWorldPartition.test_hlod_plan`, `test_hlod_actors`,
`TestWorldRules.test_changelist_and_settings` (passed). In editor: pending.

## P7. Village: kits, Level Instances, assemblies

1. Audit the kit from scenario-unreal-pipeline-automation:

```python
bmin, bmax = mesh_bounds_cm   # from ue_audit or StaticMesh bounds [verify]
W.kit_piece_check("SM_Wall_Plain", bmin, bmax, footprint_cm=(400, 400, 300), tiling_edges=("+x", "-x"), min_inset_cm=1)
W.door_width_check({"SM_Wall_Door": 120}, standards_cm=[120, 240])   # the project's two standards
```

Footprint and door values are the project's (the talk fixes the rule, not the numbers). 2. Houses:
gameplay content in Level Instances, static dressing in Packed Level Actors (Deiter [00:30:59]).
Programmatic creation through `unreal.LevelInstanceSubsystem` is [verify]; probe it, else the GUI
step (select > right-click > Level > Create ...; pivot Center Min Z). Copy the map to `versions/`
before any Break. 3. Assemblies for yard clutter: spawn a cluster, tag it from a fixed vocabulary,
make a Level Instance, export a PCG Data Asset (native exporter since 5.4; Python entry point
unknown, GUI: right-click > asset action), then Load PCG Data Asset > Copy Points > Attribute Filter
on the tag > Static Mesh Spawner (Oztalay [00:15:00]-[00:17:12]).

```python
VOCAB = ["ASM", "STL", "Clutter", "ClutterLow", "ClutterMed", "ClutterHigh", "Pick1", "Pick2", "RandScale", "HLOD", "CULL", "intensity"]
W.tag_actors(cluster_actors, ["Clutter", "intensity:0.5"], VOCAB)     # refuses typos (Oztalay [00:29:42])
```

4. **Paths from doors to the road** (Oztalay [00:19:25]-[00:21:09]): the recursive pattern, each
   found path joins the goal set so the next house connects to the nearest path already built
   (nested networks). Offline, on the blockout heights downsampled to a few meters per cell:

```python
import numpy as np
hs = v["heights"][::4, ::4]                                   # 4 m cells from the 1 m blockout
net = W.village_paths(hs.tolist(), 4.0, doors_m=[(812, 930), (840, 880)], network_m=road_points_m,
                      max_slope_deg=25, slope_weight=8)       # slope limit and weight: project values [added]
for p in net["paths"]:
    spline_points_cm = [(x * 100, y * 100, z * 100) for x, y, z in p["points_m"]]   # landscape spline, Splines layer
```

Then carve with landscape splines on the Splines edit layer or a patch. In the graph editor the same
pattern is the Recursive Pathfinding subgraph (Search Grid, Start Positions, Goals; frame 00:20:55).
Hand-placed splines are fine for a few houses: decide what stays manual (Oztalay [00:32:26]). 5.
**Fences and walls along splines** by shape grammar, not hand placement: a module table (end,
straight, gate) and a grammar string as a graph parameter, e.g.
`W.grammar_string("End", {"Straight": 3, "Gate": 1}, "End")` checked by `W.grammar_check` (Oztalay
[00:18:51]; Epic PCG team j3ke6MmcaeY [00:10:31], syntax `[ ]`, `{A:w, B}`, `*`, `+`; weight syntax
[verify]). 90-degree corners need extra handling [00:15:14]. 6. **Gameplay on scenery** (harvestable
plants, interactive props): static meshes with Asset User Data read in the order component, root
component, root mesh, not thousands of Blueprints; aggregate ticks for any type with more than 10 to
15 instances (Dark [00:23:04] [00:27:49]); `W.world_rules_check(W.world_census(), VOCAB)` flags both
(P14). The data classes are C++ (hand to scenario-unreal-gameplay). GATE: no kit errors; village
screenshots show no z-fighting, repetition not obvious from the main paths; paths join the nearest
path, not all the road. Test: `TestNaniteTiersKits.test_kit`, `TestPCG.test_tags_and_grammar`,
`TestPCGRefactor.test_village_paths`, `TestInEditorFake.test_tags_region_probe_tour` (passed). In
editor: pending.

## P8. Nanite and tessellation

```python
# job_nanite.py, commandlet
def main(args):
    plan = W.batch_nanite(["/Game/Env"], enable=True, dry_run=args.get("dry_run", True),
                          voxelize_foliage=args.get("nanite_foliage", False))
    return plan        # changed, skipped (translucent), errors
```

Run dry, read `skipped`, then `dry_run=False`. Per exception use `W.nanite_decision(mesh_info)`
(platform, blend modes, morph targets, foliage, lightmap UVs, WPO). Turn off Generate Lightmap UVs
on import in Lumen projects (doc). **Construction before import** (Epic tech artist, 6igUsOp8FdA
[00:02:46]-[00:10:06]): the same look was 250 MB built one way and 12 MB another. Disconnected
triangle groups (kitbashed rock walls with hidden interiors, tile-soup roofs), hard-edge splits, UV
seams and noisy vertex colors all stop Nanite from simplifying. Audit the DCC export of every rock,
cliff and kit piece:

```python
stats = W.obj_construction_stats(open("/abs/export/SM_CliffWall.obj").read())
issues = W.nanite_construction_check(stats, role="rock", disk_mb=size_mb, reference_disk_mb=similar_asset_mb)
```

`nanite.porous` means rebuild as one connected base with a tiling texture (better texel density,
reusable) or bake repeats to a height map; `nanite.hard_edge_splits` means consistent smoothing with
support loops. Thresholds (8 islands, 30% split positions, 5x disk size) are project defaults
[added]; send failures back to scenario-unreal-pipeline-automation and the DCC team
(scenario-maya-expert, scenario-blender-expert). In the editor, the Triangles and Clusters views
while dollying show the same fault: a good asset swaps clusters with distance, a bad one barely
changes [00:05:52]. **Distance culling does not thin Nanite.** Minimum Screen Radius, distance
culling, min/max draw distance and Cull Distance Volumes do not apply to Nanite meshes (Nanite doc
Rendering; Looman). Distance is handled by Nanite itself and by HLOD; never plan "cull distance on
the tree ISM" as a Nanite budget lever. **Tessellation per layer** (6igUsOp8FdA
[00:20:46]-[00:26:52]): no collision, so center each walkable layer at 0.5 on the collision surface
and vertical rock faces at 1; magnitudes per layer (grass small, rock large), heights normalized
0..1 and remapped with `W.displacement_layer_value(h, magnitude, center)` in the landscape master
(materials owner). Check with
`W.tessellation_check({"layers": [...], "feet_tolerance_cm": t, "dicing_rate": 2, ...})`;
`W.displacement_feet_error_cm(magnitude, center)` gives how far feet sink or float (tolerance: the
project's). Dicing rate stays 2; Height textures HDR Compressed (Sensei [00:31:32]). **Nanite
Foliage (Experimental), as an informed option** (Quixel team, aZr-mWAzoTg): Nanite Assemblies of
instanced branch parts cut asset size to about 5 to 10% [00:07:13]; wind moves to a skeleton of a
few hundred to 1,000 bones driven by Dynamic Wind instead of WPO, with tighter bounds [00:09:17]
[00:09:51]; Shape Preservation Voxelize keeps volume from every side where impostors do not
[00:12:16]; build more branch variants per zone of the tree, since instances store only transforms
[00:05:35]. Accept it only with the lead's Experimental sign-off; otherwise opaque modeled leaves
plus canopy blockers three or four trees deep [00:35:17]. GATE: no translucent Nanite mesh;
construction check clean or waived; Overdraw and Triangles views (P13) over the canopy; a character
walking on displaced ground and rocks (feet neither sink nor float). Test: `TestNaniteTiersKits`,
`TestMaterialTessNanite`, `TestInEditorFake.test_nanite_batch` (passed). In editor: pending.

## P9. Baked PCG: forest and rocks

1. **Template graph** (graph editor work, once, by hand or by a computer-use agent): Get Landscape
   Data > Surface Sampler > Attribute Filter on the forest layer weight (constant threshold 0.5,
   Warn on Data Missing Attribute on) > Normal To Density (slopes) > Spatial Noise (clumps) >
   Difference with Differences = Get Spline Data > Spline Sampler > Extents Modifier (paths, river)
   and the village volume > Distance to river points (thin the banks) > Density Filter > Self
   Pruning (Large to Small) > Transform Points (yaw -180 to 180, Absolute Rotation, scale 0.75 to
   1.25) > Match And Set Attributes from a species Data Table > Static Mesh Spawner (By Attribute).
   Rocks: a separate branch denser on slopes. Every threshold and density is a graph parameter
   (Oztalay frames 00:10:47, 00:11:58, 00:14:55; node reference). Prefer Branch over Select (Select
   does not cull), Density Filter over Attribute Filter where it fits, collision off for clutter.
   Lint the template once it exists:
   `W.pcg_graph_lint(W.dump_pcg_graph(graph)["nodes"], role="forest")` (dump accessors [verify];
   else write the node dict from a graph screenshot). It flags a layer-weight filter with Warn on
   Data Missing Attribute off (a renamed layer then empties the forest silently, Oztalay frame
   00:10:47 [00:32:26]), no Distance node for bank and edge thinning (node reference: Distance is
   the tool for trees "too close to a stream"), understory not differenced against tree locations
   (frame 00:14:55), Select where Branch should cull, superseded Distance to Density, costly Mesh or
   Volume Samplers, clutter spawned with collision, trunks and boulders spawned without it (spawner
   collision is off by default, j3ke6MmcaeY [00:17:30]).
2. **Instances and volumes, on their layers first:** PCG output inherits the PCG actor's Data Layer
   and HLOD Layer (PCG overview, World Partition Support), so a forest volume without them bakes
   thousands of trees outside the HLOD plan.

```python
# job_pcg_forest.py, mode="editor", map loaded
import unreal, ue_world as W
def main(args):
    load = unreal.EditorAssetLibrary.load_asset
    gi = load(args["graph_instance"])                                       # GI_Forest_Valley, parent PCG_Forest
    r = W.spawn_pcg_volume(gi, (100800, 100800, 12000), (201600, 201600, 60000), partitioned=True,
                           trigger="OnDemand", seed=1234, generate=False, label="PCG_Forest",
                           hlod_layer=load("/Game/Env/HLOD/HLOD_Foliage"),          # Instancing layer
                           data_layer=load("/Game/Env/DataLayers/DL_Forest"))
    p = W.set_graph_params(gi, {"TreeDensity": 0.03, "SlopeMaxDeg": 32.0, "ForestWeightMin": 0.5})
    return {"volume": r, "params": p, "missing": dict(W.MISSING)}
```

`r["used"]` reports whether both layers were set; if not, Make Current Data Layer before spawning so
the new volume auto-assigns (WP doc), and set the HLOD layer in the volume's Details. Parameter
names are the template's; densities are the project's (expected count:
`W.expected_points(area_m2, ppm2)`). Species weights: `W.mesh_probabilities`. 3. **Debug small
first:** a 256 m volume, D on the filter node, screenshot top-down; then the valley. 4.
**Generate:** in editor (`generate=True`) for a solo project and commit the partition actors, or on
the build machine (P11) where builders own generation and artists do not check in generated actors
(Oztalay [00:26:23]): `W.changelist_check(entries)` flags generated partition actors in a changelist
and OFPA files submitted outside the editor. GATE: `W.pcg_component_check(components, world_actor)`
clean (no `pcg.no_hlod_layer`); graph lint clean; instance counts in range; no trees on paths, river
or village; banks thinned; nothing on curated compositions; after the HLOD build, forest proxies
visible in Hierarchical LOD Coloration. Test: `TestPCG`,
`TestPCGRefactor.test_inheritance_and_teleports`, `test_graph_lint`,
`TestInEditorFake.test_spawn_pcg`, `test_params`, `test_dump_graph_and_lint` (passed). In editor:
pending.

## P10. Runtime grass

```python
rings = W.grass_rings(dense_radius_m=128, sparse_radius_m=256, dense_grid_m=32, sparse_grid_m=128,
                      dense_ppm2=None, sparse_ppm2=None)     # densities: the project's, then measured
W.check_hier_grids(["unbounded", 128, 32], landscape_read_grid=128)
```

Graph (template): unbounded level uploads graph parameters once (Attribute Set Processor, 5.7) and
renormalizes weights; 128 m level reads heights (Get Landscape Data with Get Height Only, layer
weights off; or Generate Landscape Textures, 5.7) and grass maps (Generate Grass Maps, Skip Readback
to CPU); 32 m level scatters with a custom HLSL Point Generator into a GPU-backend Static Mesh
Spawner. **Where the grass mask comes from on the GPU:** layer weights are not available on GPU
(icIFFlOyob4 [00:24:12]). Set up landscape grass types fully but with no meshes, paint with them,
and read them with Generate Grass Maps [00:13:36]; the grass-map value biases a random layer pick so
overlapping layers blend [00:18:05]. **Placeholders:** settings order keys grass maps, settings and
assets, so add one placeholder item to every asset array; an empty artist array otherwise collapses
the stream and breaks the keys [00:12:42].

```python
W.runtime_grass_check({"mask_source": "grass_maps", "grass_types_have_meshes": False,
                       "asset_arrays": {"grass": ["SM_Grass_A", "SM_Placeholder"], "rocks": ["SM_Placeholder"]},
                       "placeholder_entries": True, "params_upload_grid": "unbounded",
                       "landscape_read": "height_only", "nanite_instances": True, "ring_handover": "generation_radius"})
```

**Nanite grass and the ring handover:** the talk hands rings over with min and max draw distances;
those do not apply to Nanite instances (Nanite doc; Looman), so with Nanite grass the ring edges are
each grid's generation radius, `W.grass_rings(nanite=True)`, and the handover is checked frame by
frame on the first run [verify]. Component:
`W.spawn_pcg_volume(gi_grass, center, size, trigger="AtRuntime", generate=False)`. PCG World Actor
(select it in the Outliner; property names [verify]): Treat Editor Viewport as Generation Source on,
Enable World Partition Generation Sources on, landscape cache on. Budget:
`W.console("pcg.FrameTime 2")` style per area, with `pcg.RuntimeGeneration.NumGeneratingComponents`
as the concurrency cap. FastGeo option: PCG FastGeo Interop plugin plus
`pcg.RuntimeGeneration.ISM.ComponentlessPrimitives 1` (Experimental). **Teleports:** latency is
worse after a teleport than along a continuous path (icIFFlOyob4 [00:36:44]). Place a PCG Generation
Source component (class [verify], rn54) at the target before the teleport, alongside the World
Partition Streaming Source (P6), wait for both, and cap concurrent generation with
`pcg.RuntimeGeneration.NumGeneratingComponents`. `W.pcg_component_check(..., teleports=True)` warns
while no generation source is planned; CDPR had not used generation sources much in production yet,
so measure the result. Transfers: dump nodes as `{id: {"title", "gpu", "grid", "skip_readback"}}`
and edges (graph node access from Python is [verify]; else read the yellow arrows on a graph
screenshot) and run `W.find_gpu_transfers(nodes, edges)`. Latency:
`W.generation_lead_check(camera_speed_mps, 256, cull_distance_m, measured_latency_s, build="Test")`,
latency read from a Test build video, frame by frame, with the generation debug draw. For Nanite
grass, `cull_distance_m` is the distance at which a newly generated cell becomes noticeable (inside
the recolored edge), since Nanite ignores cull distances [added]. Test: `TestPCG.test_rings`,
`test_grids`, `test_gpu_transfers`, `test_latency`, `TestPCGRefactor.test_runtime_grass`,
`test_inheritance_and_teleports` (passed). In editor: pending.

## P11. Headless builds

```python
MAP = "/Game/Maps/L_Valley"
for name, args in W.build_pipeline(MAP, pcg_graphs=["PCG_Forest", "PCG_Rocks"], minimap=False):
    r = ue_run.run_commandlet(UPROJECT, name, args, timeout=7200)
    print(args[1], r["ok"], r["exit_code"], r["log"]["summary"])
    if not r["ok"]:
        break
```

Order: `WorldPartitionLandscapeBuilder` (grass maps, physical materials, Nanite, 5.7),
`PCGWorldPartitionBuilder -IncludeGraphNames=...` (5.4 form; the 5.8 PCG Builder commandlet and PCG
Builder Volume are [verify]), `WorldPartitionHLODsBuilder` (HLODs after generated content). A
minimap (`minimap=True`) builds but displays only with Project Settings > Rendering > Enable virtual
texture support (WP doc); `W.project_settings_check` flags it, and RVT blending needs the same
setting (Sensei [00:47:11]). Submitting the results: OFPA changelists are validated and submitted
from inside the editor (View Changelists), since partial submits leave dangling references (WP doc;
source control doc). Split HLOD steps with `W.hlod_builder_args(MAP, "setup")` then `"build"`;
`-DeleteHLODs` needs `allow_delete=True`. Close the editor on this project first (write locks). Map
argument position after `-run=` is [verify]. In-editor region builds: Build HLOD for Selection or
Region, or `BuildHLODForActors` / `BuildHLODForVolume` from an Editor Utility (5.8). GATE: exit 0
for each step, no fatal lines, HLOD actors per layer counted in a census. Test:
`TestBuilders.test_args` (passed). In Unreal: pending.

## P12. Region-by-region batch edits

```python
# job_region.py, mode="editor", map loaded
import ue_world as W
def main(args):
    def process(actors, tile):
        changed = []
        for a in actors:
            if a.get_actor_label().startswith("SM_Fence"):
                W.set_streaming(a, hlod_layer=None)       # example edit
                changed.append(a.get_name())
        return changed
    return W.region_batch(process, tile_m=256.0, dry_run=args.get("dry_run", True))
```

Dry run first (actor counts per tile). Tiles come from `W.region_tiles` in serpentine order. Save a
map version first; log every changed actor; re-run the validators after. When a job needs the whole
world or C++, write a `UWorldPartitionBuilder` subclass and run it through
`WorldPartitionBuilderCommandlet` (WP doc). Test: `TestRegionsSpec.test_tiles`,
`TestInEditorFake.test_tags_region_probe_tour` (passed). In editor: pending.

## P13. Review tour, stats, handoffs

```python
# job_tour.py, run with mode="latent"
import ue_world as W
def main(args):
    vps = W.tour_viewpoints((0, 0), (2016, 2016), ground_z_m=args["ground_z_m"], named=args["named"])
    return W.tour(vps, args["out_dir"], console_per_view=args.get("console", []))
```

Named viewpoints for the valley: village square, river bank, forest edge, ridge overlook, plus
quadrants and an overview (Dark [00:23:36]; viewpoint list [added]). Passes from `W.REVIEW_CONSOLE`:
`frame` (stat unit, stat gpu), `streaming` in PIE, `hlod_off` / `hlod_on`, `hlod_coloration`
(Hierarchical LOD Coloration; command [verify], GUI path in gui-paths), `nanite_overdraw`,
`nanite_triangles` (mode names [verify]). Add the terrain captures: cliff close-up, grass in direct
sun, a character on displaced rock. Every capture goes through `ue_review.image_checks(path)`
(all-white or all-black flag) before it is looked at. PIE for streaming:
`LevelEditorSubsystem.editor_request_begin_play()` / `editor_request_end_play()` (doc). Numbers:
`stat unit` per viewpoint, PCG subsystem time from an Insights trace of a Test build (parse with
`ue_stat`), cell loads with `-trace=WorldStreaming` (World Streaming Insights plugin must be enabled
in UnrealInsights config). Handoffs:

```python
sheet = W.budget_sheet(spec, measured={"pcg_gt_ms": 0.18, "frame_ms_by_viewpoint": {...}})
json.dump(sheet, open("handoff/performance_budget.json", "w"), indent=1)
json.dump(W.lighting_handoff(spec, "/Game/Maps/L_Valley", vps), open("handoff/lighting.json", "w"), indent=1)
```

GATE: critique rubric passes; every claim in the report has its capture or number. Test:
`TestRegionsSpec.test_viewpoints`, `test_handoffs`, `TestInEditorFake.test_tags_region_probe_tour`
(passed). In editor: pending.

## P14. World rules as validators and a census

Rules that documents only request need a check that fails (Dark, AalP65lrtpo [00:23:04]: "a
validator makes sure that actually happens"). World rules from this skill: tags from the fixed
vocabulary, clutter without collision, no construction-script scatter (170,000 bodies and a 7-minute
map open in Epic's example, Oztalay [00:30:49]), ticking Blueprint types above 10 to 15 placed
instances aggregated (Dark [00:23:04]), data-only Blueprints placed in numbers moved to static
meshes with Asset User Data (Dark [00:27:49]).

```python
# job_world_rules.py, mode="editor", map loaded (load a region first in WP maps, P12)
import ue_world as W
VOCAB = ["ASM", "STL", "Clutter", "ClutterLow", "ClutterMed", "ClutterHigh", "Pick1", "Pick2", "RandScale", "HLOD", "CULL", "intensity"]
def main(args):
    census = W.world_census()
    return {"findings": W.world_rules_check(census, VOCAB), "actors": len(census),
            "validator": W.register_world_validator(VOCAB)}      # per-actor rules on save [verify reach]
```

`register_world_validator` follows the scenario-unreal-pipeline-automation pattern
(`EditorValidatorBase` subclass, `k2_can_validate_asset` / `k2_validate_loaded_asset` in 5.8,
self-registration each session through `init_unreal.py`); that skill owns the validator framework
and the headless `-run=DataValidation` run, this one delivers the world rules. Construction-script
spawning cannot be read from Python; flag it from a code review or a component count before and
after a rerun [added]. GATE: no `error` findings; warnings answered or handed to
scenario-unreal-gameplay (tick aggregation, Asset User Data classes in C++). Test: `TestWorldRules`,
`TestInEditorFake.test_census_and_validator` (passed). In editor: pending.
