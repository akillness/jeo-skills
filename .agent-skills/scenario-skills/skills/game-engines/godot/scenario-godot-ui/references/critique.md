# scenario-godot-ui: critique rubric

Score each line pass or fail, with the evidence (a number from the AGENT_RESULT or what you saw in a
sheet). Do not deliver a UI with a failed blocker.

## Blockers (measured)

| Check                           | Pass condition                                                                                              | Tool                                     |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Stretch keys                    | mode, aspect and base written in project.godot; Jolt and renderer intact                                    | `gd_env.read_project`, U1                |
| Scale per target                | phone scale such that buttons reach 126 px; 4K text not tiny (scale 3 at base 720)                          | `gd_ui.stretch_math`                     |
| Layout matrix                   | 0 offscreen, outside_safe, small_target, text, overlap, collapsed on 8 targets                              | `gd_ui.layout_matrix`                    |
| Same in long and pseudo locales | de and pseudolocalization at 0.4 expansion also 0 issues                                                    | `layout_matrix(locale=..., pseudo=True)` |
| HUD passes input                | full-rect HUD nodes IGNORE; a click reaches `_unhandled_input`                                              | `ui_audit` `hud_blocks_input`, U8        |
| Focus                           | default focus on open, every focusable reachable, covered panels unreachable, focus back to opener on close | `gd_ui.focus_walk`, `ui_focus.graph`     |
| Bindings                        | normalized (device -1), conflicts reported, save and load round trip                                        | U7                                       |
| Pad on Accept and Back          | `ui_accept` has a JoypadButton 0 and `ui_cancel` a JoypadButton 1 (4.7.2 defaults are keys only)            | `InputMap.action_get_events`, P14        |
| Pseudo expansion really on      | `expansion_ratio` set (default 0.0) and reloaded; strings padded                                            | U9, P14                                  |
| Translations                    | `check_csv` ok, translations registered, no raw keys on screen per locale                                   | U3, U9                                   |
| Contrast                        | body pairs >= 4.5:1, large text >= 3:1 [added, WCAG 2]                                                      | `ui_theme.contrast_report`               |
| No GDScript errors              | compile and run logs clean                                                                                  | U1, `gd_run` errors                      |

## Visual review (open the contact sheet)

- Selection is the highest-contrast element; still obvious in grayscale (Rawb Herb).
- The focus ring is visible on every control type (Button, OptionButton, slider, tabs).
- Nothing important sits under the red notch bands; backgrounds do extend under them.
- Black bars only where the stretch aspect says so; nothing stretched or blurry at 4K.
- CJK and Arabic glyphs are complete (no tofu boxes); Arabic layout is mirrored; numbers stay
  readable.
- Pseudolocalized brackets are visible at both ends of each string (nothing clipped).
- Two or three fonts at most; body text readable at phone size.
- HUD frames, bars and minimap keep their aspect; the trail bar reads as damage.

## Judgment calls

- `canvas_items` vs `viewport`: crisp UI and high-res art vs pixel art (docs, Gwizz).
- `expand` vs `keep_width`: multi-ratio game vs a HUD-first portrait game where the height can grow
  (docs).
- Square base vs 16:9 base: phone portrait and landscape in scope or not (docs, measured).
- CSV vs PO: agent and small team vs translators with gettext tools (jitspoe, Cashew OldDew).
- `offset_transform` vs wrapper minimum size: decoration vs motion the layout must follow
  (MrElipteach).

## Red flags in a proposal

- "Headless root is 64x64, so test in SubViewports." This is wrong in 4.7.2: `root.size` works
  headless.
- A base swap at runtime for portrait, when one square base covers both orientations.
- HUD values updated in `_process`.
- `theme_override_*` across many scenes instead of a Theme.
- Captures through an embedded Window with `content_scale_*` (draws unscaled).
- Touch sizes given in logical pixels without the scale.
- A round minimap mask with children on another `z_index` (they escape `clip_children`).
- `set_anchors_preset()` alone on a Control that was moved (old offsets kept).
- Default Theme Scale changed at runtime (read once).
