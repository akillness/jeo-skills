---
name: scenario-godot-performance-export
description: "Use when a Godot game stutters, drops frames, hitches when entering new areas, overheats a phone, or must ship: profiling and Performance monitors, CPU or GPU bound, draw calls, MultiMesh, occlusion culling, LOD, shader compilation hitches, export to macOS, Windows, Linux, Steam, Android (APK, AAB, keystore), iOS (Xcode), web (itch.io, COOP/COEP headers, SharedArrayBuffer, JavaScript interop), build size budgets, demo and DLC builds, signing and notarization."
license: MIT
---

# Godot performance and release

Target: Godot 4.7.2.stable, macOS Apple Silicon; the Android helpers also run on Windows and Linux.

Expert level here means every claim about speed comes with a before and after number from the same
harness, every build is verified as a file before anyone calls it shipped, and the agent knows which
numbers Godot reports wrongly. The stance: measure, classify the bound, fix the biggest cost,
re-measure, compare pictures, then ship builds you have opened, run and listed. If a sibling skill
named here is missing from your available skills, load it with `skill_get` (Scenario MCP) or ask the
user to install it (https://github.com/scenario-labs/skills#install); unattended, proceed from tool
schemas and flag the gap.

**REQUIRED BACKGROUND:** scenario-godot-expert (channels, the review loop, toolkit, 4.7 traps).

## Stance (the expert delta)

1. **Classify before fixing.** Frame time is the slower of CPU and GPU, so a fix on the other side
   gains nothing (general optimization doc). Live: cutting draw calls from 2,501 to 2 dropped CPU
   from 2.7 to 0.35 ms and left the GPU at 6.2 ms; only the shadow budget moved the GPU (to 1.7 ms).
   Run a half-resolution pass: when GPU time does not fall, resolution is not the problem [added].
   First log `RenderingServer.get_video_adapter_name()`: a hybrid laptop may run on its integrated
   GPU; `--gpu-index N` picks another [added].
2. **Nodes cost before pixels do.** Per-node `_process`, thousands of nodes and redundant physics
   objects are the usual Godot CPU cost (Firebelley 1PnG3r1rKcs: 115 ms to about 8 ms with
   RenderingServer items; DwMoEdAhtYQ, O5a4AKemkiQ). Replace repeats with MultiMesh and a shader,
   and centralize ticking. Live: 2,000 MeshInstance3D created in 2.3 ms, 0.6 ms through
   `RenderingServer.instance_create2`.
3. **Spread periodic work.** Random phase per poller, `force_raycast_update()` on a disabled RayCast
   (Dan Does Dev, s2C2RO_WMh0 [00:05:34]). Live: 600 agents, worst tick 1.93 to 0.64 ms, spike
   frames 62 to 16.
4. **Hand-sized occluders, judged by objects drawn.** Box occluders per big wall beat a whole-scene
   bake (Zenva, VBiBZBVxu1s: about 300 to 80 FPS baked versus 350 with boxes). Occlusion is a CPU
   raster: judge by objects drawn from several camera spots.
5. **Hitches are loading, pipelines and runtime bakes.** Load AND instantiate off the main thread,
   ship a warm pipeline cache (Shader Baker export option, 4.5), and log the
   `PIPELINE_COMPILATIONS_*` deltas per frame so each hitch is classed as load or compile. Navmesh
   bakes and ReflectionProbes on Always at area boundaries are the other suspects [added]. Live
   worst frame: synchronous 453 ms cold, threaded load plus instantiate 230 ms cold, 9.6 ms warm.
6. **Test on the real target, long enough.** Export With Debug does not slow the game; throttling
   shows only on long runs (Ian Bolton, Arm, WrjaUNAXYqk [00:05:20, 00:09:35]). Soak a phone 30
   minutes in the heaviest area and gate on minutes 20 to 30 [added duration]. Clean build for every
   perf report: a stale cache hid a perf bug for weeks (Claire Blackshaw, grdqHJOL5F4 [00:16:15]).
7. **Exports fail on environment and credentials, not on Godot.** Templates per exact version, JDK
   and SDK paths, ETC2/ASTC import, bundle ids, signing identities, server headers. Credentials go
   in `GODOT_*` env vars, never in `export_presets.cfg` (export docs; Nihamkin _n9l15CANag
   [00:25:38]).
8. **Web is Compatibility only and single-threaded by default.** Threads need COOP `same-origin`
   plus COEP `require-corp` over HTTPS (web doc). Live: the threaded build without headers does not
   start.
9. **A written plan must run without this toolkit.** Next to every `gd_perf` call, give the engine
   code or CLI it wraps: the logger below, `godot --headless --export-release`, the env vars,
   `bundletool`, `xcodebuild`. Round-1 blind grading docked plans a reader could not run.

## Establish first

| Input                            | Why it changes the plan                                               | Default if unknown                                       |
| -------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------- |
| Target hardware and frame budget | 16.67 ms at 60 fps, 33.33 at 30, 11.11 at 90 (VR), 8.33 at 120        | 60 fps on the lowest named device                        |
| Renderer per platform            | auto-instancing, occlusion, features differ; web forces Compatibility | Forward+ desktop, Mobile on phones, Compatibility on web |
| Where it is slow                 | steady low fps versus hitches when loading or turning                 | profile both                                             |
| Platforms and stores             | signing, ids, size limits, AAB versus APK                             | ask; each store needs account steps                      |
| Download budget                  | wasm, pck, APK sizes                                                  | the bytes the host really serves                         |
| Who holds credentials            | keystores, Apple team, Steam builder                                  | the agent never invents or stores secrets                |

## Workflow

1. **Baseline on a clean project copy.** Clone with `gd_env.base_project`, `gd_perf.install(P)`,
   rename `application/config/name` (Base3D clones otherwise share one `user://` and shader cache).
   Read `project.godot` back: Jolt for 3D, the renderer you mean. `gd_perf.scene_audit` on the heavy
   scene. GATE: audit JSON saved, physics engine and renderer confirmed.
2. **Measure windowed, per variable.**
   `gd_perf.profile_variant(P, scene, size=(1280, 720), driver="vulkan")`: per-frame CSV, visible
   and shadow draw calls, scene `_process` time from sentinel nodes; it compares `settings`,
   `toggles` or `rendering_method` variants after `gd_perf.install(P)`, while a single verdict on an
   unchanged scene needs only the lead's `gd_run.profile_scene(driver="vulkan")`. Never use
   `Performance.TIME_PROCESS` per frame: it holds one value for about a second. Metal reports GPU 0
   on macOS; use Vulkan. Windowed frame time is capped at the refresh; judge gpu_ms and cpu_ms.
   Deeper: `--gpu-profile`, the Visual Profiler, the script Profiler (read Self, not Inclusive; it
   does not cover C#), RenderDoc or the vendor tool for one frame. GATE: two runs within 10 %
   [added].
3. **Classify.** `gd_perf.classify(full, half_res)`. GATE: a written verdict (CPU scripts, CPU
   render, GPU fill, GPU geometry or shadows) backed by numbers.
4. **Fix one thing, re-measure, look.** `gd_perf.apply_fix(P, scene, out, fix)` writes a new scene:
   `share_materials`, `multimesh`, `shadow_budget`, `box_occluders`, `visibility_range`,
   `strip_process` (lab only: drops `_process` scripts once a shader does their work).
   `gd_perf.compare(before, after)` applies a 5 % and 0.1 ms noise floor. Capture before and after,
   contact sheet, open it. Resolution scale below an agreed floor (0.67) needs sign-off [added].
   GATE: metric improved beyond noise, nothing regressed, mean luma difference under 0.02 or the
   change approved.
5. **Hitch pass.** `perf_bench.gd:hitch` with a fresh `private_home` (run with `home_env`) for a
   cold shader cache. GATE: worst frame under 2x the budget on warm cache, pipeline compilations off
   gameplay frames.
6. **Ship builds.** Presets through `gd_run.ensure_preset` plus `gd_perf.preset_fields`; exports
   under `gd_perf.export_env(**gd_perf.home_env(home))` with `home = gd_perf.private_home(...)`.
   Plain CLI: `godot --headless --path . --export-release "<preset>" <out>`. Verify each artifact:
   `verify_macos`, `verify_apk`, `verify_xcode_project`, `pck_listing`, `size_report`, `web_smoke`.
   GATE: per platform below.
7. **Run what you exported.**
   `gd_perf.run_exported(exe, ["--headless", "--", "--perf-log", "--perf-quit"])` with
   [`perf_logger.gd`](scripts/agentkit/perf/perf_logger.gd); web through headless Chrome. GATE:
   `SHIP_BOOT` shows the expected tags and renderer, `PERF_SUMMARY` p95 within budget, no errors.
8. **Release audit and handover.** `gd_perf.release_audit(P)`; write signing, notarization and
   upload steps for the human holding the accounts (`notarize_plan`, `steam_vdf`). GATE: no high
   flag; account steps listed as "not run" with the reason.

**Phones.** Mobile renderer, or Compatibility for the widest low-end reach (Ray Hayes, KWhVVMpihsc
[00:06:03]); `fallback_to_opengl3` is on by default and changes the look, so capture the fallback
too [00:05:12]. Low tier: `scaling_3d_scale` 0.67 to 0.8, `Engine.max_fps = 30`, physics tick 30
with interpolation on (O5a4AKemkiQ [00:03:43]). Apply the safe area on Android too: 4.7.2 APKs
target SDK 36 (measured), so Android 15+ draws edge to edge [added]. Android build:
`--install-android-build-template` only together with an export command (with `--quit` it installs
nothing, measured), keystore in `GODOT_ANDROID_KEYSTORE_RELEASE_{PATH,USER,PASSWORD}`, size with
`bundletool build-apks --connected-device` then `get-size total` [not run]. Thermal soak: log
`adb shell dumpsys thermalservice` every 10 s; Streamline region markers and Performance Advisor in
CI (WrjaUNAXYqk [00:14:43]); `Performance.add_custom_monitor` for on-device game metrics. Wire a
crash reporter and test the next OS beta before launch (8zqjiRuhQLE [00:03:40, 00:09:11]). iOS:
export writes an Xcode project, then `xcodebuild archive` and `-exportArchive`; create the App Store
Connect record before the first upload, raise the build number each time, no simulator for Vulkan
renderers, `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer` when export says
"xcodebuild requires Xcode" (x_ZFAV2id3I [00:14:41, 00:17:04, 00:40:34]). IAP: store plugins and
accounts, never faked.

**Web.** Single-threaded unless threads were measured to matter. itch.io serves files as uploaded
(no on-the-fly compression), so budget the bytes it sends. Background tabs pause `_process` and drop
networked games; HTTPRequest has no chunked responses and one progress step per frame; a stale
service worker can show another project (web doc). Once isolated, cross-origin fetches need CORS or
CORP [added]. C# projects cannot export to web (version deltas 16). Leaderboard read-only in the
browser.

## Engine-only frame logger (no toolkit, run 2026-10-02)

```gdscript
extends Node   # autoload "Bench"; run the game with: -- --bench
var ai_ms := 0.0
var _vp: RID
var _rows := PackedStringArray(["frame_ms,render_cpu_ms,gpu_ms,draw_calls,pipelines_total"])
func _ready() -> void:
	if not "--bench" in OS.get_cmdline_user_args():
		set_process(false)
		return
	_vp = get_viewport().get_viewport_rid()
	RenderingServer.viewport_set_measure_render_time(_vp, true)
	Performance.add_custom_monitor("game/ai_ms", _get_ai_ms)   # a method, never a lambda
	print("BENCH adapter=", RenderingServer.get_video_adapter_name())
func _get_ai_ms() -> float:
	return ai_ms
func _process(delta: float) -> void:
	var pipes := Performance.get_monitor(Performance.PIPELINE_COMPILATIONS_SURFACE) \
		+ Performance.get_monitor(Performance.PIPELINE_COMPILATIONS_SPECIALIZATION)
	_rows.append("%.2f,%.3f,%.3f,%d,%d" % [delta * 1000.0,
		RenderingServer.viewport_get_measured_render_time_cpu(_vp),
		RenderingServer.viewport_get_measured_render_time_gpu(_vp),
		Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME), pipes])
func _exit_tree() -> void:
	if is_processing():
		Performance.remove_custom_monitor("game/ai_ms")
		FileAccess.open("user://bench.csv", FileAccess.WRITE).store_string("\n".join(_rows))
```

Pipeline counters are cumulative: a hitch row whose total rose is a compile. GPU time reads 0 for
the first frames.

## Numbers

| Value                                                                   | Relative to                               | Source                                   |
| ----------------------------------------------------------------------- | ----------------------------------------- | ---------------------------------------- |
| hitch = frame over 2x the median                                        | per run                                   | toolkit [added]                          |
| 2,501 to 33 draw calls                                                  | 2,500 cubes, 8 shared materials, Forward+ | live, auto-instancing                    |
| 2,501 to 2,501                                                          | same on Mobile                            | live: no auto-instancing                 |
| 400 transparent cubes: 1 draw, 2 alternating materials: 117 (opaque: 2) | Forward+                                  | live: depth sorting breaks batches       |
| 400 Label3D: 800 draws; one shared TextMesh: 1                          | Forward+                                  | live: outline plus text, never instanced |
| omni shadow: Cube (default) 19 draws, Dual Paraboloid 2                 | Forward+, 400 casters                     | live; Mobile reversed (124 vs 220)       |
| 6.6 to 1.7 ms GPU                                                       | 16 to 4 shadowed omni lights              | live                                     |
| 1,260 to 90 objects                                                     | one box occluder                          | live, all three renderers                |
| 38.1 MB raw, 9.7 gzip, 7.8 brotli                                       | 4.7.2 web export, small 3D scene          | live; wasm dominates                     |
| 26.5 to 28.3 MB                                                         | Android arm64 APK, release / debug        | live; engine library 24 MB               |

## Quality gates

- **Measured:** p95 frame or GPU time within budget on the target class; worst frame on area load;
  `compare` shows the intended metric moved and none regressed; `scene_audit` has no high flag.
- **Visual:** before and after contact sheet (1600 px max) opened; occluder debug capture; web
  canvas screenshot.
- **macOS:** `codesign --verify --deep --strict` OK, Debugging entitlement off, both archs;
  Gatekeeper accepts only after notarization.
- **Android:** `apksigner` verifies, signer SHA-256 equals the keystore, versionCode raised, release
  not debuggable, planned ABIs, no password in presets.
- **iOS:** Xcode project with scheme, bundle id and team; unsigned `xcodebuild` passes once the iOS
  platform is installed.
- **Web:** boots in headless Chrome as served; `crossOriginIsolated` true if threaded; no page
  errors; served size within budget.
- **Packs:** base pck holds no excluded content; DLC loads with `replace_files=false`; demo tag only
  in the demo.

## Common mistakes

| Mistake                                    | What it looks like                                          | Fix                                                                         |
| ------------------------------------------ | ----------------------------------------------------------- | --------------------------------------------------------------------------- |
| `process_ms` p95 from the monitor CSV      | the same value on 120 rows                                  | sentinel timing                                                             |
| GPU numbers on Metal                       | gpu_ms 0                                                    | `--rendering-driver vulkan`                                                 |
| Headless frame times                       | "60 fps" with nothing drawn                                 | windowed runs                                                               |
| MultiMesh built in a headless job          | saved scene has no instances                                | write `MultiMesh.buffer`                                                    |
| Shared materials on Mobile                 | draw calls unchanged                                        | MultiMesh                                                                   |
| Mixed transparent materials in one area    | draw calls climb with object count                          | fewer transparent materials; split mixed opaque and alpha surfaces (3D doc) |
| Label3D for nameplates or damage numbers   | 2 draws per label                                           | shared TextMesh or one text node (grdqHJOL5F4 [00:09:33])                   |
| Lights left Dynamic beside LightmapGI      | dynamic light cost on baked areas                           | Static bake mode, DirectionalLight3D stays Dynamic (3D doc)                 |
| Custom monitor as a lambda                 | stays at its first value; crashed 4.7.2 at exit (signal 11) | bind a method; `remove_custom_monitor` on exit                              |
| Occlusion on, no occluders                 | objects drawn unchanged                                     | OccluderInstance3D boxes                                                    |
| Threaded web build on itch without headers | "Cross-Origin Isolation missing"                            | single-threaded, headers, or PWA workaround                                 |
| Android paths seeded once                  | "A valid Java SDK path is required"                         | set paths in a private editor settings file                                 |
| DLC mounted with replace_files true        | old scripts override new ones                               | `load_resource_pack(path, false)`                                           |
| Passwords in `export_presets.cfg`          | secrets in git                                              | `GODOT_ANDROID_KEYSTORE_*`, `GODOT_MACOS_*` env vars                        |

## Handoffs

scenario-godot-rendering-lighting (shadow budgets, bake modes, quality tiers),
scenario-godot-shaders (MultiMesh vertex animation, Shader Baker), scenario-godot-3d-world (LOD,
visibility ranges, occluders, Jolt, Large World Coordinates or origin shifting for big maps),
scenario-godot-gameplay and scenario-godot-architecture (managers, pooling, staggered timers,
threaded loading), scenario-godot-ui (touch layout, safe areas), scenario-godot-multiplayer (web
transport, dedicated server, trusted leaderboard writes), scenario-godot-pipeline-automation (CI
exports, clean builds), scenario-godot-audio (Sample playback on web). Humans: Apple Developer ID,
App Store Connect, Play Console, Steamworks, consoles, IAP products. Audit flags carry the owner
([`perf_audit.gd`](scripts/agentkit/perf/perf_audit.gd)).

## Godot 4.7 notes

- `OS.get_thermal_state` does not exist in 4.7.2: log frame times over the soak, and OS thermal
  status from adb or Instruments.
- Defaults checked: `rendering_method.mobile="mobile"`, `rendering_method.web="gl_compatibility"`,
  occlusion culling off, `import_etc2_astc` false in a hand-written project, physics interpolation
  off, physics 60 Hz, `fallback_to_opengl3` true, `OmniLight3D.omni_shadow_mode` Cube,
  `light_bake_mode` Dynamic, web audio Sample.
- Pck format 4 (`pck_listing` reads it). Jolt is default for new 3D projects since 4.6; a
  hand-written `project.godot` needs the setting.
- Android: JDK 17; Godot seeds JDK and SDK paths from JAVA_HOME and ANDROID_HOME only when it
  creates its editor settings; permissions are not auto-requested since 4.3.
- iOS export needs `application/export_project_only` without a signing team; `gd_run.export` reports
  failure because no `.ipa` exists.
- Physics interpolation (2D 4.3, 3D 4.4) makes a lower physics tick viable.

## References

- [`references/procedures.md`](references/procedures.md): procedures 1 to 16 with code, live results
  and what was not run.
- [`references/expert-notes.md`](references/expert-notes.md): claims by expert with timestamps,
  where live tests disagreed.
- [`references/critique.md`](references/critique.md),
  [`references/gui-paths.md`](references/gui-paths.md),
  [`references/sources.md`](references/sources.md).
- [`scripts/gd_perf.py`](scripts/gd_perf.py) and [`scripts/agentkit/perf/`](scripts/agentkit/perf/)
  (`perf_stress`, `perf_fixes`, `perf_audit`, `perf_bench`, `perf_logger`, `ship_boot`,
  `web_bridge`, `mobile_touch`).
