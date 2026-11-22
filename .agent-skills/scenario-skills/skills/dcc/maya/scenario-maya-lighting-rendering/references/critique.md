# Critique rubric: judging a lit frame, a render setup and a delivery

Load at every gate. Two halves: the supervisor's frame critique (what `analyze_frame` measures, and
what only eyes can judge), and the render-engineering rubric (noise, passes, color, budget). Code
screens, the eye decides: never call a frame done from the numbers alone (scenario-maya-expert
protocol).

**Proportionate notes.** A lead judges the big picture and does not "pixel f#ck" (BR-B ch6
Storytelling on Lego Batman); a 15-frame shot does not deserve a week (BR-B ch8 Do a first pass);
Tanzillo labels his late notes "very nitpicky" (TZ-C 00:19:12). Work the list top-down: an early
failure (the eye lands on the wrong thing) makes later polish moot.

## A. The frame critique, in the supervisor's order

Merged from Tanzillo's live critique, KT's three goals and Brejon's review order (lighting studio
digest). Column "code" names the `analyze_frame` finding id; thresholds live in
`mx_light.THRESHOLDS` and are all [added]: calibrate them on an approved frame of the project, then
keep them per project.

| #   | Question                                                                                                                                                                                            | Code (finding id, metric)                                                                                                                                          | Default threshold                                                                                                                    | Look at                                                                    | Typical fix                                                                                                                                            | Triage           |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- |
| 1   | Does the frame tell the story in the shot's duration (7 frames can be enough, KT 00:13:22)? Was it lit from a reference (ARV-C 00:02:44; BR 00:08:13; TZ-C 00:02:20)?                               | `story` (info: needs the brief); `reference` (warn without `brief["references"]`, else info: L* histogram distance and value groups of the reference vs the frame) | none                                                                                                                                 | the frame at thumbnail size, one-second flash; the reference beside it     | layout or story issue: say so instead of over-lighting (BR-B ch6 Complementing Composition); rebuild the reference's light placement                   | eyes             |
| 2   | Same world as the master and neighbors; signature features persist (BR-B ch6 Hugo)?                                                                                                                 | `compare_frames`: L* histogram distance, group energy in stops                                                                                                     | L* EMD < 4 within a setup; a character's rim within about 1 stop                                                                     | the shot cut with its neighbors; `light_group_sheet` per shot side by side | the outlier shot's solo light gets the tweak (BR 00:25:14)                                                                                             | lighting         |
| 3   | Eye path: squint, is the most contrasted area the target (TZ-C 00:11:53)?                                                                                                                           | `eye_path`: saliency peak in subject mask, concentration (subject saliency share / area share); `isolated_hue`                                                     | peak inside the subject, concentration >= 1.3; hue clusters 0.1 to 3% of frame, >= 60 deg from the scene's cast, outside the subject | `squint.png`, `annotated.png` (yellow cross = saliency peak)               | darken competitors, pool light at the subject, leading lines down, darker windows (TZ-C 00:12:27 00:13:00); remove or use the lone hue (TZ-C 00:14:39) | lighting         |
| 4   | Value structure: blacks lifted far, darkest and most contrasty near; foreground below the subject; lighting vignetted (TZ-C 00:08:38; BR-B ch6 Negative space, Vignetting)?                         | `back_to_front` (Z AOV, subject excluded), `foreground_bright`, `value_plan` (3-group notan clarity), `vignette`                                                   | blacks near <= mid <= far and contrast near >= mid >= far; clarity >= 2; edges not > 5 L* above center                               | the frame desaturated; the -2.5 stop tile of the bracket                   | haze or lower background light for far planes; take the foreground out of the light (BR 00:29:06); blockers at the edges                               | lighting         |
| 5   | Separation: counterchange behind each subject, never dark on dark (BR 00:38:56, 00:40:02)?                                                                                                          | `separation`: subject vs ring median delta L* and d'                                                                                                               | abs(d') >= 0.8                                                                                                                       | the subject's outline in `annotated.png`                                   | darken the surround rather than push the subject (KT 00:30:31); a rim; haze behind (KT 00:35:50); a bright object behind a dark head                   | lighting         |
| 6   | Balance: one light stands above; rim not equal to or above the key; symmetry only if the art direction is symmetric (BR-B ch6 Balance, Planet 51)?                                                  | `balance` (top group share and gap on the subject or face mask), `rim_equals_key` (signed: a hotter rim warns too), `key_not_top`, `symmetric_face`                | gap >= 15%; rim at least 0.5 stop under the key; face halves differ by >= 10% for natural looks                                      | `light_group_sheet` (each group solo at the same exposure)                 | pick the shaping light, lower competitors                                                                                                              | lighting         |
| 7   | Mood and color: hue, saturation, softness carry the emotion; complementary scheme present, split by direction or medium so it does not go gray (KT 00:04:40; BR-B ch8 Final result)?                | `warm_cool` (info: lit minus shadow b*, subject minus background b*)                                                                                               | sign matches the brief's scheme                                                                                                      | the frame against the reference board                                      | one hue per direction or medium; warm skin, warm food (KT 00:07:47, 00:08:19)                                                                          | lighting         |
| 8   | Face: key upstage, five portrait rules, eye highlight present unless dead or defeated, spec on skin, SSS not glowing (BR-B ch8.5)?                                                                  | `face_ratio` (stops from the EXR vs brief target), `face_black`, `symmetric_face`; scene: `key_upstage`, `fill_lens_axis`                                          | ratio within 0.5 stop of the mood target; < 5% of the face below 2% of its mean                                                      | the face at 100%, the Rembrandt triangle, the mouth line                   | wrap in 0.5-stop steps; sfumato on the transition (BR 00:38:24); move the rim to outline the face, not the hair (BR 00:30:11)                          | lighting         |
| 9   | Shaping: falloff on every form and set piece, no constant tone (KT 00:10:11; BR-B ch8 Let's keep it simple)?                                                                                        | none in code                                                                                                                                                       | none                                                                                                                                 | flat walls, flat floors, the slate                                         | IES or area lights to break large surfaces; a grazer across the set                                                                                    | lighting         |
| 10  | Motivation and physical signature: every dramatic impact has a cause; shadow softness fits source size and distance; one distant source gives parallel rays (BR 00:22:30; TZ-C 00:05:53, 00:12:27)? | scene: sun-role lights share a direction [added]; window lights are large                                                                                          | none                                                                                                                                 | shadow edges, ray directions                                               | enlarge the source; justify the pool (a practical, a bounce)                                                                                           | lighting         |
| 11  | Technical: clipping on the subject, crushed blacks, NaN, broken black materials, comp edges, DOF logic, layers sum to beauty (TZ-C 00:08:38, 00:03:24; BR 00:59:41)?                                | `subject_clipping`, `crushed_blacks`, `nan_inf`, `brightest_pixel`, `layers_sum`                                                                                   | subject clipped < 0.5%; crushed < 5% of the frame; light groups + default within 1% of the beauty                                    | the +2.5 and +5 stop tiles (clipping), the -5 tile (hidden range)          | lower the key or darken the surround; subtle black lift (ARV-C 00:52:51, comp); fix names or RGBA_default for sums                                     | lighting or comp |
| 12  | Polish: practical cores, broken-up background glows, catchlight shape, bokeh with energy (TZ-C 00:18:07, 00:18:39; BR 00:35:05, 00:55:51)?                                                          | none                                                                                                                                                               | none                                                                                                                                 | 100% crops                                                                 | a hot core, primitive blockers in background rooms, disc sources for round catchlights                                                                 | lighting or comp |

**Notes as a lead writes them:** one line each, in the order above, with the triage (KT 00:47:19:
"the key needs to be moved" is lighting, "lift that fill by 10" is comp). `write_report` produces
exactly this table in `critique.md`.

## B. Product hero shot (scenario M5 and similar)

- **The reflections are the product.** Polished steel shows only what it reflects: each face that
  must read has a light or a card in its reflection; dark bands (flags) make metal read as metal
  [added photographic practice]; highlights break and travel across bevels when the camera or a
  light moves slightly (ARV-C 00:45:05). Check the render at 100% on the case edges and the bezel.
- **Reference first:** real photographs of the same kind of product and shot, their light placement
  read from the reflections and rebuilt before any material is judged (ARV-C 00:02:44, 00:36:21).
- **Soft means large** (JHILL 00:08:26): a key as big as the product or larger; a rim small and hot
  (JHILL 00:13:47) for the silhouette against the dark background, still at least 0.5 stop under the
  key on the subject (small and hot is radiance, not total energy).
- **What must be sharp:** state it (the logo, the dial, the indices) and check `L.dof_plan` on its
  depth range; a whole watch head at macro distance is usually not holdable, so turn the camera
  toward perpendicular to the dial or frame wider (a longer lens at the same framing gives the same
  depth) [added optics].
- **Skydome:** when the steel reflects the environment, dome resolution at the HDRI width
  (`dome_resolution_check`); a near-black dome at 1k is fine.
- **The focal point is the dial or the logo, not the brightest reflection.** `eye_path` must peak on
  the subject; a hot highlight on a lug that steals the eye is a note.
- **Dark surroundings, separated subject:** the slate darker than the watch and falling off toward
  the frame edges (vignette the lighting), the background never pure black unless intended (a low
  dome, ARV-L 00:11:53); the watch's shadow side still separated from the slate (separation d').
- **Glass reads as glass:** the crystal shows a controlled reflection and lets the dial through; if
  a big softbox floods the crystal the dial disappears (move or flag it) [added]. Crystal and
  leather sampling belong to scenario-maya-lookdev's notes; transmission depth covers the interfaces
  (settings_lint).
- **Grounding:** contact shadow under the case and strap; no floating [ARV-C 00:50:54].
- **Finish:** subtle black lift, light vignette, bloom on specular hits only if the brief wants it;
  the denoiser must not erase brushing or dial texture (`detail_loss` against a high-sample crop,
  below about 0.8 means detail loss [added]).

## C. Character close-up

- Key upstage from the face axis (scene check `key_upstage` must pass); no wrap within 30 degrees of
  the lens axis (`fill_lens_axis`); wrap area at least twice the key's (`rig_plan_checks`).
- Five portrait rules: no harsh shadow, no flat light, no black areas (`face_black`), one shadow
  direction, face not cut in half (BR-B ch8.5 Introduction).
- Eye highlight present unless the character is dead or defeated; sharp for anger, bigger and dimmer
  for thinking; it comes from the set lights, not a dedicated eye light in production (BR-B ch8.5
  Eyes lighting).
- Skin: key-side specular, SSS present but not glowing on an ear opposite the key (TZ-C 00:06:26,
  00:07:31).

## D. Render engineering

| Area        | Pass condition                                                                                                                                                                                                    | Code                                                                                               | Source                                                     |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Noise       | beauty relative noise at or below the brief's target after the loop; no AOV raised past its limit without a reason; fireflies handled by the playbook, not by samples                                             | `noise_pair`, `noise_loop` history, `FIREFLY_PLAYBOOK`                                             | SMP § Removing Noise; ARV-T 00:03:38                       |
| Rays        | rays per pixel stated; AA raised implies secondaries lowered; GLS 4 or fewer on CPU; adaptive only with AA >= 2 and Max AA > AA, off in previews                                                                  | `rays_per_pixel`, `settings_lint`                                                                  | SMP § Camera (AA), § Global Light Sampling                 |
| Ray depth   | diffuse 1 to 2 for products and exteriors, 3 to 4 interiors; specular <= 2 unless glass or inter-reflecting metal; transmission >= interfaces                                                                     | `settings_lint`                                                                                    | ARV-T 00:05:59; SMP § Ray Depth                            |
| Denoiser    | OIDN first in the chain on macOS; off for noise measurement; detail kept; it forces a box filter and works on full frames, so detail crops come from a full denoised frame and the reference uses a box filter    | `set_denoiser`, `render_settings_report` (`denoiser_box_filter`, `denoiser_region`), `detail_loss` | AOV § Imager Denoiser OIDN, Note                           |
| Device      | CPU on macOS (no Arnold GPU, no OptiX)                                                                                                                                                                            | `settings_lint` (`gpu_on_macos` fails)                                                             | LGT § Can I use Arnold GPU on macOS?                       |
| Textures    | .tx pre-baked; batch with auto-TX off and use-existing on                                                                                                                                                         | `settings_lint` (`autotx_on`, `use_existing_tx_off`); scenario-maya-lookdev lint `no_tx`           | ARV-T 00:14:13, 00:14:44                                   |
| Passes      | light groups <= 16, names consistent, every light grouped; groups + default sum to beauty; additive set sums; no empty requested AOV                                                                              | `group_contract`, `check_sums`                                                                     | SARK 00:07:19; AOV § Composing the Beauty AOV; BR 00:59:41 |
| EXR         | single-part, merged, Preserve Layer Name, half for color, float Z/P/N, zip, scanline                                                                                                                              | `setup_exr_driver`, `exr_info`                                                                     | AOV § EXR; BRJ-CM Ch.1 Format                              |
| Color       | CM on; ACEScg (or the studio's linear space); tone-mapping view for judgment; output transform off for EXR; dome HDRI linear Rec.709 not Raw under ACEScg; texture spaces pass scenario-maya-lookdev's lint       | `cm_audit`, `cm_audit_scene`, `scene_checks` (`hdri_raw`)                                          | CM; BRJ-CM Ch.1                                            |
| Calibration | a 0.18 card under a unit dome reads 0.18 in the EXR; the PNG is tone mapped (classify_view 'aces_like')                                                                                                           | `job_color_setup_batch.py`                                                                         | MLC 00:02:13                                               |
| Budget      | test time extrapolated (pixels x AA^2 for fixed sampling), one full frame re-timed before a sequence; time sinks checked before cutting samples                                                                   | `extrapolate_time`, `sequence_budget`, `TIME_SINKS`                                                | ARV-T; Arnold digest P9                                    |
| Batch       | scene saved before rendering; exit code 0 and the expected files on disk; license checked before a long batch; finals abort on a license failure instead of watermarking (a watermark also skews `analyze_frame`) | `render_cmd`, `render_env(final=True)`, `licence_check_cmd`, `kick_cmd(final=True)`                | LGT § Batch Rendering, § Useful Commands; WN25             |

## E. Severity

- **fail**: the delivery is wrong or misleading (subject clipped, passes do not sum, NaN, output
  transform baked into EXR, key downstage when the brief asks for a face read, transmission depth
  below the interfaces).
- **warn**: a lead would give a note (eye pulled away, dark on dark, no dominant light, crushed
  blacks, a lone hue).
- **info**: context to read (warm/cool, brightest pixel, "key not top" under Brejon's definition). A
  verdict passes with warnings only when each warning is answered in the report (fixed, or kept on
  purpose with the reason: "areas left dark on purpose", BR 00:42:13).
