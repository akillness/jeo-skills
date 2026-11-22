# Procedures (agent side, full calls, each run live)

Conventions: `P` is a project path;
`import sys; sys.path.insert(0, "<skills>/scenario-unity-ui/scripts"); import ut_ui, ut_run` (ut_ui
puts scenario-unity-expert's `scripts/` on the path). Every job is a static C# method in
`scripts/AgentKit/UI/` run with `ut_run.run_method`
(`Unity -batchmode [-nographics] [-quit] -projectPath P -executeMethod <method> -agentJob <dir>`),
returning the `AGENT_RESULT` envelope. Captures and counters need `graphics=True`; async jobs need
`quit=False`. If a GUI editor holds the project, run the same method through
`ut_live.call(P, method, args)`.

Live tests: `tests/code/unity-ui/test_live_ui.py` (21 checks, results appended to
`archive/tests/unity-ui/live_results.jsonl`, artifacts and contact sheets in
`archive/tests/unity-ui/`), Play Mode tests
`tests/code/unity-ui/unity/Tests/PlayMode/UIPlayModeTests.cs` (10), Edit Mode UI Test Framework
tests `tests/code/unity-ui/unity/Tests/EditMode/UIToolkitEditModeTests.cs` (8), offline
`tests/code/unity-ui/test_offline.py` (25 tests). Result lines below: "run in Unity 6000.3.21f1 on
2026-09-24". P14 to P21 and the v0.2 parts of P7, P9 and P12 were added by the Y7 refactor.

---

## P1. Route the UI system

Goal: pick uGUI, UI Toolkit or a split from the brief, quoting the 6.3 matrix row that decides.

```python
ut_ui.choose_system({"keyframed_animation"})                 # -> uGUI   (Animation Clips/Timeline: uGUI only)
ut_ui.choose_system({"rtl_or_emoji", "data_binding"})        # -> UI Toolkit
ut_ui.choose_system({"timeline", "data_binding"})            # -> split: uGUI for timeline, UI Toolkit for binding
ut_ui.choose_system(set(), existing="ugui")                  # -> keep the project's system
ut_ui.choose_system(set(), ui_heavy=True)                    # -> UI Toolkit ("often used" case)
ut_ui.choose_system(set())                                   # -> uGUI (6.3 runtime recommendation)
ut_ui.choose_system({"custom_shaders", "world_space"})       # -> uGUI by default, "shared_not_deciding": both systems have them in 6.3
```

Detect the existing system first: `UIDocument` components and `.uxml` files (UI Toolkit), `Canvas`
components (uGUI), `OnGUI` in runtime scripts (IMGUI). `SHARED` rows (custom shaders through UI
Shader Graph, world space since 6.2, font fallbacks, masks, sprite atlases) never route: a tutorial
that sends custom shaders to uGUI predates 6.3. Test: `test_offline.py` Routing (4 tests). Result:
pass (offline, no Unity needed).

## P2. Headless setup: TextMeshPro essentials, build scenes, UI input

```python
ut_ui.project("<repo>/tests/projects/unity-ui")                          # APFS clone of Base3D_URP + both AgentKits + runtime
ut_run.run_method(P, "AgentKit.UI.UISetup.ImportTmpEssentials", {}, quit=False, timeout=600)
ut_run.run_method(P, "AgentKit.UI.UISetup.AddScenesToBuild", {"scenes": [LEVEL, MENU, HUD]})
```

`ImportTmpEssentials` resolves `com.unity.ugui` through
`PackageManager.PackageInfo.FindForAssetPath("Packages/com.unity.ugui").resolvedPath`, calls
`AssetDatabase.ImportPackage(<path>/Package Resources/TMP Essential Resources.unitypackage, false)`
and waits for `importPackageCompleted`.
`TMP_PackageResourceImporter.ImportResources(true, false, false)` imports nothing in batch mode (it
looks for a `Packages/com.unity.ugui` folder that does not exist for a built-in package), and
without the essentials `TMP_Settings.defaultFontAsset` throws a NullReferenceException. UI input:
`BuildMenuScene` sets `InputSystemUIInputModule.actionsAsset = InputSystem.actions` when the
project-wide asset has a UI map; AddComponent alone gives `DefaultInputActions` (observed), so
player rebinds of the UI map would not reach navigation. Test: `test_01_tmp_essentials_headless`,
`test_04` (AddScenesToBuild), Play Mode `PointerEnterSelects_ExitClears_GamepadRecovers` (records
the module's asset). Result: run in Unity 6000.3.21f1 on 2026-09-24: pass. Essentials imported in 15
to 23 s (TMP Settings + LiberationSans SDF); build scene list set; the scripted module reports
`InputSystem_Actions` after the fix (`DefaultInputActions` before).

## P3. Main menu and settings screen in uGUI, from code

```python
ut_run.run_method(P, "AgentKit.Gameplay.GameplayAudio.CreateCombatMixer",      # scenario-unity-gameplay's job (handoff)
                  {"path": "Assets/AgentUI/Audio/UIMixer.mixer", "groups": ["Music", "SFX"], "snapshots": {"Default": {}}})
ut_run.run_method(P, "AgentKit.UI.UIBuild.BuildMenuScene",
                  {"scene": "Assets/AgentUI/Scenes/UI_Menu.unity", "mixer": "Assets/AgentUI/Audio/UIMixer.mixer",
                   "reference": [1920, 1080], "match": 0.5, "handheld_multiplier": 1.35}, strict=True)
```

What the job builds (C#, `UIBuild.cs`): one EventSystem; "Canvas - Menu" (Overlay, sort order 10,
Pixel Perfect off, TexCoord1 only, CanvasScaler Scale With Screen Size 1920 x 1080 Match 0.5,
`CanvasDeviceScale`, `MenuRouter`, no raycaster on the root); sub-canvases "Decoration" (no
raycaster), "Screen - Main" and "Screen - Settings" (Canvas + GraphicRaycaster + CanvasGroup +
`MenuScreen`). Main: a `ContentSizeFitter` column at the top of its hierarchy with `ClampedWidth`
(max 800), title, subtitle, PLAY (the only accent surface), SETTINGS, QUIT. Settings: header, a
ScrollRect (RectMask2D viewport, content pivot y = 1, `ScrollToSelection`) with section labels and
rows (label flexible and wrapping, control slot 440 preferred / 280 min): resolution and quality
`TMP_Dropdown` (`TMP_DefaultControls.CreateDropdown`), master/music/SFX `Slider`
(`DefaultControls.CreateSlider`) with value labels, three `RebindRow`s (Jump, Attack, Interact on
the project-wide actions), Back. Buttons: Color Tint from `UiTheme`, `SelectableFeedback`,
persistent listeners
(`UnityEventTools.AddStringPersistentListener(button.onClick, router.ShowScreen, "Settings")`).
Labels have raycastTarget off. The builder reuses
`UIBuild.NewUI/Stretch/Place/Label/Panel/MakeButton/Row/MakeSlider/MakeDropdown/MakeRebind` for any
other screen. Runtime (`scripts/Runtime/UI/`): `SettingsService` (JSON in `persistentDataPath`,
`Apply` at boot: quality, resolution on desktop only, volumes `20*log10(v)` with a 0.0001 floor on
the mixer or `AudioListener.volume`, binding overrides JSON), `SettingsScreen` (widgets to data,
listeners added in OnEnable and removed in OnDisable; hides the resolution row on mobile and the
quality row when the platform has one level), `RebindRow` (`action.Disable()` first, since an
enabled action cannot be rebound;
`PerformInteractiveRebinding(index).WithControlsExcluding("<Mouse>/position").WithCancelingThrough("<Keyboard>/escape").OnMatchWaitForAnother(0.1f)...Start()`;
on complete or cancel the operation is `Dispose`d and the action re-enabled; label from
`GetBindingDisplayString`). On mobile the resolution row hides: a render-scale option belongs to
scenario-unity-rendering-lighting's URP asset settings [added]. Mixer handoff: the test runs
scenario-unity-gameplay's `AgentKit.Gameplay.GameplayAudio.CreateCombatMixer`
`{"path": MIXER, "groups": ["Music", "SFX"], "snapshots": {"Default": {}}}` (exposes MasterVol,
MusicVol, SFXVol; with mood snapshots, the player's slider needs a parameter no snapshot drives).
Test: `test_02_mixer_from_gameplay_handoff`, `test_03_build_ugui_menu_and_settings`. Result: run in
Unity 6000.3.21f1 on 2026-09-24: pass, 14 s, zero compile errors and warnings: 4 canvases, 2
raycasters (interactive screens only), 63 graphics, 29 raycast targets (controls and dropdown
templates), 16 selectables, 14 layout groups, 1 EventSystem, no camera; mixer exposed MasterVol,
MusicVol, SFXVol.

## P4. HUD in UI Toolkit, UXML and USS written as files

```python
ut_ui.write_uitk_templates(P)            # Hud.uxml, Hud.uss, AgentRuntimeTheme.tss -> Assets/AgentUI/HUD/
ut_run.run_method(P, "AgentKit.UI.UIToolkitBuild.BuildHud",
                  {"scene": "Assets/AgentUI/Scenes/UI_HUD.unity", "reference": [1920, 1080], "match": 0.5}, strict=True)
```

Text assets (see `scripts/templates/uitk/`): the theme is one line,
`@import url("unity-theme://default");`, imported as a `ThemeStyleSheet`. The UXML declares bindings
as text:
`<agent:HudBar name="health-bar"><Bindings><ui:DataBinding property="value" data-source-path="Health01" binding-mode="ToTarget" /></Bindings></agent:HudBar>`
(property = target property, path = `HudModel` member). The USS keeps tokens as `:root` variables,
positions blocks absolutely in the corners, animates nothing on layout properties, and avoids
`overflow: hidden` with `border-radius` (stencil). `HudBar` is a `[UxmlElement] partial` control
whose fill moves with `style.scale` (usage hints DynamicTransform | DynamicColor set in the
constructor) and reads `--bar-high/--bar-mid/--bar-low` through `CustomStyleResolvedEvent`.
`HudModel` is `[GeneratePropertyBag]` (assembly attribute
`[assembly: GeneratePropertyBagsForAssembly]`), implements `INotifyBindablePropertyChanged` and
`IDataSourceViewHashProvider`, builds strings once per change. `HudView` sets
`rootVisualElement.dataSource = model` once. The job creates the scene BEFORE loading the UXML
(NewScene unloads unreferenced assets: the loaded `VisualTreeAsset` was destroyed under the job,
observed), creates `HudPanelSettings.asset` (`ScriptableObject.CreateInstance<PanelSettings>`, Scale
With Screen Size, Match Width Or Height 0.5, theme assigned, `vertexBudget`, public in 6.3), and
reports each UXML/USS/TSS import verdict (`StyleSheet.importedWithErrors`, rules kept) plus
`texture_slot_count`, the dynamic atlas' `maxSubTextureSize` and filters, `sorting_order` and
`text_settings`. Test: `test_04_build_uitk_hud_from_text`. Result: run in Unity 6000.3.21f1 on
2026-09-24: pass, 0 import errors (TSS as ThemeStyleSheet, USS as StyleSheet, UXML as
VisualTreeAsset), 13 named elements including `health-bar` and its `fill`, Vertex Budget 0
(automatic).

## P5. Capture uGUI at the device matrix, with a layout assertion

```python
shots = ut_ui.shots(screen="Main", prefix="main_") + ut_ui.shots(screen="Settings", prefix="settings_")
r = ut_run.run_method(P, "AgentKit.UI.UICapture.CaptureUGUI",
                      {"scene": MENU, "shots": shots, "probes": ["Menu Background@0.02,0.5", "Accent Stripe@0.5,0.5"]},
                      graphics=True, timeout=900)
assert not ut_ui.layout_verdict(r)                       # empty = every shot passed
rev = ut_ui.review(r, "<out>/ugui_sheet.png")            # image checks + contact sheet: LOOK at it
```

Capture path: every root Overlay canvas is switched, for the capture only and without saving, to
Screen Space Camera on a hidden orthographic camera (`planeDistance = 1`) whose `targetTexture` is
an sRGB RenderTexture of the device size; the Canvas Scaler then sizes the canvas from
`Canvas.renderingDisplaySize` (the camera's pixel size). Per shot: `CanvasDeviceScale.ForceHandheld`
for phones, `MenuScreen.Show` for the named screen, three rounds of `Camera.Render` +
`Canvas.ForceUpdateCanvases` + `ClampedWidth.Apply` + `LayoutRebuilder.ForceRebuildLayoutImmediate`
(the first render also absorbs the white first frame), then `ReadPixels`. Assertion on the same
frame, from `RectTransform.GetWorldCorners` through `Camera.WorldToScreenPoint`: every visible
Graphic or Selectable inside the screen (or inside its RectMask2D horizontally; scrolled-out rows
counted as `clipped_by_scroll`), TMP `textBounds` inside its rect and `isTextTruncated` false, no
two interactive rects (clipped to their viewport) or text bounds overlapping, interactive height at
or above `min_target_px`. The job also returns `scale_factor` and the CanvasScaler formula's
`expected_scale`, and probe colors. First pass on this screen (kept as the example of what the
assertion catches): at 1080 x 1920 "Master volume" overflowed its 231 px label slot and a partly
scrolled rebind button overlapped Back; fixed by wrapping labels and clipping rects to their
viewport. Test: `test_05_capture_ugui_devices`, sheet
`archive/tests/unity-ui/sheets/ugui_menu_settings.png`. Result: run in Unity 6000.3.21f1 on
2026-09-24: pass at 6 devices x 2 screens (12 shots, 10 elements checked on Main, 44 on Settings):
scale equals the formula everywhere (phone 1.35, laptop 1.0, 4K 2.0, tall phone 1.6136, tablet
1.6628, 21:9 1.5456); color probes within 3 of `#2f3640` and `#40739e`; contact sheet looked at.
Looking at the six-device sheet also caught what no check covered yet: "Resolutio/n" broken inside
the word at 1170 x 2532 and ragged control columns; the `word_breaks` assertion was added (it flags
the old scene: `word_break_check_catches_defect`), labels got a minimum of their longest word and
one shared width.

## P6. Capture the UI Toolkit HUD at the device matrix

```python
r = ut_run.run_method(P, "AgentKit.UI.UICapture.CaptureUITK",
                      {"scene": HUD, "shots": ut_ui.shots(prefix="hud_"),
                       "model": {"health": 42, "max_health": 100, "ammo": 24, "reserve": 90},
                       "backdrop_scene": "Assets/Scenes/SampleScene.unity"},
                      graphics=True, quit=False, timeout=900)
assert not ut_ui.layout_verdict(r)
```

Capture path: each UIDocument's PanelSettings is cloned with `Object.Instantiate` (a PanelSettings
asset changed in Play mode keeps the change) and given `targetTexture` = sRGB RenderTexture(device
size); the job ticks the editor with `EditorApplication.QueuePlayerLoopUpdate` (8 updates; the panel
renders and bindings update in edit mode), reads the texture, and with `backdrop_scene` renders that
level's camera at the same size and composites the premultiplied panel over it. `colorClearValue` is
linear in a Linear project (convert with `Color.linear`, observed). Assertion: every visible
element's `worldBound` inside the panel, labels measured with `MeasureTextSize` against their
content rect and parent block, `hud-block` elements never overlapping; `binding` compares the labels
and the bar with the model; `scale_factor` = device width / panel width, with the linear and log
predictions side by side. Test: `test_06_capture_uitk_devices`, sheet
`archive/tests/unity-ui/sheets/uitk_hud.png`. Result: run in Unity 6000.3.21f1 on 2026-09-24: pass
at 6 devices: labels "42 / 100" and "24", bar 0.42 at every size (binding proven in edit mode); UI
Toolkit scale linear: phone 1.1701 (uGUI's log blend: 1.0), tall phone 1.4769 (1.1953), tablet
1.2444 (1.2317), 21:9 1.5625 (1.5456); HUD readable over the SampleScene sky and ground, 4K crop
crisp.

## P7. Static audit of uGUI scenes and prefabs

```python
r = ut_run.run_method(P, "AgentKit.UI.UIAudit.Audit",
                      {"scenes": [MENU, HUD], "prefabs": [], "text": strings_of_every_locale})
r["result"]["counts"], r["result"]["findings"]     # {severity, code, path, message, fix}
```

30 rules (list and sources in `UIAudit.cs`): scaler mode and Match vs orientations (from
`PlayerSettings`), idle raycasters, Pixel Perfect with moving content, mixed-timing canvases,
Overlay shader channels, raycast targets without an interactive owner, non-zero Z or off-plane
rotation, scale not 1, legacy Text, Shadow/Outline on text, fitter inside a controlling group,
zero-size children (control on, force expand off, nothing reported), nested layout depth, Animators,
Animation transitions, EventSystem count across the scene set, MenuScreen without a first selection,
Navigation None, TMP essentials and glyphs; v0.2: `stack.sort_tie` (two screen-space layers of
either system on one sort order), `canvas.world_many` (more than `max_world_canvases`, default 8,
World Space canvases: at least one batch each), `mask.static_stencil` (a stencil `Mask` that no
ScrollRect uses), `anchor.center_edge` (center anchors on an element whose center sits more than a
quarter of the reference size from the middle, under full-screen parents, not driven by a layout
group), `atlas.rotation`, `atlas.tight_packing`, `atlas.uncompressed` (Sprite Atlases V1 or V2 that
pack a sprite an audited Image uses, or `atlases` given; V2 read through
`SpriteAtlasImporter.packingSettings` and `GetPlatformSettings("DefaultTexturePlatform")`, packables
through `SpriteAtlasExtensions.GetPackables`, which works on V2 atlases). The result also lists
`stack`: every root Overlay canvas and screen-space panel sorted by sort order, the order input
follows. It runs `LayoutRebuilder.ForceRebuildLayoutImmediate` first (layout groups report 0 before
a pass) and decides root canvases by hierarchy (a disabled nested canvas reported WorldSpace and
root, observed). Recall check: `UITests.UIFixtures.BuildBadScene` (test-only) plants one violation
for 23 of them (the glyph rules are P8's; Match, mixed timing, world camera, fitter pivot and
uncompressed atlas are not planted): v0.2 adds a second Overlay canvas and a UI Toolkit panel on
sort order 0 next to the root canvas, a coin counter at (860, 480) with center anchors, ten World
Space name plates, an avatar under a stencil Mask, and a V2 Sprite Atlas with rotation and tight
packing that packs the sprite of an Image. Test: `test_07_audit_clean_and_bad`. Result: run in Unity
6000.3.21f1 on 2026-09-24: pass. Clean menu + HUD scenes: 0 errors, 0 warnings, 11 infos
(`layout.nested` on the settings rows: a screen that rebuilds on open); clean stack: HUD panel (sort
0), then "Canvas - Menu" (sort 10), no tie. Bad fixture: 8 errors, 15 warnings, 4 infos, all 23
planted rules fired ("3 layers of BOTH systems share sort order 0", "10 World Space canvases",
"offset (860, 480) reference px", atlas rotation and tight packing; the atlas' default compression
was already Compressed, so `atlas.uncompressed` stayed silent). Before the two v0.1 precision fixes
the clean menu showed 20 false `layout.zero_child` errors and 1 false `canvas.world_camera`.

## P8. Glyph gate per locale, and a candidate fallback font

```python
r = ut_run.run_method(P, "AgentKit.UI.UIAudit.Audit", {"scenes": [MENU], "text": ["Settings", "Paramètres audio", "Настройки звука", "設定"]})
r["result"]["tmp"]["missing"]            # [{text, missing: ["U+8A2D", ...], count}]
r = ut_run.run_method(P, "AgentKit.UI.UIAudit.Audit", {"scenes": [MENU], "text": [...],
                      "candidate_fallback_font": "Assets/Fonts/NotoSansJP-Regular.otf"})   # "would this font close the gap?"
```

`TMP_FontAsset.HasCharacters(text, out uint[] missing, searchFallbacks: true, tryAddCharacter: true)`
on the default font walks its local fallbacks and TMP Settings' general list;
`tryAddCharacter: true` lets dynamic fonts (TMP's own LiberationSans fallback is dynamic) pull
glyphs from their source before answering. The candidate is a transient
`TMP_FontAsset.CreateFontAsset(path, 0, 90, 9, GlyphRenderMode.SDFAA, 1024, 1024)` appended to the
local fallback list for the check, then removed. For shipping, generate font assets from a font you
may redistribute (Noto), same sampling size and padding for every script (Imphenzia). Test:
`test_08_glyph_gate_and_candidate_font` (candidate: macOS Hiragino Sans GB, test only). Result: run
in Unity 6000.3.21f1 on 2026-09-24: pass. English, French and Russian covered by LiberationSans SDF
and its dynamic fallback; "設定" missing U+8A2D and U+5B9A; with the candidate font 0 missing.

## P9. USS parser verdict and USS/UXML lint

```python
ut_run.run_method(P, "AgentKit.UI.UIToolkitBuild.ImportReport", {"folder": "Assets/AgentUI/HUD"})   # errors/warnings per file
ut_ui.lint_uss(open("Hud.uss").read(), "Hud.uss")      # transitions on layout props, resting opacity 0, stencil masks
ut_ui.lint_uxml(open("Hud.uxml").read(), "Hud.uxml")   # inline style=, bindings without binding-mode or property
```

6.3's upgraded parser "will block the file from importing" on errors (upgrade guide). What that
means, measured: the asset still exists as a `StyleSheet` flagged `importedWithErrors`, but with 0
rules: ONE bad value (`width: 10qq`) or ONE missing brace drops every rule of the file, the valid
ones too, and the UI renders unstyled with no exception. Gate on `errors == false` AND `rules > 0`
per sheet after every USS write; the Editor log has line and column only on the import that parsed
it. The report also lists each sheet's hard dependencies and their in-memory size: a stylesheet
loads every texture and font it references (Borromeo, bECmaYIvZJg [00:41:31]), so keep
screen-specific art out of a global theme; `lint_uss` flags them offline (`uitk.hard_refs`). Test:
`test_09_uss_parser_and_lint`, `test_offline.py` Lint. Result: run in Unity 6000.3.21f1 on
2026-09-24: pass. Broken.uss (mixed errors), BrokenValues.uss (only invalid values, two valid rules)
and BrokenSyntax.uss (one extra brace, two valid rules): each a StyleSheet with errors and 0 rules;
Refs.uss: no error, 1 rule, dependency `icon.png` (Texture2D, 3,008 bytes in memory). The first
import logged "Could not parse color token" and "Unsupported unit: '10qq'"; a later job that does
not reimport prints nothing. Lint on the fixture: `uitk.transition_layout`, `uitk.opacity_zero`,
`uitk.stencil_mask`; the shipped Hud.uss and Hud.uxml lint clean (offline test). v0.1 of this skill
said an invalid USS "still imports": true for the asset, false for its rules (Y7 grade).

## P10. Hiding without rebuilds (mesh regenerations)

```python
ut_run.run_method(P, "AgentKit.UI.UIPerf.HideCost", {"probes": 200}, graphics=True)
```

A canvas of 200 `RebuildProbe` graphics (a MaskableGraphic that counts `OnPopulateMesh`; it declares
`[RequireComponent(typeof(CanvasRenderer))]`: `Graphic` itself does not, and a custom Graphic
without one draws nothing and never rebuilds, observed). Each toggle is followed by a canvas render
and the count read. Test: `test_10_hide_cost_rebuilds`. Result: run in Unity 6000.3.21f1 on
2026-09-24: pass (three runs, identical): first build 200 regenerations; Canvas.enabled off/on 0;
CanvasGroup alpha 0/1 0; SetActive off/on 200; one color change 1; moving the parent 0; resizing the
parent with fixed-size children 0, with stretched children 200.

## P11. Text effects: Shadow/Outline vs TMP material

```python
ut_run.run_method(P, "AgentKit.UI.UIPerf.TextEffectCost", {"text": "HEADER TEXT 1234"}, graphics=True)
```

Legacy Text's generator quads go through `Shadow.ModifyMesh` and `Outline.ModifyMesh` on a
VertexHelper; TMP gets a material copy with `OUTLINE_ON` and `UNDERLAY_ON`, then `ForceMeshUpdate`;
triangles compared. Test: `test_11_text_effect_cost`. Result: run in Unity 6000.3.21f1 on
2026-09-24: pass. Legacy Text 28 triangles, +Shadow 56, +Outline 280 (10x); TMP with outline and
underlay 30 triangles (14 visible glyphs).

## P12. UI counters in Play mode: canvas split, UI Toolkit texture slots, HUD GC

```python
ut_run.run_method(P, "AgentKit.UI.UIPerf.BuildPerfScenes", {"static": 600})
ut_run.run_method(P, "AgentKit.UI.UIPerf.PlayModeCounters",
                  {"scene": "Assets/AgentUI/Scenes/Perf/Perf_Single.unity", "frames": 240, "warmup": 60,
                   "counters": ["UI Render/Canvas.BuildBatch", "PlayerLoop/UIEvents.WillRenderCanvases", "UI Layout/Layout",
                                "PlayerLoop/PreLateUpdate.UIElementsUpdatePanels", "Render/Batches Count",
                                "Render/Draw Calls Count", "Memory/GC Allocated In Frame"]},
                  graphics=True, quit=False, timeout=900)
```

The job enters Play mode (state in `SessionState`, resumed by an `[InitializeOnLoad]` driver after
the domain reload), gives every camera an offscreen target and every UIDocument a cloned
PanelSettings with a target (batch Play mode renders nothing on screen), and samples the counters
once per frame with `UiCounterSampler` (preallocated rows, so the sampler adds no GC), tagged by
`UiCounterSampler.Tag` (`UitkTextureGrid` publishes its texture count). Marker names are those
`ProfilerRecorderHandle.GetAvailable` lists in 6.3. Units follow `ProfilerRecorder.UnitType` (ns to
ms, bytes, counts). Scenes: `Perf_Single` / `Perf_Split` (600 static Images + a TMP counter changed
every frame, on the same canvas or its own sub-canvas), `Perf_UitkTextures` / `Perf_UitkAtlas` (4,
8, 9, 16, 17 distinct 512 px or 32 px textures), `UI_HUD` / `UI_HUD_Driven` (Ammo changes every
frame). `list_markers: ["Binding", "UIElements"]` returns the exact "Category/Name" of every
recorder available after the run (a wrong category makes a recorder silently invalid): in 6.3
Borromeo's "Update Runtime Bindings" is `Scripts/UIElements.UpdateRuntimeBindings`, next to
`Scripts/UIElements.UpdateLayout`, `Scripts/UIElements.UpdateStyle`,
`Scripts/UIElements.UpdateRenderData`, `Scripts/Bindings.Update`. Drivers publish facts through
`UiCounterSampler.Extra`, returned as `extra`. Under `-runTests -nographics` the "GC Allocated In
Frame" recorder read 0 even for a 4 KB allocation per frame (observed), so GC is measured here, with
graphics. Test: `test_12_canvas_split_counters`, `test_13_uitk_texture_slots`,
`test_14_hud_gc_and_update_cost`. Result: run in Unity 6000.3.21f1 on 2026-09-24 (editor Play mode
on Apple Silicon with other editors running: relative numbers): pass. Canvas split, 600 static
graphics: `Canvas.BuildBatch` mean 0.027 to 0.048 ms on one canvas vs 0.015 to 0.024 ms split (5
runs, split always lower, ratio 1.4 to 2.8); 2000 static graphics, three alternating runs: p50 0.038
to 0.043 ms vs 0.018 to 0.022 ms; `UIEvents.WillRenderCanvases` 0.085 to 0.099 vs 0.058 to 0.070 ms;
batches 8 in both (the counter's TMP material was already its own batch). UI Toolkit, 512 px
textures: 4 and 8 textures 1 batch, 9 and 16 two, 17 three; 32 px textures: 1 batch at every count
(dynamic atlas). HUD: 1 batch; GC per frame p50 40 bytes idle (editor baseline) vs 66 bytes when
Ammo changes every frame; `PreLateUpdate.UIElementsUpdatePanels` 0.010 to 0.012 ms vs 0.051 to 0.063
ms.

## P13. Behavior in Play mode (Test Framework)

```python
ut_run.run_tests(P, "PlayMode")      # never with -quit; NUnit XML parsed; metrics in Library/AgentKit/ui_playmode_metrics.json
```

Tests (`UIPlayModeTests.cs`, asmdef referencing `AgentUI.Runtime`, `Unity.InputSystem`,
`Unity.TextMeshPro`, `UnityEngine.UI`): first selection one frame after show; hover selects and exit
clears; a virtual `Gamepad` (`InputSystem.AddDevice<Gamepad>()`,
`QueueStateEvent(pad, new GamepadState().WithButton(GamepadButton.DpadDown))`) recovers the last
selection then navigates; a hidden screen has 0 interactable controls, and `Canvas.enabled = false`
alone leaves them navigable; quality lists the runtime levels, volumes land in the mixer in dB,
settings JSON saved; rebinding Jump with a virtual keyboard K press saves `<Keyboard>/k` and
restores it from JSON; the UI scene loads additively over SampleScene three times with one
EventSystem and no handler growth; HUD bindings update, keep updating under display:none and stop
when the element is removed. Test: `test_15_playmode_navigation_settings_additive_binding` (P14, P19
and P21 add three tests to this run). Result: run in Unity 6000.3.21f1 on 2026-09-24: 10/10 pass;
the seven v0.1 tests: Selection null at load, Button Play one frame later; hover selected Button
Settings, exit cleared it, dpad resumed on Button Settings, a second press reached Button Quit;
hidden main screen 0 interactable controls (3 with Canvas.enabled alone); runtime quality list "PC"
only (the Quality row hides), mixer -6.02 dB and -12.04 dB for 0.5 and 0.25, 11 resolutions; rebind
saved `<Keyboard>/k`, label "K", restored from JSON; handler counts 2,0,2,0,2,0 over three
load/unload cycles, the opaque menu disabled the level camera and set 30 fps, HideAll restored both;
bar 0.80 under display:none, stayed 0.80 while removed (model 0.10), 0.10 after re-insertion.

## P14. Layers and focus across uGUI and UI Toolkit

Goal: when both systems ship (a uGUI pause or settings screen over a UI Toolkit HUD, or the
reverse), every layer has its own sort order from ONE table and focus moves on purpose between the
two input paths.

```python
ut_ui.UI_LAYERS                    # {"world_markers": -10, "hud": 0, "menu": 10, "modal": 20, "toast": 30, "debug": 100}
r = ut_run.run_method(P, "AgentKit.UI.UIAudit.Audit", {"scenes": [MENU, HUD]})
r["result"]["stack"]               # [{system, path, sort, panel_settings?, document_sort?}] lowest first: the draw and input order
```

Set `Canvas.sortingOrder` (root Overlay canvases) and `PanelSettings.sortingOrder` (one per panel;
several UIDocuments on one PanelSettings are ONE panel, ordered by `UIDocument.sortingOrder`) from
the table. Unity sorts screen-space panels and Overlay canvases together since 2021.2 (Unity staff
on the forum; drawing not observable headless: Overlay reaches no camera), and the EventSystem ranks
their raycasters by the same numbers (`EventSystem.RaycastComparer`:
`GraphicRaycaster.sortOrderPriority` = canvas sort order, `PanelRaycaster.sortOrderPriority` = panel
sort order). `stack.sort_tie` flags equal values: the winner is then Hierarchy or load order
(Christina, 1OwQflHq5kg [00:05:39]). Focus handoff (source read: `PanelEventHandler`): with an
EventSystem present, each screen-space panel gets a GameObject named after its PanelSettings
(PanelEventHandler + PanelRaycaster, child of the EventSystem). `element.Focus()` makes that
GameObject the EventSystem selection; `EventSystem.SetSelectedGameObject(uguiControl)` blurs the
panel. So opening a uGUI popup over UI Toolkit: remember the focused element,
`SetSelectedGameObject(firstControl)`; closing it: `element.Focus()` again. A uGUI `MenuScreen`
never navigates into a panel by itself (the Navigation graph holds Selectables only). Test:
`test_07` (stack and `stack.sort_tie`), Play Mode
`LayerAndFocusTests.SortOrderRanksBothSystems_FocusHandsOver` (in `test_15`): an Overlay canvas
(sort 10) with a full-screen Button and a UIDocument (runtime PanelSettings) with a full-screen UI
Toolkit Button. Result: run in Unity 6000.3.21f1 on 2026-09-24: pass. Panel sort 20: the top raycast
hit is `PanelRaycaster:HUD PanelSettings` (2 hits); panel sort 5: `GraphicRaycaster:UGUI Button`.
After `uitkButton.Focus()`: EventSystem selection "HUD PanelSettings", panel focus "uitk-button";
after `SetSelectedGameObject(UGUI Button)`: selection "UGUI Button", panel focus null. Under
`-nographics` the panel's own size can be 0: give test elements an explicit size (a stretched
element picked nothing on the first run).

## P15. Layout explained: the Layout Properties pane as data

```python
r = ut_run.run_method(P, "AgentKit.UI.UIAudit.ExplainLayout", {"scene": MENU, "path": "Canvas - Menu/Screen - Settings", "depth": 2})
for row in r["result"]["rows"]: print(row["name"], row["size"], row["min"], row["preferred"], row["flexible"], row.get("why"))
```

After `LayoutRebuilder.ForceRebuildLayoutImmediate` on the root canvas and the element, each row
gives `LayoutUtility.GetMin/Preferred/FlexibleWidth/Height`, the element's own LayoutElement, fitter
and group flags (control, force expand, spacing, padding), and `why`: the parent group's rule
applied to that child (not controlled; preferred else min; plus a share of spare space; or
COLLAPSED). Use it whenever a capture shows a size nobody expected, before touching a checkbox
(Christina, HTQV4mukZ2M [00:43:22]: read parent AND children). Test: `test_16_explain_layout` on the
audit fixture's group. Result: run in Unity 6000.3.21f1 on 2026-09-24: pass. Group:
VerticalLayoutGroup, control (true, true), force expand (true, false). "Empty Child": size 100 x 0,
min, preferred and flexible all 0, why "height: COLLAPSED, preferred = min = flexible = 0 under
Control Child Size, force expand off"; width 100 from force expand.

## P16. UI Toolkit hiding: pick by duration, measured per method

```python
ut_ui.uitk_hide_method(hidden_seconds=600)                       # settings behind Escape -> "remove"
ut_ui.uitk_hide_method(1, toggles_per_minute=30)                 # blinking prompt -> "opacity_or_offscreen"
ut_ui.uitk_hide_method(20, toggles_per_minute=1)                 # in between -> "display"
ut_run.run_method(P, "AgentKit.UI.UIPerf.PlayModeCounters", {"scene": "Assets/AgentUI/Scenes/Perf/Perf_UitkHide.unity", "frames": 440, "warmup": 30,
    "counters": ["PlayerLoop/PreLateUpdate.UIElementsUpdatePanels", "Render/Vertices Count", "Render/Batches Count",
                 "Scripts/UIElements.UpdateRuntimeBindings", "Scripts/UIElements.UpdateLayout", "Scripts/UIElements.UpdateStyle",
                 "Scripts/UIElements.UpdateRenderData"]}, graphics=True, quit=False)
```

`UitkHideDriver` builds a settings-sized screen (120 rows, each a label bound to a model that
changes every frame and a rounded bar), then per method: visible frames, the hide frame, hidden
frames, the show frame (tags method * 10 + phase). Borromeo's rule (bECmaYIvZJg [00:38:08]): long
absences favor removal, frequent short toggles favor opacity or off-screen; the manual adds
visibility (layout kept, children can override) and display none (siblings reflow). Measured costs
make the trade concrete. Test: `test_20_uitk_hide_matrix`. Result: run in Unity 6000.3.21f1 on
2026-09-24, three runs (editor Play mode, p50 ms of `UIElementsUpdatePanels`, relative; ranges over
the runs): pass. Visible 1.16 to 1.32 ms (bindings 0.86 to 0.96), 8,160 vertices, 1 batch. Hidden
per frame: opacity 0 and off-screen equal to visible (8,160 vertices kept, full cost); visibility
hidden 1.14 to 1.26 (0 vertices, bindings still running); display none 0.87 to 0.99 (0 vertices,
layout 0.03, bindings still 0.84 to 0.92: most of the cost stays for a bound screen); removed 0.005
(everything stops). Toggle frames: visibility 2.4 to 2.8 each way (style re-evaluation 1.2 to 1.4
ms); display none 1.3 hide / 1.5 to 2.0 show; removed 0.2 to 0.3 hide / 2.2 to 3.3 show (bindings
1.1 to 1.2, style 0.6 to 0.7); opacity and off-screen no spike. Bindings kept updating while hidden
for every method except removal (`extra`). Same ranking in all three runs.

## P17. Vertex Budget: one static panel, one draw

```python
ut_run.run_method(P, "AgentKit.UI.UIPerf.BuildPerfScenes", {"vertex_budgets": [0, 20000]})
ut_run.run_method(P, "AgentKit.UI.UIPerf.PlayModeCounters", {"scene": "Assets/AgentUI/Scenes/Perf/Perf_UitkVertex_B0.unity", "frames": 360, "warmup": 20,
    "counters": ["Render/Batches Count", "Render/Vertices Count"]}, graphics=True, quit=False)   # then _B20000
```

`UitkVertexGrid` fills the panel with 250 to 12,000 plain 8 px elements (no texture, so only a
vertex buffer change can split the batch). Borromeo (bECmaYIvZJg [00:08:08], [00:09:13]): vertex
buffers are pre-allocated pages; when a static panel spills into a second one it draws twice; raise
Panel Settings > Buffer Management > Vertex Budget (`PanelSettings.vertexBudget`, 0 = automatic)
until it draws once, without oversizing (memory). Size it from `Render/Vertices Count` of the real
screen. Test: `test_19_uitk_vertex_budget`. Result: run in Unity 6000.3.21f1 on 2026-09-24: pass. 12
vertices per element here. Batches at Vertex Budget 0 vs 20000: 3,000 vertices 1 vs 1; 12,000: 3 vs
1; 24,000: 3 vs 2; 48,000: 5 vs 3; 96,000: 5 vs 4; 144,000: 7 vs 5.

## P18. UI Toolkit text: its own font chain and glyph gate

```python
r = ut_run.run_method(P, "AgentKit.UI.UIToolkitBuild.UitkGlyphs", {"scene": HUD, "text": strings_of_every_locale,
                      "candidate_fallback_font": "Assets/Fonts/NotoSansJP-Regular.otf"}, graphics=True, quit=False)
r["result"]["panels"][0]["missing"], r["result"]["tmp"]["missing"]
```

The job adds a probe Label to each UIDocument (cloned PanelSettings), ticks the editor until styles
resolve, reads the font the panel really uses (`resolvedStyle.unityFontDefinition`, a FontAsset, or
a Font turned into a dynamic `FontAsset`), checks every string with
`FontAsset.HasCharacters(text, out uint[] missing, searchFallbacks: true, tryAddCharacter: true)`
then the panel's `PanelSettings.textSettings.fallbackFontAssets`, and compares with the TMP chain
after adding the candidate to TMP Settings (in memory only). UI Toolkit fallbacks live in a Panel
Text Settings asset (Create > UI Toolkit > Text Settings) assigned to the PanelSettings; without
one, a default is created at runtime. Font parity applies to both chains (Imphenzia, NFn74l2WA_8
[00:07:33], [00:08:04]): every fallback asset has the same sampling point size and padding (about a
tenth), CJK split across several assets, only the characters used baked (doc-tmp-font-fallback).
Test: `test_17_uitk_glyphs_separate_from_tmp` (candidate: macOS Hiragino Sans GB, test only).
Result: run in Unity 6000.3.21f1 on 2026-09-24: pass. The HUD label resolved "NotInter-Regular" (a
Font, dynamic asset), no Text Settings asset; English, French and Russian covered; "設定" missing
U+8A2D and U+5B9A in UI Toolkit while the TMP chain with the candidate reported 0 missing; with the
candidate as a UI Toolkit fallback, 0 missing.

## P19. Binding sources and invalidation tracing

```python
r = ut_run.run_method(P, "AgentKit.UI.UIToolkitBuild.BindingSources", {"types": ["AgentUI.HudModel", "MyGame.InventoryViewModel"]})
[t["generated"] for t in r["result"]["types"]]          # False = reflection property bag
```

`PropertyBag.GetPropertyBag(type)` names the bag: generated (`<Type>_<guid>_PropertyBag`) or
`ReflectedPropertyBag`. Generation needs BOTH `[GeneratePropertyBag]` on the partial class AND
`[assembly: GeneratePropertyBagsForAssembly]` in its assembly (Borromeo, bECmaYIvZJg [00:33:15],
[00:33:47]); add `INotifyBindablePropertyChanged` and `IDataSourceViewHashProvider` so bindings
refresh only on change. Then trace what still invalidates the panel: `PanelChangeLog` (runtime
component, an `IDebugPanelChangeReceiver` set with `PanelSettings.SetPanelChangeReceiver`, editor
and development builds only) counts changes per element and `VersionChangeType` (Borromeo
[00:42:04]); an idle screen must report 0. Tests: `test_18_binding_sources_property_bags`; Play Mode
`PanelChangeTests.IdleHudIsQuiet_DrivenValueIsNamed` (in `test_15`). Result: run in Unity
6000.3.21f1 on 2026-09-24: pass. HudModel and HideProbeModel (class + assembly attribute): generated
bags. `UITests.PlainModel` (no attribute): `ReflectedPropertyBag`. `UITests.ClassOnlyModel`
(`[GeneratePropertyBag]` in Assembly-CSharp-Editor, no assembly attribute): `ReflectedPropertyBag`
too. Idle HUD, 30 frames: 0 changes. Ammo changed every frame, 30 frames: 96 changes, top
"ammo-text:52", then its row and "reserve-text" (flex re-layout); types Repaint 74, Size 44,
Transform 44, Layout 30.

## P20. UI Toolkit interaction tests with the UI Test Framework (6.3)

```python
ut_ui.add_ui_test_framework(P)                      # "com.unity.ui.test-framework": "6.3.0" (built into the editor, no download)
ut_run.run_tests(P, "EditMode", assemblies="AgentUI.EditModeTests")
```

Test classes derive from `UnityEngine.UIElements.TestFramework.UITestFixture` (Edit Mode, no scene)
or `RuntimeUITestFixture` (Play Mode, `SetUIContent(uiDocument)`); the asmdef references
`Unity.UI.TestFramework.Runtime` and `.Editor`. `simulate.FrameUpdate()` runs the panel update
(styles, layout, bindings), `simulate.Click(element)`, `simulate.KeyPress`, `ReturnKeyPress`,
`TabKeyPress`, `TypingText`, `ScrollWheel`, `DragAndDrop` send real UI Toolkit events. Replaces
hand-rolled `SendEvent` code. Also assert that every name the C# queries exists in the UXML (Game
Dev Guide, 6DcwHPxCE54 [00:10:35]); `ut_ui.lint_cs_queries` does the same offline. Test:
`test_21_editmode_ui_test_framework`. Result: run in Unity 6000.3.21f1 on 2026-09-24: 8/8 pass: six
queried names exist in Hud.uxml; after `Health = 42, Ammo = 7` and one simulated frame the labels
read "42 / 100" and "7", bar 0.42; a simulated click gave 1 activation, Return on the focused button
a second.

## P21. Localized settings content filled in code

```csharp
settingsScreen.localize = key => LocalizationSettings.StringDatabase.GetLocalizedString("Settings", key);   // Localization package
LocalizationSettings.SelectedLocaleChanged += _ => settingsScreen.OnLocaleChanged();                    // and -= in OnDisable
```

The resolution and quality options are strings made in code, so the Localize component on a
drop-down never reaches them (Imphenzia, NFn74l2WA_8 [00:12:56]); `SettingsScreen.OnLocaleChanged`
refills them through `localize` (keys: the quality level names and the `"{0} x {1}"` format) and
keeps the selection. Event-driven, never a per-frame check ([00:13:28]). The Localization package is
not installed in the test project: the test drives `localize` directly. Test: Play Mode
`LocaleTests.LocaleChangeRefillsCodeFilledOptions_KeepsSelection` (in `test_15`). Result: run in
Unity 6000.3.21f1 on 2026-09-24: pass. Quality option "PC" became "FR PC", the resolution option
"3456 × 2170 px", the selected index unchanged.

---

## Not run here (and why)

- A real notch and safe area on a device, and the Device Simulator (GUI window):
  scenario-unity-mobile's `SafeAreaFitter` goes on the menu's root panel; device screenshots are a
  hand-over item.
- An Overlay canvas in a player at each resolution (`-screen-width/-screen-height` +
  `ScreenCapture`): the capture path here switches Overlay to Screen Space Camera, which uses the
  same scaler math (the recorded scale equals the formula) but is not the player's final composite.
- UI Builder, the UI Toolkit Debugger, the Profiler's UI modules and the Frame Debugger are windows
  (no scripting surface): the text and counter substitutes above replace them; `gui-paths.md` gives
  the clicks.
- The DRAW order between an Overlay canvas and a screen-space panel (P14): neither reaches a camera
  target in batch mode; input order was measured, drawing follows the same sort order per Unity
  staff (2021.2+). Check it once in a windowed player or the Game view.
- The Localization package itself (P21): not in the test project; the hook is tested with a stand-in
  `localize` function.
- GPU cost on the target device: editor counters are relative; the verdict comes from a development
  player (scenario-unity-performance).
