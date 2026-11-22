# Procedures (scenario-unity-vfx): copyable, each with its live test and recorded result (v0.2: P14 to P19 added)

All procedures ran in Unity 6000.3.21f1 (URP 17.3, VFX Graph 17.3.0, Metal, macOS 26.5.1 Apple
Silicon) on 2026-09-24 in `tests/projects/unity-vfx/` (APFS clone of `Base3D_URP` + VFX Graph).
Every result line is in `archive/tests/unity-vfx/live_results.jsonl`; images, heatmaps, CSVs and
JSON under `archive/tests/unity-vfx/evidence/`. Full C# lives in `scripts/AgentKit/Vfx/` (namespace
`AgentKit.Vfx`), `scripts/Runtime/Vfx/`, `scripts/EditorGraph/`; this file shows how to call it and
what it does inside (Unity APIs), per the scenario-unity-expert report format.

## P0. Set up a VFX project (and the offline checks)

```python
import sys; sys.path.insert(0, "<skills>/scenario-unity-vfx/scripts")
import ut_vfx, ut_run, ut_review, ut_stat
P = ut_vfx.project("<repo>/tests/projects/unity-vfx")   # cp -cR Base3D_URP; manifest += com.unity.visualeffectgraph 17.3.0; install()
# install(): core AgentKit -> Assets/Editor/AgentKit/, jobs -> Assets/Editor/AgentKit/Vfx/, VfxOverdraw.shader ->
# Assets/AgentKitVfx/Shaders/, runtime (asmdef AgentKit.Vfx.Runtime) -> Assets/AgentKitVfx/Runtime/, and, when VFX Graph
# is in the manifest, the friend-assembly graph authoring -> Assets/AgentKitVfx/EditorGraph/
r = ut_run.run_method(P, "AgentKit.AgentJob.Echo")      # first start imports VFX Graph: 48 s here, then 10 to 20 s per job
```

Live test: `tests/code/unity-vfx/test_offline.py` (pure Python: verdicts, `.vfx` YAML facts on the
editor's templates, pCache writer, effect mask; v0.2: importance ladder, crowd readability, effect
energy, motion gaps, texel verdict, effect verdict, graph hygiene). Run 2026-09-24 (v0.2): pass, 22
checks (02_Simple_Loop capacity 68 Recorded bounds, sort Auto; 03_Simple_Burst 128, sort Off;
hygiene flags capacity 68 for 10 alive). First Echo: ok, 48.4 s, 0 compile errors.

## P1. Build a Shuriken effect (or a whole kit) from C#

The layer spec keeps one job per layer; every module is set explicitly; seeds are fixed so captures
repeat.

```python
r = ut_vfx.run(P, "AgentKit.Vfx.VfxFireballKit.Build", {"folder": "Assets/VFX/Fireball", "mobile": True, "seed": 7}, graphics=True)
```

Inside (C#): `VfxTextures.MakeStandardSet` writes PNGs (`Texture2D.SetPixels`, `EncodeToPNG`) and
sets `TextureImporter` (`alphaIsTransparency`, `wrapMode = Clamp`, `maxTextureSize` 64/256/512,
`sRGBTexture`, compression; the LUT uncompressed, no mips); `VfxMaterials.Particle` makes
`Universal Render Pipeline/Particles/Unlit` materials (`_Surface = 1`, `_Blend` 0 Alpha / 1
Premultiply / 2 Additive / 3 Multiply, `_ZWrite = 0`, `_Cull = 0`, `_FlipbookBlending`) then
`BaseShaderGUI.SetMaterialKeywords(mat, null, ParticleGUI.SetMaterialKeywords)`;
`VfxShuriken.Build(parent, Layer, seed)` sets `main` (loop, prewarm, lifetime, speed, size, rotation
in radians, start color range, gravity, maxParticles, simulation space, `scalingMode = Hierarchy`,
stopAction), `emission` (`rateOverTime`, `rateOverDistance`, `SetBursts`), `shape`,
`colorOverLifetime`, `sizeOverLifetime`, `limitVelocityOverLifetime.drag`, `noise`,
`textureSheetAnimation` (Grid; random cell = `frameOverTime = new MinMaxCurve(0f, 0.999f)`,
normalized in script; decelerating curve `VfxShuriken.Decelerate()`), `trails` (Ribbon,
`widthOverTrail`, `colorOverTrail`), renderer (`renderMode`, `velocityScale`, `sortingOrder`,
`sortingFudge`, `maxParticleSize`, shadows off,
`SetActiveVertexStreams(Position, Color, UV[, UV2, AnimBlend])`); v0.2: `Layer.mesh` (Mesh mode,
`alignment` Local, instancing off), `yawDeg` (3D start rotation),
`custom1X/custom1Y/custom2X/custom2Y` (Custom Data module in Vector mode + `VfxUber.Streams`),
`localPosition`; size curves through `VfxShuriken.EaseOut/EaseIn` (never linear); prefabs with
`PrefabUtility.SaveAsPrefabAsset`; every root gets a `VfxTier`.

```csharp
// one layer, as the kit writes it (explosion fire billow)
new Layer { name = "Fireball_Billow", material = m.billow, duration = 0.3f, lifetime = new Vector2(0.35f, 0.55f),
    speed = new Vector2(0.6f, 1.6f), size = new Vector2(0.7f, 1.0f), bursts = { Burst(0f, 7, 9) }, maxParticles = 12,
    shapeRadius = 0.3f, drag = 4f, tilesX = 4, tilesY = 4, frameOverTime = VfxShuriken.Decelerate(), flipbookBlend = true,
    sizeOverLife = VfxShuriken.Curve(0f, 0.7f, 1f, 1.1f), colorOverLife = FireFade(), sortingOrder = 1 };
```

Live test: `tests/code/unity-vfx/test_live_fireball.py kit`. Run 2026-09-24 (v0.2): pass, 10 s; 4
prefabs, 8 materials (queue 3000, `_SURFACE_TYPE_TRANSPARENT`, `_FLIPBOOKBLENDING_ON` on the billow
only); draw-call estimate projectile 5, muzzle 3, impact 4 (flash, sparks, scorch, hot core),
explosion 4 (Nordeus: 5 to 6 for a low-level spell); max 36 particles per emitter; maxParticles sums
85 / 18 / 25 / 47. v0.2 changes: six linear size curves eased (found by the motion lint, P9c),
sparks shrink, muzzle sparks 4 to 10 m/s against a 1 to 3 m/s flame, impact flash pushed 0.4 m off
the surface (centered on the hit, half of it was cut by the ground, P18 capture), scorch + hot core.
First v0.1 run failed on `GetComponent<ParticleSystem>() ?? AddComponent<...>()` (Unity fake null):
fixed with an explicit null check.

## P2. Stepped, offscreen capture of a gameplay beat (edit mode, deterministic)

```python
s = ut_vfx.run(P, "AgentKit.Vfx.VfxSequence.CaptureFireball",
               {"width": 960, "height": 540, "gameplay_radius": 1.5, "out_dir": "<evidence>/fireball_sequence"}, graphics=True)
res = s["result"]
rev = ut_review.review_images([f["png"] for f in res["frames"]], sheet="<evidence>/fireball_sequence/contact_color.png")
ut_review.contact_sheet([f["overdraw"]["heatmap"] for f in res["frames"]], "<evidence>/fireball_sequence/contact_overdraw.png")
# then OPEN both sheets and judge with references/critique.md
```

Inside: `EditorSceneManager.NewScene(EmptyScene)`; a stage (ground, target wall, key light, camera
with `renderPostProcessing = false`: the low-end look without Bloom); `camera.aspect = w / h` once
(assigning it freezes it); prefabs placed with `PrefabUtility.InstantiatePrefab`; each frame: the
projectile moves `speed * dt`, every root is advanced with
`ps.Simulate(dt, withChildren: true, restart: firstStepOnly, fixedTimeStep: false)`; at the hit
frame the head layers get `Stop(StopEmittingAndClear)`, the trail `Stop(StopEmitting)` (fades, never
pops), the impact is spawned with `Quaternion.FromToRotation(Vector3.up, normal)` and the explosion
at `hit + normal * 0.45 * radius`, scaled to `radius / 1 m`; at chosen frames
`AgentCapture.RenderCamera` (SubmitRenderRequest into an sRGB target, first white frame discarded).
Live test: `test_live_fireball.py sequence`. Run 2026-09-24: pass, 12 s for 12 frames at 960 x 540
plus heatmaps; hit at frame 29 (0.47 s at 14 m/s); world-space rate-over-distance trail emitted
while stepping (33 live trail particles in flight): moving the transform between `Simulate` calls
works. 0 image errors. Iterations kept: `evidence/fireball_sequence_iter2/` (before the overdraw
cut). The first iteration's flat white procedural shapes read as blocky squares: generators now keep
a value range and erode with a black point.

## P3. Particle count and overdraw budget

```python
v = ut_vfx.sequence_verdict(res, ut_vfx.BUDGETS["mobile"])   # FSE, p95 layers, peak particles, capped emitters, radius ratio, end
m = ut_vfx.effect_mask_stats(frame_png, res["background"])      # screen coverage and mean luma of the effect alone
```

Inside `VfxBudget.Overdraw(cam, renderers, w, h, heatmap)`: for each `ParticleSystemRenderer`,
`BakeMesh(mesh, cam, BakePosition | BakeRotationAndScale)` and `BakeTrailsMesh`; a `CommandBuffer`
sets an `ARGBHalf` target,
`SetViewProjectionMatrices(cam.worldToCameraMatrix, cam.projectionMatrix)`,
`DrawMesh(mesh, identity, Hidden/AgentKit/VfxOverdraw)` (Blend One One, ZTest Always, +1 per
fragment); `Graphics.ExecuteCommandBuffer`; `ReadPixels` into `RGBAHalf`; per-pixel layer count ->
FSE (fragments / screen pixels), coverage, mean, p95, max, heatmap PNG. `VfxBudget.Counts` sums
`particleCount` and flags rate-driven emitters pinned at `maxParticles`; `VfxBudget.VisualRadius`
walks `GetParticles` (+ half `GetCurrentSize`) of the primary layer. Live test:
`test_live_fireball.py sequence` (P3 line). Run 2026-09-24 (v0.2): verdict warn (explained): peak
fill 0.51 FSE (<= 1.5; v0.1 0.40: ease-out billows reach full size in the first third of their life
and the scorch pair adds two quads), peak 98 live particles (<= 100), visual/gameplay radius 0.96, 0
particles at 1.67 s; p95 11 layers (max 28 on a few pixels at the impact frame). v0.1 run: 0.40 FSE,
96 particles; p95 11 only on the 3-frame muzzle moment (flight 7 to 9, impact 8). Iteration
evidence: flight fill 0.31 -> 0.16 FSE and p95 16 -> 11 after replacing 6 overlapping glow quads
with 2 and trimming the head flames, with no visible change (compare `fireball_sequence_iter2/` and
`fireball_sequence/`).

## P4. Twenty simultaneous explosions: worst-case fill and frame time

```python
ut_vfx.run(P, "AgentKit.Vfx.VfxStress.BuildScene", {"scene": "Assets/Scenes/VFX_Stress_20.unity", "count": 20, "period": 1.2,
                                                    "scale": 1.5, "quality": "Mobile", "report": "<evidence>/stress/spawner_20.json"})
ut_vfx.run(P, "AgentKit.Vfx.VfxStress.BuildScene", {"scene": "Assets/Scenes/VFX_Stress_0.unity", "count": 0, ...})
od = ut_vfx.run(P, "AgentKit.Vfx.VfxStress.StressOverdraw", {"scene": ".../VFX_Stress_20.unity", "times": [0.05, 0.15, 0.3, 0.6]}, graphics=True)
for scene in (s20, s0):
    ut_run.run_method(P, "AgentKit.AgentProfile.PlayModeTimings", {"scene": scene, "frames": 600, "warmup": 90, "target_fps": 30,
                      "width": 1280, "height": 720, "out_csv": csv}, quit=False, graphics=True)
cmp = ut_stat.compare_frames(csv0, csv20, column="cpu_frame_ms")
```

Inside: `VfxStressSpawner` (runtime) instantiates N copies once (pooling: `stopAction = None`,
`Clear(true)` + `Play(true)` every period, all together = worst case), caches child systems (no
per-frame `GetComponentsInChildren` garbage), records peak and mean live particles, sets
`Time.captureDeltaTime = 1f / 60f` (float literals: `1/60` in C# is integer division, 0) so every
frame advances 1/60 s of game time (batch Play mode runs uncapped: a first run covered only 0.3 s of
effect life in 300 frames and saw a single replay), optionally switches `QualitySettings` to
"Mobile"; AgentProfile renders the main camera offscreen (batch Play mode draws nothing otherwise)
and records ProfilerRecorder counters. Live test: `tests/code/unity-vfx/test_live_stress.py`. Run
2026-09-24 (v0.2 kit): P4a pass: 20 explosions at their peak = 540 live particles, 1.05 FSE at t =
0.3 s (p95 12, max 19), 0.96 FSE at 0.05 s; crowd readability on this packed layout (2.2 m apart for
a 1.5 m radius) warns: 6 to 9 cores for 20 copies. P4c (v0.2, readability): the same 20 at a 4 m
gameplay spacing, camera pulled back 1.7x: 20, 20 and 21 separate cores at 0.05, 0.15 and 0.3 s,
4.5% clipped white at the flash: pass. P4b (v0.2): CPU frame p50 0.61 -> 0.83 ms (+0.22 ms mean),
draw calls p50 48 (p95 88), peak 560 live particles, mean 231. v0.1 run: 0.83 FSE at t = 0.05 s, p95
11, max 16 layers, 20% of the screen; on the light stress floor the dark smoke finally reads while
the additive fire washes out (context changes the verdict). P4b pass (Play mode, 1280 x 720
offscreen, 600 frames after 90 of warm-up, 10 replays over 11.5 s of game time): peak 560 live
particles, mean 231; CPU frame time p50 0.80 ms (0 copies) -> 0.90 ms (20 copies), +0.10 ms, p95
1.39 ms, verdict pass against the 21.7 ms mobile budget (an M-series editor, not a phone: the device
decides); Draw Calls p50 8 -> 48 (p95 88), Batches and SetPass 8 -> 10, triangles 406 -> 686 (p95
1,526); GPU Frame Time 0 on most editor frames and no Render Thread counter (as the lead observed).
The quality switch to "Mobile" from the spawner did not apply in batch Play mode (both runs report
PC / PC_RPAsset): for mobile settings, launch the editor on the mobile target
(`build_target="android"`, whose default quality level is Mobile) [not run: platform switch
reimport].

## P5. VFX Graph asset from a template, exposed property and event, contract test

```python
A = "Assets/VFX/Graph/VFX_Loop_Fire.vfx"
ut_vfx.run(P, "AgentKit.Vfx.VfxGraphJobs.CopyTemplate", {"template": "02_Simple_Loop", "dest": A})        # public API
ut_vfx.run(P, "AgentKit.Vfx.VfxGraphJobs.Author", {"asset": A, "property": "Rate", "value": 64,            # UNSUPPORTED
           "block": "VFXSpawnerConstantRate", "slot": "Rate", "event": "Fire", "capacity": 512})
c = ut_vfx.run(P, "AgentKit.Vfx.VfxGraphJobs.Contract", {"asset": A, "expect_properties": ["Rate"], "expect_events": ["Fire", "OnStop"]})
facts = ut_vfx.vfx_yaml_facts(P + "/" + A)     # capacity, boundsMode, sort, exposed count (read-only text)
```

Inside:
`AssetDatabase.CopyAsset("Packages/com.unity.visualeffectgraph/Editor/Templates/02_Simple_Loop.vfx", A)`
(what the template window does: copy the text, import). The contract uses
`VisualEffectAsset.GetExposedProperties(List<VFXExposedProperty>)` and `GetEvents(List<string>)`.
`Author` reflects into `AgentKit.VfxGraph.VfxGraphAuthoring`, compiled in an editor asmdef named
`Unity.Testing.VisualEffectGraph.EditorTests`, one of the friend names in the package's
`[InternalsVisibleTo]`: it creates a `VFXParameter` from `VFXLibrary.GetParameters()` (float), sets
`m_ExposedName` and `m_Exposed`, links `outputSlots[0]` to the block's `Rate` slot, adds a
`VFXBasicEvent` (`eventName = "Fire"`) with `LinkTo(spawner, 0, 0)`, sets `capacity` on every
`VFXDataParticle`, then `CompileAndUpdateAsset` + `WriteAssetWithSubAssets`, the window's Compile
and Save. Version-locked to 17.3 and unsupported: prefer the GUI path when a human is available.
Live test: `tests/code/unity-vfx/test_live_vfxgraph.py template author`. Run 2026-09-24: pass.
Template: 0 exposed, events OnPlay, OnStop (six templates, none exposes anything). After Author (9.8
s): exposed `Rate:Single`, events OnStop, Fire (OnPlay gone: wiring an event into Spawn Start
removes the implicit binding, as documented), capacity 512 in Initialize/Update/Output; contract
missing = []; YAML: capacity 512, bounds Recorded, 1 exposed.

## P6. VFX Graph Play-mode test with the right waits

```python
r = ut_vfx.run(P, "AgentKit.Vfx.VfxGraphJobs.PlayTest", {"asset": A, "property": "Rate", "rate": 200, "rate2": 50, "event": "Fire",
               "instances": 20, "out_dir": "<evidence>/vfxgraph"}, graphics=True, quit=False, timeout=600)
```

Inside (driver resumed after the Play-mode domain reload from `SessionState`, `[InitializeOnLoad]`):
`Camera.main.targetTexture = RenderTexture` (else the effect is culled and not simulated in batch
Play mode); IDs cached with `Shader.PropertyToID`; after 1.5 s of game time read
`aliveParticleCount`, `HasAnySystemAwake()`; `SetFloat(id, 200)`, `SendEvent(id)`; per frame
`aliveParticleCount` and `GetParticleSystemInfo(name).aliveCount`; capture at 1 s of game time (not
real time: the first frame after the first `SendEvent` in a fresh editor stalled 1.2 s while VFX
shaders compiled); `SetFloat(id, 50)`, wait, count, capture; 19 `Instantiate` copies + `SendEvent`,
`VFXManager.GetBatchedEffectInfos`; `culled` in view, then camera turned away 5 frames. Live test:
`test_live_vfxgraph.py play`. Run 2026-09-24: pass, 27.7 s. `aliveParticleCount` = **-1** before the
event and on the send tick (unknown, not 0), `HasAnySystemAwake` false; first non-zero count 6
frames after the send; then the count refreshes every **60 frames** (0.05 to 0.1 s of game time at
the editor's rate, about 1 s at 60 fps); `GetParticleSystemInfo` updates on the same beat. Rate 200
-> 196 alive, rate 50 -> 48 (lifetime 0.8 to 1.2 s: the exposed property drives the effect
proportionally); capacity 512; `culled` false in view, true after turning away. Captures show the
dense and the sparse fountain.

## P7. VFX Graph instancing check

Same job (P6). Result 2026-09-24: 20 active instances of `VFX_Loop_Fire` in **1 batch**, 0
unbatched, 149 max per batch, 4,004,188 bytes GPU, 3,240 bytes CPU (capacity 512 x stored attributes
x 20). Close the VFX profiling panels before such a measurement (they disable instancing on the
attached effect; docs).

## P8. Point cache written as text

```python
pts = ut_vfx.sphere_points(1024, 1.0); cols = [((x+1)/2, (y+1)/2, (z+1)/2, 1.0) for x, y, z in pts]
ut_vfx.write_pcache(P + "/Assets/VFX/Graph/PC_Sphere.pCache", pts, colors=cols)     # ASCII, float properties only
ut_vfx.run(P, "AgentKit.Vfx.VfxGraphJobs.ImportPointCache", {"path": "Assets/VFX/Graph/PC_Sphere.pCache"})
```

Live test: `test_live_vfxgraph.py pcache`. Run 2026-09-24: pass: imported as
`UnityEditor.Experimental.VFX.Utility.PointCacheAsset`, 1,024 points, maps
`position 32x32 RGBAHalf`, `color 32x32 RGBAHalf`. Binding it in a graph (Point Cache operator, Set
Position from Map) is GUI work or a prepared graph with an exposed Texture2D.

## P9. VFX audit (prefabs and scenes)

```python
ut_vfx.run(P, "AgentKit.Vfx.VfxAudit.AuditPrefabs", {"folders": ["Assets/VFX"], "tier": "mobile"})
```

Inside: `AssetDatabase.FindAssets("t:Prefab")`, `PrefabUtility.LoadPrefabContents`; per
`ParticleSystemRenderer`: material and shader (`LegacyBlend`, `Shader.isSupported`), Mesh mode
`enableGPUInstancing`, Shader Graph path `AssetDatabase.GetAssetPath(shader)` read as text for
`instancing_options procedural`, `GetActiveVertexStreams` vs `_FLIPBOOKBLENDING_ON`, trails without
`trailMaterial`, World collision on many particles, `maxParticles` vs tier, Lights module on mobile,
shadow casting on URP particle shaders, shared sorting orders, root duration vs longest child life
with a Stop Action, draw-call estimate, texture import sizes; per `VisualEffect`: no asset, Output
Event Handlers, legacy-input binders. Findings in the core format (`AgentAudit.Findings`). v0.2
codes (see the header of `VfxAudit.cs`): `stream_mismatch`, `lut_import`, `data_texture_srgb`,
`mesh_color_format`, `distortion_order`, `distortion_no_opaque`, `linear_curve`,
`no_speed_contrast`, `loop_no_start_burst`, `texture_border`, `no_tier`; `mesh_no_instancing` now
only above 8 max particles. Live test P9b: `test_live_audit.py craft` (fixture
`VfxAudit.MakeCraftFixture`: uber Custom Data material with default streams, compressed mipmapped
LUT, distortion over an additive layer, linear size curve, a sprite filling its cell, a float-color
mesh, no tier). Run 2026-09-24: pass: all 7 expected codes plus `distortion_no_opaque` (the Mobile
quality level has no Opaque Texture) and `no_speed_contrast`; the fireball and mesh-first kits: 0
errors, 0 warns, one info (`loop_no_start_burst` on the projectile, whose start burst is the
muzzle). P9c (lint before the fix): six `vfx.linear_curve` warns on the v0.1 kit (three flashes,
billow, smoke, trail flame). Live test: `tests/code/unity-vfx/test_live_audit.py audit` (fixture
`VfxAudit.MakeBadFixture`: legacy shader, trail without material, 500 max particles, World
collision, mesh particles with a copy of the 6.3 `0_Particle Unlit.shadergraph` template, equal
sorting orders, short root). Run 2026-09-24: pass (24.2 s): the fixture raised all 8 expected codes
(`vfx.legacy_shader`, `world_collision`, `max_particles_tier`, `trail_no_material`,
`mesh_no_instancing`, `sg_no_procedural` on the copy of the 6.3 Shader Graph particle template,
`same_sorting_order`, `root_duration`); the fireball kit is clean (0 findings). The first run also
flagged the kit: two false positives in the audit itself, fixed from that evidence: the
root-duration rule now uses the last emission time (last burst for burst-only systems, not the whole
duration), and a shared sorting order is reported only when a non-additive layer is in the stack
(additive over additive is order independent [added]).

## P10. Legacy particle materials to URP

```python
ut_vfx.run(P, "AgentKit.Vfx.VfxMaterials.MigrateLegacyJob", {"folders": ["Assets"]})
```

Why: URP's converter skips these shaders, and the simple unlit ones still draw in 6.3 URP (observed:
their untagged pass runs as SRPDefaultUnlit), so they are easy to miss; they lack URP's particle
features and the SRP Batcher [added]. Inside: for materials whose shader starts with `Particles/`,
`Legacy Shaders/Particles/` or `Mobile/Particles/`: Multiply/Premultiply/Additive/else Alpha ->
`_Blend`; Standard Surface and VertexLit families -> Particles/Simple Lit, others ->
Particles/Unlit; `_MainTex` -> `_BaseMap`; `_TintColor x 2` -> `_BaseColor` (legacy particle shaders
double the tint [added]); inspector logic applied. Live test: `test_live_audit.py legacy` (test-only
job `AgentKit.VfxTests.VfxTestJobs.LegacyMigrationDemo`: three systems on Legacy Additive, Legacy
Alpha Blended and Mobile Additive, captured before and after). Run 2026-09-24: pass (15.8 s).
Finding: the three legacy shaders did **not** render magenta in 6.3 URP (magenta fraction 0 before),
so the eye will not catch them; after migration all three are
`Universal Render Pipeline/Particles/Unlit` (Additive, Alpha, Additive) and the look held:
before/after PSNR 29.4 dB, 5% of pixels changed (the doubled tint is right). P10b:
`MigrateLegacyJob` on the fixture folder migrated 1 of 3 materials and the re-audit no longer
reports `vfx.legacy_shader`.

## P11. Mesh particles: instanced URP shader versus a 6.3 Shader Graph particle shader

```python
# test-only scene builder, then the core profiler job for each material
ut_vfx.run(P, "AgentKit.VfxTests.VfxTestJobs.MeshParticleScene", {"scene": s, "material": m, "count": 300})
ut_run.run_method(P, "AgentKit.AgentProfile.PlayModeTimings", {"scene": s, "frames": 120, "warmup": 30}, quit=False, graphics=True)
```

Live test: `tests/code/unity-vfx/test_live_instancing.py` (`VFX_MESH_COUNT` = 300, then 5000). Run
2026-09-24: pass both. 300 cubes: identical (7 draw calls, 7 batches, main thread p50 0.71 ms each):
too small to show anything. **5,000 cubes: main thread p50 0.89 ms with URP Particles/Unlit versus
1.51 ms with the Shader Graph particle template (+0.62 ms, +69%), with the same 7 draw calls, 7
batches and 60k triangles**: the render counters do not reveal the dynamic-batching fallback, the
CPU time does (Fred Moreau: vertices transformed on the CPU). Detect it with the audit, confirm with
CPU time or the Frame Debugger, fix in scenario-unity-shaders.

## P12. SDF baked with the public API, saved as a Texture3D

```python
ut_vfx.run(P, "AgentKit.Vfx.VfxGraphJobs.BakeSdf", {"mesh": "builtin:Sphere", "asset": "Assets/VFX/Graph/SDF_Sphere.asset",
                                                   "max_res": 32, "padding": 0.1}, graphics=True)
```

Inside (`scripts/EditorGraph/Sdf/VfxSdf.cs`, asmdef `AgentKit.Vfx.GraphTools`, public API only):
`new MeshToSDFBaker(size, center, maxRes, mesh, 1, 0.5f, 0f)`, `BakeSDF()`,
`AsyncGPUReadback.Request(SdfTexture, 0, 0, w, 0, h, 0, d, null).WaitForCompletion()`, slices copied
into `new Texture3D(w, h, d, RHalf)` + `SetPixelData`, `AssetDatabase.CreateAsset`, `Dispose()` in
`finally` (the Bake Tool's own save is internal). Feed the graph `SetTexture(sdfId, tex)` and
`SetVector3(sizeId, baker.GetActualBoxSize())` (the SDF is normalized). Live test:
`test_live_vfxgraph.py sdf`. Run 2026-09-24: pass, 29.8 s: 32 x 32 x 32 R16_SFloat, box 2.2 m,
center sample -0.42 (inside, negative) and corner +0.39 (outside, positive); values are in the
baker's normalized units.

## P13. The kit glue in Play mode (Test Framework)

```python
t = ut_run.run_tests(P, "PlayMode", filter="AgentKit.Vfx.Tests", graphics=True)
```

Test `tests/code/unity-vfx/unity/Tests/PlayModeVfx/FireballKitTests.cs` (asmdef references
`AgentKit.Vfx.Runtime`): fires `FireballProjectile` at a wall tilted 30/20 degrees; asserts muzzle
forward = shot, hit point on the collider surface, impact `up` . normal > 0.99, explosion scale =
damage radius / 1 m, and after 2.2 s the projectile destroyed and no `(Clone)` effect left (Stop
Action Destroy). Live test: `test_live_playmode.py`. Run 2026-09-24 (v0.2: `VfxSeed.Reseed` on every
spawn, impact with scorch): pass, 1/1 test, 2.6 s in the runner, 0 compile errors.

## P14. Mesh-first effects with the uber VFX shader (Nordeus's backbone)

```python
r = ut_vfx.run(P, "AgentKit.Vfx.VfxMeshFx.Build", {"folder": "Assets/VFX/MeshFx", "seed": 5}, graphics=True)
```

```csharp
// a ring authored at 1 m (U along the ring, V inner to outer, vertex alpha 0 at both edges, Color32)
var ring = VfxMeshes.Save(VfxMeshes.Ring(64, 0.5f, 1f), folder + "/Meshes/VFX_Ring.asset");
var mat = VfxUber.Create(folder + "/Materials/M_Uber_Shockwave.mat", new UberSpec {
    blend = VfxBlend.Additive, main = packed /* R gray, G ridges, B soft; imported sRGB OFF */, mainTiling = new Vector2(6, 1),
    mainScroll = new Vector2(0.8f, 0), tint = new Color(5, 5, 5, 1), ramp = rampEnergy /* 256 x 1, uncompressed, no mips */,
    emission = new Color(1.5f, 2.2f, 3f, 1), erosion = 0f, erosionWidth = 0.35f, secondAlpha = packed, secondTiling = new Vector2(2, 1),
    secondScroll = new Vector2(-0.35f, 0.1f), customData = true });
VfxShuriken.Build(root.transform, new Layer { name = "Ring", material = mat, mesh = ring, alignment = ParticleSystemRenderSpace.Local,
    lifetime = new Vector2(0.6f, 0.6f), speed = Vector2.zero, bursts = { Burst(0f, 1, 1) }, maxParticles = 1, shapeEnabled = false,
    yawDeg = new Vector2(0, 360), sizeOverLife = VfxShuriken.EaseOut(0.25f, 1f),
    custom1X = new ParticleSystem.MinMaxCurve(1f, VfxShuriken.EaseIn(0f, 0.9f)),   // erosion over life
    custom1Y = new ParticleSystem.MinMaxCurve(1f, VfxShuriken.EaseOut(1.6f, 0.2f)), // emission over life
    custom2X = new ParticleSystem.MinMaxCurve(0f, 1f) }, seed);                     // random UV offset per particle
```

Inside: `VfxUber.Create` sets textures, tiling, scroll, the `_*On` toggle floats AND `EnableKeyword`
for each `shader_feature_local` (`_RAMP_ON`, `_EMISSION_G`, `_ALPHA_B`, `_LINEARFADE_ON`,
`_EROSION_ON`, `_SECONDALPHA_ON`, `_CUSTOMDATA_ON`), `_SrcBlend/_DstBlend` (Alpha: SrcAlpha,
OneMinusSrcAlpha; Additive: SrcAlpha, One; Premultiply: One, OneMinusSrcAlpha), `_Cull` Off,
queue 3000. The shader (`scripts/Shaders/VfxUber.shader`, `AgentKit/VFX/Uber`): URP
`UniversalForward`, every material property in `UnityPerMaterial`, fog, `_Time.y` scroll unless the
global `_AgentVfxTime` (x = 1) pins it (capture jobs); Custom1.x adds to the erosion black point,
Custom1.y multiplies the emission, Custom2.x offsets both UVs, Custom2.y moves the linear fade.
`VfxMeshes`: `Ring` (also open arcs with tapered ends), `Cone` (open, alpha fading up), `QuadXZ`;
colors written as Color32. Live tests:
`tests/code/unity-vfx/test_live_meshfx.py build matrix probe compare`. Run 2026-09-24: P14a pass (3
prefabs, 1 draw call each, streams match, `ShaderUtil.ShaderHasError` false). P14c feature matrix (a
quad mesh particle, alpha blend, center sRGB value): gray 0.5 linear 0.541 vs the same PNG imported
sRGB 0.243; erosion 0 with width 1 = identity (0.541); Custom1.x = 0.45 erodes to 0.251; the same
with default streams stays 0.541 (Custom1 reads 0); Custom2.y = 1.2 moves the fade front past the
quad (0). P14d: a ring mesh with float vertex colors rendered flat dark blue with R = 0 on the
particle path only (first probe, `evidence/meshfx/probe/`); with Color32 the particle path gives the
same alpha-tent profile as a MeshRenderer (0 at both edges, 0.99 in the middle); 2D and 3D start
rotation give the same orientation. P14b shockwave, 6 frames at 960 x 540 from the same camera: ring
mesh 1 layer everywhere, peak 0.037 FSE, 1 particle, peak coverage 3.0% of the screen; 36-puff ring
3.3 to 7.2 mean layers where covered (p95 6 to 14), peak 0.35 FSE, 36 particles, 4.8% coverage: 1.2
vs 7.4 fragments per covered pixel. Iterations kept in the jsonl: the first builds were dim because
the packed texture was imported sRGB and the mesh colors were float (both now audited).

## P15. Per-particle variation through Custom Data and custom vertex streams

Set the curves or random ranges on the layer (`custom1X` ... `custom2Y`, P14); `VfxShuriken.Build`
enables the module (`customData.SetMode(Custom1/Custom2, Vector)`, `SetVectorComponentCount(.., 2)`,
`SetVector(.., i, MinMaxCurve)`) and calls `renderer.SetActiveVertexStreams(VfxUber.Streams)` =
Position, Color, UV, Custom1XY, Custom2XY, so TEXCOORD0 = (uv, Custom1.xy) and TEXCOORD1 =
(Custom2.xy). Keep GPU instancing off on those renderers (the instanced path reads
`unity_ParticleInstanceData`). Check with the audit (`vfx.stream_mismatch`) and by capture:

```python
a = ut_vfx.run(P, "AgentKit.Vfx.VfxSequence.CaptureEffect", {"prefab": "Assets/VFX/MeshFx/FX_Slash_Mesh.prefab", "frames": [2, 6, 10, 14, 17, 20],
               "seed": 1, "cam_pos": [0, 3, -2.6], "cam_target": [0, 0.8, 0.3], "out_dir": out}, graphics=True)["result"]
energy = [ut_vfx.effect_energy(f["png"], a["background"])["energy"] for f in a["frames"]]
```

Live test: `test_live_meshfx.py customdata` (plus the test-only `VfxTestJobs.DefaultStreamsCopy`).
Run 2026-09-24: pass. The slash's added light 2.27 -> 0.95 from frame 2 to 17 (hot start from
Custom1.y, wipe and erosion from Custom2.y and Custom1.x); with default streams 1.39 to 1.77, flat
and dimmer at the start (no emission boost, no wipe, no erosion). Seed 1 twice: identical frames;
seed 2: 2.1% of pixels differ (the random offset Custom2.x). Before `_AgentVfxTime` was pinned, two
runs with the same seed differed (PSNR 34 dB): time-scrolled shaders need the pinned time for
repeatable captures.

## P16. Random fixed flipbook frame per particle (variant sheets)

```csharp
new Layer { tilesX = 2, tilesY = 2, randomFrame = true /* frameOverTime = new MinMaxCurve(0f, 0.999f): Random Between Two Constants */ }
var cells = VfxBudget.FlipbookCells(ps, cam);   // cell per live particle from its baked quad UVs; call twice and compare
```

Live test: `test_live_meshfx.py flipbook` (test-only `VfxTestJobs.FlipbookFixedFrame`: 40-particle
bursts on one 2 x 2 flame sheet, random fixed vs a linear 0 to 1 frame curve). Run 2026-09-24: pass.
Random fixed: every particle kept its cell between 0.2 s and 0.8 s, all 4 cells used (12, 13, 8, 7);
animated: all 40 particles on cell 2 then all on cell 3 (the whole emitter swaps shape together).

## P17. Distortion order (URP particle distortion)

URP Particles/Unlit with `_DistortionEnabled = 1`, `_DistortionStrength`, `_DistortionBlend = 1`, a
normal map in `_BumpMap`, then `VfxMaterials.ApplyInspectorLogic` (keywords `_DISTORTION_ON`,
`_NORMALMAP`); the URP asset needs Opaque Texture. Draw it BEFORE the transparent layers it
surrounds: lower `sortingOrder`, or the same order and a larger `sortingFudge` (Hovl: 2). The audit
checks it (`vfx.distortion_order`) and lists quality levels without Opaque Texture
(`vfx.distortion_no_opaque`). Live test: `test_live_meshfx.py distortion` (test-only
`VfxTestJobs.DistortionOrderDemo`: an additive glow and a distortion quad in front of a lit checker
wall; the wall material is saved as an asset, a runtime-only URP Unlit material rendered magenta in
that batch job). Run 2026-09-24: pass. Center luma (sRGB 0..255): glow only 187, distortion drawn
after the glow 161, before 188, distortion alone 148: drawn after, 31% of the glow's added light
survives (the distortion paints the opaque-only scene over it, weighted by its alpha); drawn before,
102%.

## P18. Importance ladder, screen texels and effect verdicts (any prefab)

```python
res = ut_vfx.run(P, "AgentKit.Vfx.VfxSequence.CaptureEffect", {"prefab": prefab, "frames": [2, 4, 7, 10, 14, 20, 28], "scale": 1.5,
                 "primary": ["Fireball_Billow"], "cam_pos": [0, 3.2, -6], "cam_target": [0, 0.8, 0], "out_dir": out}, graphics=True)["result"]
peak = max(ut_vfx.effect_energy(f["png"], res["background"])["energy"] for f in res["frames"])
rows.append({"name": name, "tier_rank": res["tier_rank"], "energy": peak, "frequent": res["frequent"]})
ut_vfx.importance_ladder(rows); ut_vfx.effect_verdict(res, ut_vfx.BUDGETS["mobile"]); ut_vfx.texel_verdict(res["texel_max"], ut_vfx.BUDGETS["mobile"])
```

Inside `CaptureEffect`: new empty scene, ground, key light, camera (no post), `copies` instances
along X with seeds `seed + 101 i`, global `_AgentVfxTime` pinned to the simulated time, per frame
`Simulate(dt, true, first, false)`, `Stop(StopEmitting)` at `stop_t`, captures +
`VfxBudget.Overdraw` + `Counts` + `ScreenTexel` (largest projected particle size x hierarchy scale x
mesh extent, texels = texture width / sheet columns x material tiling, `TextureDetail` = error after
a 4x reduction), mesh-aware `VisualRadius` of the `primary` systems against
`VfxTier.gameplayRadius x scale`, then stepping on until the first empty frame (`life_seconds`, or
`tail_seconds` after the stop). Mesh or texture objects must be created after
`EditorSceneManager.NewScene(Single)`, which unloads unreferenced in-memory meshes (observed while
writing the probe). Live test: `tests/code/unity-vfx/test_live_craft.py tiers`. Run 2026-09-24:
pass. Peak energy slash 0.39 < muzzle 0.46 < impact 1.50 (all Basic, frequent) < shockwave 2.60 <
explosion 5.99 (Damaging, 1.5 m radius). Radius: explosion 1.08, shockwave 1.01 (0.52 before
`VisualRadius` counted the mesh extent). Texels: the explosion flash (367 px on screen, 64 px glow,
detail 0.003) passes as smooth; billow 0.72 and smoke 0.65 pass; sparks 3.5 to 10.5 texels per pixel
and the tiled shockwave 5.4 are info (tiny or tiling). Life: muzzle 0.35 s, slash 0.37 s, explosion
0.97 s, impact 1.02 s (the scorch). Tier contact sheet: `evidence/craft/contact_tiers_peak.png`.

## P19. Effects end with the gameplay state (loops)

```python
res = ut_vfx.run(P, "AgentKit.Vfx.VfxSequence.CaptureEffect", {"prefab": ".../FX_Fireball_Projectile.prefab", "frames": [10, 25, 31, 34, 40, 50, 60],
                 "stop_t": 0.5, "max_tail": 3.0, "out_dir": out}, graphics=True)["result"]
ut_vfx.effect_verdict(res, ut_vfx.BUDGETS["mobile"])     # tail_seconds <= max_tail_s (0.5 s [added])
```

Live test: `test_live_craft.py tail`. Run 2026-09-24: pass: live particles 9 at the stop, 4 at +0.07
s, 2 at +0.17 s, gone at +0.22 s. Crowd readability of the same kit (Keyser's N copies): P4c. P19b,
something always moving (Nordeus): `ut_vfx.motion_gaps(pngs, bg)` on evenly spaced frames of a loop
(mean luma change inside the effect, frozen under 0.6 levels [added]). Live test
`test_live_craft.py motion`: projectile frames 8 to 24 every 4: changes 10.4, 10.0, 11.3, 7.0, none
frozen: pass.

## Not run here, and why

- **Device numbers** (GPU time, fill rate, thermals): no device attached; the VFX profiling panel
  has no GPU timings on Apple Silicon and the editor's GPU Frame Time reads 0. Profile a development
  player on the lowest target device (scenario-unity-performance, scenario-unity-mobile).
- **Six-way smoke, particle decals, Learning Templates import, binding an SDF or point cache inside
  a graph**: documented from the sources with their API names and GUI paths; not executed in this
  session (they need graph authoring or prepared graphs). The scorch and hot core ship as flat
  mesh-particle quads; URP Decal Projectors (PC path) were not run.
- **The uber shader on device**: compiled and rendered in the editor on Metal only; variant counts
  in a player build and device fill were not measured (scenario-unity-shaders,
  scenario-unity-performance).
- **Shader Graph particle instancing fix** (Custom Function pragma injection): owned and tested by
  scenario-unity-shaders; this skill detects the problem (P9) and measures it (P11).
