# Expert notes: UI and input

Principles and judgment by source, with timestamps. URLs are in [sources.md](sources.md). Items
marked [added] are this skill's own additions. "Measured" means run in Roblox Studio 0.743 on
2026-10-19 (see [procedures.md](procedures.md)).

## Corrections and findings from live tests

| Claim in the sources or notes                                                                                                                                       | Test result                                                                                                                                                                                       | Use instead                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Top bar 36 px on a phone (mobile roundtable slide, BsyU-SJ9L-c [00:08:20])                                                                                          | `GuiService.TopbarInset` height 58 px on every preset, phones to Xbox                                                                                                                             | measure the inset; `ScreenInsets.CoreUISafeInsets`                                               |
| `StarterGui.ScreenOrientation` defaults to Sensor (API reference)                                                                                                   | a new place reads LandscapeSensor                                                                                                                                                                 | set `Sensor` when portrait is supported                                                          |
| An unset `InputBinding.KeyCode` reads `Unknown` (API reference)                                                                                                     | it reads `Enum.KeyCode.None`                                                                                                                                                                      | treat nil, Unknown and None as unset                                                             |
| `InputActionLabel` resolves the key glyph (IAS doc, label resolution order)                                                                                         | `ResolvedText` and `ResolvedImageContent` read empty in a playtest                                                                                                                                | build glyphs from `InputAction.PreferredBinding` (`UIInput.glyph`)                               |
| The device emulator is GUI-only; capture at other window sizes instead (research digests)                                                                           | `StudioDeviceSimulatorService` runs from `execute_luau` in Edit and in the playtest Client; the Server is refused                                                                                 | `rbx_ui.simulate`, `rbx_ui.layout_matrix`                                                        |
| The keyboard navigation toggle checks gamepad focus order on PC (accessibility roundtable, K1pEI6LVJJA [00:44:48]; `AutoSelectGuiEnabled` doc: Select or BackSlash) | BackSlash from the MCP tool and from `VirtualInput` did not enter selection mode                                                                                                                  | `GuiService:Select(container)`, then arrow keys and Return                                       |
| Gamepad input can be simulated with key events (research digests)                                                                                                   | `VirtualInput:SendKey(ButtonX)` arrives as a keyboard event and fires no IAS binding; `SendKey(ButtonB)` errors (bound to a CoreGUI action)                                                       | a Scriptable `InputBinding:Fire(state)`                                                          |
| `ScreenOrientation` decides what the simulator shows                                                                                                                | the simulator rotated iPhone 14 to portrait while the place said LandscapeSensor; with `Sensor` it opened iPhone 7 in portrait                                                                    | set each preset's orientation explicitly                                                         |
| Left half of a phone is the movement thumb (roundtable [00:32:41])                                                                                                  | iPhone 7 landscape: `DynamicThumbstickFrame` 366x311 from x -100, so the left 40%; portrait: full width                                                                                           | reserve the left 40% [added clamp]                                                               |
| CAS priority runs 0 to 100 (BrawlDev, gsA2_hlvfF0 [00:14:45])                                                                                                       | `Enum.ContextActionPriority` Low 1000, Medium 2000, High 3000 (reference)                                                                                                                         | the enum                                                                                         |
| A style rule sets the property (common assumption)                                                                                                                  | a direct read returns the default; `GetStyled` returns the styled value; a property set on the instance beats every rule                                                                          | `GetStyled`; never set a styled property in code                                                 |
| A `UIButton` binding points at one instance                                                                                                                         | a binding set to the StarterGui button fires from the PlayerGui copy at runtime                                                                                                                   | bind in Edit, click at runtime                                                                   |
| A key press keeps the touch layout under test                                                                                                                       | a keyboard or mouse event switches `PreferredInput` from Touch to KeyboardAndMouse; `SetDeviceAsync` resets it                                                                                    | drive touch scenes with Scriptable bindings                                                      |
| `StyleRule.SelectorError` reports a bad selector (API reference)                                                                                                    | a Selector set before the rule is in the place reads "" even when broken; after a change on a parented rule the error appears a few frames later ("Expected a selector part, but found nothing.") | `UIStyle.errors`: reassign every Selector, wait 0.3 s, read                                      |
| A button bound as an `InputBinding.UIButton` still fires `Activated` (common assumption)                                                                            | the InputAction fired on the click; `Activated` arrived only with the next click                                                                                                                  | handle the action, not `Activated`                                                               |
| Set `PlayerScriptsUseInputActionSystem` "in a script" (research digests)                                                                                            | `execute_luau` can neither write nor read it ("lacking capability RobloxScript")                                                                                                                  | the Rojo project or the Properties window; prove it by behavior (a Sink context blocks the jump) |
| Test reduced motion by setting `GuiService.ReducedMotionEnabled` (research digests)                                                                                 | "Unable to assign property ReducedMotionEnabled. Property is read only", same for `PreferredTransparency`                                                                                         | an in-game setting that overrides the preference (the template's Settings page)                  |
| Disable the contexts while capturing a key for rebinding (common pattern)                                                                                           | contexts turned back on inside `InputBegan` let the IAS read that same press with the new binding: the rebound action fired (L14)                                                                 | turn them back on at `InputEnded` of the captured key                                            |
| A new place uses TextChatService (ChatVersion doc: deprecated in new places)                                                                                        | a Rojo-built place with no TextChatService entry loaded as `LegacyChatService`: no chat window, `AbsoluteSize` 0                                                                                  | set `ChatVersion` in the Rojo project                                                            |
| ResetOnSpawn false is ignored for a ScreenGui in a Folder (on-screen containers doc)                                                                                | confirmed once the test waited for a new character model (a check on a replicated attribute raced the respawn and first showed the opposite)                                                      | wait on `LocalPlayer.Character` identity                                                         |

## Roblox Learn: Input Action System walkthrough (Jasmine, product manager; Alex, player scripts engineer), Fg-Ksoa7b-s, 2026-06-11

- Do not translate old UIS or CAS code line by line. Ask for the intent, the action type and the
  bindings, then rebuild [00:04:04, 00:06:39].
- A complete action needs no code: a Bool action, `KeyCode.F`, `ButtonX`, and a `UIButton` binding
  for touch [00:02:38-00:03:43].
- `PrimaryModifier` makes chords [00:03:43]. This skill avoids chords for accessibility (see the
  accessibility panel).

## Roblox Learn: Input Action System Q&A (Jasmine, Alex; host Jeremy), KnFJl6z5UN0, 2026-07-13

- Priority and Sink are set per InputContext, not per action. Same-priority order is not
  deterministic; higher priority runs first [00:17:26-00:18:01, 00:29:33, 00:40:49].
- Default player scripts run at a low priority: put your context above them with Sink to avoid
  double fire [00:18:33].
- IAS generates no mobile UI and no button prompts; switch your own on `PreferredInput` [00:13:30,
  00:23:01].
- Plan around input types, not platforms [00:10:42].
- Rollout: opt-in now, opt-out around the end of 2026, mostly migrated early 2027. CAS is soft
  deprecated; UIS stays as the raw hardware funnel [00:25:43-00:28:29].
- `BindActivate` and the gamepad selection toggle are not in IAS yet [00:20:15, 00:39:43].
- Agents through the Studio MCP scaffold IAS about as well as the Assistant: audit the result
  [00:21:23].

## Roblox docs: Input Action System, gamepad input

- Priority 2000 with Sink beats the default PlayerScripts contexts. Set
  `Workspace.PlayerScriptsUseInputActionSystem = Enabled` when replacing default controls.
- A held thumbstick fires `StateChanged` once: poll `GetState()` per frame for analog input.
- `MouseDelta` and `TouchDelta` are pixels: scale by about 0.01.
- `InputActionLabel` resolves DisplayImage, then the key image, DisplayName, the key string, then a
  placeholder.
- Respond to `PreferredInput`, not to the platform: a PC player can plug in a pad.
- `InputAction:Fire` is deprecated in the API reference.

## Roblox Learn: Style Editor (Roblox product team), _k1ea0OIKaU, 2025-05-22

- Use tokens for any repeated value; copies drift [00:03:22].
- Themes are sets of identically named tokens with different values [00:03:52, 00:04:24].
- The editor's theme switch is edit-time; at runtime, repoint the `StyleDerive` [00:04:56].
  Measured: swapping the derive changed Dark to Light in a playtest.
- Tags make variants (primary, secondary) so hover rules inherit [00:05:57].
- Keep the generated base sheet and its derive (docs).

## Roblox docs: layout, containers, animation, localization

- Place custom touch buttons relative to `JumpButton`. A button 40% from the top is reachable on a
  phone, not on a tablet (position and size).
- Studio property boxes read `0.5` as Scale and `20` as Offset (position and size).
- `ResetOnSpawn = false` is ignored for a ScreenGui nested in a Folder (on-screen containers).
  Measured.
- A disabled ScreenGui does not render, take input or update: toggle `Enabled` per screen (on-screen
  containers).
- `UIListLayout` overrides the Position of its siblings; flex costs more than a grid, so use a grid
  for strict cells (list and flex). Negating `LayoutOrder` reverses the order.
- Fade a subtree with `CanvasGroup.GroupTransparency`; add `UIAspectRatioConstraint` before tweening
  Size (UI animation).
- Typewriter text: disable `AutoLocalize`, translate manually, strip RichText, loop `utf8.graphemes`
  (UI animation).
- Automatic Text Capture collects only `AutoLocalize` objects. The quota counts characters per
  language. A locked translation skips updates but stays moderated (automatic translations).

## Roblox Learn: mobile UI/UX roundtable (Cindering, Cinder Studios; Nathan "Undone Builder", Simple Games), BsyU-SJ9L-c, 2023-02-23

- Show fewer things; move features into the world. Shop visibility "quadruples" monetization in War
  Simulator [00:07:13, 00:33:50].
- Live phones are not Studio: chat covers the top left, the left thumb moves, so the right side is
  free [00:32:09, 00:32:41].
- Hot zones: left under chat for display only, right column for buttons, bottom center free
  [00:08:20].
- Scale for big screens, Offset to keep small screens legible, `UIAspectRatioConstraint` for shape
  [00:11:15, 00:12:35].
- Measure discoverability with a badge on a button's first click [00:43:08]. Test with someone who
  does not play mobile games, and stay silent [00:42:07].
- German text growth shrinks fixed boxes to illegibility [00:37:07].
- Color encodes meaning; the intended action is the largest, boldest button [00:25:16].

## Roblox Learn: designing for accessibility (BitwiseAndrea, Roblox accessibility; WooleyWool; ControlCoreAngel; host DSPAV), K1pEI6LVJJA, 2023-05-18

- Accessibility fails when information uses one channel. Add a second channel; do not remove the
  first [00:18:25].
- Test color with a monochrome pass; same-brightness red and green fail [00:29:24, 00:33:14].
- No two-key chords, support WASD and arrows, avoid F keys (Mac laptops map them) [00:43:15].
- Give camera shake an intensity slider; red flashes and large coverage are worse [00:48:51,
  00:52:34].
- One volume slider per sound group [00:35:41].
- The panel's "Studio has no accessibility tools" is outdated: `PreferredTransparency`,
  `PreferredTextSize`, `ReducedMotionEnabled` and the style query selectors exist now.

## RDC 2024: UI frameworks panel (Andrea Fletcher, Roblox; grilme99, kampfkarren, elttob, boatbomber), OHqMLEL5QnY, 2024-09-23

- Large UIs fail through inconsistency and stale state; a declarative framework removes those bug
  classes [00:01:14].
- React has the docs and the ecosystem; Fusion is lighter with easier animation. Naive React without
  memoization is slow [00:05:42, 00:28:43].
- Benchmark your own code; stress tests mislead [00:28:11].
- Build UI in a plugin harness to preview it at any size without Play [00:09:20, 00:36:22].
- Do not put a `UIScale` on the ScreenGui to cope with screen sizes [00:38:15]. Use the flex API for
  wrapping, and the native `UIDragDetector` [00:21:41, 00:38:15].

## Framework authors and users

- Leif, React Luau (Ezk3vEOvv8o, 2026-01-03): per-frame animation through bindings, never state
  [00:10:25]; effects need cleanup and dependencies [00:12:44]; keep game data outside React
  [00:13:51]; preview with UI Labs stories [00:05:59].
- Chase Higgins, Vide 0.4 (p86bt9ROQfk, 2026-07-08): a `source` reads and writes; binding a function
  to a property updates only that property [00:07:36]; story files for live preview [00:11:40];
  StyLua rewrites the paren-less call style [00:02:00].
- Fusion 0.3 showcase (3e406QQHt7o, 2025-11-04): use elttob's package only [00:01:58]; sizes default
  to zero; `peek` replaced `:get()` [00:10:50, 00:13:37].

## Educators and creators (unverified credentials)

- Itz_FloppyFish (BLZl-0cl2DM, 2024): constraints on the outer container only; set AnchorPoint
  before converting to Scale [00:16:37, 00:05:52]; keep titles outside the ScrollingFrame
  [00:27:12]. His "a plugin is mandatory" is outdated: layouts and constraints do it natively.
- Stewiepfing (9kuWl_t1AOE, 2024): thick text strokes need Miter or Bevel joins [00:00:12]; a
  rounded progress bar at low fill needs a CanvasGroup [00:00:54]. His canvas polling script is
  replaced by `AutomaticCanvasSize`.
- Stewiepfing (h-POiqC120Y, 2025): clamp `dt / duration` to 0..1 and disconnect at 1 [00:02:41];
  scale motion by delta time [00:14:37].
- BrawlDev (gsA2_hlvfF0, 2023): `GetButton` returns nil off touch; guard it [00:26:14]. CAS is
  superseded by IAS for new work.
- BrawlDev (jRnyca_BWZQ, 2025): a layout acts on its parent only; parking it in a Folder disables it
  [00:03:14]; `UIListLayout.Wraps` fixes overflow; `UIPageLayout` Padding 0.5 hides neighbor pages
  [00:07:21].
- TwinPlayz (5-Wo0EHzJtM, 2023): B closes menus; `ProximityPrompt.GamepadKeyCode` defaults to
  ButtonX [00:07:50]. His `IsTenFootInterface` checks are replaced by `ViewportDisplaySize`.
- derpmonster83 (8nqNw6kSKJ0, 2025): enable a context when an interaction starts and disable it when
  it ends; rebinding is a property change [00:08:26, 00:09:21].
- Hamorei for Kek (z16zs2v-FNI, 2026): one recipe everywhere: corner radius 10, black outer stroke
  3, white outer stroke 6, inner stroke 4 [00:12:11, 00:24:27]. Built at 1080p, so the values are
  Offsets only at that reference size.
- TheDevKing (QWdyxoni7aw, 2020): do not translate the experience name; set `AutoLocalize = false`
  on dynamic text [00:05:00, 00:07:08].

## When the experts disagree

- **Framework or instances:** frameworks win for large, stateful, long-lived UI and a Rojo team (RDC
  panel). Instances win for a HUD and a few screens, designer edits in Studio, or agent testing
  through MCP, because framework UI exists only at runtime [added].
- **React or Fusion or Vide:** use the one the project already has [added]; otherwise React for
  ecosystem and hiring, Fusion or Vide for lighter animation-heavy UI (RDC panel).
- **IAS or CAS:** IAS for new builds (both IAS videos, docs). Keep CAS only for `BindActivate` until
  IAS covers it (Q&A).
- **Icons or text:** the roundtable prefers icons; the docs ask for translation room. Both leave
  room; the audience's language mix decides.
- **Left-side buttons:** avoid them on phones (roundtable); place custom buttons relative to the
  `JumpButton` (docs).
- **Tween or per-frame motion:** tweens for A to B UI; per-frame loops for arcs, springs and orbits
  (Stewiepfing). Under reduced motion, snap either.
