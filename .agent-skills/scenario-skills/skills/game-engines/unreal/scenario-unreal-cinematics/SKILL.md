---
name: scenario-unreal-cinematics
description: 'Use when making a trailer, cutscene, cinematic or short film in Unreal Engine 5.8 with Sequencer: shot lists, master and shot sequences, cameras, lenses, depth of field, camera cuts, spawnables, character animation in shots, per-shot lighting, Movie Render Graph or Movie Render Queue EXR renders, "render darker than the viewport", "first frames pop", "last frame missing", ACES or OCIO to DaVinci Resolve, the 180-degree rule, Sequencer Python, or reviewing a cut.'
license: MIT
---

# Cinematics in Unreal Engine 5.8 (Sequencer and Movie Render Graph)

Expert level here means the cut is checked as data before anything is built and a render is judged
on its files and frames, not the viewport. The core stance: plan offline, build in one transaction,
lock timing against the music before animating, light from approved masters, render per shot through
one template graph, hand linear EXRs, an edit and a color note to the grade. If a sibling skill
named here is missing from your available skills, load it with `skill_get` (Scenario MCP) or ask the
user to install it (https://github.com/scenario-labs/skills#install); unattended, proceed from tool
schemas and flag the gap.

**REQUIRED BACKGROUND:** scenario-unreal-expert (channels, review loop, 5.8 traps).

**Status (2026-09-24):** [`scripts/ue_cine.py`](scripts/ue_cine.py) and
[`scripts/cine_render_callbacks.py`](scripts/cine_render_callbacks.py) are **not yet run in
Unreal**; offline tests pass (counts: [`references/sources.md`](references/sources.md)). In the
engine, run `tests/code/unreal-cinematics/job_00_probe_cine.py` first.

## Stance (the expert delta)

- **The master is an edit; shots own the content.** Cameras, characters and keys live in shots,
  per-discipline subsequences (lighting, FX) inside shots, so re-pacing moves sections, never
  animation (Sir Wade, ywtvn1uncZo [00:07:32]; Glitch, uzTo5vQchkk [00:35:24]). Per-shot things are
  spawnables, the set is possessable, so the cinematic plays in any level (yOcgYMcxr3Q [00:07:53]
  [00:13:50]); a possessable animated in one shot snaps back after it; Outliner visibility is not
  saved, Levels panel visibility is ([00:10:34] [00:02:23]). Duplicating a master shares its shots:
  "someone tweaks lighting, it changes seven shots" (Epic CAT, S4Iyzbl-oaE [00:41:34]); experiment
  with a New Take.
- **Structure is templated and scripted, never clicked together.** Display rate, start frame, bias,
  naming and folder template are set once in `DefaultEngine.ini` under revision control (S4Iyzbl-oaE
  [00:15:22] [00:21:52]); CAT 5.8 schemas nest and can give each shot its own level (VP 5SJA1FfRPWs
  [00:19:07] [00:20:44]). Every tool is one `ScopedEditorTransaction` around a `ScopedSlowTask`,
  because "long running Python codes, they look really similar to a frozen engine" (SPI, moQTQzAOFVA
  [00:16:16]).
- **Lock timing before animating.** Board with constant keys, music on its own track, stingers
  exactly on cuts; "you don't want to spend time working on frames that will never make it into the
  final film" (Toonen, mAMp6qCt7kc [00:15:04] [00:15:36] [00:04:55]). Retiming must carry intent:
  keys move with their shot, spanning subsequences are chopped and each half gets its own asset
  (moQTQzAOFVA [00:14:04] [00:24:19]).
- **Warm-up is three fixes, and end frames are exclusive.** Idle CPU simulation: Engine Warm Up
  Count above 30; temporal history: Render Warm Up; anything moving at frame one: animation and
  camera cut extended before the start with camera-cut warm-up, which evaluates the lead-in instead
  of holding frame one (tips doc; Comly/Hoffman, demystifying MRQ). A 0 to 50 range renders 0 to 49.
- **Samples buy motion blur and anti-aliasing, nothing else.** Noise goes back to its source
  (demystifying MRQ; Faucher, fVg5ihB8Wdc [00:09:15]). Temporal only, odd counts with Frame Center,
  or Blur's 24/48/64 with Frame Close (AAAhD5tEUBs [00:39:32]); AA None above 8 samples; zero
  console variables until a named shot problem needs one (fVg5ihB8Wdc [00:03:00]).
- **Grade outside from linear EXR, and say how to read it.** Tone curve off gives linear sRGB, about
  one stop darker than the viewport because UE's tone curve is "ACES flavored, but not a true ACES"
  (Faucher, 2Q3CybANHKE [00:04:31] [00:09:39]). Resolve's ACES Transform: tone curve on, sRGB
  (Linear) to sRGB Texture; off, Linear sRGB to sRGB; ACEScg (only for a vendor), ACEScg to sRGB
  ([00:08:30] [00:09:05]). Light and review through the viewport's OCIO Display set to that view
  ([00:10:28] [00:11:00]).
- **The shot is the render unit.** "The smallest unit of distributable work in Unreal Engine is a
  single camera cut" (MRQ command-line doc): one job per shot, one template graph, per-job variable
  overrides, never edits to the shared graph. Plain MRQ needs babysitting and a crash loses the
  shots, so unattended multi-shot renders go through a farm manager (Glitch [00:40:14]).
- **Lighting scales by process.** A temp camera light from day one; then one or two signature shots
  per lighting scenario, locked with the director; then per-shot `_LGT` subsequences derived from
  them, graded by distance from their master (Glitch [00:27:18] [00:28:51] [00:29:23] [00:31:32]
  [00:36:59]).

## Establish first

| Input                                         | Changes                              | Default when silent                                                                               |
| --------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Delivery: graded or direct                    | tone curve, format, OCIO, color note | graded: EXR 16-bit half, tone curve off                                                           |
| Production record (rate, start, bias, naming) | every sequence, EDL                  | the project's `DefaultEngine.ini`; else 24 fps, start 0 (SPI 101, CAT demo 1000: match editorial) |
| Duration, shots, music                        | layout, stingers                     | the brief; a temp track before boarding                                                           |
| Aspect and filmback                           | lens, framing                        | 16:9 Digital Film [verify mm]; 2.39 crop for scope                                                |
| Level and what exists                         | bindings                             | set possessable; cameras, characters, shot lights spawnable; master lighting in the level         |
| Cast                                          | pre-roll, cost                       | existing Animation Sequences; joints and meshes per character                                     |
| Motion per shot, shutter timing               | samples, pre-roll                    | Frame Center, odd counts                                                                          |
| Exposure                                      | continuity                           | Manual, physical camera, ISO compensates aperture changes                                         |
| Channel                                       | build, board, render                 | live editor (MCP, PythonRemote) for boards; `ue_run` or the command line for finals               |

## Workflow

`import ue_cine as C` (skill `scripts/`, with scenario-unreal-expert's `scripts/` on the path). Full
code: [`references/procedures.md`](references/procedures.md).

1. **Scaffold (once per project).** Production defaults recorded once (CAT Production Setup or
   Project Settings) and copied into `plan["production"]`; folder template, shots in steps of 10;
   with CAT 5.8, shot schemas holding the `_LGT` schema, a level per shot when shots need unique set
   states (P2). Check the MCP SequencerTools toolset first [verify]. GATE:
   `C.check_production(plan)` no fail; `audit_sequence` seq.rate and seq.start.
2. **Plan the cut as data (python3).** Shots, sizes, lenses, camera and subject positions, motion,
   flags, cast (joints, meshes), stingers, lighting scenarios. `C.check_plan(plan)`: length, lenses,
   framing, 180-degree line, screen direction, jump cuts, DOF, pre-roll, exposure, cast, stingers,
   lighting groups (P1). GATE: no fail; every warn fixed or answered in the plan.
3. **Build in one transaction (editor).** `C.build_from_plan(plan)`: master with Shots and music, a
   spawnable Cine Camera per shot (lens keyed, Use Field of View for LOD on), camera cut from
   pre-roll to the exclusive end, pre-rolled performers, `<shot>_LGT` with the temp light (P3);
   never overwrites. GATE: `C.audit_sequence` no fail, `bind.override` answered;
   `C.empty_level_test` lists only set pieces.
4. **Board and lock the cut (latent editor).** `C.board_generator(..., preroll=True)`: first,
   middle, last frame per shot plus each shot's first pre-roll frame read in isolation (GUI:
   Evaluate Sub Sequences In Isolation); `ue_review.image_checks`, contact sheet (P4). Retime
   (`C.retime_shot`), takes (`C.new_take`), own tools inside `C.editor_tool` (P5). GATE: no
   all-white or all-black frame, the sheet and the cut with music judged, `C.ready_to_animate(plan)`
   passes.
5. **Performance and camera polish.** Rack focus as keyed Manual Focus Distance (P6), camera moves
   as base plus offset plus shake layers (P7); Accumulation DOF only on DOF-centric shots. GATE:
   re-board; keyed focus equals subject distance; no pop at section boundaries.
6. **Lighting (with scenario-unreal-lighting-rendering).** Temp light renders unblock everyone;
   `C.lighting_masters(plan)`, render only those (`render_jobs(plan, only=...)`), director approval
   into `plan["lighting_approved"]`; then per-shot rim and kick lights in `_LGT`, lit through the
   viewport OCIO Display (P7b). GATE: `C.ready_for_final_lighting(plan)`; luminance continuity and
   approval against the masters; `stat unit` or an Insights trace if a shot is slow.
7. **Draft render and review.** The review graph or the 5.8 Basic config; `C.review_movie_cmd` with
   the music (P10). GATE: `C.check_render_output`, `C.first_frame_pop`, `C.cut_flash`, then watch it
   with sound.
8. **Final EXR.** Template graph per P8 with the `CineWrittenFiles` Execute Script (Editor Only);
   `C.audit_render_settings(C.normalize_graph_snapshot(C.graph_snapshot(graph)))`;
   `C.render_jobs(plan, sequences=C.active_shot_paths(master, plan))`, `C.render_orchestration`,
   then `C.render_generator` (executor held globally) or `C.mrq_command_line` per shot (always
   `-notexturestreaming`) (P9). GATE: settings audit pass; `C.check_manifest`, `C.exr_checks` per
   sampled frame; after a crash, re-render `C.shots_to_render(...)` whole.
9. **Deliver.** EXRs per shot, `C.edl(plan)`, review MP4, `C.delivery_note(plan, settings)` (Resolve
   interpretation), JSON reports; notes split technical or creative, three creative rounds, then a
   live session (Glitch [00:32:37] [00:33:40]) (P11).

## Numbers

| Item                       | Value                                                                                                                                     | Relative to, source                                                  |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Hierarchical bias          | root 0, +100 per level, equal values blend                                                                                                | shots doc                                                            |
| Pre-roll                   | 24 to 48 frames on cloth, hair, particles in motion                                                                                       | digest; tips doc                                                     |
| Engine Warm Up, idle cloth | more than 30 frames                                                                                                                       | tips doc                                                             |
| Temporal samples           | Frame Close: 24 base (95% of Blur's shots), 48 fast, 64 very fast; Frame Center: odd (15, 25, 49, 65; Faucher: 15 to 31 covers 95 to 98%) | AAAhD5tEUBs [00:39:32] [00:40:05]; fVg5ihB8Wdc [00:06:01] [00:10:58] |
| AA method                  | None above 8 total samples                                                                                                                | MRG image quality doc                                                |
| Warm-up sampling           | only the last 5 warm-up frames are sampled                                                                                                | 5.6 and 5.8 notes                                                    |
| Linear vs viewport         | about 1 stop darker                                                                                                                       | 2Q3CybANHKE [00:09:39]                                               |
| Review MP4 video bitrate   | fps x 2 x 1000 kb/s (48,000 at 24 fps)                                                                                                    | 2Q3CybANHKE [00:22:54]                                               |
| Characters                 | under 200 joints                                                                                                                          | Glitch [00:05:33]                                                    |
| Master lighting            | 10 to 13 per 400-shot episode, 1 to 2 days each                                                                                           | Glitch [00:28:51]                                                    |

## Quality gates

- **Measurable:** `check_plan`, `ready_to_animate`, `ready_for_final_lighting` and `audit_sequence`
  without fail; `audit_render_settings` without fail or unanswered warn; frame counts with exclusive
  ends (`check_render_output`, `check_manifest`); EXR half, no NaN or Inf, not black, values above
  1.0 in bright shots when linear, metadata present; `first_frame_pop` and `cut_flash` false;
  luminance jumps only where intended.
- **Visual:** contact sheets, isolated pre-roll frames, first frames, every cut, DOF edges on hair
  and occluders, fastest motion blur, lighting against the masters through the grade's OCIO view,
  the cut with music.

## Common mistakes

| Mistake                                                    | What it looks like                    | Fix                                                                     |
| ---------------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------- |
| Duplicating the master to experiment                       | a change leaks into the "backup"      | New Take (`new_take`) inside the shot                                   |
| Characters and cameras possessable                         | breaks in another map                 | spawnables; `empty_level_test`                                          |
| Animating a set piece as a possessable                     | it snaps back after its shot          | key it where needed, or spawnable (`bind.override`)                     |
| Hiding actors with the Outliner eye                        | back after reopening                  | Levels panel or a Level Visibility track                                |
| Several skeletal meshes, one animation track               | parts do not follow                   | Set Leader Pose Component (`check_characters`)                          |
| Long Python tool, no progress                              | "frozen" editor killed mid-write      | `editor_tool`                                                           |
| Animating before timing is locked                          | work on frames that get cut           | board, stingers on cuts, `ready_to_animate`                             |
| Engine Warm Up for a running character                     | cloth snaps at frame one              | pre-roll plus camera-cut warm-up                                        |
| Expecting the last frame                                   | "missing" frame 50 of 0 to 50         | end is exclusive; count `end - start`                                   |
| Raising samples for noise                                  | time up, noise unchanged              | fix the light or post-process setting                                   |
| Even samples with Frame Center, mixed temporal and spatial | stepping, waste                       | odd temporal only (or 24 with Frame Close)                              |
| Lighting shot by shot, no masters                          | late creative changes                 | approved masters first                                                  |
| Lighting in the default viewport, rendering linear         | look shifts a stop                    | viewport OCIO Display                                                   |
| Linear EXRs sent with no interpretation                    | dark, odd colors in Resolve           | `delivery_note`                                                         |
| Editing the shared graph per shot                          | every job changes                     | exposed variables per job                                               |
| Overnight local queue, or a local executor                 | a crash loses the queue; render stops | farm manager or one process per shot; `shots_to_render`; `start_render` |
| Headless render without `-notexturestreaming`              | soft first frames                     | `mrq_command_line`                                                      |

## Handoffs

- **Receives** from scenario-unreal-lighting-rendering: the lit level (sky, fog, key, unbound PPV,
  exposure policy, master lighting as a sub-level or data layer), noise fixed at the source, lit
  masters for approval. From scenario-unreal-animation: Animation Sequences with lengths and rate,
  characters under 200 joints with Set Leader Pose Component on multi-mesh Blueprints, cloth or
  physics flags. From scenario-unreal-vfx: Niagara systems with user parameters and warm-up needs.
  From scenario-unreal-world-building: the map and its set pieces.
- **Delivers** to the editor and colorist: EXRs per shot
  (`{sequence_name}/{sequence_name}.####.exr`, linear, half, metadata), `<prod>.edl`, the delivery
  note, the review MP4, contact sheets, JSON reports, the master. To
  scenario-unreal-lighting-rendering: shots failing continuity or noise, with frames. Farm commands
  to scenario-unreal-pipeline-automation; slow shots to scenario-unreal-performance.

## UE 5.8 notes

- MRG is Production Ready, new features graph-only, the queue opens in a Basic config; new: Light
  Modifier, layer warm-ups, DWAA/DWAB EXR, Accumulation DOF (experimental plugin) (5.8 notes; VP
  [00:33:35]).
- In MRG, Game Overrides act only while connected; tone curve on the renderer node, OCIO on the
  output node; the Execute Script node needs Editor Only mode for Python (transition doc; 5.8
  notes).
- Spawnables are custom bindings; create them with
  `LevelSequenceEditorSubsystem.add_spawnable_from_class`; no `add_master_track`; time functions
  take `MovieSceneTimeUnit` (seq-py doc; version deltas).
- Playback honors the selection range; Sensor Aspect Ratio is not animatable; Take Recorder and VCam
  accept spawnables; Sandboxes for experiments.
- OpenColorIO 2.5.1 with ACES 2.0: view names may differ from "ACES 1.0 SDR Video" [verify].
- Mac: the MRG H.264 node is Windows only (encode with ffmpeg); ProRes on Mac is conflicting
  [verify]; path tracing needs macOS 26.4+.

## References

- `references/procedures.md`: P0 to P11, full code, plan fields, the template graph spec (P8). Load
  before writing Sequencer or render code.
- [`references/expert-notes.md`](references/expert-notes.md): judgment per expert, timestamps,
  deciding conditions.
- [`references/critique.md`](references/critique.md): the rubric, mapped to code checks.
- [`references/gui-paths.md`](references/gui-paths.md): menus and settings for the same procedures.
- `references/sources.md`: sources, credentials, URLs, timestamps; revision history.
- `scripts/ue_cine.py` (toolkit; its docstring lists every call) and
  `scripts/cine_render_callbacks.py` (the Execute Script class).
