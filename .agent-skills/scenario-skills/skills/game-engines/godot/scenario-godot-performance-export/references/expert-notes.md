# Expert notes: performance and release

Principles and judgment by source, with timestamps, then what the live tests on Godot 4.7.2
(2026-10-02) confirmed, refined or contradicted. Credentials are in `sources.md`. [added] marks this
skill's own additions.

## Measuring

- **Measure first, fix the largest bottleneck, re-measure** (general optimization doc; Dan Does Dev,
  s2C2RO_WMh0 [00:07:12]; Deep Dive Dev, O5a4AKemkiQ [00:00:33]).
- **Frame time is the slower of CPU and GPU.** If the GPU takes 50 ms, cutting CPU from 9 to 1 ms
  gains nothing (general optimization doc, appendix). Live: confirmed in shape. Cutting draw calls
  2,501 to 2 cut render CPU 2.7 to 0.35 ms, GPU stayed about 6.2 ms.
- **Inclusive versus Self in the profiler:** Self finds the real hot function (profiler doc). The
  profiler does not cover C# (profiler doc).
- **Custom monitors:** `Performance.add_custom_monitor("Category/name", callable)` (Dan Does Dev,
  s2C2RO_WMh0 [00:09:06]). Live (round 2, procedures 16): bind a method. A lambda captures locals by
  value and kept returning 0.0 while the member read 0.015 ms; a lambda monitor left registered
  crashed 4.7.2 at exit (signal 11, 2 of 2 runs, headless and windowed); `remove_custom_monitor`
  fixed it.
- **Real devices.** Export With Debug does not slow the game; Arm Streamline with the Arm GPU
  profile; Performance Advisor in CI with region markers per scene (Ian Bolton, WrjaUNAXYqk
  [00:05:20, 00:14:43-00:16:22]). The thermal graph shows throttling short tests miss (same,
  [00:09:35]). Live: no thermal API in 4.7.2 (`OS.get_thermal_state` absent). Long device logs
  (`perf_logger.gd`) are the substitute [added].
- **Clean builds for perf reports.** A stale build cache plus an API rename cost weeks chasing a
  phantom perf bug (Claire Blackshaw, grdqHJOL5F4 [00:16:15-00:17:20]).
- [added] `Performance.TIME_PROCESS` and `TIME_PHYSICS_PROCESS` are not per-frame values in 4.7.2:
  one value held for about a second. Per-frame script cost needs sentinel nodes at process priority
  -1e6 and +1e6.
- [added] On macOS, Metal reports GPU time 0 through `viewport_get_measured_render_time_gpu`; Vulkan
  (MoltenVK) reports it (lead toolkit, re-observed). Windowed frame time is capped by the 120 Hz
  display.

## CPU: nodes, scripts, physics

- **Nodes cost even when idle:** 1 million empty `Node2D` dropped to 18 FPS on a top CPU (Deep Dive
  Dev, DwMoEdAhtYQ [00:06:11]).
- **Servers for bulk visuals:** 100 card scenes took 115 ms to instantiate; direct `RenderingServer`
  canvas items about 8 ms (debug build); pooling and chunked instantiation were worse hacks
  (Firebelley, 1PnG3r1rKcs [00:00:36-00:04:45]). Live (round 2, 3D, warm cache): 2,000
  MeshInstance3D created in 2.3 ms (Forward+) and 4.2 ms (Mobile) against 0.6 to 0.9 ms with
  `RenderingServer.instance_create2`; the next frame cost about the same. The 115 to 8 ms gap is for
  scripted 2D scenes; plain meshes gain about 4x on creation only. Deciding condition: Dan Does Dev
  keeps the readable node approach until measured (s2C2RO_WMh0 [00:07:12]); switch at hundreds to
  thousands of near-identical items built or updated per frame.
- **MultiMesh with per-instance color and custom data, animated in a shader:** 100,000 instances in
  3 draw calls; set a custom AABB; recycle ids (Deep Dive Dev, DwMoEdAhtYQ [00:09:08-00:15:40]).
  Live: 2,500 spinning cubes, scene `_process` 1.97 ms to 0.001 ms, render CPU 2.7 to 0.35 ms. Two
  refinements [added]: build the MultiMesh buffer directly when working headless (set_instance_* is
  dropped), and convert sRGB instance colors.
- **Stagger polling** with random initial cooldowns, disabled RayCast plus `force_raycast_update()`
  (Dan Does Dev, s2C2RO_WMh0 [00:05:34-00:06:40]). Live: worst tick 1.93 to 0.64 ms, spike frames 62
  to 16, same number of ray hits.
- **Physics objects:** remove the hurtbox Area from enemies and let attackers detect them, halving
  physics objects; `move_and_slide` is heavy past a few hundred bodies; soft-collision Areas scale
  to thousands (Deep Dive Dev, O5a4AKemkiQ [00:04:33-00:06:25]). `perf_audit` flags Areas under
  CharacterBodies (`hurtbox_areas`).
- **Lower physics tick rate needs physics interpolation** (4.3+), jitter fix 0,
  `reset_physics_interpolation()` on teleports (Deep Dive Dev, O5a4AKemkiQ [00:03:43-00:04:16]).
  Defaults checked in 4.7.2: interpolation off, jitter fix 0.5.

## GPU: draw calls, shadows, culling

- **Auto-instancing is Forward+ only** and excludes alpha blend and depth-prepass materials (3D
  performance doc). Live: sharing 8 materials cut visible draw calls 2,501 to 33 on Forward+, 2,501
  to 2,501 on Mobile.
- **Lights:** Static bake mode for non-directional lights, DirectionalLight3D Dynamic (3D doc).
  Live: `light_bake_mode` defaults to Dynamic (2), `OmniLight3D.omni_shadow_mode` to Cube (1) in
  4.7.2. One shadowed omni over 400 casters, Forward+: Cube 19 shadow draws (562 objects), Dual
  Paraboloid 2 (420); on Mobile the order reversed (124 vs 220), so measure per renderer. Shadowed
  omni lights re-render casters per face [added from the test]: 16 shadowed omnis cost 12,887 shadow
  draws; a budget of 4 with distance fade took GPU 6.6 to 1.7 ms.
- **Transparent objects** are sorted back to front and cannot batch by material (3D doc). Live
  correction (round 2, Forward+): 400 cubes sharing ONE alpha-blend material drew in 1 call
  (instanced, like opaque and alpha scissor); two alternating alpha materials took 117 calls against
  2 for opaque. Depth sorting breaks batches when materials interleave. Mobile: 400 calls in every
  case (no auto-instancing).
- **Occlusion:** hand-placed `BoxOccluder3D` per house gave about 350 FPS up close while the
  whole-scene bake dropped 300 to about 80 (Zenva, VBiBZBVxu1s [00:03:25-00:06:33]); occlusion cost
  is CPU raster and view dependent, judge by objects drawn at several positions and the occlusion
  buffer view (same, [00:07:13]). Live: one box occluder, 1,260 to 90 objects; Compatibility culls
  too (15,120 to 1,080 primitives); render CPU 0.30 to 0.58 ms in a small scene, so the cost is
  real.
- **Label3D is a hidden cost in VR** (materials per glyph); use TextMesh or a shared-font text node
  (Claire Blackshaw, grdqHJOL5F4 [00:09:33-00:11:09]). `perf_audit` flags more than 50 Label3D
  [added threshold]. Live (round 2): 400 Label3D took 800 draw calls on Forward+ (outline plus text,
  never instanced), 400 with outline 0; 400 MeshInstance3D sharing one TextMesh took 1.
- **Compute output can feed a MultiMesh** without a CPU round trip; tune workgroup size per device
  (Claire Blackshaw, grdqHJOL5F4 [00:21:26]). Not run here (handoff scenario-godot-shaders).
- **Large worlds:** Large World Coordinates or origin shifting (3D doc).
- **Renderer choice:** Ray Hayes defaults to Compatibility for solo 2D or simple 3D and widest
  reach, Forward+ for photoreal desktop, Mobile for demanding mobile (KWhVVMpihsc [00:06:03]);
  renderer fallback on a player PC (D3D12, Vulkan, OpenGL) changes the look (same, [00:05:12]).
  Opinion, no benchmarks; deciding conditions: web forces Compatibility, advanced post needs
  Forward+ or Mobile.

## Hitches

- [added] Live: entering a 4,000-mesh area with 48 new materials. Worst frame sync 453 ms cold and
  176 ms warm; threaded load 340 and 79 ms; threaded load plus instantiate 230 and 9.6 ms. Pipeline
  compilations land on the first frame that draws the new materials. Load and instantiate off the
  main thread, then warm pipelines (the shader baker export option, 4.5+, handoff
  scenario-godot-shaders).

## Export and platforms

- **Templates per exact version; most failures are missing tooling** (rcedit, JDK and SDK, bundle
  id, ETC2/ASTC) (Brett Makes Games r8KFRLd3Tbo; Cashew vv8Wyean9Ng; Gwizz dCLYMF32ZBE; FinePointCGI
  x_ZFAV2id3I; Nihamkin _n9l15CANag).
- **Credentials through env vars** (`GODOT_ANDROID_KEYSTORE_*`, `GODOT_MACOS_*`,
  `GODOT_SCRIPT_ENCRYPTION_KEY`) (export docs). Live: release APK signed through env vars only;
  presets clean.
- **Android:** keystore and key passwords must match, avoid special characters; "Could not install
  to device" means a package signed with another key is installed; adaptive icon safe zone 66 dp
  circle (264 px at xxxhdpi), sizes 192 and 432 (Android doc). Docs list Platform 35, Build-Tools
  35.0.1, NDK 28.1, CMake 3.10.2, JDK 17. Live: a non-Gradle APK exported with JDK 17, build-tools
  36.0.0 and platform 36 from Unity Hub's AndroidPlayer; NDK not used. [added] JAVA_HOME and
  ANDROID_HOME only seed editor settings on first creation.
- **macOS:** unsigned or un-notarized apps are blocked by Gatekeeper; sign with Developer ID
  Application, notarize with `xcrun notarytool` and a keychain profile, staple, check with
  `spctl -a -vvv`; keep the app-specific password out of the preset (Nihamkin, _n9l15CANag
  [00:04:05, 00:25:38, 00:32:37-00:36:59]); `import_etc2_astc` needed; duplicate certificates with
  the same common name break signing (same, [00:09:27, 00:29:16]). Debugging entitlement off to
  notarize; a custom entitlements file overrides all options; App Sandbox breaks `OS.execute`
  outside the bundle; disable Library Validation for GDExtension with ad-hoc signing; zips keep the
  executable flag (macOS doc). Live: universal export ad-hoc signed, codesign verify OK, Gatekeeper
  "rejected" as expected. Notarization not run.
- **iOS:** the simulator cannot run Godot's Vulkan renderers; every TestFlight upload needs a higher
  version; create the App Store Connect record first;
  `xcode-select -s /Applications/Xcode.app/Contents/Developer` fixes "xcodebuild requires Xcode"
  (FinePointCGI, x_ZFAV2id3I [00:14:41, 00:17:04, 00:40:34, 00:55:11]). Crash telemetry, crash-free
  rate, breadcrumbs, pre-release OS testing (Miguel de Icaza, 8zqjiRuhQLE [00:03:40, 00:09:11]).
  Live: Xcode project exported; `xcodebuild` blocked by the missing iOS 26.5 platform component.
- **Web:** Compatibility only; single-threaded by default since 4.3; threads need COOP and COEP over
  HTTPS; PWA option as workaround; stale service workers show another project; serve `.wasm` as
  `application/wasm`; gzip shrinks it to about a quarter; itch.io does not compress; fullscreen,
  mouse capture and audio need a user gesture; background tabs pause; HTTP has no chunked responses
  or blocking mode (web doc). Coding Quests presents threads as the 4.3 benefit (QB9SyW3mZ2s); the
  docs prefer single-threaded. Deciding condition: real need for threads versus reaching Safari,
  phones and hosts without headers. Live: all of the header rule confirmed in headless Chrome; gzip
  -9 brought 38.1 MB to 9.7 MB (a quarter), brotli to 7.8 MB; the PWA workaround needed one extra
  reload.
- **itch.io:** `index.html` at the zip root (Brett Makes Games, r8KFRLd3Tbo [00:05:08]; Cashew,
  vv8Wyean9Ng [00:02:48]). Embedded pck: one file for players versus smaller patches (r8KFRLd3Tbo
  [00:12:04]).
- **Demo and DLC:** custom feature tag `demo` on a preset, `OS.has_feature("demo")`, per-tag setting
  overrides; exclude the DLC folder from the base preset and mount packs with
  `ProjectSettings.load_resource_pack` (Cashew, vv8Wyean9Ng [00:16:06-00:36:01]). Live: confirmed.
  [added] An exported DLC pack also carries `project.binary` and autoload scripts: mount with
  `replace_files=false`.
- **Pre-publish:** real icon, name, main scene, splash, window mode, AA (StayAtHomeDev,
  3iGHpha-DmE). Encoded in `release_audit`.
- **Steam:** GodotSteam module or template matching the Godot version, Steam library next to the
  executable, set builds live on a beta branch first (BluePhoenix, J0GrG-AffCI [00:04:58-00:12:43]).
  2023 method names are dated.
- **Consoles:** no public templates because of NDAs; routes are a porting house, middleware (about
  $800 per year per console quoted) or a publisher; plan a 720p30 docked Switch tier (StayAtHomeDev,
  oIRJP5uXGpc [00:00:22-00:06:39]).
- **Platform compliance:** a Meta OS update changed an undocumented manifest default and broke the
  boot-splash pass-through; read platform compliance docs six months before shipping; upstreaming
  engine work costs 3 to 5 times the original (Claire Blackshaw, grdqHJOL5F4 [00:12:33,
  00:17:41-00:19:18, 00:27:27]).
- **Touch controls:** TouchScreenButton bound to InputMap actions keeps gameplay code unchanged
  (WisconsiKnight, uofaDRa7dWM [00:03:21]). Live: confirmed; synthetic test touches need
  viewport-local coordinates [added].
