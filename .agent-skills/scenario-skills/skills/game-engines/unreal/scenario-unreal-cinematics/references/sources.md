# Sources

Distilled notes live in `notes/sequencer/`, `notes/cinematography/`, `notes/virtual-production/`
(digest: `notes/sequencer/_digest_cinematics_sequencer.md`) and, for the render side,
`notes/rendering/` (digest: `_digest_rendering_mrg_pathtracer_post.md`). Version facts:
`sources/unreal-version-deltas.md`. Credentials marked "verified" were checked against official
session descriptions or Epic staff pages by the research agents; others are self-described.

## Talks and videos

| Code   | Source                                                                                                | Expert and credential                                                                                                                                | URL                                         | Best for                                                                                                                          | Best timestamps                                                                                    |
| ------ | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| SI     | "Shoot Your Shot: Cinematic Pipeline Dating Advice", Unreal Fest Orlando 2025 (UE 5.6, 5.7 previewed) | Thomas Kilkenny (Senior Technical Product Manager, shot and cinematic pipeline) and Jeff Douglas (tools programmer, wrote CAT), Epic Games; verified | https://www.youtube.com/watch?v=S4Iyzbl-oaE | production defaults, naming tokens, folder templates, CAT schemas and assemblies, shared-subsequence trap                         | 00:15:22, 00:17:30, 00:21:52, 00:24:31, 00:27:13, 00:33:13, 00:35:42, 00:41:34                     |
| SPI    | "Automate and Expand Sequencer's Functionality with Python", Unreal Fest Orlando 2025                 | Daniel Orozco Garcia, real-time pipeline TD, Sony Pictures Imageworks (KPop Demon Hunters layout tools); verified                                    | https://www.youtube.com/watch?v=moQTQzAOFVA | retime with intent, chop and split, undo and progress, portable binding IDs, channel writes                                       | 00:05:52, 00:14:04, 00:16:16, 00:19:36, 00:24:19, 00:28:28, 00:33:37                               |
| BLUR   | "Crafting an Episode for Secret Level with Unreal Engine", Unreal Fest Seattle 2024 (UE 5.0 to 5.3)   | Blur Studio production team (creative, UE tech, rigging, animation, CG supervisors); verified                                                        | https://www.youtube.com/watch?v=AAAhD5tEUBs | temporal sample baseline (24/48/64, Frame Close), plugin structure, pass system lessons, character cost                           | 00:06:35, 00:12:01, 00:31:09, 00:34:25, 00:34:58, 00:39:32, 00:40:05                               |
| GLITCH | "Learnings from The Amazing Digital Circus and Murder Drones", Unreal Fest Gold Coast 2024            | Glitch Productions: Mark Humphrey (lead rigger, TA), Armen Hawk (lighting and rendering lead); verified                                              | https://www.youtube.com/watch?v=uzTo5vQchkk | temp, master and final lighting, shot master structure, QA rounds, farm, joint budget                                             | 00:05:33, 00:14:20, 00:27:18, 00:28:51, 00:31:32, 00:32:37, 00:35:24, 00:36:59, 00:40:14           |
| SW-L   | "Level Management: Sub-Levels, Spawnables, Possessables in UE5" (UE 5.6, A-COM sample)                | Sir Wade Neistadt, animator and trainer, with Epic Games; verified official channel                                                                  | https://www.youtube.com/watch?v=yOcgYMcxr3Q | spawnable vs possessable policy, empty-level test, sub-level visibility                                                           | 00:02:23, 00:07:53, 00:10:34, 00:13:50                                                             |
| SW-P   | "Unreal Engine 5: Animation Cinematic Production Overview" (UE 5.6)                                   | Sir Wade Neistadt with Epic Games; verified                                                                                                          | https://www.youtube.com/watch?v=ywtvn1uncZo | the master as an edit, animatic sequence, duplicate before re-cutting                                                             | 00:02:34, 00:07:32, 00:08:05, 00:10:09                                                             |
| SW-C   | "Advanced UE5 Cinematic Workflow: Camera Rigs and Custom Viewports" (UE 5.6)                          | Sir Wade Neistadt with Epic Games; verified                                                                                                          | https://www.youtube.com/watch?v=E7C1xbpEA_Q | camera Control Rig, offset and shake layers, dual viewport                                                                        | 00:03:58, 00:05:03, 00:05:17, 00:06:21, 00:08:48                                                   |
| JT     | "Why Every Shot in Obsession was Storyboarded (in Unreal 5)"                                          | Josh Toonen, founder of Unreal for VFX (self-described decade of Hollywood VFX; unverified)                                                          | https://www.youtube.com/watch?v=mAMp6qCt7kc | boarding order, constant keys, lock timing with audio, real filmback and camera height                                            | 00:04:55, 00:09:44, 00:10:29, 00:11:35, 00:13:38, 00:15:04, 00:15:36                               |
| WF-C   | "The 2026 Unreal Engine to DaVinci Resolve Guide: ACES and sRGB"                                      | William Faucher, VFX artist and UE educator (self-described Epic ambassador; unverified)                                                             | https://www.youtube.com/watch?v=2Q3CybANHKE | tone curve off, OCIO only when needed, Resolve ACES Transform settings, one-stop difference, bitrate                              | 00:01:53, 00:02:27, 00:04:31, 00:08:30, 00:09:05, 00:09:39, 00:10:28, 00:22:54                     |
| WF-R   | "The 2025 Guide to Rendering in Unreal Engine 5" (legacy MRQ UI)                                      | William Faucher (credits Comly's article)                                                                                                            | https://www.youtube.com/watch?v=fVg5ihB8Wdc | no cvar cargo cult, temporal vs spatial, odd samples, AA None, ghosting fix                                                       | 00:03:00, 00:04:58, 00:06:01, 00:07:59, 00:09:15, 00:10:58                                         |
| SC     | "How to render layers using the new Unreal Engine Movie Render Graph" (UE 5.4)                        | Shaun Comly, Epic Games staff; verified                                                                                                              | https://www.youtube.com/watch?v=8o2yaZzfHCA | MRG model: render layer node, last-one-wins, holdouts, spawnables in collections, exposed variables, subgraphs                    | 00:04:00, 00:07:33, 00:10:48, 00:16:01, 00:21:56, 00:26:58, 00:28:03, 00:30:14                     |
| VP     | "State of Virtual Production", Unreal Fest Chicago 2026 (UE 5.8)                                      | Ryan Mayeda (Lead Technical Product Manager, VP) and Thomas Kilkenny, Epic Games; verified                                                           | https://www.youtube.com/watch?v=5SJA1FfRPWs | 5.8 status: MRG production ready, Basic config, Accumulation DOF, Light Modifier, CAT 5.8, Sandboxes, spawnables in Take Recorder | 00:19:07, 00:20:44, 00:22:47, 00:27:25, 00:33:35, 00:34:41, 00:36:19, 00:36:56, 00:38:35, 00:40:44 |

## Articles and official docs (Epic Developer Community, pages marked 5.8, retrieved 2026-09-24)

| Code         | Page                                                                                                                      | URL                                                                                                                              | Best for                                                                               |
| ------------ | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| dmrq         | "Demystifying Movie Render Queue", Shaun Comly with Matt Hoffman (MRQ developer), Epic staff tutorial, tagged 4.27 to 5.5 | https://dev.epicgames.com/community/learning/tutorials/GxdV/unreal-engine-demystifying-movie-render-queue                        | samples vs noise, warm-up internals, camera-cut warm-up, invisible game overrides      |
| seq-py       | Python Scripting in Sequencer + 5.8 API digests                                                                           | https://dev.epicgames.com/documentation/en-us/unreal-engine/python-scripting-in-sequencer-in-unreal-engine                       | object model, subsystem calls, portable binding IDs, deprecations                      |
| shots        | Sequences, Shots, and Takes                                                                                               | https://dev.epicgames.com/documentation/en-us/unreal-engine/sequences-shots-and-takes-in-unreal-engine                           | shot track rules, hierarchical bias, takes, time warp                                  |
| bind         | Spawnables, track rebinding, custom bindings                                                                              | https://dev.epicgames.com/documentation/en-us/unreal-engine/spawn-temporary-actors-in-unreal-engine-cinematics                   | binding types, Replaceable, Resolve to Player Pawn                                     |
| tips         | Cinematic Workflow Tips; Event Tracks                                                                                     | https://dev.epicgames.com/documentation/en-us/unreal-engine/cinematic-workflow-tips-for-sequencer-in-unreal-engine               | exclusive end frames, warm-up by cause, default tracks, ultrawide                      |
| mrq-cli      | Command Line Rendering; MRQ to MRG transition; Programming a Render in MRG; MRG Callback Scripts                          | https://dev.epicgames.com/documentation/en-us/unreal-engine/using-command-line-rendering-with-move-render-queue-in-unreal-engine | shot as render unit, command-line modes, variable overrides, callbacks                 |
| mrg          | Movie Render Pipeline; MRG Nodes; Cinematic Rendering Image Quality Settings                                              | https://dev.epicgames.com/documentation/en-us/unreal-engine/movie-render-graph-nodes-in-unreal-engine                            | node names, per-job vs per-layer, AA rule above 8 samples, LODZero foliage cap, tokens |
| cam          | Cinematic Cameras; Camera Rig Rail and Crane                                                                              | https://dev.epicgames.com/documentation/en-us/unreal-engine/cinematic-cameras-in-unreal-engine                                   | Cine Camera settings, spawnable camera button, rails and cranes                        |
| cons         | Animation Constraint Tools                                                                                                | https://dev.epicgames.com/documentation/en-us/unreal-engine/animation-constraint-tools-in-unreal-engine                          | constraints, compensation, bake                                                        |
| take         | Take Recorder                                                                                                             | https://dev.epicgames.com/documentation/en-us/unreal-engine/take-recorder-in-unreal-engine                                       | recording sources, slate, 5.8 spawnable support                                        |
| pt           | Path Tracer                                                                                                               | https://dev.epicgames.com/documentation/en-us/unreal-engine/path-tracer-in-unreal-engine                                         | path-traced sequences: 1 spatial, temporal with Reference Motion Blur                  |
| expo         | Exposure, post process and color                                                                                          | https://dev.epicgames.com/documentation/en-us/unreal-engine/auto-exposure-in-unreal-engine                                       | EV100 math, physical camera exposure (aperture drives exposure)                        |
| rn54 to rn58 | UE 5.4 to 5.8 release notes (excerpts in `sources/docs/versions__ue-5.x-release-notes.md`)                                | https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-engine-5-8-release-notes?application_version=5.8              | statuses and new features cited in "UE 5.8 notes"                                      |

## Added knowledge (no source; marked [added] in the skill)

- Lens and aperture ranges per shot size, framed-height classes, circle of confusion = diagonal /
  1500, thin-lens DOF, the 30-degree rule, the 180-degree bookkeeping (neutral shots and in-shot
  crossings reset the side), CMX 3600 EDL layout, the ACES-like preview curve (Narkowicz fit):
  standard cinematography and imaging practice.
- Toolkit conventions: `_LGT` naming, template variable names, the
  `{sequence_name}/{sequence_name}.####.exr` layout, keyed lens tracks on spawnable cameras, a temp
  light keyed on the camera transform instead of an attach track, anim offsets converted to tick
  resolution, master lighting kept in the level because per-shot renders skip master tracks.
- Found by the offline tests (2026-09-24): ffmpeg 8.0.1 decodes half EXRs as `gbrpf16le`; converting
  to `gbrpf32le` clamps values to 0..1 and hides NaN and Inf, so `exr_pixels` reads the native
  planes.
- Added in v0.2 (2026-09-24): the 85 mm "long lens" threshold for the Use Field of View for LOD
  reminder (start of the CU lens range); the longest shot as the proposed lighting master when none
  is marked; the `lighting.scope` rule (every shot its own scenario); the consequence that meshes
  the animation track is not bound to do not follow without a leader pose; the reason given for
  `-notexturestreaming` (every doc example carries the flag, the reason is not stated); the manifest
  file layout of `cine_render_callbacks.py`; the Level Visibility track for per-shot visibility.

## Revision history

- 2026-09-24 v0.1: first version (SKILL.md 2,349 words; offline 165 + fake-unreal 81 + procedure
  blocks 32 checks). Snapshot: `skills/_versions/unreal-cinematics v1 2026-09-24/` (with its tests
  in `_tests_code_unreal-cinematics/`).
- 2026-09-24 v0.2: refactor after the blind grade `tests/grading/U6_grade.md` ("missing from both"
  items). Added: Resolve interpretation per render mode and the viewport OCIO display
  (`color_handoff`, `delivery_note`, P11, stance); production record set once and versioned plus CAT
  5.8 nested schemas and a level per shot (`check_production`, P2); farm manager, global executor,
  resume after a crash (`render_orchestration`, `shots_to_render`, P9); possessable overrides
  snapping back and saved vs unsaved visibility (`audit_sequence` bind.override, P3, mistakes);
  master lighting method with approval gate (`lighting_masters`, `check_lighting`,
  `ready_for_final_lighting`, P7b); `ScopedSlowTask` with every transaction (`editor_tool`, retime);
  `-notexturestreaming` stated where the agent renders; pre-roll boarded in isolation
  (`board_generator(preroll=True)`); Set Leader Pose Component and the joint budget
  (`check_characters`); constant-key board, stingers on cuts and the timing lock
  (`check_music_sync`, `ready_to_animate`, P4 and P5); Use Field of View for LOD on long lenses
  (`lens.lod`, builder); Execute Script written-file callbacks in Editor Only mode and Flush Disk
  Writes Per Shot (`scripts/cine_render_callbacks.py`, `latest_manifests`, `check_manifest`, P8,
  P10); stat and Insights checks on slow shots (P7b, critique 4b). Paraphrases no longer shown as
  quotes; review bitrate labeled as the video bitrate; Faucher's 15 to 31 range cited next to the
  odd sample counts. SKILL.md 2,296 words (four mistake rows and three number rows moved to
  critique.md and procedures.md P1). Offline: 208 pure-layer checks, 98 fake-unreal checks, 41
  procedure-block checks, all passing; everything still not yet run in Unreal.
