---
name: scenario-unity-ui
description: "Use when building or fixing game UI in Unity 6.3: main menu, settings screen (resolution, quality, volume, key rebinding), HUD, health bar, minimap frame; choosing uGUI or UI Toolkit or mixing both; 'UI scales wrong on phones', portrait to 4K, Canvas Scaler, anchors, layout groups collapsing, sort order, UXML/USS, data binding, TextMeshPro or UI Toolkit fonts missing glyphs, localized menus, gamepad navigation, UI draw calls, canvas rebuild spikes, UI tests, or capturing UI to check it."
license: MIT
---

# Unity UI (UI developer)

Expert UI work is a screen that keeps the same shape from a phone in portrait to a 4K monitor,
answers mouse, touch, keyboard and gamepad alike, reads clearly, and costs almost nothing while it
sits still. An agent gets there by building from code or text, then proving each screen with a
capture at every device size, a layout assertion on the same frame, an audit, behavior tests and
counters. Target: Unity 6000.3.21f1, uGUI 2.0 (TextMeshPro inside), UI Toolkit, Input System 1.20.
If a sibling skill named here is missing from your available skills, load it with `skill_get`
(Scenario MCP) or ask the user to install it (https://github.com/scenario-labs/skills#install);
unattended, proceed from tool schemas and flag the gap.

**REQUIRED BACKGROUND:** scenario-unity-expert (channels, review loop, 6.3 traps). Toolkit:
[`scripts/ut_ui.py`](scripts/ut_ui.py) (imports `ut_env`, `ut_run`, `ut_review`), jobs in
[`scripts/AgentKit/UI/`](scripts/AgentKit/UI/), runtime components in
[`scripts/Runtime/UI/`](scripts/Runtime/UI/) (asmdef `AgentUI.Runtime`), UXML/USS/TSS templates in
[`scripts/templates/uitk/`](scripts/templates/uitk/).

## Stance (the expert delta)

1. **uGUI is still the 6.3 runtime recommendation; the matrix decides.** UI Toolkit only: data
   binding, USS transitions, flexible layout, global styles, dynamic atlas, RTL and emoji, SVG. uGUI
   only: Animation Clips and Timeline, serialized events, Scene-view authoring (6.3 Manual). Custom
   shaders (UI Shader Graph) and world space are in BOTH columns in 6.3: never a reason to pick
   uGUI. No blocker: keep the project's system; UI-heavy or designer-led projects lean UI Toolkit;
   split by screen when both columns are needed (`ut_ui.choose_system`).
2. **One reference resolution, anchored edges, Match chosen by orientation.** 1920 x 1080, Scale
   With Screen Size, Match 0.5 when both orientations exist: with this landscape reference, Match 0
   shrinks a portrait phone to 0.5625 (Match 1 inflates it 1.78x); the manual's "1.5x at Match 0" is
   its portrait reference shown in landscape. uGUI blends Match in log space, UI Toolkit linearly:
   1.0 vs 1.17 at 1080 x 1920 (measured). Anchor each element to its corner while the Game view
   shows the design resolution, keep scale 1 (uGUI manual; Christina). Phones take a handheld
   multiplier set from a touch-target check (`CanvasDeviceScale`, 1.35).
3. **A uGUI Canvas is the rebuild and batch unit.** Split static and per-frame content into
   sub-canvases, remove raycasters from display-only canvases, untick Raycast Target on labels.
   Canvases never batch with each other: 400 world-space name plates are 400 batches (Andy Touch).
   Hide with `Canvas.enabled` (0 mesh regenerations vs 200 for `SetActive`, measured) plus
   `CanvasGroup.interactable`, or buttons stay navigable.
4. **Layout resolves preferred, else min, else 0.** A child with nothing to report collapses under
   Control Child Size; a Content Size Fitter goes only at the top; the pivot sets growth; no layout
   groups on per-frame UI. When a size surprises you, read min/preferred/flexible of parent AND
   children (`UIAudit.ExplainLayout`), never toggle checkboxes (Christina, HTQV4mukZ2M).
5. **One selection, one layer table, across both systems.** Hover selects, the first selection lands
   one frame after a screen shows, the last selection is remembered for the gamepad (Sasquatch B
   Studios). Point a scripted `InputSystemUIInputModule` at `InputSystem.actions` or rebinds never
   reach navigation (measured). Give every layer its own sort order from one table
   (`ut_ui.UI_LAYERS`: HUD 0, menus 10, modal 20): `Canvas.sortingOrder` and
   `PanelSettings.sortingOrder` rank against each other (drawing since 2021.2, Unity staff; input
   measured here); a tie leaves the top layer to Hierarchy order (Christina). Focus crosses systems
   through the EventSystem: `element.Focus()` selects the panel, `SetSelectedGameObject(uguiButton)`
   blurs it (measured). UI in its own additive scene holding the only EventSystem (Jason Weimann).
6. **Text: effects in the material, one font chain per system.** Shadow plus Outline turned 28
   triangles into 280; TMP outline and underlay stayed at 30 (measured; Andy Touch). TMP fallbacks
   never reach UI Toolkit text, which resolves its own font and Panel Text Settings: with a CJK font
   in TMP Settings, the HUD still missed "設定" (measured). Gate every locale per system with tryAdd
   on; all fallback assets share one sampling size and padding (about a tenth); CJK split across
   assets; RTL means UI Toolkit (Imphenzia). Code-filled drop-downs refill on the locale event
   (`SettingsScreen.OnLocaleChanged`).
7. **UI Toolkit costs follow GPU state and time hidden.** At most 8 textures per batch (measured
   ceil(N/8)); a static panel split across vertex buffers draws twice: raise Vertex Budget (12k
   vertices: 3 batches at 0, 1 at 20000, measured); stencil masks break batches, so pre-cut a round
   minimap frame; animate transforms with usage hints; no class toggles on big containers;
   `[GeneratePropertyBag]` works only with the assembly attribute too (class alone gave a reflected
   bag, measured) (Nicolas Borromeo, Unity). Hide by duration: removal for long absences, display
   none in between (bindings keep running), opacity or off-screen for blinking
   (`ut_ui.uitk_hide_method`, costs in procedures P16). Find idle invalidations with
   `PanelChangeLog`; a stylesheet loads every asset it references.
8. **Capture the UI the way it renders, then assert on the same frame.** Overlay canvases never
   reach a camera target (0 UI pixels, measured): capture uGUI through Screen Space Camera on a
   hidden camera, UI Toolkit through a cloned PanelSettings with `targetTexture`. Look at every
   sheet, including a 4K crop.

## Establish first

Platforms and orientations; inputs; languages (CJK, RTL) and which system renders each string; who
edits the UI later; the system already used; the device list (defaults: phone portrait 1080 x 1920
at 420 dpi, laptop 1920 x 1080, 4K); palette (default: flat neutrals, one accent); a UI scene shared
across levels; the budget (default: idle HUD adds no GC, 1 batch, 0 panel changes per frame).

## Workflow

1. **Route.** `ut_ui.choose_system(needs, ui_heavy, existing, team)`. GATE: blockers quoted, shared
   rows not used as reasons, a layer table when both systems ship.
2. **Set up.** `UISetup.ImportTmpEssentials`, `UISetup.AddScenesToBuild`,
   `ut_ui.add_ui_test_framework`; mixer from scenario-unity-gameplay. GATE: TMP Settings present.
3. **Build.** `UiTheme` tokens (8 px steps, one accent, one title level; Game Dev Guide). uGUI:
   `UIBuild.BuildMenuScene` or its helpers. UI Toolkit: `ut_ui.write_uitk_templates` then
   `UIToolkitBuild.BuildHud`. GATE: zero compile errors and warnings, `ImportReport` 0 errors with
   rules > 0 per sheet, `lint_uss`/`lint_uxml`/`lint_cs_events`/`lint_cs_queries` clean.
4. **Capture and assert.** `UICapture.CaptureUGUI` / `CaptureUITK` over `ut_ui.shots(...)`, HUD over
   a real level. GATE: `layout_verdict` empty, scale equals the formula, sheet and 4K crop looked at
   and critiqued ([`references/critique.md`](references/critique.md)); a collapse explained with
   `ExplainLayout`.
5. **Audit.** `UIAudit.Audit` with every locale's strings; `UIToolkitBuild.UitkGlyphs` for UI
   Toolkit text; `BindingSources` for data sources. GATE: 0 errors, 0 warnings, 0 missing glyphs in
   both systems, every source generated.
6. **Behavior.** Play Mode tests (selection, gamepad, hidden screens, settings, rebind, additive
   scene, bindings, layers and focus, locale) and Edit Mode UI Test Framework tests (clicks, keys,
   bindings, queried names). GATE: all pass.
7. **Cost.** `UIPerf.HideCost`, `TextEffectCost`, `PlayModeCounters` (counters, `list_markers`),
   `PanelChangeLog`. GATE: numbers against the budget, before and after each change.
8. **Deliver** with Verified and Assumed, and the handoff packets below.

## Numbers

| Value                        | Relative to                                                                     | Source                 |
| ---------------------------- | ------------------------------------------------------------------------------- | ---------------------- |
| 1920 x 1080, Match 0.5       | reference, both orientations                                                    | uGUI manual; Christina |
| 1.0 / 2.0; 0.5625 at Match 0 | uGUI scale at 1080 x 1920 / 3840 x 2160                                         | measured; formula      |
| 1.1701 / 1.4769              | UI Toolkit scale at 1080 x 1920 / 1170 x 2532 (uGUI 1.0 / 1.1953)               | measured               |
| 88 ref px x 1.35 = 119 px    | control height vs a 116 px (7 mm) target at 420 dpi                             | [added]                |
| 4.5:1 / 3:1                  | contrast, body / large text                                                     | [added] WCAG           |
| 8; 256 px                    | textures per UI Toolkit batch (measured); dynamic atlas size filter in the demo | Borromeo               |
| 3 vs 1 batches               | 12,000 vertices, Vertex Budget 0 vs 20000                                       | measured               |
| 7 / 18 ms                    | stencil nesting levels / Update Style from one big class swap                   | Borromeo               |
| 0.87-0.99 / 0.005 ms         | hidden bound screen per frame: display none / removed (visible 1.16-1.32)       | measured, 3 runs       |
| 2.2-3.3 ms                   | re-adding a removed 120-row screen (display flex 1.5-2.0)                       | measured, 3 runs       |
| 0 vs 200                     | mesh regenerations: Canvas.enabled vs SetActive, 200 graphics                   | measured               |
| 40 to 14                     | batches after a Sprite Atlas (rotation, tight packing off)                      | Andy Touch             |
| 0.01, 100 px = 1 unit        | world-space canvas scale                                                        | Christina, Brackeys    |
| 80 / 8                       | TMP sampling point size / padding                                               | Imphenzia              |

## Quality gates

- **Measurable:** compile clean; `layout_verdict` empty at every device; scale equals `canvas_scale`
  or `panel_scale`; `UIAudit` 0 errors and 0 warnings (sort ties, world canvases, static masks,
  center-anchored edges, atlas settings included); glyph gates 0 missing in TMP and UI Toolkit; USS
  rules kept; Play and Edit Mode tests 0 failures; static panel 1 batch; idle HUD 0 GC and 0 panel
  changes.
- **Visual:** the contact sheet and a 4K crop, judged on hierarchy, palette, contrast, spacing, same
  shape at every size, HUD readable over the level.

## Common mistakes

| Mistake                                          | What it looks like                                   | Fix                                                |
| ------------------------------------------------ | ---------------------------------------------------- | -------------------------------------------------- |
| Capturing Overlay UI with a camera               | frame without UI                                     | `CaptureUGUI`                                      |
| Match 0 with a landscape reference               | portrait UI at 0.56x                                 | Match 0.5, or one canvas per orientation           |
| Same Match in UI Toolkit                         | portrait HUD 17% larger                              | `panel_scale`                                      |
| Custom shaders routed to uGUI                    | outdated 2022 advice                                 | UI Shader Graph for UI Toolkit (6.3)               |
| Two layers on one sort order                     | pause menu under the HUD, clicks to the wrong system | one table, distinct values                         |
| Focus left in the other system                   | gamepad dead after a uGUI popup over UI Toolkit      | `SetSelectedGameObject` in, `element.Focus()` back |
| Center anchors on corner UI                      | counter drifts off screen on 21:9                    | corner anchors                                     |
| Hiding with SetActive / Canvas.enabled alone     | rebuild spike / hidden buttons navigable             | `MenuScreen.Show`                                  |
| Empty child under Control Child Size             | element vanishes                                     | Layout Element floor; `ExplainLayout`              |
| One canvas per enemy bar                         | batches grow with enemies                            | shared canvas, UI Toolkit world space, sprites     |
| Rounded `overflow: hidden` or Mask for a minimap | batch break per mask                                 | pre-cut frame art, shader clip                     |
| Atlas rotation or tight packing on UI            | upside-down or bleeding icons                        | untick both                                        |
| TMP fallback expected in UI Toolkit              | tofu in the HUD                                      | Panel Text Settings fallbacks, `UitkGlyphs`        |
| Code-filled drop-down                            | stays English after a locale switch                  | refill on the locale event                         |
| Class-only `[GeneratePropertyBag]`               | reflection bindings                                  | plus `[assembly: GeneratePropertyBagsForAssembly]` |
| display none for a screen hidden minutes         | binding cost keeps running                           | `RemoveFromHierarchy`                              |
| One USS error                                    | whole sheet dropped, UI unstyled                     | `ImportReport` rules > 0                           |
| Frame Debugger as a gate                         | nothing an agent can read                            | `Render/Batches Count` recorder                    |
| No first selection; default UI actions           | keyboard dead; rebinds ignored                       | `MenuScreen.FirstSelected`; `InputSystem.actions`  |
| Subscribe without unsubscribe                    | handlers pile up on reloads                          | register, initialize, `-=` in OnDisable/OnDestroy  |

## Handoffs

- **Receives** from scenario-unity-architecture: models, events, the Input actions asset. From
  scenario-unity-gameplay: the AudioMixer with exposed MasterVol/MusicVol/SFXVol. From
  scenario-unity-rendering-lighting: quality levels (at runtime `QualitySettings.names` lists only
  the platform's levels). From artists, scenario-unity-2d or scenario-* skills: sprites and icons
  (atlased, rotation and tight packing off).
- **Delivers** to scenario-unity-mobile: one root per system for the safe-area panel (UI Toolkit:
  `RuntimePanelUtils.ScreenToPanel` with the y flip). To scenario-unity-performance: counter CSVs.
  To scenario-unity-shaders: UI Shader Graph or Canvas materials (minimap clip, blur). To
  scenario-unity-pipeline-automation: UI scenes, Play and Edit Mode tests for CI. Packet: scenes,
  capture sheets with the verdict, audit JSON, test totals, Verified and Assumed.

## Unity 6.3 notes

- TextMeshPro ships inside `com.unity.ugui` 2.0; in batch mode `TMP_PackageResourceImporter` finds
  no package path (`UISetup.ImportTmpEssentials`). `enableWordWrapping` is obsolete.
- `using UnityEngine.UI` with `UnityEngine.UIElements` makes `Image`, `Button`, `Slider` ambiguous
  (CS0104): alias them.
- Runtime binding since 6000.0; world-space UI Toolkit since 6.2; 6.3 adds UI Shader Graph, USS
  `filter`, `aspect-ratio`, SVG, the UI Test Framework package (`com.unity.ui.test-framework` 6.3.0,
  built in), and a stricter USS parser: any error leaves an EMPTY StyleSheet flagged
  `importedWithErrors` (measured). `PanelSettings.vertexBudget`, `textureSlotCount`,
  `SetPanelChangeReceiver` are public. Markers: `Scripts/UIElements.UpdateRuntimeBindings`,
  `.UpdateLayout`, `.UpdateStyle`.
- `EditorSceneManager.NewScene` unloads unreferenced assets: create the scene before loading the
  UXML.
- After 6.3: 6.5 Panel Renderer replaces UIDocument (which keeps working), uGUI Raycast Receiver;
  6.6 removes UXML Factory/Traits (`[UxmlElement]` now).

## References

- [`references/procedures.md`](references/procedures.md): twenty-one agent procedures with full
  calls, live tests and recorded results.
- [`references/expert-notes.md`](references/expert-notes.md): principles by expert with timestamps,
  measured claims marked.
- `references/critique.md`: the rubric for layout, look, behavior, structure and cost.
- [`references/gui-paths.md`](references/gui-paths.md): the same work through editor windows and
  menus.
- [`references/sources.md`](references/sources.md): every source with credentials, URLs and best
  timestamps.
