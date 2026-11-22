# Expert notes: principles and judgment by source

Each principle carries its source and timestamp (videos) or section (docs). [added] marks this
skill's own additions; **measured** marks a claim re-run in Unity 6000.3.21f1 on 2026-09-24 (numbers
in `procedures.md`). When experts disagree, the deciding condition is given.

## Unity 6.3 Manual, "Comparison of UI systems" (official)

- Runtime: uGUI recommended, UI Toolkit the alternative; Editor: UI Toolkit recommended, IMGUI the
  alternative [§General consideration]. The only stated reason for uGUI at runtime is "Easy
  referencing from MonoBehaviours" [§Runtime].
- Hard blockers. uGUI-only: in-scene authoring, serialized events, Animation Clip and Timeline
  integration. UI Toolkit-only: data binding, transition animations, textureless elements, advanced
  flexible layout, global style management, dynamic texture atlas, UI anti-aliasing, right-to-left
  language and emoji, SVG [§Runtime, In details].
- "Often used for": multi-resolution menus and HUD in UI-intensive projects, world-space UI and VR,
  custom shaders: UI Toolkit; keyframed animation: uGUI [§Use Cases]. The recommendation is a
  conservative default, not a quality verdict.
- Team: technical artists lean uGUI (GameObjects, Scene view), UI designers lean UI Toolkit
  (documents, UI Builder) [§Roles].
- World space and custom shaders are ✅ for UI Toolkit in 6.3: tutorials that say otherwise predate
  6.2 and 6.3. Shared rows (custom materials and shaders, world space, font fallbacks, masks, sprite
  atlases) never decide: `ut_ui.choose_system` reports them as `shared_not_deciding`.
- "When a need spans both columns" the page gives no tie-breaker; the note's own suggestion (split
  by screen) flags input focus and sorting as the care points [verify]. **Measured [added]:** the
  EventSystem ranks a uGUI Overlay canvas and a UI Toolkit panel by their sort orders (panel 20 over
  canvas 10: the panel's `PanelRaycaster` hit first; panel 5: the canvas'), and focus crosses
  through EventSystem selection (`element.Focus()` selects the panel's GameObject, selecting a uGUI
  control blurs the panel). Drawing is sorted the same way since 2021.2 per Unity staff (Unity
  forum, "Mixing uGUI and UI Toolkit, sorting order", 2022-08-05) [added, not observable headless].
  Hence one sort-order table for both systems (`ut_ui.UI_LAYERS`).

## Code Monkey (Hugo Cardoso), `_UadeZn6kI8` (2025-09)

- uGUI for runtime, UI Toolkit for editor tools, matching Unity's table [00:02:01]; UI Toolkit is
  production-ready at runtime, choosing it is preference [00:03:26].
- UI Toolkit's split into structure, style and logic pays off in teams, little for a solo developer
  [00:05:05].
- Do not migrate a working uGUI habit because a system is newer [00:04:37].
- [added] Agent tiebreaker: UXML and USS are text an agent writes and diffs; uGUI is built through
  the editor API and lives in scene YAML.

## uGUI 2.0 manual, "Designing UI for Multiple Resolutions" (official)

- Anchors handle aspect ratio, the Canvas Scaler handles density; use both [§Scaling with Screen
  Size].
- New elements anchor to the center; set corner anchors while the Game view shows the design
  resolution [§Using anchors]. The audit's `anchor.center_edge` flags a center-anchored element
  whose center sits more than a quarter of the reference size from the middle (fixture: a coin
  counter at (860, 480)).
- Match 0 (width, the default) scales a portrait reference 1.5x in landscape; Match 0.5 gives
  exactly 1 [§Scaling]. The mirror case matters more for a 1920 x 1080 LANDSCAPE reference: Match 0
  shrinks a 1080 x 1920 phone to 0.5625 (UI about 1.78x too small), Match 1 inflates it to 1.7778
  (v0.1 of this skill wrote "1.5x too big in landscape" for this setup: wrong direction and size, Y7
  grade). **Measured:** the blend is log-space in `CanvasScaler.HandleScaleWithScreenSize` (source
  read), captures reported 1.0 at 1080 x 1920 and 1920 x 1080, 2.0 at 3840 x 2160.
- **Measured [added]:** UI Toolkit's PanelSettings Match blends LINEARLY: the same 1920 x 1080
  reference at Match 0.5 gives 1.1701 at 1080 x 1920 and 1.4769 at 1170 x 2532, where uGUI gives 1.0
  and 1.1953. The two systems diverge in portrait with identical settings.

## Christina Creates Games, `1OwQflHq5kg` Canvas render modes and Canvas Scaler (2024-06)

- Split canvases per logical group, and profile before optimizing anything [00:02:37], [00:03:08].
- Decorative canvases lose their Graphic Raycaster so they neither eat clicks nor make
  `IsPointerOverGameObject` true [00:03:38], [00:04:32].
- Stack by Sort Order, never Hierarchy order [00:05:39]. The audit reports the whole stack of both
  systems and flags ties (`stack.sort_tie`).
- Overlay is untouched by scene effects; Screen Space Camera unlocks post-processing, particles and
  depth behind scene geometry [00:08:17], [frame 00:09:06].
- "In overlay, the camera doesn't see the UI" [00:09:21]. **Measured:** a camera rendered into a
  RenderTexture contained 0 UI pixels from an Overlay canvas; the same canvas in Screen Space Camera
  rendered.
- World-space canvases: size in pixels, scale 0.01, 100 px = 1 unit; assign the Event Camera
  [00:12:11], [frame 00:10:36].
- Fixed offsets on stretch anchors break in portrait (500 px side gaps leave an 80 px bar)
  [00:15:31].
- Reference 1920 x 1080 from the Steam survey, then 2560 x 1440 [00:14:52]; one canvas per
  orientation, or Match toward width for portrait, height for landscape [00:18:27]. Deciding
  condition vs the manual's 0.5: a single canvas that must survive both orientations takes 0.5.

## Christina Creates Games, `HTQV4mukZ2M` Layout groups, Layout Element, Content Size Fitter (2025-09)

- Configure a layout group from the bottom of its Inspector up; Child Force Expand off on the
  stacking axis most of the time [00:03:06], [00:09:59].
- Control Child Size resolves preferred, else min, else 0: an Image without a sprite or an empty
  container silently disappears [00:13:08], [00:16:31]. A Layout Element floor fixes it [00:15:30].
  **Measured [added]:** the collapse needs Force Expand OFF on that axis; with it on, the group
  still hands the child space (the audit rule checks both).
- A Content Size Fitter only at the top of a layout hierarchy; on a child of a group it fights the
  group, the usual reason people write "rebuild on activate" code [00:36:30].
- A self-sizing box grows from its pivot: y = 1 grows down [00:23:55].
- A nested group forwards a long text's one-line preferred width (almost 3,000 px): cap it with a
  Layout Element [00:34:22].
- Keep every element at scale 1 [00:11:24]; flexible widths as ratios for splits [00:45:38]; Grid
  ignores child Layout Elements [00:42:50].
- Read the Layout Properties of the parent AND the children instead of "randomly clicking" settings
  [00:00:00], [00:43:22]. Agent form: `UIAudit.ExplainLayout` (`LayoutUtility`
  min/preferred/flexible after `ForceRebuildLayoutImmediate`, plus the rule that sized each child).
  **Measured:** on the fixture group it named the collapsed child: height 0, preferred = min =
  flexible = 0, force expand off.
- Visual balance: below the center line keep space at the top; dialogue boxes stay top-anchored
  [00:35:28].

## Game Dev Guide (Matt Gambell), `HwdweCX5aMI` Flat UI, palette, layout, blur (2020-02)

- Decide and restrict the palette first (about 20 swatches, stored as a project color library)
  [00:02:34], [00:04:13].
- Without a UI artist choose flat: stylized UI risks obfuscation [00:01:55].
- Bad vs good mock-up: neutrals over most of the area, two small saturated action surfaces, dark
  text on light (or light on dark), one title level [frame 00:02:54] vs [frame 00:04:48].
- Min plus preferred sizes cover most layouts; header Min Height 75, body Preferred 999 [00:09:42].
- Blur behind a popup beats darkening [00:10:47]; GrabPass is Built-in only (URP 6.3 needs a
  captured still or a renderer feature, see scenario-unity-shaders).
- Motion behind a menu should be present but not distracting; 0.5 s fades [00:04:49], [frame
  00:16:59].

## Unity Technologies, "Optimization tips for Unity UI" (e-book excerpt)

- One element change re-batches its whole Canvas; split static and dynamic content into sub-canvases
  by update timing, uniform Z, material and texture per canvas [§Split up your Canvases].
  **Measured:** 2000 static Images plus a counter changed every frame: `Canvas.BuildBatch` p50 0.038
  to 0.043 ms per frame on one canvas vs 0.018 to 0.022 ms with the counter on a sub-canvas (three
  alternating runs; 600 Images gave 1.4x to 2.8x; editor on Apple Silicon: the ratio matters, not
  the absolute).
- Graphic Raycaster is an intersection loop: remove it from display-only canvases, untick Raycast
  Target, starting with button labels [§Limit Graphic Raycasters].
- Each layout group adds a GetComponent walk per dirtying child; a Scroll Rect counts [§Avoid layout
  groups]. Deciding condition: fine for screens that rebuild on open, avoid for per-frame UI.
- Hide with `Canvas.enabled = false`: meshes kept, no rebuild on show, no OnDisable/OnEnable cascade
  [§How to hide a Canvas]. **Measured:** 200 graphics, Canvas off/on: 0 mesh regenerations;
  SetActive off/on: 200; CanvasGroup alpha 0/1: 0; one color change: 1.
- Pool: disable, then reparent; reuse: reparent, update, enable [§Pool UI objects the smart way].
- Animators dirty UI every frame; tween in code [§Optimal use of animators].
- Fullscreen UI: disable the 3D camera and hidden canvases, lower `Application.targetFrameRate`
  [§When using a fullscreen UI].

## Andy Touch (Unity), `eH-PdFKgctE` Unite 2017 Optimizing Unity UI

- No "optimize UI" button: profile on the target device, while interacting (scrolling), not at rest
  [00:04:29], [00:06:09], [00:17:19].
- Batch rules: same canvas, material, texture, coplanar Z, same mask [slide frame 00:09:51];
  canvases never batch with each other (400 name plates = 400 batches) [00:09:36]. Audit rule
  `canvas.world_many` (more than 8 World Space canvases); alternatives: one shared world canvas, UI
  Toolkit world space (6.2+), SpriteRenderer or TextMeshPro 3D bars [added].
- A child at non-zero Z silently breaks batching [00:29:12].
- Sprite Atlas: untick Allow Rotation and Tight Packing for UI; 8 MB to 244 KB with compression;
  batches 40 to 14 [00:24:43], [00:25:50], [00:26:22]. Audit rules `atlas.rotation`,
  `atlas.tight_packing` (errors), `atlas.uncompressed` (info), on the atlases that pack a sprite an
  audited Image uses (V2 read through `SpriteAtlasImporter`). **Measured:** a V2 fixture atlas with
  both options on fired both; its default platform was already Compressed.
- Masks on small static visuals cost batches: pre-cut the art (9 batches) [00:30:19], [00:30:55];
  only mask what must be cut out (scroll lists). A round minimap: a pre-cut ring over the map
  texture (a baked map, or a RenderTexture refreshed at a low rate), or the clip in the material (UI
  Shader Graph in 6.3), not a Mask or a rounded `overflow: hidden` [added]. Audit rule
  `mask.static_stencil`.
- Shadow and Outline duplicate text geometry: 4.1k tris vs 1.8k with TMP [00:42:36]. **Measured:**
  "HEADER TEXT 1234": legacy Text 28 triangles, +Shadow 56, +Outline 280; TMP with outline and
  underlay in its material 30.
- Pixel Perfect on a canvas with moving content re-snaps every frame: 60 to 26 fps while scrolling;
  a sub-canvas with it off restored 60 [00:52:32], [00:55:18]. Conflict with Christina (who ticks it
  on a static HUD): acceptable only when nothing on that canvas moves.
- Scrolling a 1,000-item list took layout from 0.7 to 7.9 ms; pool about 8 visible items [00:17:19],
  [00:51:59].
- Sub-canvases isolate rebuilds but add batches: balance for your bottleneck [00:55:18].
  **Measured:** in the split test the counter already had its own batch (TMP material), so the split
  added none.

## Jason Weimann, `6ztY9-IX3Qg` UI as an additive scene (2020-01)

- Put the UI in its own scene, loaded additively over any level [00:04:31]; the level stays active
  for lighting [00:37:34].
- Gameplay never knows the UI exists: entities raise events, panels bind [00:24:57].
- Register, then initialize immediately (a UI loaded after the selection still shows it); unbind
  before rebinding and in OnDestroy whatever Awake or Start subscribed [00:22:45], [00:30:57],
  [00:32:04], [00:34:15]. Offline lint `ut_ui.lint_cs_events`: `+=` without its `-=`, lambdas on
  events; the shipped runtime scripts lint clean.
- Keep design data and runtime data apart [00:47:37]; group canvases by change timing [00:41:17];
  pool list items [00:52:44].
- **Measured [added]:** two overlapping additive loads give two EventSystems (a loader started twice
  in one frame); UILoader now refuses a second load while one is in flight. Reloading the UI scene 3
  times left the static selection event at 2 handlers loaded, 0 unloaded.

## Sasquatch B Studios, `u3YdlUW1nx0` Selection animations and control schemes (2023-06)

- Mouse, keyboard and gamepad must share one selection; hover SELECTS
  (`eventData.selectedObject = gameObject`) [00:05:03], [00:05:35].
- Drive feedback from ISelectHandler/IDeselectHandler; Color Tint plus a code tween; Animation
  transitions carry Animator overhead [00:01:31], [00:02:02].
- Set a first selection every time a screen opens, one frame late; remember the last selection to
  recover after the mouse leaves [00:07:38], [00:08:41], [00:10:42]. **Measured:** selection null at
  load, Button Play after the frame; pointer exit then a gamepad dpad press resumed on the last
  item, a second press moved to the next.
- [added] Stop the previous tween before starting one (fast hovering), run on unscaled time (pause
  menus).
- **Measured [added]:** an `InputSystemUIInputModule` added by script uses the package's
  `DefaultInputActions`, not the project-wide actions: player rebinds of the UI map do not reach
  navigation until `actionsAsset = InputSystem.actions`.

## Tarodev, `lF26yGJbsQk` Menu build order (2021-09) and `I1JcytXwXM4` UI Toolkit from C# (2023-08)

- Shift+Alt anchor presets; TMP over legacy Text; Scale With Screen Size or the menu is tiny
  [lF26yGJbsQk 00:03:29, 00:07:48, 00:11:30]. His Animator side menu is a prototype technique
  (conflicts with the performance guidance).
- Build UI Toolkit trees in C# to remove string lookups; one USS sheet, classes, variables, `:hover`
  with `transition-duration: 0.25s` [I1JcytXwXM4 00:06:42, 00:19:35, 00:21:17].
- Inline styles override style sheets [00:04:07]; find built-in part classes
  (`unity-base-slider__dragger`) with the Debugger [00:20:11]; always unsubscribe static events
  [00:24:09].

## Game Dev Guide, `6DcwHPxCE54` UI Toolkit runtime menu, custom controls, binding (2024-04)

- UXML, USS and C# are separate files; hand-writing them is as valid as UI Builder [00:05:38],
  [00:06:12].
- State as classes, transitions in USS, no tween library [00:07:15], [00:09:21].
- Panel Settings = Canvas + Canvas Scaler: set Scale With Screen Size 1920 x 1080 before judging
  sizes [00:10:02].
- `[UxmlElement] partial` custom controls, `[UxmlAttribute]` for data, custom USS properties for
  looks [00:12:33], [00:16:54]; start a filled arc at the center [00:16:03].
- String lookups break when a UXML name changes [00:10:35]; no fix shown. [added] An Edit Mode test
  asserts every queried name exists (UI Test Framework, P20) and `ut_ui.lint_cs_queries` checks
  `Q<T>("name")` calls against the UXML offline.
- State as root classes, toggled on change only: the same mechanism gives orientation branches (a
  `.portrait` class with its own layout) since USS has no media queries [00:07:15] [added
  application].
- Bind with `[CreateProperty]`, mode To Target [00:18:33]. **Measured:** the shipped HudBar
  (UxmlElement, CustomStyleResolvedEvent colors) bound to `Health01` showed 0.42 for health 42/100
  at every capture size.

## git-amend, `g2a4ZK8cEso` UI Toolkit binding with a view model (2024-02)

- The view raises intent, the controller decides, the model notifies [00:00:36]; bind through a view
  model, not the model [00:11:07].
- Set the data source on a container, children bind by path, mode explicit [00:14:27], [00:15:01];
  optimize later with versioning or change events [00:16:07].
- [added] A getter that builds a string on every read allocates on every binding update: build
  strings once per change (HudModel does).

## Nicolas Borromeo (Unity), `bECmaYIvZJg` UI Toolkit performance, Unite 2024

- Batches break on vertex buffer, shader, textures (8 slots) and stencil [00:06:28], [00:10:22].
  **Measured:** 512 px textures (outside the dynamic atlas): 4 and 8 distinct textures 1 batch, 9
  and 16 two, 17 three: batches = ceil(N/8).
- The dynamic atlas packs loose images and fonts into one slot [00:14:31]; filter what enters it by
  size (256 px in the demo) [00:15:03]. **Measured:** the same grid with 32 px textures stayed at 1
  batch up to 17 textures.
- Raise Panel Settings Vertex Budget (0 = automatic) when a static panel draws twice [00:08:08],
  [00:09:13]. **Measured:** plain elements (12 vertices each): 12,000 vertices drew in 3 batches at
  budget 0 and 1 at 20000; 24,000 in 3 vs 2; 144,000 in 7 vs 5. `PanelSettings.vertexBudget` is a
  public uint in 6.3, next to `textureSlotCount` (One, Two, Four, Eight).
- Rounded or SVG masks are stencil: a batch per mask container, 7 levels; rectangular masks are
  free; Mask Container only on nested stencil masks [00:17:05], [00:21:36].
- Animate translate, scale, rotate, never width or position; pre-set DynamicTransform;
  GroupTransform on moving containers with dynamic children, not everywhere [00:22:41], [00:27:43],
  [00:32:11].
- Class toggles on a big container recompute styles for every descendant (18 ms spike); inline
  `style.translate` removes it [00:24:22], [frame 00:23:21].
- Bindings use reflection without `[GeneratePropertyBag]`; the assembly must be marked for
  generation too [00:33:47]; `IDataSourceViewHashProvider` and `INotifyBindablePropertyChanged` stop
  needless updates; watch "Update Runtime Bindings" [00:33:15], [00:34:53], [00:35:27].
  **Measured:** HudModel (class + `[assembly: GeneratePropertyBagsForAssembly]`) had a generated
  bag; the class attribute alone in an assembly without the assembly attribute gave
  `ReflectedPropertyBag`, like no attribute. The 6.3 marker is
  `Scripts/UIElements.UpdateRuntimeBindings`.
- Deactivation matrix: opacity 0 keeps full render cost; display none has no render cost but
  bindings keep updating; removal zeroes everything and costs the most to toggle [frame 00:36:49].
  Choose by duration: frequent short toggles (blinking) favor opacity or off-screen, long absences
  (options behind Escape) favor removal [00:38:08] (`ut_ui.uitk_hide_method`). **Measured:** with
  display none, a bound bar followed the model (0.8); removed from the hierarchy it stayed at 0.8
  while the model went to 0.1, and caught up to 0.1 when re-inserted. A 120-row bound screen
  (editor, p50 panel update, three runs): visible 1.16 to 1.32 ms; hidden opacity 0 and off-screen
  the same (8,160 vertices kept); visibility hidden 1.14 to 1.26 and display none 0.87 to 0.99 (0
  vertices, bindings still 0.84 to 0.92); removed 0.005. Toggle spikes: removed 2.2 to 3.3 ms on
  show, visibility 2.4 to 2.8 each way (style), display 1.5 to 2.0 on show, opacity none.
- Stylesheets hold hard references to their textures and fonts: loading a USS loads its assets;
  split sheets or UIDocuments to control memory [00:40:57], [00:41:31]. **Measured:** `ImportReport`
  listed a one-rule USS's `url()` texture as a dependency (3,008 bytes in memory); `lint_uss` flags
  references offline.
- `IDebugPanelChangeReceiver` finds who keeps invalidating a panel, editor and development builds
  only [00:42:04]. **Measured** with `PanelChangeLog`: idle HUD 0 changes in 30 frames; Ammo changed
  every frame: 96 changes, "ammo-text" first (52).

## UI Toolkit manual, "Best practices for managing elements" and "Runtime binding" (6.3, official)

- No built-in VisualElement pool; unregister callbacks before pooling; ListView virtualizes [§Pool,
  §Keep visible elements low].
- Hiding costs: `visibility: hidden` frees meshes but children can override it; `opacity: 0` keeps
  vertex shading; `display: none` no GPU cost, reflows siblings; translate off-screen with
  DynamicTransform; `RemoveFromHierarchy` frees everything [§Different approaches]. Measured per
  method in procedures P16 (vertices 0 for visibility, display and removal; 8,160 kept for opacity
  and off-screen).
- Runtime binding from 6000.0: binding id = the target property ("text", "value"),
  `data-source-path` = the source member marked `[CreateProperty]`; UXML
  `<Bindings><engine:DataBinding .../></Bindings>`; bindings never see `style` changes [§Best
  practices, §Known limitations]. The C# sample sets no binding mode: set it explicitly.
- **Measured [added]:** in a Linear project UI Toolkit blends in linear space (a 0.82-alpha panel
  over #4b5563 rendered #2d333d, the linear blend; the sRGB blend a design tool shows is #2a3039),
  and `PanelSettings.colorClearValue` is read as linear.

## TMP manual "Fallback font assets" (uGUI 2.0) and Imphenzia `NFn74l2WA_8` (2023-04)

- Search order: primary font, its local fallbacks (recursive), the text's sprite asset, TMP
  Settings' general fallbacks, default sprite asset, default font, missing glyph [manual §The
  fallback chain].
- Split CJK across several fallback assets; mobile texture limits [manual §intro].
- UI Toolkit is separate: its text uses TextCore font assets and a Panel Text Settings asset, not
  TMP Settings [note's Agent translation, verify]. **Measured:** the HUD label resolved the theme's
  "NotInter-Regular"; with a CJK candidate in TMP Settings the TMP chain covered "設定" while the UI
  Toolkit label still missed 2 characters; the same font as a UI Toolkit fallback closed the gap
  (`UIToolkitBuild.UitkGlyphs`).
- One master font per text object, other scripts as its fallbacks; same sampling point size
  (about 80) and padding (8) everywhere, padding about 1/10 of the point size; bake only the CJK
  characters used [Imphenzia 00:07:33], [00:08:04], [00:08:37], [00:10:14].
- Arabic failed in TMP; RTL is UI Toolkit-only in the 6.3 matrix [00:06:29].
- Dynamic content (a resolution drop-down filled from code) needs code: subscribe to the
  locale-changed event and rewrite the option texts; event-driven, never a per-frame check
  [00:12:56], [00:13:28]. `SettingsScreen.localize` + `OnLocaleChanged` (**measured:** "PC" became
  "FR PC", selection kept).
- **Measured:** the default LiberationSans SDF (with its dynamic fallback) covered English, French
  and Russian strings; "設定" had 2 missing glyphs; a candidate CJK font (Hiragino Sans GB, macOS)
  added as a temporary local fallback closed the gap. Glyph gates on DYNAMIC fonts must pass
  `tryAddCharacter: true`.

## Brackeys, `BLfNP4Sc_iA` Health bar (2020-02)

- A display-only Slider: Interactable, Transition and Navigation off; color from
  `gradient.Evaluate(normalizedValue)`, Fixed mode for steps [00:05:06], [00:13:00].
- World-space bars billboard to the camera's forward in LateUpdate at canvas scale 0.01 [00:15:45],
  [00:18:01]. His URP Render Scale fix for soft world-space UI is costly [00:19:31]: try Dynamic
  Pixels Per Unit, TMP and sprite resolution first [added].

## UI Test Framework package (6.3, official)

- `com.unity.ui.test-framework` 6.3.0 is new in 6.3 and built into the editor (version deltas §1.3,
  §4; package docs in the editor's BuiltInPackages): `UITestFixture` (Edit Mode, no scene) and
  `RuntimeUITestFixture` (Play Mode, `SetUIContent(uiDocument)`), `simulate.FrameUpdate`, `Click`,
  `KeyPress`, `ReturnKeyPress`, `TypingText`, `ScrollWheel`, `DragAndDrop`. **Measured:** 8 Edit
  Mode tests on the HUD UXML (queried names, bindings after one simulated frame, click and Return on
  a button) passed through `-runTests -testPlatform EditMode`.
