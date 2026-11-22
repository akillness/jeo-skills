# scenario-godot-ui: agent procedures

Every procedure ran in Godot 4.7.2.stable.official.ed1daf0bf (standard build, Forward+, Metal, Apple
Silicon) on 2026-10-02 through the scenario-godot-expert toolkit (`gd_env`, `gd_run`, `gd_review`,
GD_MAX lock). Live tests: `tests/code/godot-ui/test_ui_live.py` (U1 to U15; `--only U4,U6`,
`--skip-windowed`). Offline: `tests/code/godot-ui/test_ui_offline.py`. Evidence:
`tests/live_evidence/godot-ui/live_<stamp>.json` and the contact sheets next to it. Final full run:
`live_20261002-213932.json`, 13 of 13 pass (numbers below from that run and
`live_20261002-213346.json`, identical within noise). Round 2 (after blind grading G7): U14 and U15
added, `live_20261002-223639.json`, 2 of 2 pass (`--only U14,U15`, project
`tests/projects/godot-ui/runs/20261002-223639/UI`).

Full code lives in the skill scripts; this file shows the calls, the rules inside them and the
measured results.

## 0. Setup

```python
import sys
sys.path[:0] = ["<repo>/skills/scenario-godot-expert/scripts", "<repo>/skills/scenario-godot-ui/scripts"]
import gd_env, gd_run, gd_review, gd_ui
P = gd_env.base_project("2d", "<repo>/tests/projects/godot-ui/Work")   # APFS clone, Forward+, Jolt
gd_ui.install_ui_kit(P)                 # agentkit/ui/*.gd -> res://addons/agentkit/ui/
r = gd_run.run_script(P, "res://addons/agentkit/ui/examples/build_g7.gd:build", {"base": [720, 720]})
gd_run.import_project(P)                # CSV -> strings.<lang>.translation
gd_ui.register_translations(P)          # writes internationalization/locale/translations
```

Kit files (`scripts/agentkit/ui/`): `ui_stretch.gd`, `ui_layout.gd`, `ui_capture.gd`, `ui_focus.gd`,
`ui_theme.gd`, `ui_audit.gd`, `ui_rebind.gd`, `ui_settings.gd` (autoload), `menu_stack.gd`,
`hud_bar.gd`, `safe_area.gd`, `ui_selftest.gd`, `examples/build_g7.gd`.

## P1. Compile the kit and check project settings (U1)

`agent_audit` skips `res://addons/agentkit/`, so `ui_selftest.gd:compile` loads every kit script
(except itself: reloading the running module breaks the call).
`gd_run.check_all(P, exclude=("res://addons/",))` covers the project scripts. Then read
project.godot: `3d/physics_engine="Jolt Physics"`, renderer `forward_plus` (reported by the job),
`window/stretch/mode="canvas_items"`, `aspect="expand"`, `viewport_width=720`,
`handheld/orientation=6`.

Run in Godot 4.7.2 on 2026-10-02: pass, 12 kit files and 11 project files, 0 errors; Jolt and
Forward+ present.

## P2. Stretch math before any layout (U2)

```python
gd_ui.stretch_math((1080, 2400), (720, 720), "canvas_items", "expand")
# {'logical': (720.0, 1600.0), 'screen': (1080, 2400), 'margin': (0.0, 0.0), 'scale': 1.5}
```

The Python and GDScript (`ui_stretch.gd` `compute()`) ports of `Window::_update_viewport_size` are
checked against the engine (`ui_stretch.gd:parity` sets `root.size` headless and reads
`get_visible_rect()` and `get_final_transform()`). Margins are centered per axis wherever the drawn
area is smaller than the window (keep bars, and integer borders even with expand).

Run in Godot 4.7.2 on 2026-10-02: pass, 224 cases (8 window sizes x 4 bases x 7 mode, aspect,
scale-mode, factor combinations), 0 mismatches on logical size, origin and scale, for both ports.
Key values: base 720x720 expand gives 720x1600 at 1.5x (portrait), 1600x720 at 1.5x (landscape),
1280x720 at 3x (4K), 1280x720 at 1.0672x (1366x768). Base 1152x648 keep_width on 1080x2400 gives
1152x2560 at 0.9375x. Integer scale on 1366x768 gives 1.0. Factor 1.5 on 1080p gives 853x480 at
2.25x. Integer with expand on 1080x2400 gives a 180, 400 border.

## P3. Translation CSV checks (U3)

`gd_ui.check_csv(path)`: duplicate keys, empty cells, placeholder sets that differ from the first
language (`{named}` and `%d`), unbalanced BBCode. `?plural` and `_comment` columns are skipped;
continuation rows (empty key) hold the plural form. After `--import`, `register_translations` lists
`strings.<lang>.translation` and writes the setting (nothing translates until it is registered:
jitspoe Lw-3Tnwv4Ds).

Run in Godot 4.7.2 on 2026-10-02: pass, 28 keys in en, fr, de, ja, ar, 5 translation files
registered; a bad CSV yields the 4 kinds (bbcode, duplicate_key, empty, placeholders). Offline test:
same checks without Godot.

## P4. Layout matrix headless (U4)

```python
TOUCH = {"phone_portrait": 126, "phone_landscape": 126, "tablet_4x3": 96}   # [added] 48 dp
INSETS = {"phone_portrait": [0, 132, 0, 102], "phone_landscape": [132, 0, 102, 63]}  # example notch, physical px [added]
gd_ui.layout_matrix(P, "res://ui/settings.tscn", min_touch_px=TOUCH, safe_insets=INSETS, locale="de")
gd_ui.layout_matrix(P, "res://ui/settings.tscn", pseudo=True, expansion=0.4, min_touch_px=TOUCH, safe_insets=INSETS)
```

`ui_layout.gd:matrix` sets `root.size` per target (the root applies the project stretch headless),
instantiates the scene, applies test insets to every `safe_area.gd` node, waits, and `report()`
counts: offscreen, outside_safe, small_target (physical px = logical x scale, TabContainer tab bars
included), text (clipped or overflowing Labels and Buttons), overlap of interactive rects (clipped
by ScrollContainer ancestors), collapsed (content with zero size in a container). ProgressBars with
accessibility focus are not counted as touch targets.

Run in Godot 4.7.2 on 2026-10-02: pass, 0 issues for main_menu, settings and hud on 8 targets,
settings in de and pseudolocalized at 0.4 included. HUD on phone portrait: Health at 28, 157,
Minimap at 520, 104 (184x176), Ammo at 551, 1461, all inside the safe area. Counterexample with base
1152x648: phone portrait logical 1152x2560 at 0.9375x, 3 small_target issues.

## P5. Capture matrix windowed, then look (U5)

```python
gd_ui.capture_matrix(P, "res://ui/hud.tscn", ["phone_portrait", "phone_landscape", "fhd", "uhd"],
                     safe_insets=INSETS, out_dir="captures/hud")   # returns PNGs, image_checks, contact sheet
```

`ui_capture.gd:matrix` (windowed run, the 160x90 OS window stays small): per target, a SubViewport
sized to the drawn area with `size_2d_override` = logical size and `size_2d_override_stretch = true`
(viewport mode renders at the render size, then a nearest resize), the scene inside, insets applied,
`frame_post_draw`, then the image composited onto a black image of the physical size at the margin,
with translucent red bands over the inset areas.

Run in Godot 4.7.2 on 2026-10-02: pass, 5 sheets (menu, hud, settings_ja, menu_ar, settings_pseudo),
no image_checks flags (menu mean luma 0.11, HUD 0.29). Looked at: titles, buttons and focus readable
at every size; the notch bands cover background only; Japanese and Arabic glyphs complete through
the SystemFont fallbacks; Arabic menu mirrored; pseudolocalized settings fit. The first look found
two defects the numbers missed: OptionButton items were literal English in the Japanese screen and
the tabs were too small to touch. Fixed (items as keys, tab styleboxes, TabBar added to the touch
check) and recaptured.

## P6. Focus flow and menu stack (U6)

`menu_stack.gd`: `open(panel, opener, first)` saves and disables the covered panel (focus NONE,
mouse IGNORE), shows the new one, grabs `first`; `ui_cancel` or `close()` restores and grabs the
opener. With no focus owner, the first navigation event grabs the default and is swallowed (Mostly
Mad Productions ecJZipjUj6k pattern). `ui_focus.gd:walk` pushes `InputEventAction` press and release
through `root.push_input`, records `gui_get_focus_owner()`; `graph()` gives neighbors per side plus
`ui_focus_next`, reachable and unreachable sets.

Run in Godot 4.7.2 on 2026-10-02: pass. First key from no focus lands on Play; walk Settings, Quit,
Quit (no wrap at the end of a VBox), Settings; open settings focuses Back; Play focus mode 0 while
covered, 2 after; cancel returns focus to SettingsButton; 3 of 3 menu buttons reachable. Standalone
settings scene with no grab: 8 `ui_down` presses do nothing (focus stays null), which is the engine
behavior to design around.

## P7. Rebinding (U7)

`ui_rebind.gd`: `accepts(e)` refuses echo, Escape and stick values under 0.5; `normalize(e)` keeps
the physical keycode, sets device -1, keeps the axis sign; `rebind(action, e, swap, actions)`
replaces only the same kind (key or pad) and returns clashes; `save_bindings`/`load_bindings` write
a ConfigFile of plain dicts; `reset_all()` calls `InputMap.load_from_project_settings()`; `label()`
uses `DisplayServer.keyboard_get_label_from_physical` (not headless) and pad names.

Run in Godot 4.7.2 on 2026-10-02: pass. New keyboard events report device 16, new pad events
device 0. A raw binding stored with device 16 does not match a synthesized device-0 event; the
normalized binding (device -1) matches keyboard and pad 1. A legacy stored key with device 0 does
match a device-16 keyboard event (asymmetric). Conflict on fire detected; swap keeps the other
action bound; 3 events back after a save and load.

## P8. HUD: passive input and damage trail (U8)

`hud_bar.gd` (DashNothing f90ieBOoIYQ): ProgressBar with a Trail child using the TrailBar variation;
damage starts a one-shot 0.4 s Timer, restarted per hit, then a 0.25 s tween catches up; heal moves
both at once. HUD root and wrappers `MOUSE_FILTER_IGNORE`; ammo through
`tr("HUD_AMMO").format({...})` and `tr_n`.

Run in Godot 4.7.2 on 2026-10-02: pass. 100 to 60: at 0.2 s value 60, trail 100; a second hit
restarts the timer (trail still 100 at 0.5 s); settles at 40 after 1111 ms; heal to 90 instant.
Clicks reach `_unhandled_input` 2 of 2 as built, 0 when the root is set to STOP; the audit flags
`hud_blocks_input`. Plurals: "1 round left", "2 rounds left", "1 cartouche restante", "3 cartouches
restantes".

## P9. Localization run (U9)

Per locale: `TranslationServer.set_locale()`, instantiate, check no key is shown raw, RTL flag,
widths. Pseudolocalization: set the options, then `TranslationServer.reload_pseudolocalization()`.
Command line: `--language fr` (non-persistent; the Locale Test setting leaks into version control:
docs).

Run in Godot 4.7.2 on 2026-10-02: pass. 18 keys on screen, none missing in en, fr, de, ja, ar; ar is
RTL; named placeholders give "7 / 90"; without reload the expansion ratio is ignored, after reload
the string is padded; `--language fr` sets the locale to fr; Locale Test empty.

## P10. Engine facts the kit relies on (U10)

Promoted probes (`jobs/engine_facts.gd`, `grow_rtl.gd`): focus without grab, VBox walk,
`find_valid_focus_neighbor`, ui_focus_next wraps; full-rect Control STOP 0 hits, PASS 2, IGNORE 1;
`push_input(e, true)` for logical coordinates; `offset_transform` (rect unchanged, visual-only click
at the drawn position misses, layout position hits, with `visual_only = false` the drawn position
hits); grow direction (default END: right edge 1537 in a 1280 parent; BEGIN keeps it at 1280; no
`set_grow_direction_preset`); RTL mirrors HBox order and anchors; stretch layout at 7 sizes.

Run in Godot 4.7.2 on 2026-10-02: pass, all values above.

## P11. Theme, audit and settings store (U11)

`ui_theme.gd` `build()`, `contrast_report(theme, bg)`, `check_variations(root, [theme])`;
`ui_audit.gd` `audit_tree(root, {"hud": true})`; `ui_settings.gd`
`set_value/save_settings/load_settings`.

Run in Godot 4.7.2 on 2026-10-02: pass. Contrast: Button normal 14.72, hover 10.17, PrimaryButton
9.97, HudLabel 8.8, pressed 6.42, disabled 4.37 (the only pair under 4.5, allowed for disabled).
Misspelt `HudVlaue` reported. Bad tree flags hud_blocks_input, grows_offscreen_x and _y,
icon_keep_size, no_accessible_name, shared_stylebox_override, not_pad_reachable. Settings: UI scale
1.5 turns 1280x720 into 853x480; music bus 0.25 linear; render scale 0.75 with upscaler "auto"
giving MetalFX spatial (mode 3) on macOS; locale de; window mode skipped headless; save and reload
round trip.

## P12. UI update cost (U12)

`jobs/ui_cost.gd`: 200 Labels in PanelContainer and HBox in a GridContainer, 240 frames per mode;
`update_ms` times the text sets plus `get_minimum_size()` (forces the shaping).

Run in Godot 4.7.2 on 2026-10-02: pass. Headless frame time is paced at about 6.9 ms in every mode,
so it hides the cost; the update work over three runs: no updates 0.06 to 0.09 ms, same string
re-set 0.07 to 0.09 ms, 10 labels per frame 0.17 to 0.27 ms, 200 new strings 1.13 to 1.49 ms.
Signal-driven HUD updates stay small; re-setting an unchanged string is free.

## P13. Embedded Window capture limit (U13)

`jobs/embedded_window.gd`: an embedded Window with `content_scale_*` inside a SubViewport.

Run in Godot 4.7.2 on 2026-10-02: pass (the limit reproduced). Layout logical sizes are right
(1152x648 at 4K, 1152x2560 on the phone) but the image draws unscaled: the 4K capture shows the UI
in the top-left 1152x648. Use P5 instead.

## P14. Round-2 layout, theme and input facts (U14)

`jobs/round2_facts.gd` (headless). Run: `python3 tests/code/godot-ui/test_ui_live.py --only U14`.

- TextureRect with a 512x512 texture next to a Label in an HBox sized 400x64, Stretch Keep Aspect
  Centered: `EXPAND_KEEP_SIZE` icon 512x512, row grows to 614x512; `EXPAND_IGNORE_SIZE` without a
  minimum, icon width 0; `EXPAND_FIT_WIDTH_PROPORTIONAL` icon 64x64, row stays 400x64 (Godotneers
  1_OFJLyqlXI 00:10:28, Karto 5Hog6a0EYa0 00:13:33).
- Two 20 px ColorRects in a 400 px HBox (project theme separation 14): EXPAND_FILL with ratios 1 and
  3 gives widths 96 and 290 (386 px shared 1:3); FILL only, 20 and 20 at x 0 and 34; EXPAND without
  FILL on the first, it stays 20 wide and the second moves to x 380; ratio 3 without EXPAND changes
  nothing (Karto 00:15:45, Godotneers 00:32:36).
- Parent at (100, 100) size 200x100: an empty Control with
  `set_anchors_and_offsets_preset(PRESET_BOTTOM_RIGHT)` sits at (300, 200) size 0; a Label "Score
  12345" sits at (127, 161) size 173x39 with offsets -173, -39, 0, 0 (relative to the parent,
  negative inward; Karto 00:05:24 to 00:08:01). A 50x50 child at (10, 10):
  `set_anchors_preset(PRESET_FULL_RECT)` alone leaves it at 110, 110 size 50x50;
  `set_anchors_and_offsets_preset(PRESET_FULL_RECT)` gives 100, 100 size 200x100.
- Default InputMap in 4.7.2: `ui_accept` = Enter, Kp Enter, Space (device 16); `ui_cancel` = Escape
  (device 16); no joypad events. Add `InputEventJoypadButton` 0 to `ui_accept` and 1 to `ui_cancel`
  (Mostly Mad ecJZipjUj6k 00:12:00).
- Array with a setter: 0 setter calls after `append`, 1 after `items = items` (NoBSGodot Yuw7CK5H8eA
  00:05:06).
- Base 720x1280, `canvas_items`: on 1080x2400, `keep_width` and `expand` give 720x1600 at 1.5,
  `keep_height` 720x1280 at 1.5 with origin y 240 (bars); on 2400x1080, `expand` and `keep_height`
  give 2844x1280 at 0.8439, `keep_width` 720x1280 at 0.8431 with origin x 897; on 1536x2048,
  `keep_width` 720x1280 at 1.6 with origin x 192, the others 960x1280. `viewport` mode, base
  1280x720 on 1366x768: logical 1280x720 at 1.0672 (rendered at base then resampled).
- Default Theme Scale: setting 1.0, `ThemeDB.fallback_base_scale` 1.0 and default theme base scale
  1.0, all still 1.0 after `ProjectSettings.set_setting("gui/theme/default_theme_scale", 2.0)` at
  runtime (read once at startup: docs, Multiple resolutions).
- MSDF: `gui/theme/default_font_multichannel_signed_distance_field` false, `SystemFont` and
  `FontFile` `multichannel_signed_distance_field` false by default; fallback font is a FontFile
  (Karto 00:20:50).
- Pseudolocalization defaults: `use_pseudolocalization` false, `expansion_ratio` 0.0,
  `replace_with_accents` true, `double_vowels` false, `fake_bidi` false, `override` false, prefix
  "[", suffix "]", `skip_placeholders` true. So expansion must be set (0.3 to 0.4) and reloaded.
- `safe_area.gd` with test insets [0, 132, 0, 102] under a 720x720 expand project: top margin 104 at
  1080x2400 (scale 1.5), then 82 after `root.size = 1440x3200` (scale 2.0) with no manual call (it
  listens to `size_changed`).
- Runtime Theme edit: Label font color red, then `theme.set_color(...)` green, read back green the
  next frame. `has_theme_font_size_override` false before `add_theme_font_size_override`, true
  after. The editor repaint quirk (Godotneers 00:22:10) and the override checkbox (Karto 00:17:25)
  are editor-GUI behavior, not run here.

Run in Godot 4.7.2 on 2026-10-02: pass, all values above (0.5 s).

## P15. Round-2 windowed facts: clip mask, text effect, key labels (U15)

`jobs/round2_visual.gd` (windowed, 160x90 OS window, SubViewports). Run: `--only U15`.

- `clip_children = CLIP_CHILDREN_ONLY` on a 64x64 Panel with a StyleBoxFlat of corner radius 32 at
  (32, 32) in a 128x128 SubViewport, a red 128x128 child: center pixel red; the Panel rect corner
  outside the circle (35, 35) and outside the Panel (120, 120) show the gray background. A z_index 1
  child outside the mask is drawn (blue at 10, 10); a z_index 0 child outside is clipped (GDQuest
  W4j4tnQLcTA 00:03:47).
- RichTextEffect from code: `bbcode := "lift"`, `_process_custom_fx(c)` reads
  `c.env.get("px", 0.0)`; `install_effect(fx)`, text `[lift px=6]Hello[/lift]`: 35 calls in 4
  frames, env px 6.0, parsed text "Hello", one custom effect (Cashew OldDew KMqYeRae6rM 00:14:01).
  Godot 3 tutorials name it `process_custom_fx` (kuxRwZdYzj8).
- `DisplayServer.keyboard_get_label_from_physical()` on this Mac (layout "French"): physical Q gives
  A, W gives Z, A gives Q, Z gives W, Semicolon gives M, M gives Comma. Store the physical keycode,
  show the label.

Run in Godot 4.7.2 on 2026-10-02: pass (0.9 s); images `clip_children.png` and
`rich_text_effect.png` in the run's `.agent_out/`.

## Not yet run

- Safe area from a real device (`DisplayServer.get_display_safe_area()` on Android or iOS): needs a
  device build; the tests use injected insets.
- Screen reader output (VoiceOver with AccessKit): needs an assistive app and a human listener; the
  kit checks names and focus modes only.
- Exclusive Fullscreen and vsync switching: skipped headless, and a windowed run would take over the
  shared screen.
- Real touch input on hardware.
- Editor-only quirks from the sources: open scenes not repainting after a Theme edit (Godotneers
  1_OFJLyqlXI 00:22:10), Inspector override value inactive until its checkbox is ticked (Karto
  5Hog6a0EYa0 00:17:25). The code paths were checked in P14.
- POT generation picking up text in custom nodes (fixed in 4.3 per Cashew OldDew v0tJPsNNOM8
  00:08:00): not rerun; the kit uses CSV keys.
