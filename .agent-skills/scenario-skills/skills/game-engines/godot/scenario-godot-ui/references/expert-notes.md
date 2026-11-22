# scenario-godot-ui: expert notes

Principles and judgment by source, with timestamps. The video experts are educators whose
credentials are unverified, apart from GDQuest (training studio) and Rawb Herb (ex art director).
Statements checked live in Godot 4.7.2 say so; my own additions are marked [added].

## Official docs (docs.godotengine.org, stable, retrieved 2026-10-02)

**Multiple resolutions**

- Default recipe for modern 2D and UI: `canvas_items` + `expand` with anchors. `keep_width` suits
  HUD-heavy portrait games; `keep_height` suits side scrollers.
- A square base (720x720) plus Handheld Orientation `sensor` supports portrait and landscape with
  one scale. Measured: 1.5x both ways on a 1080x2400 phone and 3x on 4K [added].
- Pixel art: base 640x360, `viewport`, `keep` or `expand`, integer scale. 640x360 divides evenly
  into 720p, 1080p, 1440p and 4K.
- With integer scaling use Exclusive Fullscreen, not Fullscreen: the one-pixel line in Fullscreen
  can drop the scale factor.
- A 4K base needs Default Theme Scale 2.0 to 3.0 and mipmaps; a mobile 1080p base needs 1.5 to 2.0.
  Default Theme Scale is read once at startup (a runtime set changed nothing, P14).
- Expose `content_scale_factor` as the UI size slider. Measured: 1.5 turns 1280x720 into 853x480
  [added].
- Portrait 3D: set Camera3D Keep Aspect to Keep Width.

**Using containers / Size and anchors**

- Container children give up position authority. Use size flags and `custom_minimum_size`.
- Fill and Expand are separate flags. Stretch Ratio only splits space between expanding siblings.
- MarginContainer padding is a theme constant (`margin_*`), not a property.
- Custom containers handle `NOTIFICATION_SORT_CHILDREN` with `fit_child_in_rect`.
- Anchors are 0..1 fractions of the parent; offsets are pixels from the anchor.

**Keyboard and controller navigation**

- Nothing works until a Control calls `grab_focus()`; use `call_deferred` at scene start. Measured:
  focus is null and `ui_down` does nothing [added].
- Do not reuse `ui_*` actions for gameplay.
- Hidden nodes lose focus, so grab focus again after a panel switch.

**Theme type variations**

- Create a new type, set its Base Type, then apply it with `theme_type_variation`.
- The editor dropdown only lists project-theme variations. A misspelt name silently falls back to
  the base type; `check_variations()` reports it [added].

**Internationalizing games**

- Use named placeholders with `format()` so translators can reorder words.
- Use `tr_n` for plurals and a context argument for identical English.
- Set Auto Translate Mode to Disabled on dynamic text.
- The Locale Test setting leaks into version control; `--language` is the non-persistent test.
- Pseudolocalization finds overflow and missing glyphs, not CJK or RTL coverage. `expansion_ratio`
  defaults to 0.0 (P14).
- Include Text Server Data (~4 MB) for languages written without spaces.
- Fonts use fallbacks, not remaps.
- RTL mirrors anchors, alignment and container order automatically (measured for HBox order and
  anchors).

## Godotneers, "Godot UI Basics" (1_OFJLyqlXI)

- 00:06:10 UI goes on a CanvasLayer, separate from the camera.
- 00:10:28 to 00:14:08 TextureRect in a container: Expand Mode Fit Width (or Ignore Size plus a
  minimum size) and Stretch Mode Keep Aspect Centered. The default KEEP_SIZE blows up a row;
  `ui_audit` flags `icon_keep_size` [added].
- 00:19:20 Project-wide theme: `gui/theme/custom`.
- 00:22:10 After a theme edit in the editor, reload the scene.
- 00:24:29 to 00:26:43 Type variations; override HeaderLarge, HeaderMedium and HeaderSmall.
- 00:35:00 Sizing negotiation: minimum, Expand, Fill.
- 00:42:38 Stretch `canvas_items` + `expand`. His 1920x1080 base suits desktop; for phone portrait
  the docs' square base is better (see OPEN_ISSUES).

## Karto, "Control Node Masterclass" (5Hog6a0EYa0)

- 00:05:24 to 00:08:01 Anchor presets are relative to the parent; offsets go negative to move
  inward. `set_anchors_preset()` alone keeps old offsets; `set_anchors_and_offsets_preset()` resets
  them (P14, measured).
- 00:14:39 to 00:16:16 Expand alone shows nothing. Stretch ratios add up (1:3 gives 25/75; measured
  96 and 290 of 386 px, P14).
- 00:17:25 A theme override value is inactive until its checkbox is ticked.
- 00:19:00 StyleBoxes are shared Resources: use Make Unique or `duplicate()`. `ui_audit` flags
  shared overrides [added].
- 00:20:50 Turn on the MSDF default font option for crisp text at any scale
  (`gui/theme/default_font_multichannel_signed_distance_field` exists in 4.7.2, default false, P14).

## Rawb Herb, "Improving Your UI", GodotCon 2025 (sjmAD1ZLBcE)

- 00:06:14 List player information by priority.
- 00:12:50 Every action gets immediate feedback.
- 00:21:34 Use two or three fonts at most; body text readable first.
- 00:31:42 Wireframe in gray values first; the current selection is the highest-contrast element.
- 00:34:32 Playtest before final art.
- 00:55:38 A flashy intro is fine; the outro is faster.
- 00:56:12 Controller users always have a focused control; the cursor follows focus.

## Mostly Mad Productions, menu input manager (ecJZipjUj6k)

- 00:04:53 and 00:08:57 A menu stack disables hidden menus (mouse IGNORE, focus NONE) and restores
  focus to the opener. Implemented in `menu_stack.gd`; measured focus mode 0 while covered and 2
  after.
- 00:10:34 to 00:13:36 Switching between mouse and pad: swallow the first event of the new mode and
  grab focus on the last hovered button.
- 00:12:00 Add pad buttons to `ui_accept` and `ui_cancel`. In 4.7.2 the defaults are keys only:
  Enter, Kp Enter, Space and Escape, device 16, no joypad event (P14, measured).

## Mostly Mad Productions, custom RichTextEffects (kuxRwZdYzj8)

Highlight and appear effects. The source hints are Godot 3 (`process_custom_fx` without the
underscore); use `_process_custom_fx` in 4.x.

## Cashew OldDew, BBCode and RichTextEffect (KMqYeRae6rM)

- 00:14:01 to 00:15:45 Use a `bbcode` var plus `_process_custom_fx(char_fx)`. Read tag options from
  `char_fx.env`. Editing the script while the tag is live floods errors.
- 00:20:16, 00:22:34 `rotated_local` rotates each glyph; staggered reveals subtract
  `relative_index`.
- `install_effect()` exists in 4.7.2. `[img]` sizing now has width and height units (deltas).

## Cashew OldDew, PO localization (v0tJPsNNOM8)

- Use PO and POT when translators need gettext tools.
- 00:08:00 The custom-node POT bug was fixed in 4.3.

## jitspoe, quick localization pipeline (Lw-3Tnwv4Ds)

- One key per control text, CSV, register the translations, named placeholders, font fallbacks for
  CJK, underscore locale codes.
- CSV and PO can coexist. CSV is easiest for agents.

## MrElipteach, `offset_transform` in 4.7 (pK2vI2-jCH4)

- 00:03:18 to 00:04:59 Animate a container child without relayout. Visual-only by default, so input
  stays at the layout rect (measured: a click at the drawn position misses).
- 00:02:54 Use `modulate.a` instead of `visible` to avoid relayout.
- 00:06:35 Fan layouts: tween a wrapper's minimum size.

## DashNothing, health bar with damage trail (f90ieBOoIYQ)

- 00:01:26 to 00:05:12 Two stacked bars: the front one has a StyleBoxEmpty background; the trail
  follows after a 0.4 s one-shot timer restarted per hit; heal is instant. Measured: the trail holds
  at 100 through a hit combo and settles at 1111 ms.

## CoffeeCrow, accessibility options menu (9H_fN4OxyIE)

- Settings in an autoload.
- 00:08:11 Show toggles as On and Off text.
- The promised text scaling and remapping are not in the video. Use `content_scale_factor` and
  `ui_rebind.gd`.

## Blackwater Gator Studios, screen reader (Mfo80WXX1A0)

- 00:09:57 to 00:12:41 Set accessibility name and description. Non-interactive labels need Focus
  Mode Accessibility to be read.
- In 4.7.2 RichTextLabel defaults to `FOCUS_ACCESSIBILITY`; Label defaults to NONE [added,
  measured].
- `accessibility_support` 0 (Auto) only activates with an assistive app running.

## GDQuest, clipping masks (W4j4tnQLcTA)

- 00:03:47 `clip_children` Clip and Draw or Clip Only works with soft alpha. Children with another
  `z_index` escape the mask (measured: z 1 drawn outside, z 0 clipped, P15); a SubViewport is the
  fallback.

## NoBSGodot, reactive UI state (Yuw7CK5H8eA)

- 00:05:06 to 00:06:51 Array mutations do not call setters (measured: 0 calls after `append`, P14).
  Wrap arrays (ReactiveArray) so the UI updates by signal.

## Gwizz, dynamic screen sizes (blPqie3Z_F0)

- Choose `viewport` for pixel art and `canvas_items` for crisp UI.

## StayAtHomeDev, editor theme (_tOf5wWjiqM)

Editor customization only. Not relevant to game UI.
