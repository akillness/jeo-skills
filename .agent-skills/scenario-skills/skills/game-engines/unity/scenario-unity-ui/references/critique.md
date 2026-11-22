# Critique rubric: how the UI agent judges its own output

Run it on every deliverable, in this order. A screen is not done while any **gate** line fails. Each
line says how it is checked: **job** (a number from AgentKit), **sheet** (you look at the contact
sheet), or **both**.

## 1. Fit for the brief (before any pixel)

| Check                          | How                               | Pass                                                                                                                                                                                                            |
| ------------------------------ | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| System matches the 6.3 matrix  | `ut_ui.choose_system(needs, ...)` | no blocker row ignored; a split has a reason per screen; no shared row (custom shaders, world space) used as a reason                                                                                           |
| Layers planned                 | `ut_ui.UI_LAYERS`, audit `stack`  | every screen-space layer of both systems has its own sort order; focus handoff written for each popup that crosses systems                                                                                      |
| Device matrix covers the brief | the shot list                     | at least phone portrait, a 16:9 laptop, 4K; plus tablet, 21:9 or tall phone when the brief names them                                                                                                           |
| Inputs named                   | brief                             | mouse, touch, keyboard, gamepad each has a path to every control                                                                                                                                                |
| Languages named                | brief                             | CJK needs fallbacks in EACH text system that shows it (TMP Settings and Panel Text Settings); Arabic or Hebrew needs UI Toolkit (RTL is UI Toolkit-only in 6.3); code-filled options refill on the locale event |

## 2. Layout (gate: job)

- `ut_ui.layout_verdict(envelope)` is empty for every shot: nothing outside the screen, no text
  overflowing or truncated, no line broken inside a word, no overlapping controls or texts, touch
  targets at or above the device's `min_target_px` (7 mm at the assumed DPI).
- The checks only cover what they model. Every defect you see on the sheet that no check flagged
  becomes a new check (the word-break rule came from "Resolutio/n" seen on the 1170 x 2532 capture).
- `scale_factor == expected_scale` (uGUI, log-space formula) or `== ut_ui.panel_scale(...)` (UI
  Toolkit, linear). A mismatch means a scaler you did not expect (a CanvasDeviceScale, a wrong
  reference, Constant Pixel Size).
- `checked > 0` in every shot (a capture that checked nothing proves nothing).
- `clipped_by_scroll` is expected only where a ScrollRect exists; if a screen scrolls at the laptop
  size, keyboard and gamepad selection must scroll with it (ScrollToSelection).
- A size nobody expected is explained with `UIAudit.ExplainLayout` (min, preferred, flexible and the
  rule per child) before any setting changes.

## 3. Look (gate: sheet, then words)

Open the contact sheet and the 4K frame at full size (crop a region). Write one line per point:

1. **Hierarchy**: one title level, then headings, then body; the eye lands on the primary action
   first (the only accent surface on the screen).
2. **Palette discipline**: neutrals carry most of the area; the accent marks selection and the
   primary action only; no saturated text on a saturated fill (Game Dev Guide's "CAN YOU READ
   THIS?"). Color probes within 3 of their tokens.
3. **Contrast**: `ut_ui.check_pairs` passes (4.5:1 body, 3:1 large text). Translucent panels read
   lighter in-engine than in a design tool (UI Toolkit blends in linear space in a Linear project):
   judge them on the capture over a real backdrop (`backdrop_scene`).
4. **Spacing and alignment**: margins and gaps from the 8 px scale, text never touching a box edge,
   labels on one left edge and controls on one shared column at every width, breathing room around
   blocks.
5. **Same shape everywhere**: phone, laptop and 4K show the same composition; the phone is not a
   shrunken laptop (controls bigger through the handheld multiplier, labels wrap instead of
   overflowing); 4K text crisp (TMP SDF), not blurry.
6. **Balance**: a box below the screen center keeps space at its top; dialogs stay top-anchored
   (Christina, HTQV4mukZ2M [00:35:28]).
7. **HUD over gameplay**: blocks readable over the brightest and busiest part of the level frame;
   the HUD takes the corners, leaves the center.

## 4. Behavior (gate: Play Mode tests)

- First selection lands one frame after a screen shows; hover selects; mouse exit then a gamepad
  press resumes on the last item; dpad moves.
- A hidden screen has 0 interactable controls (Canvas.enabled alone leaves them navigable).
- Settings apply and persist: quality (runtime level list), volumes in dB on the mixer, resolution
  list non-empty on desktop and hidden on mobile, rebinds saved as override JSON and restored at
  boot.
- The UI scene loads over a level with exactly one EventSystem; reloading never grows a handler
  count.
- Bindings: the view shows the model after one frame; display:none keeps binding, removal stops it.
- Layers: the top raycast hit where a uGUI canvas and a UI Toolkit panel overlap belongs to the
  higher sort order; focus returns to the right system when a popup closes.
- Locale: code-filled options change language and keep their selection.
- UI Toolkit screens: UI Test Framework Edit Mode tests (clicks, keys, bindings, every queried name
  exists).

## 5. Structure and cost (gate: audit + counters)

- `UIAudit.Audit`: 0 errors, 0 warnings on shipped scenes; each info justified (nested layout only
  on screens that rebuild on open).
- Glyph gate: 0 missing characters for every shipped string table, in TMP (`UIAudit`) AND UI Toolkit
  (`UitkGlyphs`); fallback assets share one sampling size and padding.
- `UIAudit` v0.2 rules silent: no sort ties, no more than 8 World Space canvases, no stencil Mask
  outside scroll views (a round minimap uses pre-cut art or a shader clip), no center-anchored edge
  elements, UI atlases without rotation or tight packing.
- uGUI: static and per-frame content on different canvases (`canvas.mixed_timing` silent;
  `Canvas.BuildBatch` lower after a split); hide paths use Canvas.enabled (0 mesh regenerations); no
  Shadow/Outline on text.
- UI Toolkit: a static panel in 1 batch (`Render/Batches Count`; if not, raise Vertex Budget from
  its vertex count), no more than 8 non-atlased textures in a run, no layout-property transitions or
  resting opacity 0 (`ut_ui.lint_uss`), no inline styles or modeless bindings (`ut_ui.lint_uxml`), 0
  USS import errors and rules > 0 per sheet (one error empties the whole sheet), screen art out of
  the global theme (`uitk.hard_refs`).
- Bindings: every data source has a generated property bag (`BindingSources`), change tracking, and
  an idle screen reports 0 panel changes (`PanelChangeLog`).
- Hiding: each hidden screen's method matches its duration (`ut_ui.uitk_hide_method`): no
  display:none or opacity 0 on a bound screen hidden for minutes.
- GC: an idle HUD allocates nothing beyond the editor baseline (40 bytes per frame here); strings
  are built on change, not per read.

## 6. Report

Verified (job id, sheet path, numbers) and Assumed (device DPI, player-only checks such as a real
notch, a player build's Overlay rendering, device GPU cost) as scenario-unity-expert's report format
asks. Never call a screen done from the build job alone.

## Scoring (for self-review and blind grading)

| Score | Meaning                                                                               |
| ----- | ------------------------------------------------------------------------------------- |
| 0     | not built or does not compile                                                         |
| 1     | builds, never captured or captured only at one size                                   |
| 2     | captured at the matrix, looked at, but layout verdict or audit not clean              |
| 3     | layout verdict and audit clean, behavior tests pass                                   |
| 4     | 3 plus cost numbers measured and compared, design critique written, handoffs packaged |
