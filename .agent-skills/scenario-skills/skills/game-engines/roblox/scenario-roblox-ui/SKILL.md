---
name: scenario-roblox-ui
description: "Use when building or fixing Roblox game UI or input: HUD (health bar, currency, ability cooldowns), main menu, shop with a scrolling grid, settings screen, inventory, \"UI scales wrong on phone\", buttons hidden behind the jump button, UI too small on a tablet or TV, portrait and landscape, top bar and safe area, Scale vs Offset, UIListLayout, UIGridLayout, UIFlexItem, StyleSheets and themes, gamepad or console menu navigation, the Input Action System (InputContext, InputAction, InputBinding), ContextActionService migration, PreferredInput, reduced motion and accessibility, localization and AutoLocalize, React, Fusion or Vide, the Device Simulator, and testing UI without a phone."
license: MIT
---

# Roblox UI and Input

Roblox Studio (October 2026 build) on macOS, driven through the scenario-roblox-expert toolkit.

Expert level here means one UI tree that reads the screen and the player's input at runtime, proven
by numbers and captures on phones in both orientations, a tablet, PCs, a console and a handheld,
without owning any of them. Build the UI as instances in Edit, keep the look in a StyleSheet and the
controls in Input Action System (IAS) contexts, then measure it under Studio's device presets and
drive it with real clicks and keys.

If a sibling skill named here is missing from your available skills, load it with `skill_get`
(Scenario MCP) or ask the user to install it (https://github.com/scenario-labs/skills#install);
unattended, proceed from tool schemas and flag the gap.

**REQUIRED BACKGROUND:** scenario-roblox-expert (channels, review loop, toolkit, current-Roblox
traps).

## Stance (the expert delta)

1. **One tree, adapted by measurement.** Never build per-device copies (Roblox mobile roundtable,
   BsyU-SJ9L-c; RDC 2024 frameworks panel). Lay out by `GuiService.ViewportDisplaySize` and show
   prompts by `UserInputService.PreferredInput` (Roblox gamepad doc). Phones take controllers and
   laptops have touch screens (Roblox IAS Q&A, KnFJl6z5UN0 [00:10:42]), so `TouchEnabled` and
   `IsTenFootInterface` guess wrong.
2. **Scale for the shell, Offset for what a thumb or an eye needs.** Panels take Scale capped by a
   `UISizeConstraint`; buttons and text take Offset so they stay legible on a phone (roundtable
   [00:11:15]). Constrain the outer container, not its children (Itz_FloppyFish, BLZl-0cl2DM
   [00:16:37]). A `UIScale` on the whole ScreenGui "breaks everything" (boatbomber, RDC 2024 panel
   [00:38:15]).
3. **The core touch controls and the top bar own their space.** Place custom touch buttons relative
   to the `JumpButton` (Roblox position-and-size doc). The top bar inset measured 58 px on every
   preset in Studio 0.743, while the 2023 roundtable slide said 36 (BsyU-SJ9L-c [00:08:20]). Use
   `ScreenInsets.CoreUISafeInsets` and measure; never hard-code a margin.
4. **The look lives in a StyleSheet.** Tokens hold every repeated value, themes are sheets of
   identically named tokens, and query selectors (`@ViewportDisplaySizeLarge`,
   `@PreferredInputTouch`, `@ReducedMotionEnabledFalse`) adapt it (Roblox Style Editor video,
   _k1ea0OIKaU [00:03:52, 00:04:24]). A property set in code beats every StyleRule (StyleSheet doc;
   measured). A direct read returns the unstyled value: read with `GetStyled`.
5. **Input is a set of contexts switched with the screen.** Gameplay context at Priority 2000, menu
   context at 3000 with `Sink`, enabled only while the menu is open (IAS doc; derpmonster83,
   8nqNw6kSKJ0 [00:08:26]). Priority and Sink live on the context, and equal priorities run in no
   fixed order (KnFJl6z5UN0 [00:17:26, 00:29:33]). Every action gets a key and a gamepad button.
   Touch needs a `UIButton` binding only where nothing on screen does the job (abilities, open menu,
   close); shortcuts for a control the player taps anyway (tab cycling, Confirm for Buy) need none,
   and UIAudit reports them as `ias-no-touch` info. IAS draws no mobile buttons or prompts: you
   build them (KnFJl6z5UN0 [00:13:30]).
6. **A persistent HUD is a direct child of StarterGui with `ResetOnSpawn = false`.** Nested in a
   Folder, the flag is ignored and the HUD resets (on-screen containers doc; measured).
7. **Accessibility is a second channel.** Never encode state by color alone (BitwiseAndrea,
   accessibility roundtable K1pEI6LVJJA [00:29:24]). No chords, no F keys, WASD and arrows both
   (same panel [00:43:15]). Honor `PreferredTransparency`, `ReducedMotionEnabled` and
   `PreferredTextSize` (Roblox accessibility doc). Contrast 4.5:1, or 3:1 for text of 24 px and up
   [added, WCAG].
8. **Plain instances unless the project already runs a framework.** Instances built in Edit are
   visible to the MCP tools, so audits, layout checks and captures run before Play. Choose React
   (jsdotlua), Fusion or Vide when many screens share fast-changing state and a team works in Rojo.
   Then keep game data outside the framework (Leif, Ezk3vEOvv8o [00:13:51]) and benchmark your own
   code, not stress tests (RDC 2024 panel [00:28:11]).

## Establish first

| Input                                         | Changes                                               | Default if nobody says                                                 |
| --------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------- |
| Devices and orientations                      | cell sizes, safe area, `StarterGui.ScreenOrientation` | phones landscape and portrait, tablet, PC, console, handheld; `Sensor` |
| A UI framework in the project                 | where the tree is built and tested                    | none: instances plus StyleSheet                                        |
| `Workspace.PlayerScriptsUseInputActionSystem` | default controls on IAS, jump sinkable by a menu      | `Enabled`, set in the Rojo project (scripts cannot write it)           |
| Languages                                     | text room, `AutoLocalize`                             | English source; test German and +40% pseudo-localization               |
| UI art                                        | image slots, 9-slice margins                          | flat StyleSheet look, Scenario art later                               |
| Accessibility bar                             | contrast, motion, target size                         | 4.5:1, reduced motion honored, 44 px targets                           |

## Procedure

Full code, test ids and results: [references/procedures.md](references/procedures.md). Every stage
runs through [`scripts/rbx_ui.py`](scripts/rbx_ui.py) and the lead's toolkit; L and O ids refer to
`run_live.py`.

1. **Build in Edit (P1).** `rbx_ui.build(s)` installs the catalog, the kit modules, the client
   controller (a `Script` with RunContext Client) and the shop server, then runs
   [BuildMenuHud.luau](scripts/agentkit/ui/templates/BuildMenuHud.luau). The HUD holds status top
   left (display only), the menu button top right and the ability buttons. The menu is a
   `CanvasGroup` panel with tabs in the header and Home, Shop and Settings pages. The shop is a
   `ScrollingFrame` with `AutomaticCanvasSize = Y` and a `UIGridLayout` whose cell size comes from
   the StyleSheet. Dynamic labels set `AutoLocalize = false`. Code never sets a property that a
   StyleRule owns. GATE: 30 items, 2 StyleLinks, 0 selector errors, both ScreenGuis direct children
   of StarterGui with `ResetOnSpawn = false`.
2. **Audit (P2).** `rbx_ui.audit(s)` runs [UIAudit.luau](scripts/agentkit/ui/UIAudit.luau) (20
   rules: resets, insets, constraints, canvas, strokes, selectors, selection, contrast, IAS coverage
   and conflicts, legacy input patterns) and the lead's `Audit.ui`. The same module runs in Lune on
   a place file. GATE: 0 error and 0 warn; a fixture with one fault per rule fires every rule.
3. **Layout matrix (P3).** `rbx_ui.layout_matrix(pt, rbx_ui.DEVICES, scenes, out)` sets nine presets
   through `StudioDeviceSimulatorService` inside the playtest.
   [UILayout.luau](scripts/agentkit/ui/UILayout.luau) `check` then flags offscreen, top bar, safe
   area, core touch control overlap, small targets, overlap, clipped and small text, and each state
   is captured. Drive scenes with Scriptable bindings, because a key or click switches
   `PreferredInput` away from Touch. GATE: 0 warn per device and scene; ability buttons above the
   `JumpButton` on touch; at least one full row of shop cells; contact sheets read.
4. **Mouse (P4).** `pt.mouse` with `instance_path` `"LocalPlayer.PlayerGui.Menu..."` clicks the
   PlayerGui copy. A `UIButton` binding set in Edit follows the clone at runtime. GATE: each click
   changes exactly its attribute; a purchase spends coins on the server once.
5. **Keyboard and contexts (P5).** `pt.keys` presses through the IAS. GATE: the cooldown refuses a
   second use; with the menu open, Q, E and Space never reach gameplay or the jump.
6. **Gamepad as far as Studio reaches (P6).** Start selection with `GuiService:Select(grid)`, move
   with arrow keys, activate with Return, press gamepad buttons through Scriptable bindings, and
   read glyphs and sizes under the `xbox` preset. GATE: focus moves down and right in the grid;
   selecting the last item scrolls the canvas; the xbox glyph reads "X". Thumbsticks, the D-pad,
   ButtonB and the Select button need a controller or the Controller Emulator
   ([gui-paths](references/gui-paths.md)).
7. **Styles and themes (P7).** Swap the theme at runtime with `UIStyle.setTheme`, which repoints the
   design sheet's `StyleDerive`. GATE: both themes 0 `low-contrast`; a code-set Size survives every
   rule.
8. **Preferences and motion (P8).** Multiply decorative transparency by `PreferredTransparency`;
   skip the fade when reduced motion is on. GATE: the panel is opaque on the first frame under
   reduced motion. Volume, camera shake, key rebinding and text size:
   [player-settings.md](references/player-settings.md) with `UISettings`.
9. **Respawn (P9).** Kill the character on the server and compare marks on the HUD before and after.
   GATE: one HUD, state kept, health rebound to the new Humanoid.
10. **Localization (P10).** Translate in place through
    `LocalizationService:GetTranslatorForLocaleAsync("de")`, then add 40% to every localizable
    string, on the two smallest phones. GATE: 0 `text-clipped` on every page in both passes.
11. **Scenario UI art (P12).** Item icons, frames and button skins come from scenario-game-assets as
    transparent PNGs. Upload them only with the user's go, then set `Icon.Image` per cell and
    `ScaleType = Slice` with `SliceCenter` for frames. Keep text out of the art.

## Numbers

| Value                                                                              | Relative to                            | Source                                     |
| ---------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------ |
| Top bar inset 58 px on every preset                                                | `GuiService.TopbarInset`, Studio 0.743 | measured (2023 slide: 36)                  |
| iPhone 7 666x374, iPhone 14 749x388 (portrait 388x762), Galaxy A06 705x338         | viewport, simulator preset             | measured                                   |
| iPad 10th gen 1179x819, laptop 1365x768, 1080p and Xbox 1919x1079                  | viewport, simulator preset             | measured                                   |
| Small: phones and handheld; Medium: iPad, laptop, 1080p; Large: Xbox               | `ViewportDisplaySize`                  | measured                                   |
| `JumpButton` 70 px at (1,-95, 1,-90) on phones; 120 px at (1,-170, 1,-210) on iPad | screen corner                          | measured                                   |
| Thumbstick zone: left 40% of the width                                             | viewport width                         | measured frame, clamp [added]              |
| 40% from the top is reachable on a phone, not on a tablet                          | screen height                          | position-and-size doc                      |
| Targets 44 px, text 11 px minimum                                                  | absolute pixels                        | [added, Apple HIG]                         |
| Contrast 4.5:1; 3:1 at 24 px and up                                                | text vs its background                 | [added, WCAG]                              |
| Menu context 3000 with Sink over gameplay 2000                                     | `InputContext.Priority`                | IAS doc (2000 beats default scripts)       |
| CAS Low 1000, Medium 2000, High 3000                                               | `Enum.ContextActionPriority`           | reference (a "0 to 100" tutorial is wrong) |
| Cells 88x100, 96x112, 140x160; abilities 64 and 88 px                              | Small, Medium, Large display           | template [added]                           |
| Fade 0.2 s; dim 0.45 x `PreferredTransparency`                                     | menu open                              | template [added]                           |
| +40% length                                                                        | source strings                         | pseudo-localization [added]                |
| Auto-translation quota counts characters per language                              | characters                             | automatic-translations doc                 |

## Quality gates

Measurable:

- `run_live.py` L0 to L14 and `run_offline.sh` O1 to O3 pass.
- UIAudit and the lead's `Audit.ui` report 0 warn and 0 error.
- `UILayout.check` reports 0 warn on nine presets in two scenes.
- 0 `text-clipped` in German and pseudo-localization on the two smallest phones; 0 `low-contrast` in
  both themes.
- No console errors from your scripts. FoundationProvider and UIBlox lines come from Studio's own
  core scripts.

Visual: read the HUD and shop contact sheets (at most 1,600 px) against
[critique.md](references/critique.md). Permanent elements, the chat area and shop discovery:
[screen-budget.md](references/screen-budget.md). Check that text is legible, nothing sits under the
touch controls or the top bar, the primary action is the largest button, and rarity reads without
color.

## Common mistakes

| Mistake                                                    | Symptom                                                                      | Fix                                                                                                                   |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Code sets a property a StyleRule owns                      | theme swap skips that object                                                 | leave it to the rule                                                                                                  |
| Reading `obj.BackgroundColor3` on a styled object          | the default color comes back                                                 | `obj:GetStyled("BackgroundColor3")`                                                                                   |
| HUD ScreenGui inside a Folder                              | it resets on respawn despite the flag                                        | parent it directly to StarterGui                                                                                      |
| `MouseButton1Click` as the button handler                  | gamepad and touch paths differ                                               | `Activated`, or an IAS `UIButton` binding                                                                             |
| `TouchEnabled` decides the layout                          | touch laptop gets the phone UI                                               | `PreferredInput`, `ViewportDisplaySize`                                                                               |
| A key press during a touch test                            | `PreferredInput` flips to KeyboardAndMouse                                   | Scriptable `InputBinding:Fire`                                                                                        |
| Menu hides touch controls and never restores them          | jump button gone after close                                                 | restore `TouchControlsEnabled` on close                                                                               |
| Two contexts at one Priority share a key                   | either action fires                                                          | distinct priorities, Sink on the top one                                                                              |
| `AutomaticCanvasSize = None` with a grid                   | last items unreachable                                                       | `AutomaticCanvasSize = Y`                                                                                             |
| Thick `UIStroke` with Round joins on text                  | see-through overlaps                                                         | `LineJoinMode` Miter or Bevel (Stewiepfing, 9kuWl_t1AOE [00:00:12])                                                   |
| `AutoLocalize` on numbers and names                        | junk entries in the translation table                                        | `AutoLocalize = false` on dynamic labels                                                                              |
| A selector typo                                            | the rule does nothing; `SelectorError` often reads ""                        | `UIStyle.errors` reassigns, waits, then reads                                                                         |
| `Activated` handler on a button bound as an IAS `UIButton` | fires one click late (observed)                                              | handle the InputAction                                                                                                |
| Ability buttons placed once at startup                     | after a rotation or an input switch they no longer sit above the jump button | re-place on `Camera.ViewportSize` and `PreferredInput` changes (template; iPhone 14 portrait measured above the jump) |

## Handoffs

- In: coins and ownership as player attributes (persistence from scenario-roblox-data), remote
  validation rules (scenario-roblox-networking), ability names and cooldowns
  (scenario-roblox-gameplay), Robux prompts (scenario-roblox-monetization), click and purchase
  sounds (scenario-roblox-vfx-audio), icons, frames and button skins (scenario-game-assets), project
  layout and Rojo (scenario-roblox-architecture, scenario-roblox-tooling).
- Out: InputActions with Scriptable test bindings to scenario-roblox-gameplay; the UI cost on low
  phones to scenario-roblox-performance; screen open and close attributes to
  scenario-roblox-monetization for funnels.

## Current Roblox notes

- The IAS reached full release on 2026-06-11. `InputAction:Fire` is deprecated: fire a Scriptable
  `InputBinding`. Default scripts on IAS are expected by default in early 2027. `BindActivate` and
  the gamepad selection toggle have no IAS form yet (KnFJl6z5UN0 [00:20:15, 00:39:43]).
- `PreferredInput` (2025-10-14) and `ViewportDisplaySize` (2025-08-14) replace device sniffing.
- An unset `InputBinding.KeyCode` reads `None`, not `Unknown` as documented.
  `InputActionLabel.ResolvedText` read empty in a playtest, so glyphs come from
  `InputAction.PreferredBinding` (measured).
- `StudioDeviceSimulatorService` (PluginSecurity) drives the Device Simulator from `execute_luau` in
  Edit and in the playtest Client; the Server is refused. The simulator rotates regardless of
  `ScreenOrientation` (measured).
- A new place reads `ScreenOrientation = LandscapeSensor`; the reference says Sensor.
- `StyleRule.SelectorError` fills a few frames after the Selector changes on a rule already in the
  place; set earlier, a broken selector reads "" (measured).
- `execute_luau` cannot read `PlayerScriptsUseInputActionSystem` or write the `GuiService`
  preferences: set the flag in Rojo, and test preferences through an in-game setting.
- MCP `user_keyboard_input` and `VirtualInput` send keyboard events only: gamepad KeyCodes never
  reach the IAS (measured).

## References

- [references/procedures.md](references/procedures.md): P0 to P12 with full code, test ids and
  results.
- [references/expert-notes.md](references/expert-notes.md): what each expert and doc teaches, with
  timestamps.
- [references/critique.md](references/critique.md): the rubric for judging a UI build and its
  captures.
- [references/player-settings.md](references/player-settings.md): volume, camera shake, rebinding,
  text size.
- [references/screen-budget.md](references/screen-budget.md): fewer HUD elements, the chat area,
  shop discovery, purchase feedback.
- [references/gui-paths.md](references/gui-paths.md): Device Simulator, Controller Emulator, Style
  Editor, IAS and localization in the Studio GUI.
- [references/sources.md](references/sources.md): every source, credentials, URLs, best timestamps.
- [scripts/rbx_ui.py](scripts/rbx_ui.py): build, audit, device list, simulation, layout matrix,
  contrast.
- [scripts/agentkit/ui/](scripts/agentkit/ui/): UIKit, UIStyle, UIInput, UILayout, UIAudit,
  UISettings, and the templates (BuildMenuHud, MenuController, ShopServer, Catalog).
