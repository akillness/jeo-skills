# Critique rubric: judge a render like a lighter

Run the numbers first (`BL.analyse` + `BL.verdict`, `BL.light_report`, `BL.color_audit`), then open
the render, the value study and, for sequences, the contact sheet, and answer the questions in this
order (the order experts read a frame). A number that passes does not excuse a visual failure; a
visual doubt with passing numbers means look closer at that region. Thresholds are [added] starting
points calibrated on the workshop fixture (procedures P9).

Severity: **blocker** (the image does not read; fix before anything else), **major** (reads, but an
expert would send it back), **minor** (polish).

## 1. One-second read (blocker)

- Where does the eye go first? It must be the subject's face or the story point. Andrew: the
  highest-contrast area wins whether you want it or not [O8i7OKbWmRM 00:04:00].
  - Code: `rep["focus"]["peak_on_subject"]`, `concentration >= 1.5`;
    `rep["squint"]["max_on_subject"]`.
  - Fix: darken or shadow the competitor (blocker, spot cone, split world, lower that light), add a
    cue on the subject (light-linked key, saturation, DoF), or move the camera.
- Is there exactly one focal element? Two equal ones irritate [O8i7OKbWmRM 00:11:00].

## 2. Value structure, desaturated (blocker)

- Open `value_study`: does the subject sit in a different value group than what surrounds it? Andy
  checks almost every shot desaturated [APgQKQgAdyU 00:22:09].
  - Code: `subject.minus_ring` magnitude >= 0.10, `band != ring_band`, `edge_merge_pct <= 35`.
  - Fix order: darken the set first (Andy [00:53:02]; linking the key to the subject, spot instead
    of point, blockers, lower window/practical), then raise the subject; for a dark subject, light
    the background behind the dark side instead.
- Are there 3 to 5 clear value groups, with the foreground in high contrast and the background in
  midtones (Lino [Xqne7oRxSjM 00:17:45])? `value_range` spread >= 0.30.
- Are the frame edges darker than the center (vignette in the lighting, Andy [00:23:18], Lino
  [00:19:25])? `vignette_ratio < 1`.

## 3. Form and light quality (major)

- Is there a light-to-shadow gradient across the subject, not flat front light? Gleb: "flattening,
  not flattering" [6hPZ0ckL5I0 00:14:48]; Andy: gradients along the faces [00:20:28].
  - Code: clay render `subject.internal_ratio >= 2.5` (flat frontal key measured 1.34, designed key
    6.05); `light_report` flags a key < 20 deg off the camera axis or below the eye line.
- Does the light size match the intent? Large source for faces and form, small for texture, grit,
  hard sun or streetlamp (Andrew [ENnEYoUpFfU 00:19:17] [00:22:34]). Check `angular_size_deg` and
  `source_m` in `light_report`; `light_report(face=head)` flags a key smaller than the head (not an
  issue for toon keys).
- Does the shadow side read as shadow and still show detail (Andrew [00:04:45])? Judge the result,
  not a key:fill ratio: Andrew calls the textbook ratio "bogus".
- Soft lights in EEVEE: microshadows under nose, chin, eyelids present (per-light jitter, Gleb
  [00:05:55])? Skin not resin-like (SSS radius, Gleb [00:04:24])?
- Protrusion vs cutout readable; major planes in different values (Andrew [00:03:09] [00:33:37]).

## 4. Motivation and plausibility (major)

- Can every light be named by its purpose and its source (Andrew [00:34:40])? Are colors drawn from
  the world (window = sky color, practical = tungsten, rim eyedropped from the background: Gleb
  [00:17:36], Lino [00:30:45])?
- Rim on the key side, or on the shadow side only with a visible or implied source behind (Andy
  [00:53:36])?
- Does it "look lit" (Gleb [00:09:42])? Cheats (cheated key, blockers, split world) must stay
  plausible.
- Eye highlights in the upper half of the eye, only on the eyes, not cross-eyed (Andy [00:34:56];
  Gleb eye light linking [00:20:35]).
- Speculars restricted to the eyes and hero metal; no background twinkle (Andy [00:24:23]).
- Code: `light_contributions`: the key carries the largest share on the subject; in interiors the
  world is < 10 % (a larger share usually means the EEVEE world leak). In Cycles with light groups,
  one render gives the same shares: `lightgroup_check(exr, mask)` (S7 workshop: linked key 0.77 on
  the character, 0.28 of the frame); a group that must be turned up or down is a comp gain
  (`lightgroup_mix`), not a re-render.

## 5. Color (major)

- Contrast in value, saturation and hue all present (Lino [00:01:06]).
- One saturated focus hue; the complement desaturated over large areas or only in small dots (Lino
  [00:07:40]).
  - Code: `rep["hue"]["clusters"]`; the verdict flags two saturated complements over similar areas.
- Warm/cool separation matches the motivation (practical warm on the subject, cool window fill).
- Color pipeline: `color_audit()` empty (data maps Non-Color, not Standard for HDR scenes, finals
  Follow Scene, background footage View as Render). View transform chosen on purpose: AgX for
  scenes, ACES 2.0 or AgX High Contrast for portraits, Khronos PBR Neutral for product or brand
  colors (measured: brand red within 3.8 of 255 steps vs AgX 41.8). Global brightness changed with
  `exposure`, never by scaling lamps (the world and emissives get left behind).
- Clipping: `clip_pct <= 0.5` outside emitters; read `linear_max` from the EXR (AgX shows linear 4
  as 0.91). Crushed blacks `crush_pct <= 25` (near-black keeps headroom, Andrew [00:10:05]).

## 6. Composition (major)

- Structure chosen and respected: subject near a thirds point (`thirds.distance < 0.1`) with look
  room, or deliberate symmetry, pyramid or full frame (Andrew [O8i7OKbWmRM 00:14:00]).
- Balance: `squint.left_weight` near 0.5, or a counterweight on the light side (figures and shadows
  count, [00:26:00]).
- No guiding line leaves the frame without a stopper [00:10:30]; high-weight cells on the border
  (`squint.edge_weight`) checked visually.
- Lens: no distortion on boxy products (80 mm, Andrew [ENnEYoUpFfU 00:32:32]).

## 7. Engine artifacts (major for finals, minor for previews)

- EEVEE: ray tracing on; black ghosts behind objects in reflections, reflections eaten at frame
  edges, light switching on/off when the camera pans, grid patterns or banding after a probe bake,
  smeared textures (temporal accumulation), glass portals or self-reflection (sphere probe clip
  start), light leaks through thin walls (Andrew, -gW6vk_OuNQ). For interiors, a world-only render
  with windows closed must be near black, and `probe_report` must show the outer probe samples at
  the inner walls (Andrew [00:38:22]; samples 0.2 m inside leak 0.054).
- EEVEE vs Cycles: render a Cycles reference at preview quality; on the S7 fixture EEVEE matched the
  character (0.94) but lifted the set (1.54). Judge the set's darkness against Cycles.
- Cycles: fireflies (clamp or fix the path), denoiser blotches in dark corners, noise in soft
  shadows and volumes; bounces enough for glass (8 transmission).
- Animation: flicker (jitter, alpha foliage, RT resolution 1/16), temporal denoise on.

## 8. Comp finish (minor)

- Bloom only where values exceed ~1.0 (`over1_pct` small, on intended highlights), vignette subtle,
  correction restores the punch; stop before "2013's Instagram" (Pau [kAWfjBKcgFc 00:06:32]).
- Pixel-unit effects driven by Relative To Pixel, so previews match finals (Pau [00:11:54]).
- Re-run `verdict` on the finished image: the comp must not break separation.

## 9. Sequences (major)

- Sun azimuth per location within about 30 deg of the reference (`BL.sun_azimuth`, Andy [00:29:30]).
- Contact sheet reads as one film; `sheet_stats` flags shots more than 0.5 stop from the median
  (Andy [00:38:59]).
- Eye-highlight direction consistent with the key per shot (Andy's cheat sheet [00:33:51]).

## Report template

State: engine and preset, view transform and look, lights with purpose/source/level/share, verdict
list (empty or accepted with reason), the three images you looked at (render, value study, contact
sheet), and what was not verified (for example: final Cycles quality not rendered, animation flicker
not checked).
