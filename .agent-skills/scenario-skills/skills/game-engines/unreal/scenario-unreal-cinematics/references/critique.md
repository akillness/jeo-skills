# Critique rubric (the agent judges its own cinematic)

Judge in this order, at each gate. Every line names the code check that measures it (ue_cine unless
stated) and the visual question that the number cannot answer. Severity: **fail** blocks the next
stage; **warn** needs a fix or a written answer in the plan or report; **info** is recorded. Never
approve a frame on sight alone: in Epic's MCP talk an agent approved an all-white frame
(scenario-unreal-expert, ue_review). Numbers first, then look.

## 1. The plan (before building)

| Question                                                                                | Code                                                        | Severity                                       | Visual / judgment                                                                   |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------- |
| Does the cut fit the brief (duration, shot count)?                                      | `check_lengths`: lengths.total, lengths.count               | fail                                           | does the rhythm vary (long establishing, short inserts)?                            |
| Does each lens suit its shot size, and does the camera distance give that size?         | `check_lenses`, `check_framing`                             | warn                                           | is the lens a choice (tight, claustrophobic long lens; JT [00:13:38]) or a default? |
| Do A and B keep their screen sides?                                                     | `check_180`                                                 | fail on a cut across the line                  | is a stated crossing motivated?                                                     |
| Does movement keep its screen direction?                                                | `check_screen_direction`                                    | warn                                           |                                                                                     |
| Are two consecutive same-size shots at least 30 degrees apart?                          | `check_jump_cuts`                                           | warn                                           | intentional jump cut? say so                                                        |
| Is focus planned wherever f/5.6 or wider?                                               | `check_dof`: dof.no_focus                                   | fail                                           | where must the eye go: the near eye in a close-up                                   |
| Does the depth of field hold the subject?                                               | `check_dof`: dof.thin                                       | warn                                           |                                                                                     |
| Is Accumulation DOF limited to DOF-centric shots?                                       | dof.accumulation                                            | warn                                           |                                                                                     |
| Do simulated characters in motion have pre-roll?                                        | `check_preroll`                                             | fail                                           |                                                                                     |
| Do aperture changes keep exposure under physical camera exposure?                       | `check_exposure`                                            | warn                                           |                                                                                     |
| Does the plan follow the project's production record (rate, start frame, bias, naming)? | `check_production`                                          | fail (rate, start); warn (naming)              | was the record set once and versioned (SI [00:15:22])?                              |
| Is the cast affordable and wired?                                                       | `check_characters`: character.joints, character.leader_pose | warn                                           | faces through materials and blend shapes, not joints (GLITCH [00:09:17])            |
| Do stingers land on cuts?                                                               | `check_music_sync`: timing.stinger                          | warn                                           | does the cut breathe with the music (JT [00:04:55])?                                |
| Can lighting be locked by a few masters?                                                | `check_lighting`: lighting.masters, lighting.scope          | info; warn when every shot is its own scenario | is each master a signature look?                                                    |
| Long lenses                                                                             | `check_lenses`: lens.lod                                    | info                                           | Use Field of View for LOD on (cam doc)                                              |

## 2. The build

| Question                                                  | Code                                                                                                       | Severity                                                                                                                 |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Production rate and start frame everywhere                | `audit_sequence`: seq.rate (fail), seq.start (warn)                                                        |                                                                                                                          |
| Shots contiguous, each shot's length equal to its section | edit.contiguous (overlap fail, gap warn), edit.length (fail)                                               |                                                                                                                          |
| Camera cut covers the shot and its pre-roll               | cam.cut, warmup.preroll                                                                                    | fail                                                                                                                     |
| Camera is the shot's spawnable                            | cam.spawnable                                                                                              | warn                                                                                                                     |
| Every possessable resolves in the target map              | bind.unresolved                                                                                            | fail                                                                                                                     |
| Default hierarchical bias (unless top-down production)    | seq.bias                                                                                                   | warn                                                                                                                     |
| Animation sections start before the shot                  | warmup.section (warn), warmup.anim (fail on simulated shots)                                               |                                                                                                                          |
| What does the cinematic need from the level?              | `empty_level_test`                                                                                         | cameras or characters listed = fail                                                                                      |
| Soft failures in the build report                         | `report["soft"]`                                                                                           | each one is a name to fix after the probe                                                                                |
| Set pieces animated as possessables                       | bind.override                                                                                              | info: answer it (keyed in every shot that needs it, or spawnable); it snaps back after its shot (yOcgYMcxr3Q [00:10:34]) |
| Hidden actors stay hidden                                 | visual: Levels panel or Level Visibility track, never the Outliner eye (not saved, yOcgYMcxr3Q [00:02:23]) |                                                                                                                          |

## 3. The board (first, middle, last frame per shot)

Measured: `ue_review.image_checks` per PNG (all_white, all_black, clipped, crushed); `board.json`
"written" true for every frame, including the isolated pre-roll frames (`preroll=True`). Gate:
`ready_to_animate` (fail without audio or without `timing_locked`; repeats stinger offsets). Look at
the sheet, shot by shot:

- Composition: horizon level unless motivated, headroom, lead room in the direction of the look or
  move, the subject where the eye lands first.
- Lens reads as intended (a wide establishing, a compressed close-up); no wide-angle distortion on a
  face unless chosen.
- Continuity: eyelines match across the cut; screen sides and direction as in the plan.
- The cut plays with the music: stingers on cuts, lengths feel right (JT [00:04:55]). If not, retime
  now, before animating.
- Pre-roll frames (read from the shot alone): the character already in motion, cloth and hair
  already moving, never the previous shot.

## 4. Performance and camera

- Keyed focus distance equals the subject distance on keyed frames (compare `shot_geometry` focus
  with the Manual Focus Distance keys).
- No pops at animation section boundaries or constraint switches (compensate keys; cons doc).
- Camera moves eased, reframes on an offset layer, shake weighted per moment (E7C1xbpEA_Q [00:05:03]
  [00:06:21]).
- Stepped (on twos) parts have motion blur disabled (Glitch [00:14:20]).

## 4b. Lighting

| Question                                                                                                                                                               | Code                                                                                                | Severity                                |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Is every lighting scenario's master approved before per-shot lighting?                                                                                                 | `ready_for_final_lighting`: lighting.unapproved                                                     | fail (GLITCH [00:29:23])                |
| Only the masters rendered for approval?                                                                                                                                | `render_jobs(plan, only=[masters])`                                                                 |                                         |
| Lit through the grade's view?                                                                                                                                          | visual: viewport Lit > OCIO Display on, same config as the grade (`color_handoff(...)["viewport"]`) | warn if not (WF 2Q3CybANHKE [00:10:28]) |
| A shot slow in the viewport or in draft renders?                                                                                                                       | `stat unit`, `stat gpu`; MRG Debug Settings Insights trace; to scenario-unreal-performance          | info                                    |
| Final shots are judged against their approved master (GLITCH [00:32:05]); lighting is graded A+ to B by distance from the master to allocate time (GLITCH [00:31:32]). |

## 5. Render settings (before any final render)

`graph_snapshot` into `normalize_graph_snapshot` into `audit_render_settings`:

| Rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Check id                                      | Severity |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | -------- |
| Temporal and spatial not mixed on the deferred path                                                                                                                                                                                                                                                                                                                                                                                                                                          | samples.mixed                                 | fail     |
| Parity matches shutter timing                                                                                                                                                                                                                                                                                                                                                                                                                                                                | samples.parity                                | warn     |
| AA None above 8 samples, or a written reason                                                                                                                                                                                                                                                                                                                                                                                                                                                 | aa.method                                     | warn     |
| Graded delivery: EXR, 16-bit or more, tone curve off (or OCIO to a working space)                                                                                                                                                                                                                                                                                                                                                                                                            | output.format, output.depth, color.tone_curve | fail     |
| Camera-cut warm-up has a pre-roll to evaluate                                                                                                                                                                                                                                                                                                                                                                                                                                                | warmup.cut                                    | fail     |
| Sections extended when temporal samples exceed 1                                                                                                                                                                                                                                                                                                                                                                                                                                             | warmup.section                                | warn     |
| Use LODZero in foliage shots                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | overrides.lod0                                | warn     |
| Every console variable has a reason                                                                                                                                                                                                                                                                                                                                                                                                                                                          | cvars.reason                                  | warn     |
| Path-traced sequences: 1 spatial, temporal with Reference Motion Blur                                                                                                                                                                                                                                                                                                                                                                                                                        | pt.samples, pt.refmb                          | warn     |
| Also: exposed variables present for every value `render_jobs` sends (`queue_render_jobs` lists missing ones); jobs point at the active takes (`active_shot_paths`); the Execute Script node uses `CineWrittenFiles` in Editor Only mode, Flush Disk Writes Per Shot off unless a per-shot hook needs it; `render_orchestration`: one job per shot (render.duplicate fail), an unattended multi-shot local queue warns (GLITCH [00:40:14]); command-line renders carry `-notexturestreaming`. |

## 6. Frames on disk

| Question                                                               | Code                                            | Severity                                                                                                                        |
| ---------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Every frame present, none extra, none empty (exclusive end)            | `check_render_output`                           | missing, empty: fail; extra: warn                                                                                               |
| Resolution, half float, compression, metadata                          | `exr_checks`                                    | resolution fail; others warn                                                                                                    |
| No NaN, Inf or black frames                                            | exr.nan, exr.black                              | fail                                                                                                                            |
| Linear output really linear                                            | exr.linear (no value above 1.0)                 | warn                                                                                                                            |
| First frames settled                                                   | `first_frame_pop` on frames 0 to 3 of each shot | pop = fail until explained                                                                                                      |
| No one-frame flash at cuts (master renders)                            | `cut_flash`                                     | fail                                                                                                                            |
| Exposure continuity                                                    | `luminance_continuity`                          | warn above 1 stop unless intended (a coarse screen: mean luminance also moves with framing; the masters are the real reference) |
| Did the render report every frame, and is every reported file on disk? | `check_manifest` on `latest_manifests(...)`     | manifest.missing, manifest.gone: fail                                                                                           |
| What must be re-rendered after a crash?                                | `shots_to_render`                               | whole shots, into a new version folder                                                                                          |

## 7. The look (visual, after the numbers)

- First frames of every shot: particles already active, cloth settled, no temporal sparkles (tips
  doc).
- Every cut: the right shot on the first frame, no flash of the previous one.
- DOF edges on hair, fences and foreground occluders at 100 percent (Accumulation DOF where it
  fails).
- Motion blur on the fastest action: smooth arcs, no stepping (raise temporal samples; Blur
  [00:40:05]); ghost trails on particles (double frame rate trick; Faucher fVg5ihB8Wdc [00:07:59]).
- Lighting and color against the approved master shots (Glitch [00:32:05]), through the same OCIO
  view as the grade; one stop darker than the default viewport is expected for linear output
  (Faucher [00:09:39]).
- The review movie with sound, start to end, before calling it done.

## 7b. Delivery

- `delivery_note` written: rate, EDL, per-shot files and frames (end exclusive), and the Resolve
  interpretation of the render mode (tone curve on: sRGB (Linear) to sRGB Texture; off: Linear sRGB
  to sRGB; ACEScg: ACEScg to sRGB; WF 2Q3CybANHKE [00:08:30] [00:09:05]). Missing: fail, the
  colorist sees dark frames with odd colors (WF [00:07:24]).

## Common mistakes (moved from SKILL.md in v0.2)

| Mistake                                       | What it looks like         | Fix                                                                                      |
| --------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------- |
| Internet cvar lists, LOD0 override in foliage | flicker, no foliage at all | zero cvars by default; raise foliage LOD distance instead (cvars.reason, overrides.lod0) |
| Rendering the plan's shot names after a take  | old take rendered          | `active_shot_paths(master, plan)`                                                        |
| Opening the aperture under physical exposure  | shot 3 to 4 stops brighter | ISO compensation (`exposure_iso`) or the 5.7 camera exposure setting                     |
| Accumulation DOF everywhere                   | render time multiplied     | DOF-centric shots only (dof.accumulation)                                                |

## 8. Notes and rounds

Classify each note technical or creative; fix technical ones without a creative round; at most three
creative rounds, then a live session in the engine (Glitch [00:32:37] [00:33:40]). "It's not done
until the director says it's done" [00:32:37]. Every fix renders into a new version folder.

## Report

Write a JSON report with: plan hash and summary, build report (assets, soft failures), audit
findings, board manifest and image checks, render settings audit, frame checks per shot, luminance
continuity, the list of what was only looked at and not measured, and what is not verified (every
[verify] call used). Report reality: if a check was skipped (no ffmpeg, no graph), say so.
