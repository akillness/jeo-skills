---
name: scenario-godot-ui
description: "Use when building or fixing game UI in Godot 4.7: main menu, settings screen, HUD (health bar, ammo, minimap frame), Control layout, containers, anchors, themes in code, 'UI scales wrong on phones', 'text too small on 4K', notch or safe area, stretch mode and aspect, gamepad or keyboard menu navigation, focus lost, input rebinding screen, localization (CSV, PO, tr_n plurals, Arabic RTL, CJK fonts, pseudolocalization), screen reader accessibility, UI scale slider, or clicks not reaching the game."
license: MIT
---

# Godot UI (UI developer)

Target: Godot 4.7.2.stable, macOS Apple Silicon.

Expert level here means one layout proven, by numbers and images, from a 1080x2400 phone in portrait
to a 3840x2160 monitor, in every language, with mouse, pad and screen reader. The stretch transform
scales, containers place, one Theme built in code styles, and nothing ships before a layout matrix
and a contact sheet say so. If a sibling skill named here is missing from your available skills,
load it with `skill_get` (Scenario MCP) or ask the user to install it
(https://github.com/scenario-labs/skills#install); unattended, proceed from tool schemas and flag
the gap.

**REQUIRED BACKGROUND:** scenario-godot-expert (channels, review loop, 6.3 traps).

## Stance (the expert delta)

1. **Pick the base size for the extremes, not for 1080p.** A square base (720x720) with
   `canvas_items` + `expand` and Handheld Orientation `sensor` gives one scale for portrait and
   landscape (docs, Multiple resolutions). Measured: 1.5x on a 1080x2400 phone in both orientations,
   3x on 4K. A 1152x648 base gives a 0.9375x canvas on the same phone and three undersized buttons
   [added, measured]. Godotneers' 1920x1080 base (1_OFJLyqlXI) suits desktop only.
2. **Containers place, anchors pin.** Sizing is a negotiation: the minimum size is the floor, Expand
   claims leftover space, Fill uses it (Godotneers 1_OFJLyqlXI 00:35:00, Karto 5Hog6a0EYa0
   00:14:39). Measured in a 400 px HBox: Expand without Fill leaves the claimed space empty (sibling
   pushed to x 380); Fill or a stretch ratio without Expand changes nothing; ratios are summed, 1:3
   gives 96 and 290 of 386 px (Karto 00:15:45). Anchor presets are relative to the parent;
   `set_anchors_preset()` alone keeps the old offsets (a 50x50 child stays 50x50 on FULL_RECT), so
   use `set_anchors_and_offsets_preset()` (Karto 00:05:24, measured). A corner element also needs
   its grow direction, or longer text grows off screen [added, measured 1462 px wide in a 1152 px
   canvas].
3. **The look lives in one Theme resource built in code,** with type variations instead of per-node
   overrides (docs, Theme type variations). StyleBoxes are shared Resources: an override reused on
   two nodes changes both (Karto 00:19:00).
4. **Focus is explicit.** Nothing has focus at scene start, so `ui_down` does nothing until
   something calls `grab_focus()` (docs, Controller navigation; measured). Keep a menu stack that
   disables covered panels and returns focus to the opener (Mostly Mad Productions ecJZipjUj6k
   00:08:57).
5. **The current selection is the highest-contrast element on screen,** body text comes first, two
   or three fonts at most, and the outro is faster than the intro (Rawb Herb, GodotCon 2025,
   sjmAD1ZLBcE 00:31:42, 00:21:34, 00:55:38).
6. **Text is keys, never literals.** Named placeholders with `format()`, `tr_n()` for plurals,
   context for identical English, auto translate disabled on dynamic text (docs, Internationalizing
   games). Fonts get fallbacks, not remaps.
7. **HUD is passive and signal-driven.** Its root and wrappers ignore the mouse; values change on
   signals, not in `_process` (consensus of 1_OFJLyqlXI, Yuw7CK5H8eA, f90ieBOoIYQ). A new string
   reshapes (200 labels: 1.1 to 1.5 ms of CPU per frame); assigning the identical string is an
   early-out, so the cost is the changed text, not the assignment [added, measured]. In-place array
   mutations never call a setter (0 calls after `append`, 1 after reassigning), so state arrays emit
   their own signal (NoBSGodot Yuw7CK5H8eA 00:05:06, measured).
8. **Verify at device sizes headless, then look.** Headless, `root.size` takes any size and applies
   the project stretch, so a layout matrix runs in seconds; a windowed capture then renders each
   device with the notch drawn in [added, measured].

## Establish first

| Input                      | Changes                                   | Default if nobody says                                                                                                     |
| -------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Platforms and orientations | base size, orientation, touch target size | phone portrait + landscape, desktop to 4K: base 720x720, `canvas_items`, `expand`, orientation 6 (sensor)                  |
| Art style                  | stretch mode and scale mode               | vector or high-res: `canvas_items` + fractional; pixel art: `viewport`, base 640x360, integer, Exclusive Fullscreen (docs) |
| Input devices              | focus work, rebind screen, touch sizes    | mouse, keyboard, pad, touch                                                                                                |
| Languages                  | fonts, RTL, Text Server Data on export    | en plus one long (de), one CJK (ja), one RTL (ar) for tests                                                                |
| Accessibility bar          | screen reader, UI scale slider, contrast  | WCAG 4.5:1 body text, UI scale 0.75 to 2.0 via `content_scale_factor`                                                      |
| Renderer                   | upscaler choice in settings               | Forward+ (Jolt kept); Compatibility forces bilinear 3D scaling                                                             |

## Workflow

**1. Project settings.** Write the stretch keys explicitly: a hand-written project.godot gets
`disabled` and `keep` (deltas). `gd_env.set_project_setting` for
`display/window/size/viewport_width/height`, `stretch/mode`, `stretch/aspect`,
`handheld/orientation`, `gui/theme/custom`. Check that `3d/physics_engine="Jolt Physics"` and the
renderer survived. GATE: `gd_ui.stretch_math(window, base, ...)` for each target gives the expected
logical size and scale (port matches the engine on 224 cases, origin and scale included).

**2. Theme in code.** [`ui_theme.gd`](scripts/agentkit/ui/ui_theme.gd) `build(overrides)` returns a
Theme: Button states with a thick accent focus box, Label, panels, sliders, tabs, ProgressBar,
variations TitleLabel, HudLabel, HudValue, PrimaryButton, HudPanel, HealthBar, TrailBar. Save it as
`.tres`, set the default font to a SystemFont with CJK and Arabic fallbacks, two or three fonts at
most. Text drawn at many scales (HUD numerals at 3x) gets MSDF:
`gui/theme/default_font_multichannel_signed_distance_field` or the font's
`multichannel_signed_distance_field`, both false by default (Karto 5Hog6a0EYa0 00:20:50, measured).
Default Theme Scale is read once: a runtime set changed nothing (measured). In the editor a Theme
edit needs a scene reload to repaint (Godotneers 00:22:10) and an override is inactive until its
checkbox is ticked (Karto 00:17:25); in code only `add_theme_*_override` counts, and runtime Theme
edits propagate at once (measured). GATE: `contrast_report()` body pairs >= 4.5:1 (worst measured
4.37 is the disabled state, allowed); `check_variations()` finds no misspelt variation.

**3. Scenes in code.** Root Control full rect, a [`safe_area.gd`](scripts/agentkit/ui/safe_area.gd)
MarginContainer, then containers. Buttons 88 logical tall at a 720 base (132 px on a phone at 1.5x).
Settings rows in ScrollContainers inside a TabContainer. HUD on a CanvasLayer, root
`MOUSE_FILTER_IGNORE`, AspectRatioContainer for the minimap; a round minimap or portrait frame is a
`clip_children` mask (Clip Only on a rounded Panel), but a child with another `z_index` escapes it
(GDQuest W4j4tnQLcTA 00:03:47, measured), so keep masked content at z 0 or use a SubViewport.
Toggles read "On"/"Off" as text (CoffeeCrow 9H_fN4OxyIE 00:08:11). `safe_area.gd` recomputes on
`size_changed` (top margin 104 at 1.5x, 82 at 2x, measured). `examples/build_g7.gd` builds the whole
G7 set. GATE: [`ui_audit.gd`](scripts/agentkit/ui/ui_audit.gd) `audit_tree()` returns no
`hud_blocks_input`, `icon_keep_size`, `grows_offscreen_*`, `no_accessible_name`,
`shared_stylebox_override`, `unknown_variation`.

**4. Layout matrix headless.**
`gd_ui.layout_matrix(P, scene, targets, min_touch_px=..., safe_insets=..., locale=..., pseudo=True)`
for 8 targets (phone portrait and landscape, 4:3 tablet, 1366x768, 1080p, 21:9, 4K, 800x600). GATE:
zero offscreen, outside_safe, small_target, text (clipped or overflowing), overlap and collapsed
issues for each scene, in en, de and pseudolocalized at 0.4 expansion.

**5. Capture matrix windowed, then look.**
`gd_ui.capture_matrix(P, scene, targets, safe_insets=...)` renders each target at its physical size
with black bars and red notch bands, and builds a contact sheet. Open the sheet. GATE:
`image_checks` flags none; by eye: selection visible, no clipped glyphs (CJK, Arabic), notch bands
over background only, bars and frames intact. Never capture through an embedded Window with
`content_scale_*`: it draws unscaled (P13, measured).

**6. Focus and input.** `gd_ui.focus_walk(P, scene, steps)` pushes `ui_*` actions through
`push_input` and records the focus owner; `ui_focus.graph()` lists unreachable focusables. Menu
stack: open, cancel, focus back on the opener. GATE: every focusable reachable from the default;
first key press from no focus lands on the default; covered panels unreachable.

**7. Rebinding.** [`ui_rebind.gd`](scripts/agentkit/ui/ui_rebind.gd): accept (no echo, no Escape,
sticks over 0.5), normalize (physical keycode, device -1, axis sign), report conflicts, swap or
refuse, save as ConfigFile, reset from project settings. Show the key with
`DisplayServer.keyboard_get_label_from_physical()` (windowed only): on a French layout physical Q
reads "A" (measured). Add pad buttons yourself: in 4.7.2 `ui_accept` and `ui_cancel` hold keys only
(Enter, Kp Enter, Space; Escape), so add Joypad Button 0 and 1 (Mostly Mad ecJZipjUj6k 00:12:00,
measured). GATE: binding matches on keyboard and on any pad after a save and load round trip.

**8. Localization.** CSV with a `?plural` column, `gd_ui.check_csv` offline, `--import`, then
`gd_ui.register_translations`. Run en, fr, de, ja, ar and pseudolocalization; `expansion_ratio`
defaults to 0.0, so set 0.3 to 0.4 and call `reload_pseudolocalization()` (measured).
`--language fr` is the non-persistent test. Animated text is a RichTextEffect: `bbcode` var plus
`_process_custom_fx(char_fx)`, options from `char_fx.env` (Cashew OldDew KMqYeRae6rM 00:14:01;
measured `[lift px=6]` read 6.0), installed with `install_effect()`. GATE: no missing keys per
locale; Arabic mirrors (anchors and HBox order); plurals right in en and fr; layout matrix clean.

**9. Settings and cost.** [`ui_settings.gd`](scripts/agentkit/ui/ui_settings.gd) autoload applies
window mode, vsync, render scale and upscaler, quality, UI scale, bus volumes, locale; saves and
reloads. GATE: save and load round trip; `ui_scale` 1.5 turns a 1280x720 canvas into 853x480.

## Numbers

| Value                                                                                                                                                 | Relative to                               | Source                           |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | -------------------------------- |
| Base 720x720, `canvas_items`, `expand`, orientation sensor                                                                                            | phone portrait and landscape plus desktop | docs, Multiple resolutions       |
| Scale 1.5 on 1080x2400 and 2400x1080, 3.0 on 3840x2160, 1.0672 on 1366x768                                                                            | base 720x720                              | measured [added]                 |
| Base 720x1280 on a 2400x1080 phone: `expand` 2844x1280 at 0.844x (UI shrinks), `keep_width` 897 px side bars; `keep_height` on 1080x2400: 240 px bars | why a square base beats an aspect choice  | measured [added]                 |
| Pixel art 640x360 `viewport` integer; `viewport` at fractional 1.0672 (1366x768) resamples and blurs text                                             | 720p to 4K                                | docs, measured                   |
| Default Theme Scale 2.0 to 3.0 for a 4K base, 1.5 to 2.0 mobile 1080p base; read once (runtime set: no change)                                        | base size                                 | docs, measured                   |
| Touch target 126 px phone, 96 px tablet (48 dp at about 420 and 320 dpi)                                                                              | physical pixels                           | [added]                          |
| Button 88 logical at base 720                                                                                                                         | 132 px on a phone                         | [added, measured]                |
| WCAG 4.5:1 body, 3:1 large text                                                                                                                       | text vs its background                    | WCAG 2 [added]                   |
| Damage trail: one-shot timer 0.4 s, restarted per hit; heal instant                                                                                   | health change                             | DashNothing f90ieBOoIYQ 00:01:26 |
| Text Server Data ~4 MB                                                                                                                                | export size, for no-space scripts         | docs                             |
| 200 labels: 1.1 to 1.5 ms new text every frame, 0.17 to 0.23 ms for 10 per frame, under 0.1 ms same text (as idle)                                    | CPU per frame, headless M5 Max            | measured [added]                 |

## Quality gates

Measurable: `test_ui_live.py` U1 to U15 green (compile, stretch parity, CSV, layout matrix, capture,
focus, rebind, HUD, localization, engine facts, theme and settings, cost, embedded Window, round-2
layout and theme facts, clip mask and text effect); zero issues in the layout matrix for each scene
and locale; audit clean; contrast >= 4.5:1 on body pairs; save and load round trips. Visual: one
contact sheet per scene and locale (menu, HUD, settings ja, menu ar, settings pseudo), opened: focus
visible, glyphs complete, nothing under the notch, letterbox where expected, selection still visible
in grayscale (Rawb Herb).

## Common mistakes

| Mistake                                                       | What it looks like                                                                          | Fix                                                                                                                                        |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 1920x1080 or 1152x648 base for a phone game                   | tiny buttons in portrait (scale 0.9375 at 1080x2400)                                        | square base 720x720 + expand                                                                                                               |
| Stretch keys left out of an agent-written project.godot       | UI fixed size, black space on 4K                                                            | write mode and aspect explicitly                                                                                                           |
| Full-rect Control with default STOP filter over the game      | clicks never reach `_unhandled_input` (0 of 1)                                              | `MOUSE_FILTER_IGNORE` on HUD roots and wrappers                                                                                            |
| Corner preset without grow direction                          | score text runs off the right edge                                                          | `grow_horizontal = GROW_DIRECTION_BEGIN`                                                                                                   |
| No `grab_focus()` on open                                     | pad does nothing                                                                            | menu stack grabs the default on the first nav event                                                                                        |
| TextureRect left on `KEEP_SIZE` in a container                | a 512 px icon makes a 64 px row 614x512; `IGNORE_SIZE` with no minimum collapses to width 0 | `EXPAND_FIT_WIDTH_PROPORTIONAL` (64x64 measured) or ignore size + min size, Stretch Keep Aspect Centered (Godotneers 1_OFJLyqlXI 00:10:28) |
| OptionButton items as literal English                         | Japanese screen shows "Windowed"                                                            | items as keys (`OPT_WINDOWED`)                                                                                                             |
| Tabs left at theme default                                    | tabs too small to touch                                                                     | tab styleboxes with content margins; the matrix checks the TabBar                                                                          |
| Stored binding with device 0 from a synthesized event         | pad 2 or the real keyboard (device 16) do not trigger                                       | normalize to device -1                                                                                                                     |
| Pseudolocalization on, expansion untouched or no reload       | no padding (default ratio 0.0)                                                              | set `expansion_ratio`, `TranslationServer.reload_pseudolocalization()`                                                                     |
| POT generation trusted for custom nodes in old tutorials      | strings missing (4.2 bug)                                                                   | fixed in 4.3 (Cashew OldDew v0tJPsNNOM8 00:08:00, not rerun); CSV keys avoid POT                                                           |
| Locale Test set in project settings                           | ships in French                                                                             | clear it; use `--language fr`                                                                                                              |
| Hiding a container child with `visible = false` for an effect | siblings jump (relayout)                                                                    | `modulate.a = 0` or `offset_transform_scale` (MrElipteach pK2vI2-jCH4 00:02:54)                                                            |
| Expecting a focus ring after a mouse click                    | ring only on the next key or pad press                                                      | by design: `gui/common/show_focus_state_on_pointer_event` 1 (text inputs only)                                                             |

## Handoffs

- In: state autoloads and signals (scenario-godot-architecture), input actions and values
  (scenario-godot-gameplay), bus names Master, Music, SFX (scenario-godot-audio), icons, panels,
  fonts (scenario-* skills; nine-patch margins set in code).
- Out: render scale and upscaler contract (scenario-godot-rendering-lighting); Text Server Data,
  real-device safe area and touch (scenario-godot-performance-export); intro and outro tracks,
  `offset_transform` motion (scenario-godot-animation); `test_ui_live.py` for CI
  (scenario-godot-pipeline-automation).

## Godot 4.7 notes

- `offset_transform_*` (4.7) moves container children without relayout;
  `offset_transform_visual_only` defaults to true, so clicks hit the layout rect (measured).
  `pivot_offset_ratio` (4.7) for center pivots; `grab_focus(hide_focus)` (4.6).
- `AccessibilityServer` (4.7), `accessibility_name`, `FOCUS_ACCESSIBILITY` (RichTextLabel default);
  `accessibility_support` 0 Auto runs only with an assistive app active.
- `auto_translate_mode` replaced `auto_translate`; `FoldableContainer` (4.5), `VirtualJoystick`,
  `PopupMenu.allow_search` (4.7); `[img]` takes `width_unit`/`height_unit`. Upscalers: FSR2=2,
  MetalFX spatial=3, temporal=4.
- `push_input(event, true)` takes logical coordinates. Godot 3 names (`rect_size`,
  `add_color_override`, `margin_*`, stretch `2d`, `process_custom_fx`) are gone.

## References

- [`references/procedures.md`](references/procedures.md): P1 to P15 with full code paths, live test
  ids and results.
- [`references/expert-notes.md`](references/expert-notes.md): what each source teaches, with
  timestamps.
- [`references/critique.md`](references/critique.md): the rubric for judging a UI build and its
  captures.
- [`references/gui-paths.md`](references/gui-paths.md): the same steps through the editor for a
  computer-use agent.
- [`references/sources.md`](references/sources.md): every source, credentials, URLs, best
  timestamps.
- [`scripts/gd_ui.py`](scripts/gd_ui.py), [`scripts/agentkit/ui/*.gd`](scripts/agentkit/ui/),
  [`scripts/agentkit/ui/examples/build_g7.gd`](scripts/agentkit/ui/examples/build_g7.gd).
