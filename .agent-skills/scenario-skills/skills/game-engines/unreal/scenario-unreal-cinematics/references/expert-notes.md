# Expert notes: judgment by source

Principles and heuristics per expert, each with its timestamp or doc section. Marked [added] where
no source states it. Version status is checked against `sources/unreal-version-deltas.md`; where a
source predates 5.8 the translation is given.

## Epic, Cinematic Assembly Tools (Thomas Kilkenny, Jeff Douglas; S4Iyzbl-oaE, Unreal Fest 2025, UE 5.6 to 5.7)

- Managing shots by hand in the Content Browser is the failure mode; naming, folders and
  subsequences must be templated because they are "super super easy to mess up" [00:03:28]
  [00:04:00].
- One person sets production defaults once (display rate, start frame, hierarchical bias, asset
  names, folder template) and pushes them through `DefaultEngine.ini` under revision control
  [00:15:22]; "No one's going to decide that's a 30 fps show for some reason on one sequence and one
  sequence alone" [00:21:52].
- A shot is a pipeline entity with its level, parent scene, number and notes; "which level does this
  go with and why are my bindings broken" is a top complaint, so opening a shot should open its map
  [00:24:31].
- Hierarchical bias is a production decision: bottom up (default, the child wins) or top down
  (overrides from the parent scene across many shots) [00:17:30].
- Duplicating a complex sequence naively keeps shared subsequences linked: "You have one subsequence
  left, someone tweaks lighting, it changes seven shots" [00:41:34].
- Shot numbering in steps of 10 (1010, 1020) [00:33:32]; demo start frames 1000 and -48 [00:33:13]
  [00:18:02].
- CAT assets are Level Sequences to Sequencer, Take Recorder and MRQ [00:39:51]. Status:
  experimental in 5.6; 5.7 timeline templates; 5.8 nested schemas, full timeline templates with
  spawnables, a level per assembly (VP [00:19:07] [00:20:44]). Python metadata calls shown:
  `get_full_metadata_string()`, `get_metadata_as_integer`, `set_metadata_as_string` [00:37:26]
  [verify names in 5.8].

## Sony Pictures Imageworks (Daniel Orozco Garcia; moQTQzAOFVA, KPop Demon Hunters layout tools)

- Built-in edit tools move sections, not intent: keys animated for a shot must move with it, and a
  subsequence spanning several shots must be chopped per shot, or animation drifts from its camera
  [00:14:04] [00:19:36] [00:20:10].
- After a chop both halves share one asset; split it (duplicate and repoint) or edits leak
  [00:24:19] [00:24:53].
- Every tool is undoable and shows progress: "Long running Python codes, they look really similar to
  a frozen engine" [00:16:16].
- Shots start at frame 101 in their pipeline [00:05:52]; manual edits stop being viable around 50+
  shots per sequence [00:06:24].
- A layout camera in a spanning subsequence is bound into each shot's camera cut with a portable
  binding ID [00:28:28]; copy tracks by folder type with offset compensation, which Ctrl+C/Ctrl+V
  does not do [00:30:17].
- Writing Control Rig values straight into section channels is much faster than per-control library
  calls on long sequences [00:33:37].
- Small single-purpose functions composed into tools; options rather than one behavior; a tool
  touches only its target [00:21:50] [00:23:13] [00:39:11].

## Blur Studio (Secret Level episode; AAAhD5tEUBs, UE 5.0 to 5.3)

- 553 shots, 15 minutes, 56 artists, 3 TDs, no developers [00:03:48]; never modify engine source,
  extend through plugins [00:04:55].
- Plugin-per-entity and plugin-per-shot structure so disciplines cannot cross-reference [00:06:35]
  [00:07:43].
- Rigid parts as Nanite static meshes, skinning without correctives, to keep shot frame rates high
  [00:09:14] [00:12:01].
- Temporal samples 24 as the base because they render with Frame Close shutter timing (even count;
  23 or 25 if centered), 48 for fast motion, 64 for very fast; 24 covered 95% of shots [00:39:32]
  [00:40:05].
- Depth of field with hair forced a pass system and comp DOF on 5.3; their advice now: "Don't do
  your own render pass system, use Movie Render Graph" [00:34:25] [00:34:58].
- MRQ can fire Sequencer events at render start and restore the scene afterwards [00:31:09]; their
  WPO-collapse holdout trick is superseded by MRG holdouts [verify].
- Hardware and beta plugins caused up to 25 crashes a day per animator; five-minute single-feature
  training [00:25:01] [00:26:07].

## Glitch Productions (Amazing Digital Circus, Murder Drones; uzTo5vQchkk, UE5, Lumen)

- Lighting scale comes from process: temp lighting early, a few master shots that lock creative
  decisions, final lighting that propagates them [00:25:09] [00:29:23].
- Temp light: a spawnable spotlight parented to the camera, per sequence or shot, so every
  department renders from day one; unlit plus AO was tried and dropped [00:27:18] [00:27:49].
- Master lighting: signature scenarios only, 1 to 2 days each, 10 to 13 per 400-shot episode; "we've
  got 70 different lighting scenarios, this is definitely out of scope" [00:28:51].
- Final lighting graded A+ to B by distance from the master, which allocates time [00:31:32]
  [00:32:05].
- Structure: one shot master per sequence per map; subsequences for FX, lighting, environment, comp,
  hidden actors, crowd, audio; cvars and level visibility per sequence; a tool makes per-shot
  subsequences inside the discipline subsequences [00:35:24] [00:36:59].
- Three creative QA rounds, then workshop live in the engine with the director; technical fixes
  separate from creative notes [00:32:37] [00:33:40]; screenshots or GIFs for small notes, rendered
  media for directorial reviews [00:39:08].
- Deadline for Unreal: plain MRQ needs babysitting and a crash loses the queue [00:40:14] [verify
  5.8 support].
- Approving lighting shot by shot without masters brings late creative changes with "massive
  repercussions"; once masters are approved, agreement is a series of yeses and contradicting notes
  become an easy conversation [00:29:23] [00:29:56]. For a short piece the same method means one or
  two master shots (digest, Lighting per shot).
- A character split into several skeletal meshes (decal pupils with unique custom depth stencils) is
  driven by one animated mesh through Set Leader Pose Component in the construction script
  [00:18:13] [00:18:46].
- Toggle whole levels to find what costs frame time [00:37:33]; the 500+ joint pilot characters
  could not hold a 30 fps benchmark with more than a couple on screen [00:05:00].
- Characters under 200 joints (Epic's advice after a 500+ joint pilot) [00:05:33]; stepped animation
  plus motion blur looks wrong, so that part becomes its own mesh with motion blur off [00:14:20];
  stylized AO by re-enabling SSAO cvars per sequence [00:42:23] [cvar names not in the audio].

## Sir Wade Neistadt with Epic (A-COM sample; ywtvn1uncZo, yOcgYMcxr3Q, E7C1xbpEA_Q, UE 5.6)

- The master is "basically your video editing timeline"; data lives in shots [ywtvn1uncZo 00:07:32];
  "make a duplicate and then go crazy", but a duplicate edit still shares shots [00:10:09] (SI
  [00:41:34]).
- Characters and cameras spawnable, set possessable; a possessable override snaps back after its
  shot [yOcgYMcxr3Q 00:07:53] [00:10:34]; an object that exists in one shot should be a spawnable,
  not hidden elsewhere [00:11:46].
- Empty-level test: what still plays is spawnable, what is missing is a world dependency
  [yOcgYMcxr3Q 00:13:50].
- Outliner visibility is not saved, Levels panel visibility is [yOcgYMcxr3Q 00:02:23]; sub-levels
  split work by job [00:04:00] (World Partition equivalents: data layers, level instances [added]).
- Camera rigs: a Control Rig with a main mover, an offset control for reframing and weighted shake
  layers; never re-key the base to reframe; lower shake in slow moments [E7C1xbpEA_Q 00:05:03]
  [00:05:17] [00:06:21].
- Two viewports: the camera pane with cinematic control, a free pane without [E7C1xbpEA_Q 00:08:48].

## Josh Toonen (storyboarding "Obsession"; mAMp6qCt7kc)

- Board with characters and a perspective, nothing else [00:00:49]; each shot a pose and a camera
  [00:01:26].
- Constant keys (hotkey 5) so the board jumps between poses [00:15:04]; lock shot lengths with audio
  before animating [00:15:36]; music, dialogue and SFX as separate clips on their own tracks,
  stingers moved to start exactly on the cut [00:03:50] [00:04:55]; judge rhythm by scrubbing the
  master in camera-cut view with audio [00:04:23].
- Match the filmback to the real camera and measure camera height in an ortho view (200 cm = 2 m on
  set) [00:10:29] [00:11:35]; 24 mm to include the house; a longer lens feels tighter [00:10:29]
  [00:13:38].
- Tracking focus on a hidden target in the face keeps close-ups sharp [00:09:44].

## William Faucher (2Q3CybANHKE color to Resolve; fVg5ihB8Wdc rendering guide)

- Grade in Resolve from EXR, never JPEG or PNG [2Q3 00:00:32] [00:01:21]; tone curve is not the tone
  mapper [00:01:53].
- Tone curve off = linear sRGB, his recommendation; OCIO to ACEScg only when required [00:02:27]
  [00:04:31]; linear renders are about a stop darker because UE's tone curve is "ACES flavored"
  [00:09:39].
- Resolve ACES Transform: tone curve on, input sRGB (Linear) output sRGB Texture; tone curve off,
  input Linear sRGB output sRGB; ACEScg render, input ACEScg [00:08:30] [00:09:05]; EXRs read
  without it look dark with odd colors [00:07:24]; match the viewport with the OCIO display view
  (same config, source Linear sRGB, ACES SDR video view) and author the look that way, rendering
  with the tone curve off [00:10:28] [00:11:00]; the goal of grading is not to match the viewport
  [00:11:00].
- Delivery bitrate fps x 2 x 1000 kb/s [00:22:54]; "apply your edit and then divide everything by
  half" [00:17:30].
- No console variables unless you know why [fVg 00:03:00]; temporal or spatial, never mixed
  [00:04:58]; odd counts with Frame Center [00:06:01]; samples do not fix noise [00:09:15]; AA None
  with 9 to 15 temporal samples, 15 to 31 "gets the job done pretty well in 95 or 98% of situations"
  [00:10:58]; ghosting on particles: render at double frame rate with Motion Blur Amount 1.0 and
  drop every other frame [00:07:59].

## Shaun Comly and the MRQ team (demystifying MRQ article; 8o2yaZzfHCA render layers)

- MRQ samples serve motion blur and AA only; "any other noise needs to be addressed at the source"
  (article, Raytrace/Lumen/RT Shadow Samples).
- Warm-up internals (Matt Hoffman): Engine Warm Up ticks CPU systems with the sequence paused;
  Render Warm Up builds TSR history with a 0 to 1 to 0 jump for first-frame blur; camera-cut warm-up
  evaluates a real lead-in, for example [-75, 50) over [0, 50) (article, WARMUPS).
- Game Overrides act invisibly in legacy configs; in MRG only while connected (article, CVARS;
  transition doc).
- MRG renders only chains with a Render Layer node, evaluates right to left, last declaration wins;
  unique collection names [8o2 00:04:00] [00:07:33] [00:16:01]; holdout keeps shadows and
  reflections, hide does not [00:21:56]; spawnables need tags (5.4) or the Is Spawnable condition
  (5.8) [00:10:48].
- One graph, per-shot exposed variables and subgraphs instead of "a million graphs" [00:26:58]
  [00:30:14].

## Ryan Mayeda and Thomas Kilkenny (State of VP 2026; 5SJA1FfRPWs, UE 5.8)

- MRG production ready, new features graph-only, Basic config replaces preset popups [00:33:35]
  [00:34:41].
- Accumulation DOF only on DOF-centric shots (worst case a rack focus through a chain-link fence);
  component on the camera or MRG modifier in camera-default mode; cost linear in samples [00:36:19]
  [00:36:56] [00:37:29].
- Light Modifier: per-layer light overrides via a Light Actor Type collection condition [00:38:35].
- Spawnables usable as references and parents in Take Recorder and VCam from 5.8 [00:27:25];
  Sandboxes for experiments [00:22:47]; clean in-sync audio in MRQ movies [00:40:44].

## Epic docs (5.8): tips, shots and takes, bindings, Sequencer Python, MRQ command line, Cine Camera

- End frames exclusive; imported animations include an extra end frame (tips, Inclusive and
  Exclusive Frames).
- Engine Warm Up > 30 for idle cloth; camera-cut warm-up for motion at the start; Render Warm Up for
  sparkles; GPU particles need Render Warm Up Frames (tips, Warm-Up Rendering).
- Bias: root 0, +100 per level, equal values blend (shots, Hierarchical Bias); takes are the
  non-destructive experiment (shots, Takes).
- Portable binding IDs across shots (seq-py API digest); spawnables through
  `LevelSequenceEditorSubsystem` in 5.8.
- The shot is the smallest distributable render unit; `-notexturestreaming` in every command-line
  example; override exposed variables, never node defaults; keep the PIE executor in a global or it
  is garbage collected mid-render; Execute Script callbacks list written files per layer and get
  duplicated jobs and graphs; per-shot callbacks need Flush Disk Writes Per Shot and stall at each
  shot end; Python callback classes need Editor Only mode (5.8) and an import in `init_unreal.py`;
  the Debug Settings node carries Insights traces (mrq-cli; 5.8 notes).
- Pre-roll is previewed with Evaluate Sub Sequences In Isolation; otherwise negative time shows the
  previous shot (tips, Starting Motion).
- The Sequencer camera button makes a spawnable camera and sets the camera cut (cam doc); Use Field
  of View for LOD on long lenses (cam doc).

## Disagreements and deciding conditions

| Choice                 | A                                        | B                                                                                      | Decide by                                                                                                        |
| ---------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Temporal sample parity | odd, Frame Center (Faucher, Comly)       | 24/48/64, Frame Close (Blur)                                                           | the shutter timing in the Camera Settings node; one sample must land on the keyframe with Frame Center           |
| AA at high samples     | None with 9 to 15 temporal (Faucher)     | keep TSR unless a visual reason (Comly)                                                | None above 8 samples on thin, bright geometry; TSR at low counts or when effects need history (write the reason) |
| Tone curve             | on: matches the viewport, quick delivery | off: linear for the grade (Faucher)                                                    | whether a grade or comp follows                                                                                  |
| Depth of field         | real-time DOF                            | comp DOF from passes (Blur) or Accumulation DOF (5.8)                                  | hair, fences, occluders, rack focus: Accumulation DOF on those shots only                                        |
| Character binding      | spawnable per shot (A-COM)               | possessable level actor (Toonen boards); Replaceable or Resolve to Player Pawn (games) | film portability vs a live gameplay pawn                                                                         |
| Bias                   | bottom up (default)                      | top down (CAT production setting)                                                      | whether overrides are per shot or scene-wide                                                                     |
| Start frame            | 0                                        | 101 (SPI), 1000 (CAT demo)                                                             | editorial and DCC handles; one value per production                                                              |
| Render orchestration   | local MRQ/MRG                            | Deadline for Unreal (Glitch), custom executors (Blur)                                  | unattended multi-shot renders and crash recovery                                                                 |
| Temp lighting          | camera-parented spotlight (Glitch)       | unlit plus AO (dropped by Glitch)                                                      | seeing real materials and skinning early                                                                         |
| Motion blur ghosting   | more temporal samples                    | double frame rate, drop every other frame (Faucher)                                    | whether an edit step exists after the render                                                                     |
