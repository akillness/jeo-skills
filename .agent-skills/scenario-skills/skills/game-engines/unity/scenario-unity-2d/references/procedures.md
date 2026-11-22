# Procedures (scenario-unity-2d)

Procedures P0 to P14, each a Python call into a C# job of `scripts/AgentKit/TwoD/` (copied into the
project's `Assets/Editor/AgentKit/TwoD/` by `ut_2d.install`) or a PlayMode test, with the Unity API
it uses, its live test and the recorded result. All results: **run in Unity 6000.3.21f1 on
2026-09-24** (macOS 26.5.1, Apple Silicon, Metal), batch mode, project `tests/projects/unity-2d`
(clone of Base2D_URP, Universal 2D template, Cinemachine 3.1.7 pinned). First version: full suite on
a fresh clone, every step PASS. Refactor (v0.2, same day): P4c, P5c, P6b, P14 and the new PlayMode
tests added, then the full suite `tests/code/unity-2d/run_all.sh --live` rerun on the same project
(log `archive/tests/unity-2d/run_all_refactor_2026-09-24.log`): every step PASS except P7, where the
first light bench asserted large vs small lights and failed on Editor timing noise; after the
interleaved bench (large vs small reported, not asserted) P5c and P7 reran PASS, 36/36
(`archive/tests/unity-2d/run_refactor_rerun_P5c_P7_2026-09-24.log`); raw rows in
`archive/tests/unity-2d/live_results.jsonl`, captures in `archive/tests/unity-2d/evidence/`. Job
boot is 10 to 20 s each (editor start included); the machine caps 6 concurrent editors, so jobs may
queue.

Common preamble:

```python
import sys; sys.path.insert(0, "<skills>/scenario-unity-2d/scripts")
import ut_2d, ut_run, ut_review          # ut_2d puts scenario-unity-expert/scripts on sys.path
P = ut_2d.project("<repo>/tests/projects/<your project>")    # clone Base2D_URP + core AgentKit + TwoD jobs + runtime
ut_2d.make_demo_art(P)                                         # optional: generated pixel art used below
def job(method, args=None, **kw):
    r = ut_run.run_method(P, method, args or {}, **kw)
    assert r["ok"], (r["error"], r["compile_errors"][:3], r["log"])
    return r["result"]
```

Job argument rule (observed): `AgentJob.List`/`AgentJob.Dict` return an EMPTY collection for a
missing key, never null, so `?? default` never fires in C#; the TwoD jobs use
`TwoDUtil.ListOr/DictOr`. Write your own jobs the same way.

---

## P0. Project setup: sorting layers, physics layers, guards

`job("AgentKit.TwoD.TwoDSetup.ProjectSetup", {"sorting_layers": ["Background", "Default", "Ground", "Characters", "Foreground"], "physics_layers": {"Player": 8, "Ground": 9}})`

Unity calls: `SerializedObject` on `ProjectSettings/TagManager.asset` (`m_SortingLayers` name +
`uniqueID`, `layers[8]`), keeping existing IDs (renderers reference them); reads
`Packages/manifest.json` (no `com.unity.2d.pixel-perfect`), `EditorSettings.spritePackerMode`,
`Physics2D.simulationMode`, `Time.fixedDeltaTime`, `activeInputHandler`. Result: PASS. Sorting order
Background:-1, Default:0, Ground:1, Characters:2, Foreground:3; physics Player 8, Ground 9; packer
`SpriteAtlasV2`; input `InputSystemPackage`; fixed step 0.02 s. Trap found:
`Physics2D.autoSyncTransforms` is obsolete in 6.3 (CS0618), so it is no longer read.

## P1. Pixel-art import (PPU, Point, None, whole-pixel pivots, normal maps, slicing) + audit

```python
tiles = ["tile_m%02d" % m for m in range(16)]
job("AgentKit.TwoD.SpriteJobs.ImportPixelArt", {"ppu": 16, "textures": [
    {"path": "Assets/Art/Pixel/tiles_ground.png", "cell": [16, 16], "names": tiles, "pivot": [8, 8], "mesh": "FullRect",
     "normal_map": "Assets/Art/Pixel/Normals/tiles_ground_n.png"},
    {"path": "Assets/Art/Pixel/player.png", "cell": [16, 16], "names": ["player_idle0", "player_idle1", "player_run0", "player_run1",
     "player_run2", "player_run3", "player_jump", "player_fall"], "pivot": [8, 0]},          # feet pivot, in PIXELS
    {"path": "Assets/Art/Pixel/crate.png", "mesh": "FullRect", "pivot": [8, 8], "normal_map": "Assets/Art/Pixel/Normals/crate_n.png"},
    {"path": "Assets/Art/Pixel/torch.png", "pivot": [8, 0]}]})
audit = job("AgentKit.TwoD.SpriteJobs.AuditSprites", {"folders": ["Assets/Art/Pixel"], "ppu": 16, "mode": "pixel"})
assert audit["counts"]["error"] == 0
```

Unity calls: `TextureImporter` (`textureType Sprite`, `spriteImportMode`, `spritePixelsPerUnit`,
`filterMode Point`, `textureCompression Uncompressed`, `mipmapEnabled false`, `maxTextureSize` =
next power of two >= largest side, `secondarySpriteTextures = {_NormalMap}`); pivots through
`TextureImporterSettings.spritePivot` + `spriteAlignment Custom` (setting `ti.spritePivot` then
`SetTextureSettings` silently reverts it: observed); normal maps `TextureImporterType.NormalMap`,
Point; slicing with the 2D Sprite package data provider:

```csharp
var factory = new SpriteDataProviderFactories(); factory.Init();
var dp = factory.GetSpriteEditorDataProviderFromObject(ti); dp.InitSpriteEditorDataProvider();
dp.SetSpriteRects(rects);                                  // SpriteRect{name, rect (bottom-left origin), alignment Custom, pivot, spriteID}
dp.GetDataProvider<ISpriteNameFileIdDataProvider>().SetNameFileIdPairs(pairs);   // keep IDs so references survive a re-slice
dp.Apply(); ti.SaveAndReimport();
```

Result: PASS. 50 textures (v0.2 adds `spikes.png` pivot (8, 0), `platform_oneway.png` pivot (8, 6)
Full Rect for Tiled draw mode, `crenel_tile.png`, and the reskin sheet `Reskin/tiles_snow.png`
sliced with the same 16 names); 16 tiles at 1 x 1 unit; player and torch pivot (8, 0) px, every
pivot on a whole pixel; tile sheet Max Size 64; `_NormalMap=tiles_ground_n`; audit 0 errors, one PPU
(16).

**Custom physics shape by script** (`SpriteJobs.SetPhysicsOutline`, path + outline in pixels from
the bottom-left): `ISpritePhysicsOutlineDataProvider.SetOutlines(spriteID, [points - rect centre])`,
`SetTessellationDetail`, `dp.Apply()`. Observed: on 16 px pixel art the generated fallback physics
shape is a 4-point rectangle for every sprite tested (spikes, a crenellated tile, the ground tiles),
so a shaped tile or prop needs a custom outline before a `Sprite` collider means anything. Result:
PASS, crenellated tile outline 16 points read back through `Sprite.GetPhysicsShape`.

## P2. HD sprite PPU from the target resolution

`job("AgentKit.TwoD.SpriteJobs.ImportHD", {"paths": ["Assets/Art/HD/hd_disc.png"], "target_height": 2160, "ortho_size": 5})`
(offline: `ut_2d.ppu_for(2160, 5)`). Formula (2D e-book p. 21): PPU = target height / (ortho size x
2), at the closest zoom; `rig_factor` > 1 for rigged sprites. Bilinear, no mips, source uncompressed
(the atlas compresses). Result: PASS. PPU 216; the 512 px disc is 2.37 units; Size 3 would need 360.

## P3. Sprite atlases (V2): build, pack, audit, and the Analyzer mistakes

```python
lit = job("AgentKit.TwoD.AtlasJobs.BuildAtlas", {"path": "Assets/Atlases/LevelLit.spriteatlasv2",
          "packables": ["Assets/Art/Pixel/tiles_ground.png", "Assets/Art/Pixel/crate.png"], "padding": 2, "filter": "Point"})
assert lit["pages"] == 1 and lit["secondary_sets"] == ["_NormalMap"] and lit["counts"]["error"] == 0
job("AgentKit.TwoD.AtlasJobs.AuditAtlases")               # every atlas in Assets
```

Unity calls: `new SpriteAtlasAsset().Add(objects)`, `SpriteAtlasAsset.Save(asset, path)`,
`SpriteAtlasImporter.packingSettings` (padding, rotation off, tight off), `.textureSettings` (Point,
no mips, not readable), `.SetPlatformSettings(DefaultTexturePlatform)`, `.includeInBuild`;
`SpriteAtlasUtility.PackAtlases(atlases, activeBuildTarget)`; page count = distinct
`UnityEditor.Sprites.SpriteUtility.GetSpriteTexture(sprite, true)`; `atlas.GetPackables()` works on
V2 atlases; checks: compressed or crunched sources, Read/Write, single sprite, pages > 1, mixed
secondary sets, wasted bytes > 400 KB, Full Rect with alpha. Grouping is the judgment step no tool
makes: split lit sprites (with `_NormalMap`) from plain ones, and pack by what is on screen
together. Compression: HD pages compress once on the atlas (sources None); pixel-art pages stay
Compression None (or High Quality after a visual check), because compression shifts pixel colors
(2qeNu2QApAM [00:02:24]) and the atlas video's 32 px pixel-art icon atlas is set to None
(hXlpnwD-TgY [frame 00:18:40]); `BuildAtlas` defaults to None. The job's checks mirror the 6.3
Sprite Atlas Analyzer reports (Window > Analysis > Sprite Atlas Analyzer, 2D Tooling 1.0.3: page
count > 1, compressed sources, wastage > 400 KB, sprite count <= 1, secondary texture mismatch) plus
Read/Write on sources (the source stays resident next to the atlas, hXlpnwD-TgY [00:11:49]); the
Analyzer window itself has no public batch API (internal `Insider` classes), so the agent runs
`AuditAtlases` and opens the window only for a human. Result: PASS. LevelLit 1 page 128 x 64 RGBA32
Point, 17 sprites, usage 53%, 0 findings; LevelPlain 1 page; Bench 20 sprites on 1 page; the seeded
MistakesDemo atlas (one compressed source, mixed secondary textures) was flagged
`2d.atlas_double_compression` and `2d.atlas_secondary_mismatch`. What the atlas changes at runtime:
see P7 `AtlasCutsTexturesNotBatches` (Batches and SetPass unchanged, bound textures 20 to 1).

## P4. Rule Tile by script, tilemap level from a text map, merged static collision

```python
job("AgentKit.TwoD.TilemapJobs.CreateRuleTile", {"sheet": "Assets/Art/Pixel/tiles_ground.png", "out": "Assets/Tiles/GroundRule.asset"})
lvl = job("AgentKit.TwoD.TilemapJobs.BuildLevel", {"scene": "Assets/Scenes/Level2D.unity", "rows": ut_2d.DEMO_LEVEL, "fresh": True})
assert lvl["rule_mismatches"] == 0 and abs(lvl["drop_test"]["error"]) < 0.05
```

Rule construction (Tilemap Extras 6.0.2 `RuleTile`): 16 rules for the cardinal mask (N=1, E=2, S=4,
W=8), `m_NeighborPositions` = the four cardinal cells, `m_Neighbors` aligned with them
(`TilingRuleOutput.Neighbor.This` = 1 / `NotThis` = 2), `m_RuleTransform = Fixed` (directional grass
must not rotate), ordered by frequency (interior 15, top 14, walls 11 and 13...),
`m_ColliderType Grid`, `AssetDatabase.CreateAsset`. Level: `Grid.cellSize (1,1,0)`;
`Tilemap.SetTiles(positions, tiles)` in ONE call for the ground and
`SetTilesBlock(BoundsInt, tiles)` for the back wall (the Tile Palette brush is a mouse tool);
`TilemapCollider2D.compositeOperation = Merge`, `useDelaunayMesh`,
`CompositeCollider2D.geometryType Outlines`, `Rigidbody2D.bodyType Static`,
`ProcessTilemapChanges()` + `GenerateGeometry()`. Verification: `Tilemap.GetSprite(cell)` for every
painted cell against the mask its neighbors imply; physics probe dropped with
`Physics2D.simulationMode = Script` and `Physics2D.Simulate(0.02f)` x 150 (mode restored). Result:
PASS. 16 rules; 40 x 14 map, 197 ground cells, 0 mismatches (top-left corner `tile_m06`, pit edge
`tile_m12`, interior `tile_m15`); composite 4 paths, 24 points; probe rests at 5.2549 for 5.25
expected (error 0.005, asleep).

## P4b. Actors: player, props, torches, hazards, one-way platforms

`job("AgentKit.TwoD.LevelJobs.Populate", {"player": [3.5, 5], "crates": [[20.5, 5], [36.5, 5]], "torches": [[7.5, 7], [20.5, 7]], "spikes": [[7.5, 2], [8.5, 2], [9.5, 2], [10.5, 2], [11.5, 2]], "spike_inset_px": [2, 3], "one_way": [[22, 7.0, 4]]})`
Player root scale 1 on layer Player (`PlatformerStats.PlayerLayer` = 256), `CapsuleCollider2D` 0.55
x 0.85 with a frictionless `PhysicsMaterial2D`, `PlatformerController2D` whose private `stats` field
is set through `SerializedObject`, Animator from P8 with `PlatformerAnimatorBridge`; crates with
`BoxCollider2D` and `ShadowCaster2D`; torch flames on `Sprite-Unlit-Default` so they ignore the
light level. Hazards: `Hazard2D` (trigger `BoxCollider2D`, `FitHitbox()` = sprite bounds minus the
inset in art pixels, base kept on the ground, `targetLayers` = Player): the forgiveness rule "small
spike hitboxes: touching the tip does not kill" (GMTK yorTG9at90g [00:09:28]); inset values are
[added]. One-way platforms: `BoxCollider2D.usedByEffector = true` + `PlatformEffector2D`
(`useOneWay`, `surfaceArc` 180, `useSideFriction` and `useSideBounce` off; 6.3 Manual, Platform
Effector 2D reference), `SpriteRenderer` Tiled. Result: PASS. Player 1.0 unit tall, material
Sprite-Lit-Default; 2 crates, 2 torches; 5 spikes on the pit floor with hitbox-to-art 0.75 x 0.625;
1 one-way platform.

## P4c. Reskin with a Rule Override Tile, and what Use Delaunay Mesh changes

```python
job("AgentKit.TwoD.TilemapJobs.CreateRuleOverrideTile", {"source": "Assets/Tiles/GroundRule.asset",
    "sheet": "Assets/Art/Pixel/Reskin/tiles_snow.png", "out": "Assets/Tiles/GroundRule_Snow.asset"})
job("AgentKit.TwoD.SpriteJobs.SetPhysicsOutline", {"path": "Assets/Art/Pixel/crenel_tile.png", "outline": CRENEL})   # 16-point concave outline
job("AgentKit.TwoD.TilemapJobs.ColliderShapes", {"rows": ut_2d.DEMO_LEVEL, "irregular": "Assets/Art/Pixel/crenel_tile.png"})
```

Choice (Tilemap Extras 6.0 docs, 6.0.2 source): a reskin that must follow later rule edits is a
**Rule Override Tile** (`m_Tile` = the source, `ApplyOverrides(List<KeyValuePair<Sprite, Sprite>>)`,
`Override()`; it owns no rules, its hidden instance tile copies them); a new tileset with the same
layout but an independent rule set comes from a **Rule Tile Template** (Rule Tile inspector > More >
Create Rule Tile Template; editor `RuleTileTemplate.ApplyTemplateToRuleTile`); a sheet drawn to
AutoTile's floor-layout convention (Mask_2x2, 16 layouts; Mask_3x3, 48) is an **AutoTile** (6.1+),
but its masks are painted in the inspector: `AutoTile.AddSprite(sprite, texture, mask)` is internal
in 6.0.2, so an agent writes Rule Tiles and leaves AutoTile masks to a human or computer-use step.
Create the override asset BEFORE applying overrides (its instance tile becomes a sub-asset).
Verification paints test shapes (a 3 x 3 block, an L, a column, a pair, singles) in an unsaved scene
and reads every cell back. Result: PASS. 16 sprite overrides, shares the rules of GroundRule (16
rules copied into the instance tile), 17 probe cells all resolved to the snow sheet with the right
mask, 0 mismatches. Delaunay (2D e-book p. 91: "Use Delaunay Mesh", fewer shapes and small
triangles), measured on the 197-cell level:

| Tile collider                                  | Delaunay off: shapes | on: shapes       | merged composite (Outlines) |
| ---------------------------------------------- | -------------------- | ---------------- | --------------------------- |
| Grid                                           | 197                  | 197              | 4 paths, 24 points          |
| Sprite, generated physics shape (a rectangle)  | 197                  | 197              | 4 paths, 24 points          |
| Sprite, crenellated custom outline (16 points) | 1379 (7 per tile)    | 985 (5 per tile) | 433 paths either way        |

So Use Delaunay Mesh matters for concave tile outlines kept as per-tile colliders (runtime-edited
tiles: 29% fewer shapes here); it changes nothing for grid or rectangular tiles, nor for the merged
composite.

## P5. URP 2D light rig (Global, Spot with normal maps, Sprite light, shadows)

```python
job("AgentKit.TwoD.LightJobs.LightRig", {"global": {"intensity": 0.6, "color": [0.6, 0.65, 0.9]},
    "points": [{"name": "TorchLight", "parent": "Torch_0", "intensity": 2.2, "outer": 7, "normal": "Accurate", "distance": 3, "shadows": True},
               {"name": "PlayerLight", "parent": "Player", "intensity": 0.5, "outer": 2.5, "normal": "Fast", "layers": ["Ground", "Background"]}],
    "sprite_lights": [{"name": "LightShaft", "sprite": "Assets/Art/Pixel/Lights/light_shaft.png", "position": [16, 8, 0], "scale": 3}]})
```

Unity calls: `Light2D.lightType` (`Global`, `Point` = "Spot Light 2D", `Sprite`), `intensity`,
`color`, `pointLightInner/OuterRadius`, `falloffIntensity`, `shadowsEnabled`, `targetSortingLayers`
(IDs), `lightCookieSprite`; Normal Maps through `SerializedObject` because
`normalMapQuality`/`normalMapDistance` are read-only in URP 17.3:

```csharp
var so = new SerializedObject(light);
so.FindProperty("m_NormalMapQuality").intValue = (int)Light2D.NormalMapQuality.Accurate;
so.FindProperty("m_NormalMapDistance").floatValue = 3f;
so.ApplyModifiedPropertiesWithoutUndo();
```

Other Global lights in the scene are removed first (one per blend style per sorting layer); the
player fill light excludes the Characters layer (Sasquatch). That choice costs light batches: see
P5c. Result: PASS. 5 lights, 1 Global, 1 shadow-casting light, 2 shadow casters; read-back Normal
Maps Accurate. Observed defaults of `AddComponent<Light2D>()`: type Point, **shadows ON**, **normal
maps Disabled**.

## P5c. What the lights cost: light batches, fill proxy, tier flags (plus the PlayMode bench)

`job("AgentKit.TwoD.LightJobs.LightCost", {"scene": "Assets/Scenes/Level2D.unity", "width": 1920, "height": 1080, "tier": "mobile", "engine_check": True}, graphics=True)`
(needs the camera from P6)

Model (e-book p. 131 to 132; URP 17.3 source [obs]): consecutive sorting layers share a light batch
only when every visible light lights both or neither and every shadow caster shadows both or neither
(`LayerUtility.CanBatchLightsInLayer`); the Render Graph runs the normal, shadow and light passes
once per batch (`Renderer2DRendergraph`). The job replicates that on the scene (lights inside the
view, `Light2D.targetSortingLayers`, `ShadowCaster2D.IsShadowedLayer` by reflection), explains every
break, sums a fill proxy (screen fraction of each non-Global light, per batch that draws it), flags
lights covering more than half the view (`2d.light_large`, [added] threshold), Accurate normals on a
non-desktop tier (`2d.light_normal_quality`) and shadow lights over budget; with `engine_check` it
renders once and asks URP's own internal `LayerUtility.CalculateBatches` (the Light Batching
Debugger's call) by reflection. Result: PASS. 4 light batches, engine count 4 (replica agrees):
[Background], [Default], [Ground], [Characters, Foreground], all three breaks caused by PlayerLight
(targets Background and Ground only); light fill 3.64 screens (the torches are drawn in all 4
batches; about 0.99 if every light targeted every layer), shadow fill 2.27, light render scale 0.5,
1.89 M light-texture pixels per frame at 1080p; flags: TorchLight covers 57% of the view, Accurate
normals on a mobile tier. Batches are per view (only lights inside it count): with `center` [28, 6]
(the job also runs without a camera and under `-nographics` when `center` is given) the same scene
gives 1 batch and 0.40 screens of fill, because PlayerLight is out of view; check the views the
player actually sees.

PlayMode `LightFillBench` (in P7): the same lit wall of normal-mapped tiles on three sorting layers
rendered at 3840 x 2160 through `RenderPipeline.SubmitRenderRequest`, synced with
`AsyncGPUReadback.WaitForCompletion`, 32 point lights, the six setups interleaved over 7 rounds
(median of 12-render samples), engine batch count per setup. See the P7 table for the numbers.
Editor timings compare setups on this machine; device numbers belong to scenario-unity-performance.

## P5b. Normal maps respond (capture pair)

Capture (P6 job) with normals on, rerun `LightRig` with `"disable_normals": true`, capture again,
compare on the torch-lit platform, restore. Result: PASS. 64% of the platform's pixels change; mean
luma 0.320 with normals vs 0.352 without (the N.L term dims faces that point at the camera: retune
intensity after enabling normals); whole-frame max difference 0.27. Contact sheet looked at: bevels
catch the torch on the side facing it.

## P6. Pixel Perfect Camera in URP + captures that prove it

```python
job("AgentKit.TwoD.CameraJobs.SetupPixelPerfect", {"ppu": 16, "ref": [320, 180], "grid_snapping": "UpscaleRenderTexture", "filter": "Point", "position": [10, 6]})
cap = job("AgentKit.TwoD.CameraJobs.CapturePixelPerfect", {"shots": [
    {"name": "1080p", "width": 1920, "height": 1080}, {"name": "720p", "width": 1280, "height": 720},
    {"name": "ultrawide", "width": 2560, "height": 1080},
    {"name": "1080p_snap", "width": 1920, "height": 1080, "grid_snapping": "PixelSnapping"},
    {"name": "stretch_retro", "width": 1366, "height": 768, "crop": "StretchFill", "filter": "RetroAA"},
    {"name": "stretch_point", "width": 1366, "height": 768, "crop": "StretchFill", "filter": "Point"}]}, graphics=True)
for s in cap["shots"]:
    print(s["name"], s["pixel_ratio"], ut_2d.pixel_block_check(s["path"], s["pixel_ratio"])["uniform_block_fraction"])
print(ut_2d.void_columns(ultrawide_png, bg=[20, 18, 31], scale=6))     # camera shows past the level?
ut_review.review_images([s["path"] for s in cap["shots"]], sheet="sheet.png")   # then LOOK at sheet.png
```

Unity calls: `UnityEngine.Rendering.Universal.PixelPerfectCamera` (`assetsPPU`, `refResolutionX/Y`,
`gridSnapping`, `cropFrame`; `m_FilterMode` through `SerializedObject`, no public setter),
orthographic camera; captures through `AgentCapture.RenderCamera`
(`RenderPipeline.SubmitRenderRequest` sets `camera.targetTexture`, which the component reads instead
of `Screen`); **`CameraJobs.WarmLights2D()` first**: calls the internal `Light2D.UpdateMesh(true)`
and `UpdateBoundingSphere()` by reflection, because a batch capture right after `OpenScene`
otherwise culls every non-Global 2D light (observed: only the Global light rendered). Result: PASS.
Ortho 5.625, view 20 x 11.25 units; uniform 6 x 6 blocks at 1080p = 1.000 (pixel ratio 6), 720p =
1.000 (ratio 4), 21:9 = 1.000; Pixel Snapping 0.618 (lights stay at screen resolution); softness at
1366 x 768 Stretch Fill 0.188 Retro AA vs 0.092 Point; at 2560 x 1080 the camera shows 53 art pixels
of void past the level's left edge (16:9 shows none): fix with a confiner or level bounds. Contact
sheet and 2x crops looked at: square uniform pixels, no blur in Upscale Render Texture mode, smooth
light gradients in Pixel Snapping mode, visible softening with Retro AA.

## P6b. Pixel shimmer over a camera pan (and the Retro AA vs Point trade-off, measured)

```python
step = 0.37 / 16                                   # 0.37 art pixel per frame: sub-pixel motion on purpose
shots = ut_2d.pan_shots("stretch_point", (10, 6), step, 10, 1366, 768, grid_snapping="UpscaleRenderTexture", crop="StretchFill", filter="Point")
# ... one list per setup; ppc=False with ortho=5.625 renders without the component
cap = job("AgentKit.TwoD.CameraJobs.CapturePixelPerfect", {"shots": shots}, graphics=True)
sh = ut_2d.shimmer_check([s["path"] for s in cap["shots"]], max_shift=24)
```

`shimmer_check` finds, for each pair of consecutive frames, the integer horizontal shift that best
maps one onto the other and scores the share of pixels that still differ (a grid-locked renderer
slides rigidly; shimmer is art pixels changing width or color while the scene slides). URP 17.3
[obs]: `PixelPerfectCamera` rounds the camera position to its units-per-pixel before every render
(`PixelSnap`), so with the component on a pan moves in whole pixels. Result: PASS, 6 setups x 10
frames:

| Setup                                               | mean rigid | min rigid | shifts (px per frame)     | softness |
| --------------------------------------------------- | ---------- | --------- | ------------------------- | -------- |
| Upscale RT, Crop None, 1080p (ratio 6)              | 0.99966    | 0.99895   | 0 or 6 (whole art pixels) | 0.066    |
| Upscale RT, Crop None, 1366 x 768 (ratio 4, border) | 0.99963    | 0.99889   | 0 or 4                    | 0.093    |
| Pixel Snapping, 1080p                               | 1.0        | 1.0       | 0 or 6                    | 0.093    |
| no Pixel Perfect Camera, 1366 x 768                 | 0.97216    | 0.96886   | 2 every frame             | 0.126    |
| Stretch Fill + Point, 1366 x 768                    | 0.99386    | 0.98114   | 0 or 4                    | 0.092    |
| Stretch Fill + Retro AA, 1366 x 768                 | 0.99695    | 0.99078   | 0 or 4                    | 0.189    |

Reading: integer framing is rigid (the residual 0.03% is light-texture resampling); without the
component 2.8% of pixels crawl per frame; under Stretch Fill, Point shimmers (0.61%) and Retro AA
halves that (0.31%) at twice the softness, which is the Manual's trade-off ("prevents sprites
shimmering when they move, but can make pixels look blurry"). Gate: min rigid >= 0.99 on the shipped
setup. Contact sheet looked at (`evidence/p6b_shimmer/contact_sheet.png`): pan visible between frame
0 and 9, Windowbox border at 1366 x 768 with Crop None.

## P7. PlayMode tests with simulated input (controller and forgiveness, atlas and light benches, juice, top-down, Cinemachine)

`t = ut_run.run_tests(P, "PlayMode", graphics=True)`
(`Unity -batchmode -projectPath P -runTests -testPlatform PlayMode -testResults <xml>`, no `-quit`);
metrics: `ut_2d.metrics_from_nunit(t)`. Test code: `tests/code/unity-2d/unity/Tests/PlayMode2D/`
(asmdef refs `AgentKit.TwoD.Runtime`, `Unity.InputSystem`, `UnityEngine.TestRunner`, the URP runtime
and 2D runtime assemblies, nunit) and `Tests/PlayMode2DCinemachine/` (same plus `Unity.Cinemachine`
and `AgentKit.TwoD.Cinemachine`, `defineConstraints` AGENTKIT_CM3 from a `versionDefines` on
com.unity.cinemachine >= 3.0.0, so it compiles only where CM3 is installed). Input:
`InputSystem.AddDevice<Keyboard>()` +
`InputSystem.QueueStateEvent(kb, new KeyboardState(Key.Space))`, with a fresh `InputSettings`
(`backgroundBehavior = IgnoreFocus`,
`editorInputBehaviorInPlayMode = AllDeviceInputAlwaysGoesToGameView`) because a batch editor has no
focused Game view. Time: `Time.captureDeltaTime = 0.02` (one physics step per frame), other frame
rates per test. Result: PASS, 36/36 (v0.2; v0.1 was 16/16). Tarodev defaults unless stated:

| Test                                    | Measured (Tarodev defaults)                                                                                                                                                                                                                                                                        |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| JumpApexMatchesStats                    | apex 5.536 units = 50 Hz prediction 5.536 (continuous formula 5.891); rise 0.32 s; airtime 0.66 s; 6.5 body heights of a 0.85-unit collider                                                                                                                                                        |
| VariableJumpTapIsLower                  | tap 2.076 (prediction 2.076), 0.375 of the full jump                                                                                                                                                                                                                                               |
| CoyoteWindowMeasured                    | accepted 0.14 s after leaving the ledge, refused at 0.16 s (setting 0.15)                                                                                                                                                                                                                          |
| JumpBufferMeasured                      | press 0.18 s before landing jumps on landing, 0.22 s does not (setting 0.2); 0.20 s sits on the strict `<` float boundary (accepted in this run, not guaranteed)                                                                                                                                   |
| OnePressOneJumpAtAnyFrameRate           | 5 presses = 5 jumps at 144, 60 and 30 fps (50 Hz physics)                                                                                                                                                                                                                                          |
| ApexHangAddsAirtime                     | airtime 0.66 to 0.74 s (half gravity below 5 u/s while held)                                                                                                                                                                                                                                       |
| CornerCorrectionPassesLedge             | head overlapping a ceiling edge by 0.1: nudged 0.125 units and passed (apex 5.56); off: bonked at 1.19                                                                                                                                                                                             |
| TimeToTopSpeed                          | 6 steps = 0.12 s to 14 u/s (14/120 = 0.117); stop 0.24 s                                                                                                                                                                                                                                           |
| AnimatorFollowsControllerOutcome        | Idle at rest, Jump 15 frames, Fall 16 frames, Idle after landing                                                                                                                                                                                                                                   |
| AtlasCutsTexturesNotBatches             | 20 sprites, Sprite-Lit-Default, SRP Batcher: batches 21 vs 21, SetPass 2 vs 2, draw calls 21 vs 21; bound textures 20 vs 1; texture memory 60.7 KB vs 66.5 KB (tiny icons, 62% usage: no memory win here); `Used Textures` counters read 0 in Editor Play mode                                     |
| HitStopRestoresAndExtends               | 0.05 s then 0.06 s at +0.02: frozen 0.080 s (not 0.11), time scale restored to 0.5; multiplier 0 disables                                                                                                                                                                                          |
| ShakeMultiplierZeroAndKickDirection     | multiplier 0: offset 0; kick -0.9375 (opposite to fire, whole 1/16 px); settles to 0                                                                                                                                                                                                               |
| DiagonalSpeedEqualsAxisSpeed            | axis 5.0, normalized diagonal 5.0, raw diagonal 7.07; last facing kept                                                                                                                                                                                                                             |
| VariableHeightMethodsCompared (3 cases) | full / tap / 6-frame hold apex, each = discrete prediction: GravityMultiplier 5.536 / 2.076 (0.375) / 3.972; VelocityCut 0.5 5.536 / 1.810 (0.327) / 3.876; Sustain 0.2 s with JumpPower 36 13.456 / 6.256 (0.465) / 9.856 (retune: JumpPower 18.7 gives 5.52 / 1.78, rise 0.38 s, offline replay) |
| CoyoteToggle, BufferToggle              | press 0.08 s after the ledge: on 1 jump, off 0; press 0.1 s before landing: on 1 jump, off 0                                                                                                                                                                                                       |
| VariableJumpToggle, FallClampToggle     | off: tap 5.536 = full; clamp on: min vy -40, off: -81.4 after a 30-unit drop                                                                                                                                                                                                                       |
| AirFrictionProfiles (30, 240)           | release the stick at top speed in the air: AirDecel 30 drifts 3.128 units (5.7 body widths, 24 steps), 240 drifts 0.272 (0.5 width, 3 steps); both = per-step prediction                                                                                                                           |
| HazardHitboxSmallerThanArt              | art-size hitbox: hit on a 1 px graze; inset 2/3 px (0.75 x 0.625): no hit on 1 px, hit on 5 px                                                                                                                                                                                                     |
| TriggersAreNeverGround                  | first landing at y 0.016 on the real ground, not on a trigger slab at 3.25 (casts use `useTriggers = false`)                                                                                                                                                                                       |
| OneWayPlatformThroughLandDrop           | jump up through (apex 5.536, no head bonk), rests on the top at 2.505, Down + Jump drops to 0.005, 1 drop, 1 jump                                                                                                                                                                                  |
| FallDampingSwitchHysteresis             | loose rising and on a -10 u/s hop, tight below -15, jitter at -14/-16 never flips it, back at 0; 2 switches; max damping change 0.05 per 0.02 s frame (lerped)                                                                                                                                     |
| LightFillBench                          | see the paragraph below the table                                                                                                                                                                                                                                                                  |
| FallDampingShowsMoreBelow (CM3)         | 40-unit drop: fixed 0.6 s damping, min view below the feet -0.53 to 0.0 units over 4 runs (feet at or past the bottom edge); with `CinemachineFallDamping` 3.24 to 3.41 units; 2 switches, released after landing                                                                                  |
| RoomSwapOnExitNotEnter (CM3)            | into the doorway and stop: room A; turn back out left: A; through right: B; back left: A; 3 exits, 2 swaps                                                                                                                                                                                         |

LightFillBench at 3840 x 2160 (32 point lights over a normal-mapped wall on 3 sorting layers, median
ms per render; final suite run, then the range over 6 interleaved runs): small (radius 1) 2.32 ms, 1
batch; large (radius 25) 2.92 ms, 1 batch (+26%; range +8 to +43%); large with shadows and 24
casters 16.85 ms (x5.8; x5.4 to x5.9); large plus one fill light that skips Characters 5.49 ms with
3 batches (+88%; +72 to +101%); normal maps Fast 2.92 vs none 2.14 (+15 to +36%); Accurate 2.97 vs
Fast 2.92 (within noise, -8 to +14%). Asserted: 1 batch when every light targets every layer, more
batches with the skipping light, the split over 1.1x and shadows over 1.5x the large-light time. Not
asserted: large vs small (the first bench, 16 lights measured one setup after another, gave +23%
then -13%; interleaving fixed the sign but not the spread). Logs:
`archive/tests/unity-2d/lightfillbench_repeats_2026-09-24.log`.

Bug found and fixed by these tests: the Tarodev repo initializes `_timeJumpWasPressed` to 0, so a
player landing within the first 0.2 s of play gets a phantom buffered jump (8 tests failed with
"never grounded" until `m_TimeJumpWasPressed = float.MinValue`). Window boundaries:
`HasBufferedJump` and `CanUseCoyote` use a strict `<` on the accumulated controller clock, so a
press exactly 0.20 s (or 0.15 s) away lands on a float boundary and may go either way (the buffer
run above accepted 0.20 by float luck); the gates therefore assert one step inside (accepted) and
one step outside (refused). Found in review and fixed in v0.2: the Tarodev-style ground and ceiling
casts used the plain `CapsuleCast(..., layerMask)`, which hits triggers (Physics 2D Queries Hit
Triggers is on by default) and one-way platforms; the controller now casts with a `ContactFilter2D`
(`useTriggers = false`), ignores one-way colliders above the head, accepts them underfoot only on
their top face while not rising, and handles Down + Jump drop-through with
`Physics2D.IgnoreCollision` for `DropThroughTime` (0.25 s, [added]).

## P8. Sprite animation clips + Animator by script, and the lint

```python
job("AgentKit.TwoD.AnimJobs.BuildSpriteAnimator", {"sheet": "Assets/Art/Pixel/player.png", "clips": {
    "Idle": {"frames": ["player_idle0", "player_idle1"], "fps": 4}, "Run": {"frames": ["player_run0", "player_run1", "player_run2", "player_run3"], "fps": 12},
    "Jump": {"frames": ["player_jump"], "loop": False}, "Fall": {"frames": ["player_fall"], "loop": False}}})
job("AgentKit.TwoD.AnimJobs.LintAnimator", {"controllers": ["Assets/Animation/Player.controller"]})
```

Unity calls: `EditorCurveBinding.PPtrCurve("", typeof(SpriteRenderer), "m_Sprite")`,
`AnimationUtility.SetObjectReferenceCurve`, `AnimationClipSettings.loopTime`;
`AnimatorController.CreateAnimatorControllerAtPath` (or reset in place: `RemoveParameter`,
`RemoveState`, `RemoveAnyStateTransition`, no file deleted), `AddParameter`, `AddState`,
`AddTransition` with `hasExitTime = false`, `duration = 0`, `AddAnyStateTransition` with
`canTransitionToSelf = false`; transitions read Grounded and VelocityY set by the bridge from the
controller's outcome. Result: PASS. Run 4 frames at 12 fps = 0.333 s (no extra hold key: Unity
already gives the last sprite key one frame; with a hold key the clip was 0.417 s);
Player.controller 0 findings; the seeded Bad.controller flagged `2d.anim_blend` (exit time + 0.25 s
duration), `2d.anim_any_self`, `2d.anim_param` (wrong-case "Speed").

## P9. 2D scene audit (clean, seeded faults, repaired)

`job("AgentKit.TwoD.Audit2D.Scene", {"scene": "Assets/Scenes/Level2D.unity", "ppu": 16})` Checks
listed in `Audit2D.cs` (imports of every sprite used by renderers and tilemaps, PPU vs Pixel Perfect
Camera, lights, sorting, physics; v0.2: `2d.hazard_hitbox` for hazards whose hitbox is not smaller
than the art, `2d.hazard_solid`, `2d.effector_unused`, and `2d.light_normal_quality` with `tier`
mobile or low). Sprite sources are resolved with `AssetDatabase.GetAssetPath(sprite)`: with Sprite
Atlas V2 enabled, `sprite.texture` in the editor can already be the atlas page (observed: the first
version of the audit missed a Bilinear crate that way). Result: PASS. Clean scene 0 errors; seeded
(crate Bilinear, a second Global light, torch normals off, a spike with an art-size hitbox) flagged
`2d.filter`, `2d.global_dup`, `2d.light_normals_off`, `2d.hazard_hitbox`; repaired 0 errors.

## P10. Top-down sorting: Custom Axis on the 2D Renderer

`job("AgentKit.TwoD.TwoDSetup.TopDownSorting", {"source": "Assets/Settings/Renderer2D.asset", "out": "Assets/Settings/Renderer2D_TopDown.asset", "axis": [0, 1, 0]})`
`SerializedObject` on `Renderer2DData` (`m_TransparencySortMode = CustomAxis`,
`m_TransparencySortAxis`), internal fields; done on a copy assigned to top-down scenes. Result:
PASS. CustomAxis (0, 1, 0); read-back of the template renderer: light render scale 0.5, 16 light and
1 shadow render textures, blend styles Multiply, Additive, Multiply with Mask (R), Additive with
Mask (R).

## P11. LowLevelPhysics2D (Box2D v3) spike

`job("AgentKit.TwoD.PhysicsJobs.LowLevelSpike", {"steps": 150, "dt": 0.02})`
`PhysicsWorldDefinition.defaultDefinition` with `simulateType = PhysicsWorld.SimulationType.Script`
(the field is `simulateType`, not `simulationType`), `PhysicsWorld.Create`,
`CreateBody(PhysicsBodyDefinition{type, position})`,
`CreateShape(PolygonGeometry.CreateBox(size, 0, false))`,
`CreateShape(CircleGeometry.Create(0.25f))`, `world.Simulate(dt)`, `world.Destroy()`. Guarded with
`#if !UNITY_6000_5_OR_NEWER` (renamed PhysicsCore2D in 6.5). Result: PASS. Circle dropped from 5
rests at 0.2499 (expected 0.25), asleep; ran under `-nographics` (compute shaders reported
supported).

## P12. Hero frames for the look

Two 1920 x 1080 captures of the lit level (Upscale Render Texture),
`ut_review.review_images(..., expect="night")`, `pixel_block_check`. Result: PASS. Uniform blocks
1.000 on both; mean luma 0.13 (a torch-lit cave, judged with the night band); contact sheet looked
at: grass caps, outlines, pits and floating platforms resolved by the rule tile, warm pools under
the torches, crate shadows, crisp player.

## P13. Cinemachine 3 follow camera with a 2D confiner and pixel perfect (fixes the 21:9 void of P6)

Pin the package first: `"com.unity.cinemachine": "3.1.7"` in `Packages/manifest.json` (the
6000.3.21f1 editor defaults to 2.10.7, CM2 API). The rig lives in the runtime assembly
`AgentKit.TwoD.Cinemachine` (`scripts/Runtime/TwoDCinemachine/`), compiled only when CM3 is present
(asmdef `versionDefines` com.unity.cinemachine >= 3.0.0 -> `AGENTKIT_CM3`, `defineConstraints` on
it); the editor job calls it by reflection, so projects without Cinemachine still compile (one
compile error would abort every batch job).

```python
job("AgentKit.TwoD.CinemachineJobs.Setup", {"follow": "Player", "bounds": [0, 0, 40, 14], "ortho": 5.625,
    "target_offset": [1, 0, 0], "damping": [0.3, 0.5, 0]})
cap = job("AgentKit.TwoD.CinemachineJobs.Capture", {"shots": [{"name": "uw", "width": 2560, "height": 1080, "confine": True},
    {"name": "uw_free", "width": 2560, "height": 1080, "confine": False}]}, graphics=True)
```

Unity calls: `CinemachineBrain` on the Main Camera; `CinemachineCamera` (`Follow`,
`Lens.OrthographicSize`, `ModeOverride Orthographic`), `CinemachinePositionComposer` (`TargetOffset`
X = 1 for facing bias, Sasquatch; `Damping`), `CinemachineConfiner2D.BoundingShape2D` = a trigger
`CompositeCollider2D` (Polygons) fed by a `BoxCollider2D` with `compositeOperation = Merge` on a
Static body, `InvalidateBoundingShapeCache()`, `BoundingShapeIsBaked`; `CinemachinePixelPerfect`
extension. Batch/edit mode: nothing ticks the Brain, so `CinemachineBrain.ManualUpdate(frame, dt)`
in a loop with `camera.targetTexture` set (the Brain reads the output aspect from it); the Pixel
Perfect extension acts in edit mode only when `PixelPerfectCamera.runInEditMode` is true; and the
Pixel Perfect Camera computes its zoom only while rendering, so render once at the target size
BEFORE ticking (without it the extension used the stale Screen-sized ortho 7.5 and the confined
frame still showed the void). Result: PASS. Cinemachine 3.1.7 in `packages-lock.json`; confiner
baked in 12 ticks; at 2560 x 1080 the confined camera stops at x = 13.31 (half view width 13.33) and
shows 0 art columns of void, unconfined it follows the player to x = 4.5 and shows 141; 1080p
confined 0; every frame 100% uniform 6 x 6 blocks; ortho 5.625. Contact sheet looked at.

Runtime behaviors on top of the rig (v0.2, tested in Play mode in P7 with the Brain ticking
normally):

- `CinemachineFallDamping` (on the CinemachineCamera, `DefaultExecutionOrder(-100)`, before the
  Brain's LateUpdate) feeds the follow target's `Rigidbody2D.linearVelocity.y` to
  `FallDampingSwitch.Step` and writes `CinemachinePositionComposer.Damping.y`. Rules from Sasquatch
  9dzBrLUIF8g: loose rising, tight falling [00:05:37]; switch past a speed threshold and back when
  vertical speed is at least 0 [00:07:14]; lerp the damping, never move the camera directly
  [00:06:43]. His values are on screen only, so the defaults (0.6 s, 0.1 s, -15 u/s, 0.2 s blend)
  are [added].
- `CinemachineRoomSwap` on a door trigger: `OnTriggerExit2D`, exit direction = player bounds center
  minus trigger center, raises the destination camera's `Priority` and calls `Prioritize()`
  ([00:14:11], [00:14:43]). Each room camera's confiner bounds end at the room walls and at any
  secret room's border ([00:02:10], [00:16:52]); `ut_2d.bounds_hide_secrets(bounds, secrets)` checks
  the rects (offline test: bounds reaching 2 units into a secret room flagged).
- Only one room camera should start live (Sasquatch [00:17:24]); `MakeLive(start, other)` sets it
  without counting a swap.

## P14. Profiler frame timings of the level in Play mode

`ut_run.run_method(P, "AgentKit.AgentProfile.PlayModeTimings", {"scene": "Assets/Scenes/Level2D.unity", "frames": 300, "warmup": 60, "render": True, "width": 1920, "height": 1080, "out_csv": csv}, quit=False, graphics=True)`
then `ut_stat.summarize_csv(csv, target_ms=16.667)` (scenario-unity-expert toolkit:
`ProfilerRecorder` counters in a batch editor). Result: PASS (final suite run). 300 frames; CPU
frame p50 0.71 ms, p95 1.10 ms (budget 16.67 ms: pass); GC p50 88 bytes per frame, the Editor
baseline the toolkit measured with nothing scripted (the controller allocates nothing per frame),
one frame at 329 KB (Editor, not traced); 26 batches, 28 SetPass (4 light batches); GPU frame time
not reported in the Editor, so fill-rate cost is compared with P5c and `LightFillBench`, and device
numbers belong to scenario-unity-performance.

## Not run here, and why

- Skinning Editor rigging, AutoTile mask painting, Tile Palette painting, Sprite Swap overlay, the
  Light Batching Debugger and Sprite Atlas Analyzer windows: GUI-only (paths in `gui-paths.md`); the
  scripted substitutes above (`LightCost` with the engine batch count, `AuditAtlases`) cover what an
  agent can measure.
- Cinemachine ledge pans, corridor and locked-room framings (Sasquatch [00:12:47], [00:15:48],
  [00:16:52]) and the eased facing-bias follow proxy ([00:04:30]): design patterns in
  `expert-notes.md`, not built as components here (scenario-unity-animation owns Cinemachine 3 in
  depth).
- Device builds and GPU timings: owned by scenario-unity-mobile, scenario-unity-web,
  scenario-unity-performance; Editor Play mode numbers are for iteration only.
