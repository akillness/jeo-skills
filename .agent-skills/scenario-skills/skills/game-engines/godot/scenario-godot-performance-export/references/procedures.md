# Procedures: scenario-godot-performance-export 0.1

Agent procedures with full code paths (sections 1 to 15 round 1, section 16 round 2). Every
procedure was run live in Godot 4.7.2.stable (official, macOS arm64, Apple M-series GPU) on
2026-10-02 through the lead toolkit (`gd_env`, `gd_run`, `gd_stat`, `gd_review`, AgentKit) plus this
skill's `scripts/gd_perf.py` and `scripts/agentkit/perf/*.gd`. Tests:
`tests/code/godot-performance-export/test_perf_live.py` (P1 to P12) and `test_perf_offline.py` (O1
to O6). Evidence: `tests/live_evidence/godot-performance-export/`.

Setup used by every procedure:

```python
import sys; sys.path.insert(0, "<skills>/scenario-godot-performance-export/scripts")
import gd_perf, gd_env, gd_run, gd_stat, gd_review
P = gd_env.base_project("3d", "<work>/Perf")       # never the base itself
gd_perf.install(P)                                  # lead AgentKit + res://addons/agentkit/perf/*.gd
gd_env.set_project_setting(P, "application/config/name", '"PerfLab"')   # own user:// and shader cache
```

Check the agent-written `project.godot` before measuring: `gd_env.read_project(P)` must show
`physics/3d/physics_engine="Jolt Physics"` for 3D and the renderer you mean to test
(`rendering/renderer/rendering_method`). Base3D clones carry both (checked 2026-10-02). A clone
keeps `config/name="Base3D"`: every Base3D clone then shares ONE `user://` folder and one shader
cache with the other agents' clones, which poisons cold-start measurements. Rename it.

---

## 1. Scene cost audit (headless)

Goal: list what a scene costs before running it, with an owner per finding.

```python
a = gd_perf.scene_audit(P, "res://levels/city.tscn")["result"]
for f in a["flags"]:
    print(f["severity"], f["id"], f["count"], f["what"], "->", f["fix"], "(", f["owner"], ")")
```

`perf_audit.gd:scene` instantiates the scene without adding it to the tree (no `_ready` side
effects) and reports `instantiate_ms`, nodes by class, repeated meshes, unique materials,
transparent and ShaderMaterials, lights (shadowed positional, unfaded, bake mode), nodes with
`_process` or `_physics_process` (read from the script method list), visibility ranges, MultiMesh
instances, particles, skeletons and enablers, occluders, LightmapGI, Areas under CharacterBodies,
environment features, ReflectionProbes set to Always. Flags: `unique_materials`,
`multimesh_candidates`, `per_node_process`, `shadowed_lights`, `no_distance_fade`,
`dynamic_lights_with_lightmaps`, `transparent_materials`, `label3d`, `no_visibility_range`,
`no_occluders`, `skinned_offscreen`, `hurtbox_areas`, `probe_update_always`, `costly_environment`,
`particles`. Thresholds are constants at the top of the file [added: starting points, tune per
project].

Run in Godot 4.7.2 on 2026-10-02 (P1): pass. Slow city: 2,523 nodes, 2,500 unique materials, 2,500
`_process` nodes, 16 shadowed omni lights, instantiate 114 to 146 ms; 7 flags (3 high). After the
fixes: 24 nodes, 0 flags, instantiate 31 ms.

## 2. A deliberately slow scene (calibration)

```python
gd_run.run_script(P, "res://addons/agentkit/perf/perf_stress.gd:make_city", {"count": 2500, "lights": 16})
gd_run.run_script(P, "res://addons/agentkit/perf/perf_stress.gd:make_occlusion", {})
gd_run.run_script(P, "res://addons/agentkit/perf/perf_stress.gd:make_area", {"count": 4000, "materials": 48})
```

`make_city`: one shared BoxMesh, a unique StandardMaterial3D per cube (8-color palette), a GDScript
`_process` per cube (rotate plus a small loop), 16 shadowed OmniLight3D, sky, AgX, shadowed sun. It
also writes `res://perf_fx/spin_instanced.gdshader`, the MultiMesh replacement (rotation from
`TIME * INSTANCE_CUSTOM.r`, color from `COLOR` converted sRGB to linear). Use it to calibrate a
machine and to prove that the measurement pipeline sees a fix. Run in Godot 4.7.2 on 2026-10-02:
pass (P1, P2).

## 3. Measured optimization, one change at a time (windowed, Vulkan)

Goal: the G10 loop. Measure, classify, fix the biggest cost, re-measure, check the picture.

```python
runs = {}
steps = [("city_slow", None), ("city_1_shared", "share_materials"),
         ("city_2_mm", "multimesh"), ("city_3_shadow", "shadow_budget")]
prev = None
for name, fix in steps:
    if fix:
        kw = {"shader": "res://perf_fx/spin_instanced.gdshader"} if fix == "multimesh" else {}
        if fix == "shadow_budget": kw = {"max_shadowed": 4, "fade_begin": 120.0}
        assert gd_perf.apply_fix(P, f"res://perf_fx/{prev}.tscn", f"res://perf_fx/{name}.tscn", fix, **kw)["ok"]
    runs[name] = gd_perf.profile_variant(P, f"res://perf_fx/{name}.tscn", size=(1280, 720),
                                         seconds=3.0, shot=f"bench/{name}.png")
    prev = name
print(gd_perf.compare(runs["city_slow"], runs["city_1_shared"]))
gd_review.contact_sheet([r["result"]["shot"] for r in runs.values()], "city_before_after.png", cols=2, thumb=640)
```

`profile_variant` runs `perf_bench.gd:run_variant` windowed with `--rendering-driver vulkan` (Metal
reports gpu_ms 0 in 4.7.2), renders the scene into a 1280x720 SubViewport, records the lead's CSV
(`agent_profile.record`), adds per-viewport render info for the visible and shadow passes, and times
the scene's `_process` per frame with two sentinel nodes (process_priority -1e6 and +1e6). Why
sentinels: `Performance.TIME_PROCESS` is not a per-frame value. It holds one number for about a
second (the slowest step of the previous second): the CSV showed the same 193.19 ms on every row of
a scene whose frames took 8.3 ms. Never compare `process_ms` p95 from the monitor CSV; use
`result.scene_process`.

`apply_fix` never writes over its input (`out` must differ). Fixes in `perf_fixes.gd`:
`share_materials`, `multimesh` (one MultiMeshInstance3D per mesh, parent and look; per-instance
color and custom data; optional ShaderMaterial), `shadow_budget`, `box_occluders`,
`visibility_range`, `strip_process`.

Run in Godot 4.7.2 on 2026-10-02 (P2, Forward+, Vulkan, 1280x720, p95):

| Step                             | GPU ms | render CPU ms | scene `_process` ms | draw calls (visible / shadow) |
| -------------------------------- | ------ | ------------- | ------------------- | ----------------------------- |
| slow city                        | 6.62   | 2.74          | 1.97                | 2,501 / 12,887                |
| shared materials (8)             | 6.10   | 2.37          | 1.99                | 33 / 5,055                    |
| MultiMesh + vertex shader        | 6.26   | 0.35          | 0.001               | 2 / 164                       |
| shadow budget (4 shadowed, fade) | 1.66   | 0.10          | 0.001               | 2 / 4                         |

Same scene on the Mobile renderer: 2,501 visible draw calls before AND after sharing materials
(auto-instancing is Forward+ only, confirmed). The picture stayed the same: mean luma difference
first to last 0.006 (contact sheet opened: same cubes, same colors). Read the table the expert way:
draw-call fixes moved CPU, not GPU; the GPU cost was the omni shadow passes, and only the shadow
budget cut it (6.6 to 1.7 ms). Classification said so before any fix (procedure 4).

Traps found while building this (all fixed in the shipped code):

- A MultiMesh built in a headless job loses its instances: `set_instance_transform`,
  `set_instance_color` and `set_instance_custom_data` go to the dummy RenderingServer and the saved
  `.tscn` has `instance_count = 2500` and no buffer (the first "after" capture was an empty floor).
  Write `MultiMesh.buffer` directly (`perf_fixes._pack`, 20 floats per instance for TRANSFORM_3D +
  color + custom; layout verified by round trip, error 0.0) (P7).
- Instance colors copied from `StandardMaterial3D.albedo_color` are sRGB. A shader writing
  `ALBEDO = COLOR.rgb` renders pale cubes; convert to linear (shader) or set
  `vertex_color_is_srgb = true` (StandardMaterial3D path).
- `shadow_budget` with `fade_begin = 30` made every omni light vanish from a camera 60 m away:
  distance fade is measured from the camera. Pick `fade_begin` from the real camera distance and
  look at the capture.
- A vertex-shader animation does not move the instance AABB, so omni and spot shadow maps are not
  re-rendered every frame the way they are for moving nodes (164 versus 5,055 shadow draws). The
  shadows of spinning cubes then lag the cubes. Check shadows on a close-up capture when animation
  moves into a shader.

## 4. Which side bounds the frame (CPU or GPU, and which kind of GPU cost)

```python
full = gd_perf.profile_variant(P, scene, seconds=2.0)
half = gd_perf.profile_variant(P, scene, seconds=2.0, settings={"scaling_3d_scale": 0.5})
print(gd_perf.classify(full, half))
```

Main-thread CPU is scene `_process` (sentinels) + physics + viewport render CPU; GPU is the
viewport's measured GPU time (docs: frame time is the slower of the two, so optimizing the other
side gains nothing). A 0.5 `scaling_3d_scale` run separates fill-bound (GPU drops more than 30 %
[added threshold]) from geometry, draw or shadow bound.

Run in Godot 4.7.2 on 2026-10-02 (P3): pass. Slow city: GPU 6.5 ms versus CPU 5.3 ms, GPU change at
half resolution -2 % to +5 % (noise): geometry and shadow bound, so lowering resolution would not
have helped, matching procedure 3.

## 5. Staggered polling (headless physics)

```python
for mode in ("sync", "staggered"):
    r = gd_run.run_script(P, "res://addons/agentkit/perf/perf_bench.gd:stagger",
                          {"agents": 600, "mode": mode, "cooldown": 0.1, "rays": 4, "frames": 300})
```

600 agents each cast 4 rays every 0.1 s with a disabled RayCast3D and `force_raycast_update()` (Dan
Does Dev, s2C2RO_WMh0 [00:05:34]). `sync` starts every timer equal; `staggered` gives each a random
phase. The physics cost per tick is timed by sentinels (process_physics_priority).

Run in Godot 4.7.2 on 2026-10-02 (P4): pass. Same work (129,600 versus 131,612 ray hits): sync max
1.93 ms, p95 0.85 ms, 62 spike frames; staggered max 0.64 ms, p95 0.37 ms, 16 spikes. The median
rises (0.10 to 0.18 ms) because the work is spread: the expert point is the spikes.

## 6. Hitches when entering a new area (windowed)

```python
home = gd_perf.private_home("<work>/_homes/hitch_sync")      # fresh home = cold shader cache
r = gd_run.run_script(P, "res://addons/agentkit/perf/perf_bench.gd:hitch",
                      {"mode": "sync"}, headless=False,
                      extra_args=["--rendering-driver", "vulkan"], env=gd_perf.home_env(home))
```

`hitch` loads `res://perf_fx/area.tscn` (4,000 meshes, 48 feature-varied materials) at frame 60:
`sync` (`load` + `instantiate` + `add_child` in one frame), `threaded`
(`ResourceLoader.load_threaded_request`, poll, instantiate on the main thread), or
`threaded_instantiate` (load and instantiate in a WorkerThreadPool task, off-tree, then
`add_child`). It logs per-frame time and pipeline-compilation monitor deltas.

Run in Godot 4.7.2 on 2026-10-02 (P5), worst frame, cold then warm shader cache: sync 453 then 176
ms; threaded 340 then 79 ms; threaded load + instantiate 230 then 9.6 ms (baseline frame 7.9 ms).
The first-ever run in a shared Base3D user folder hit 3,906 ms. Pipeline compilations (surface and
specialization) appear on the frame the area is first drawn; with `threaded_instantiate` they began
on the worker before `add_child`. Conclusions: move load AND instantiate off the main thread, and
ship with a warm pipeline cache (the shader baker export option, since 4.5, handoff
scenario-godot-shaders; warm-up by drawing new materials once behind a loading screen [added]).
Single runs: expect ±30 % run to run.

## 7. Occlusion culling and visibility ranges (windowed)

```python
gd_run.run_script(P, "res://addons/agentkit/perf/perf_stress.gd:make_occlusion", {})
gd_perf.apply_fix(P, "res://perf_fx/occlusion.tscn", "res://perf_fx/occlusion_box.tscn", "box_occluders")
for st in ({"use_occlusion_culling": False}, {"use_occlusion_culling": True},
           {"use_occlusion_culling": True, "debug_draw": 24}):          # 24 = DEBUG_DRAW_OCCLUDERS
    gd_perf.profile_variant(P, "res://perf_fx/occlusion_box.tscn", seconds=1.5, settings=st, shot="occ/x.png")
```

`box_occluders` adds an OccluderInstance3D with a BoxOccluder3D slightly smaller than each large
static box mesh (Zenva, VBiBZBVxu1s: hand-sized boxes beat a whole-scene bake). Project-wide switch:
`rendering/occlusion_culling/use_occlusion_culling=true` (default false in 4.7.2); per viewport:
`Viewport.use_occlusion_culling`.

Run in Godot 4.7.2 on 2026-10-02 (P6): pass. Culling on without occluders: 1,260 objects drawn,
unchanged. With one box occluder: 1,260 to 90 objects, 15,120 to 1,080 primitives (Forward+ and
Mobile identical), pixels identical (`compare` identical=True). Compatibility also culls (15,120 to
1,080 primitives). Render CPU rose 0.30 to 0.58 ms in this small scene: occlusion costs CPU (raster
on the CPU), worth it when hidden geometry is heavy. Occluder debug capture looked at (the box shows
as the white occluder region).

`visibility_range` fix: sets `visibility_range_end` and margin on meshes smaller than `max_size`
(2,500 nodes set in the city). Run 2026-10-02: pass (apply only; judge pop-in on captures).

## 8. Frame logger in exported builds

Autoload `res://addons/agentkit/perf/perf_logger.gd` (idle unless asked). Desktop smoke:

```python
gd_perf.add_autoload(P, "PerfLogger", "res://addons/agentkit/perf/perf_logger.gd")
r = gd_perf.run_exported(app_exe, ["--headless", "--", "--perf-log", "--perf-seconds", "2", "--perf-quit"],
                         home=gd_perf.private_home("<work>/_homes/run"))
print(r["lines"]["SHIP_BOOT"][0], r["lines"]["PERF_SUMMARY"][0])
```

It prints `SHIP_BOOT {platform, feature tags, renderer, driver, adapter}` and, after the window,
`PERF_SUMMARY {p50, p95, p99, max, hitches, gpu_p95, max_draw_calls, pipelines_compiled, warmup_max_ms}`
and writes `user://perf/frames_<unix>.csv`. The first 10 frames are reported apart
(`--perf-warmup N`). On a phone: pass the same user args through the launch command [not yet run: no
device attached].

Run in Godot 4.7.2 on 2026-10-02 (P8): pass. Exported macOS build, headless: 290 frames, p50 6.9 ms,
p95 9.5 ms. Windowed (Metal): p50 8.2 ms (120 Hz cap), 8 pipelines compiled, first frames up to 576
ms (kept out of the percentiles; before the warm-up split, one 1,008 ms first frame counted as a
hitch).

## 9. macOS export, demo build and DLC pack

```python
home = gd_perf.private_home("<work>/_home")                 # templates linked, own editor settings
gd_run.ensure_preset(S, "mac", "macOS", options={"binary_format/architecture": "universal",
    "application/bundle_identifier": "com.studio.game", "application/short_version": "0.1.0", "application/version": "1"})
gd_perf.preset_fields(S, "mac", exclude_filter='"*.agent_out/*, dlc/*, jobs/*, addons/agentkit/agent_*"')
gd_run.ensure_preset(S, "mac_demo", "macOS", options={...same...})
gd_perf.preset_fields(S, "mac_demo", exclude_filter='"..."', custom_features='"demo"')
gd_run.ensure_preset(S, "dlc_pack", "macOS", options={...})
gd_perf.preset_fields(S, "dlc_pack", export_filter='"resources"', export_files='PackedStringArray("res://dlc/bonus.tscn")')
with gd_perf.export_env(**gd_perf.home_env(home)):
    gd_run.export(S, "mac", "<builds>/Game.zip")
    gd_run.export(S, "mac_demo", "<builds>/Game_demo.zip")
    gd_run.export(S, "dlc_pack", "<builds>/dlc.pck", pack=True)
v = gd_perf.verify_macos("<builds>/Game.zip", "<builds>/Game_x")
print(gd_perf.pck_listing(next(Path("<builds>/Game_x").rglob("*.pck"))))
```

`import_etc2_astc=true` is required (the lead's export reports the fix when missing). `ship_boot.gd`
(autoload) reads `OS.has_feature("demo")` and mounts the DLC with
`ProjectSettings.load_resource_pack(path, false)`, then prints `DLC {json}`. `verify_macos` unzips
with `ditto`, reads Info.plist, `lipo -archs`, `codesign -dv`, `codesign --verify --deep --strict`,
`spctl -a -vvv -t exec`, entitlements.

Run in Godot 4.7.2 on 2026-10-02 (P8): pass. Universal zip 56.6 MB (executable 161.8 MB
x86_64+arm64, pck 55 KB), minimum macOS arm64 13.0 / x86_64 11.0, ad-hoc signature, codesign verify
OK, Gatekeeper "rejected" (expected before Developer ID and notarization), Debugging entitlement
off. Demo build boots with the `demo` tag and refuses the DLC; full build mounts it (`loaded`,
`scene_ok`). The base pck holds no `dlc/` file (pck_listing). The DLC pack (12 files) also carries
`project.binary`, the autoload scripts and `.godot/global_script_class_cache.cfg`: hence
`replace_files=false`, so an old DLC never overwrites newer base scripts. `gd_run.verify_pack` loads
`res://dlc/bonus.tscn` from it: pass. `pck_listing` reads pack format 4 (4.7.2) and matched the
files `verify_pack` mounted.

Signing and notarization (documented, NOT run: no Developer ID here). `gd_perf.notarize_plan()`:

```
xcrun notarytool store-credentials "godot-notary" --apple-id <apple-id> --team-id <TEAMID>
xcrun notarytool submit "Game.zip" --keychain-profile "godot-notary" --wait
xcrun notarytool log <submission-id> --keychain-profile "godot-notary"      # when Invalid
xcrun stapler staple "Game.app"
spctl -a -vvv -t exec "Game.app"        # expect: accepted, source=Notarized Developer ID
xcrun stapler validate "Game.app"
```

Sign in the preset (`codesign/codesign`, identity "Developer ID Application: ...") or with
`codesign --deep --options runtime --timestamp`; pass passwords through `GODOT_MACOS_*` env vars,
never in `export_presets.cfg` (Nihamkin, _n9l15CANag [00:25:38]; macOS export doc).

## 10. Web export, headers, browser smoke, JS interop, size budget

```python
LB = "<script>window.Leaderboard={getTop:n=>Promise.resolve(JSON.stringify([...])),submit:s=>{}};</script>"
gd_run.ensure_preset(S, "web_st", "Web", options={"variant/thread_support": False, "html/head_include": LB})
gd_run.ensure_preset(S, "web_mt", "Web", options={"variant/thread_support": True, "html/head_include": LB})
with gd_perf.export_env(**gd_perf.home_env(home)):
    gd_run.export(S, "web_st", "<builds>/web_st/index.html")
srv = gd_perf.serve("<builds>/web_st", coop_coep=False)      # True adds COOP same-origin + COEP require-corp
r = gd_perf.web_smoke(srv.url + "index.html", shot="web.png",
                      after_ready=lambda page: page.evaluate("() => window.godotBridge.send('hi')"))
srv.stop()
print(gd_perf.size_report("<builds>/web_st")["total_mb"])
```

`serve` is a local static server with `application/wasm`, `no-store` and optional cross-origin
isolation headers (localhost is a secure context, so it tests the real header rule). `web_smoke`
drives headless Chrome through Playwright for Python (`channel="chrome"`), waits for the `SHIP_BOOT`
console line, and records `crossOriginIsolated`, `SharedArrayBuffer`, WebGL 2, page errors and the
status notice. `web_bridge.gd` (autoload, no-op off the web) gets
`JavaScriptBridge.get_interface("Leaderboard")`, keeps its `create_callback` objects in members,
chains `getTop(n).then(cb)`, and exposes `window.godotBridge.send` to the page.

Run in Godot 4.7.2 on 2026-10-02 (P9): pass.

| Build           | served    | boots                                                          | crossOriginIsolated | ready |
| --------------- | --------- | -------------------------------------------------------------- | ------------------- | ----- |
| single-threaded | plain     | yes                                                            | false               | 0.6 s |
| single-threaded | COOP/COEP | yes                                                            | true                | 0.5 s |
| threaded        | plain     | NO: "Cross-Origin Isolation ... SharedArrayBuffer ... missing" | false               |       |
| threaded        | COOP/COEP | yes                                                            | true                | 0.5 s |

Renderer `gl_compatibility`, driver `opengl3`, feature tags `web, nothreads` or `threads`. Interop:
"WEB_BRIDGE top 3 rows" (game called page, promise resolved), page-to-game ack "hello from page".
Screenshots opened: the 3D test scene renders in WebGL 2. Size: 38.1 MB raw, 9.7 MB gzip -9, 7.8 MB
brotli q9 (wasm 39.5 MB raw, 8.0 MB brotli); the pck is 0.1 MB. itch.io does not compress on the fly
(web doc): a 20 MB first-load budget holds only if the host serves compressed files.

PWA workaround (`progressive_web_app/enabled` + `ensure_cross_origin_isolation_headers`, threaded,
no headers): the service worker installed but the page's automatic reload came before it controlled
the page and logged "Service worker already exists"; a second reload booted isolated
(`crossOriginIsolated` true). Run 2026-10-02: pass with one extra reload (evidence
`web_pwa_coi.json`). Tell players to reload once, or prefer single-threaded.

## 11. Android: debug and release APK with env-var credentials

```python
a = gd_perf.find_android()        # env, ~/Library/Android/sdk, Android Studio JBR, Unity Hub AndroidPlayer
dbg = gd_perf.make_keystore("<keys>/debug.keystore", "androiddebugkey", "android", jdk=a["jdk"])
rel = gd_perf.make_keystore("<keys>/upload.keystore", "upload", "<password>", dname="CN=Studio,O=Studio,C=FR", jdk=a["jdk"])
gd_run.ensure_preset(S, "android_release", "Android", options={"gradle_build/use_gradle_build": False,
    "architectures/arm64-v8a": True, "package/unique_name": "com.studio.game", "version/code": 2, "version/name": "0.1.1"})
r = gd_perf.export_android(S, "android_release", "<builds>/game.apk", debug=False,
                           keystore={"path": rel["path"], "alias": "upload", "password": "<password>"},
                           home=gd_perf.private_home("<work>/_home"), android=a)
print(r["apk"])
```

Credentials go only through `GODOT_ANDROID_KEYSTORE_{DEBUG,RELEASE}_{PATH,USER,PASSWORD}`.
`export_android` sets `JAVA_HOME`, `ANDROID_HOME` and the private home's variables (`home_env`: HOME
on macOS, APPDATA on Windows, HOME and XDG on Linux), and writes the two Android paths into the
private editor settings: JAVA_HOME and ANDROID_HOME only seed those paths when Godot first creates
its editor settings file. A private home first used for a macOS or web export kept
`java_sdk_path = ""` and the Android export failed ("A valid Java SDK path is required").
`verify_apk` runs `apksigner verify --print-certs` and `aapt2 dump badging`.

Run in Godot 4.7.2 on 2026-10-02 (P10): pass. SDK and JDK from Unity Hub 6000.3.21f1 AndroidPlayer
(OpenJDK 17, build-tools 36.0.0, platforms 34 to 36, NDK r27, not needed for a non-Gradle APK).
Debug APK 28.3 MB in 5 s: v2+v3 signed, "CN=Android Debug", debuggable, arm64-v8a, minSdk 24,
targetSdk 36. Release APK 26.5 MB: signed by the upload key (SHA-256 matched the keystore),
versionCode 2, not debuggable. No password in `export_presets.cfg`. `libgodot_android.so` is 24 MB
of the 26.5 MB.

Not run: Gradle build and AAB (`gradle_build/use_gradle_build=true`, `export_format=1`; needs the
Android build template and Gradle downloads), `adb install` and on-device profiling (no device).

## 12. iOS: Xcode project, then build

```python
gd_run.ensure_preset(S, "ios_xcode", "iOS", options={"application/export_project_only": True,
    "application/app_store_team_id": "ABCDE12345", "application/bundle_identifier": "com.studio.game",
    "application/short_version": "0.1.0", "application/version": "1"})
with gd_perf.export_env(**gd_perf.home_env(home)):
    gd_run.export(S, "ios_xcode", "<builds>/ios/Game.ipa", release=False)   # writes the Xcode project
print(gd_perf.verify_xcode_project("<builds>/ios"))
print(gd_perf.xcode_build("<builds>/ios"))      # unsigned, generic iOS destination
```

Run in Godot 4.7.2 on 2026-10-02 (P11): Xcode project pass (scheme, bundle id, team, 56 KB pck,
MoltenVK and game xcframeworks). `gd_run.export` returns ok False here because no `.ipa` exists:
verify the project folder instead. `xcodebuild` not run: "iOS 26.5 is not installed. Please download
and install the platform from Xcode > Settings > Components" (Xcode 26.6 without the iOS platform).
Not run: signing, archive, TestFlight (needs an Apple developer account). After installing the
platform:
`xcodebuild -project Game.xcodeproj -scheme Game -destination generic/platform=iOS archive -archivePath Game.xcarchive`,
then `-exportArchive` with an ExportOptions.plist [added, not run].

## 13. Touch controls on InputMap actions

```python
r = gd_run.run_script(P, "res://addons/agentkit/perf/mobile_touch.gd:check",
                      {"actions": {"jump": [900, 480], "left": [60, 480]}})
```

`make_touch_layer` builds a CanvasLayer of TouchScreenButtons whose `action` is the InputMap action
(WisconsiKnight, uofaDRa7dWM [00:03:21]). Test touches use `Viewport.push_input(event, true)`: with
window coordinates the 160x90 test window scaled the 1152x648 viewport by 0.139 and every touch
missed. Layout and safe area: scenario-godot-ui.

Run in Godot 4.7.2 on 2026-10-02 (P12): pass, both actions pressed on touch and released, a stray
touch pressed nothing. Defaults: `emulate_mouse_from_touch` true, `emulate_touch_from_mouse` false.

## 14. Release audit (offline)

```python
print(gd_perf.release_audit(S))
```

Reads `project.godot`, `export_presets.cfg` and files. Flags: default name, default Godot icon, no
splash, missing main scene, 3D without Jolt, ETC2/ASTC off with macOS/Android/iOS presets, web
renderer not Compatibility, secrets in presets, export path inside the project without `.gdignore`,
tests or agent tooling exported, invalid Android package, AAB without Gradle, APK only, invalid
bundle id, iOS team id, macOS Debugging entitlement, web threads.

Run 2026-10-02 (O2): pass. A bad project raised all 14 expected flags; a good one raised none. On
the ShipTest project it found the default icon, no splash, APK-only presets and agent tooling in
presets without the exclude filter.

## 15. Steam upload files (written, not run)

```python
gd_perf.steam_vdf(app_id, {depot_id: "<builds>/windows"}, "<builds>/steam", desc="ci", set_live="beta")
# steamcmd +login <builder-account> +run_app_build "<builds>/steam/app_build_<app_id>.vdf" +quit
```

Set builds live on a beta branch first (BluePhoenix, J0GrG-AffCI). GodotSteam needs the module or
GDExtension build that matches the Godot version. Run 2026-10-02 (O4): VDF files pass; steamcmd not
run (no Steamworks account).

## 16. Round-2 checks after blind grading (R1 to R4)

Suite `tests/code/godot-performance-export/test_perf_round2.py`, project
`tests/projects/godot-performance-export/Round2` (Base3D clone, Forward+, Jolt), jobs in
`fixtures_r2/`. Windowed 160x90, `--rendering-driver vulkan`, run on Forward+ and with
`--rendering-method mobile`. Final run 2026-10-02 in Godot 4.7.2: all jobs ok, evidence
`tests/live_evidence/godot-performance-export/round2_20261002-224042.json`.

**R1 render facts (`r2_render.gd`), 400 BoxMesh cubes seen from above, root viewport render info.**

| Case                                                                     | Forward+ draws | Mobile draws |
| ------------------------------------------------------------------------ | -------------- | ------------ |
| one shared opaque material                                               | 1              | 400          |
| one shared alpha-blend material                                          | 1              | 400          |
| one shared alpha-scissor material                                        | 1              | 400          |
| two alternating opaque materials                                         | 2              | 400          |
| two alternating alpha-blend materials                                    | 117            | 400          |
| 400 Label3D (default outline) / outline 0                                | 800 / 400      | 400 / 400    |
| 400 MeshInstance3D sharing one TextMesh and material                     | 1              | 400          |
| one shadowed omni over 400 casters: Cube / Dual Paraboloid (shadow pass) | 19 / 2         | 124 / 220    |

Correction to the docs line "transparent objects cannot batch": identical transparent objects still
instance on Forward+; interleaved materials break the batches after depth sorting. Defaults read:
`OmniLight3D.omni_shadow_mode` 1 (Cube, also the ClassDB default), `light_bake_mode` 2 (Dynamic),
`fallback_to_opengl3` true, `flush_stdout_on_print` false, physics interpolation off, 60 ticks.
Adapter "Apple M5 Max", `get_video_adapter_type()` 1 (integrated).

Creation of 2,000 MeshInstance3D nodes against 2,000 `RenderingServer.instance_create2` instances
(warm shader cache): 2.3 against 0.6 ms on Forward+, 4.2 against 0.9 ms on Mobile; creation plus the
next frame 7.3 against 8.3 ms. The first run in a fresh project took 739 ms for the node case,
almost all pipeline compilation: always measure warm and cold separately.

**R2 CLI.** `godot --help` in 4.7.2 lists `--gpu-index`, `--gpu-profile`, `--disable-vsync`,
`--max-fps` and `--install-android-build-template`. With `--quit` the template flag installs
nothing; with an export command it writes `res://android/build/` (with `build.gradle`) and
`.build_version` before the export runs, even when the export then fails on missing SDK paths
(private HOME, no JAVA_HOME): pass.

```bash
export GODOT_ANDROID_KEYSTORE_RELEASE_PATH=~/keys/upload.keystore
export GODOT_ANDROID_KEYSTORE_RELEASE_USER=upload
export GODOT_ANDROID_KEYSTORE_RELEASE_PASSWORD="$(security find-generic-password -s game-upload -w)"
godot --headless --path . --install-android-build-template --export-release "Android" build/game.aab
```

Run as `--install-android-build-template --export-debug "Android" x.apk`: the template install
passed; the Gradle AAB build itself, `bundletool build-apks --connected-device` and
`bundletool get-size total` not run (Gradle download, bundletool not installed, no device).

**R3 custom monitors (`r2_monitor.gd`, headless and windowed).**

| Callable                 | Removed before exit | Exit                       |
| ------------------------ | ------------------- | -------------------------- |
| method `_get_v`          | no                  | 0                          |
| method                   | yes                 | 0                          |
| lambda capturing a local | no                  | crash, signal 11 (exit -6) |
| lambda                   | yes                 | 0                          |

In R1 a lambda monitor read 0.0 while the member it should mirror held 0.015 ms: the lambda captured
the local by value. Also: `Performance.get_custom_monitor` returns Variant, so
`var x := Performance.get_custom_monitor(...)` is a parse error under warnings-as-errors; type it.

**R4 engine-only frame logger (SKILL.md snippet, verbatim).** Saved as `bench_logger.gd`, autoload
`Bench` in `Round2_logger`, run
`godot --path Round2_logger --rendering-driver vulkan --resolution 320x180 --quit-after 90 -- --bench`:
prints `BENCH adapter=Apple M5 Max`, writes 90 rows to `user://bench.csv` (frame 6.67 ms at the
display cap, render CPU 0.048 ms, GPU 0.503 ms, 10 draws). GPU and render CPU read 0.000 for the
first two frames; the pipeline columns are cumulative totals (8 after warm-up), so diff rows to find
compile frames. Without `--bench` nothing is written: pass.

Not run in round 2: the 30-minute phone soak with `adb shell dumpsys thermalservice` (no device),
Streamline and Performance Advisor, a second pck downloaded and mounted on the web, the custom
size-optimized web or Android template (`scons ... optimize=size build_profile=...`).
