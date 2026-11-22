# GUI paths (computer-use agent or human)

The same procedures as `procedures.md`, through the Unity 6.3 editor windows. Menu paths checked
against the 6.3 Manual and the sources; items marked [verify] were not clicked on this machine (no
GUI windows during tests).

## Setup

- TMP essentials: Window > TextMeshPro > Import TMP Essential Resources (the batch substitute is
  `UISetup.ImportTmpEssentials`, because `TMP_PackageResourceImporter.ImportResources` finds no
  package path in batch mode).
- TMP settings (default font, general fallbacks, missing glyph): Edit > Project Settings > TextMesh
  Pro > Settings [verify label].
- Scenes in the build: File > Build Profiles > Scene List (a profile with its own list overrides the
  shared one).
- EventSystem: GameObject > UI > Event System; on the Input System UI Input Module set Actions Asset
  to the project-wide actions (InputSystem_Actions) so the UI map and its rebinds drive navigation.

## uGUI

- Canvas: GameObject > UI > Canvas (Canvas, Canvas Scaler, Graphic Raycaster). Canvas Scaler: UI
  Scale Mode = Scale With Screen Size, Reference Resolution 1920 x 1080, Screen Match Mode = Match
  Width Or Height, Match 0.5.
- Sub-canvas: select a child > Add Component > type "Canvas"; add Graphic Raycaster only if the
  sub-canvas is interactive; tick Override Sorting and set Sort Order.
- Layers across systems: root Canvas > Sort Order, and the Panel Settings asset > Sort Order, both
  from one table (HUD 0, menus 10, modal 20); UI Document > Sort Order only orders documents sharing
  one Panel Settings.
- Anchors: Rect Transform anchor presets square; Shift sets the pivot, Alt sets the position,
  Shift+Alt both (Tarodev, lF26yGJbsQk [00:03:29]).
- Layout debugging: select an element, Inspector preview pane (bottom) > drop-down > Layout
  Properties; read min, preferred and flexible on the parent AND the children (Christina,
  HTQV4mukZ2M [00:43:22]).
- Raycast Target: checkbox on Image; on TextMeshPro under Extra Settings.
- Button feedback: Button > Transition = Color Tint; Navigation > Visualize to see the arrows.
- 9-slice: select the sprite texture > Sprite Editor > drag borders > Apply; Image > Image Type =
  Sliced.
- Sprite Atlas for UI: Assets > Create > 2D > Sprite Atlas; untick Allow Rotation and Tight Packing;
  set compression per platform in the platform tabs; Pack Preview.
- Game view resolutions: Game view resolution drop-down > + > add 1080 x 1920, 1920 x 1080, 3840 x
  2160; keep the scale slider at 1 when judging physical size.

## UI Toolkit

- UI Document: GameObject > UI Toolkit > UI Document; Panel Settings asset: Create > UI Toolkit >
  Panel Settings Asset (creates the default runtime theme .tss when none exists) [verify].
- Panel Settings Inspector: Scale Mode = Scale With Screen Size, Reference Resolution, Screen Match
  Mode, Match (remember: linear blend, portrait scales 1.17 at Match 0.5 with a 1920 x 1080
  reference); Sort Order; Text Settings (a Panel Text Settings asset: Create > UI Toolkit > Text
  Settings [verify label], its Fallback Font Assets list is UI Toolkit's own, TMP Settings do not
  apply); Buffer Management > Vertex Budget (raise when one static panel draws twice); Dynamic Atlas
  Settings (max sub-texture size, filters).
- UI Builder: Window > UI Toolkit > UI Builder; Viewport > Match Game View; StyleSheets > add
  selector; element Inspector > Attributes > Usage Hints; Transition Animations section; right-click
  a property > Add binding (Data Source, Path, Binding Mode, Update Trigger).
- UI Toolkit Debugger: Window > UI Toolkit > Debugger; Pick Element to read built-in part classes
  (`unity-base-slider__dragger`); Dynamic Atlas Viewer inside it.
- UI Test Framework: Window > Package Manager > Built-in or by name `com.unity.ui.test-framework`
  [verify tab]; tests run from Window > General > Test Runner (EditMode tab).
- USS import verdict: select the .uss > Inspector shows errors and warnings; Unsupported Selector
  Action on the importer (error, warning, ignore). A sheet with any error keeps no rules.

## Measure

- Profiler: Window > Analysis > Profiler; CPU module markers `Canvas.BuildBatch`,
  `UIEvents.WillRenderCanvases`, `Layout`, `PreLateUpdate.UIElementsUpdatePanels` with
  `UIElements.UpdateRuntimeBindings`, `UIElements.UpdateLayout`, `UIElements.UpdateStyle` below it;
  UI and UI Details modules for batch breaking reasons (Andy Touch, eH-PdFKgctE [00:18:29]).
- Frame Debugger: Window > Analysis > Frame Debugger > Enable; UI Toolkit draws under
  `UIR.DrawChain`, uGUI overlay under `Canvas.RenderOverlays`.
- Overdraw: Scene view draw mode (Built-in) or Window > Analysis > Rendering Debugger (URP) [verify
  for UI].

## Localization

- Window > Asset Management > Localization Tables [verify]; right-click a TMP component header >
  Localize; Play mode locale drop-down in the Game view toolbar (Imphenzia, NFn74l2WA_8). Drop-downs
  filled in code are not reached by Localize: switch the locale in Play mode and look at them.
- Font Asset Creator: Window > TextMeshPro > Font Asset Creator; same sampling point size and
  padding for every script, padding about 1/10; Character Set = Custom Characters for CJK; add the
  result to the master font's Fallback Font Assets list.
