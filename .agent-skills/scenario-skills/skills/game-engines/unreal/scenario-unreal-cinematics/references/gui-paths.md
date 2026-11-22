# GUI paths (computer-use agent or human)

The same procedures as `procedures.md`, through the editor UI. Menu names come from the 5.8 docs and
the talks; items marked [verify] were not confirmed on screen for 5.8 (the 5.8 Simple View for
Sequencer can change the layout). Mac: documented Ctrl shortcuts usually map to Cmd [verify].
Hotkeys can be customized per user.

## Production setup (P2)

- Plugins: Edit > Plugins > Cinematic Assembly Tools, Naming Tokens, Directory Placeholders
  (experimental); Movie Render Queue; Take Recorder; Accumulation Depth of Field (5.8, experimental)
  [verify plugin names]. Restart.
- Production Setup Wizard: Window > Cinematics > Production Setup [verify] (S4Iyzbl-oaE [00:14:44]).
  Tabs: Revision Control, Productions (active one has a green check), Sequencer settings (default
  display rate, default start frame, subsequence priority bottom up or top down), Naming Tokens,
  Asset Naming, Folder Hierarchy > Create Template Folder.
- Without CAT: Project Settings > Engine > Level Sequence (writes DefaultEngine.ini); Editor
  settings for Level Sequences and Plugins > Level Sequencer (write
  DefaultEditorPerProjectUserSettings.ini) (cinematic editor settings doc). Default tracks: Project
  Settings > Plugins > Level Sequencer > Track Settings (tips doc).
- Schemas: Content Browser right-click > Cinematics > Cine Assembly Schema; assemblies: Cinematics >
  Cine Assembly (pick schema, level, parent, metadata, notes; nothing is created until you confirm)
  (S4Iyzbl-oaE [00:25:01] [00:27:13]). 5.8: the schema's timeline template holds folders, level
  visibility tracks and spawnables; nest a lighting schema inside the shot schema; the assembly can
  create a sub-level or a level per shot that opens with it (5SJA1FfRPWs [00:19:07] [00:20:44])
  [verify menu labels].

## Build the hierarchy (P3)

- New master with shots: Sequencer toolbar clapperboard > Create Level Sequence with Shots (name,
  number of shots, base template sequence, folder) (mAMp6qCt7kc [00:12:34]); or Content Browser >
  Add > Cinematics > Level Sequence, then Tracks (+) > Shots Track > (+) Shot > Insert Shot (shots
  doc).
- Frame rate: Sequencer toolbar frame-rate dropdown; playback range: drag the green and red markers
  or set start and end in the time fields.
- Camera: Sequencer toolbar camera button creates a spawnable Cine Camera and sets the camera cut
  (cam doc). Pilot: right-click the camera > Pilot, or Ctrl+Shift+P; exact camera view Ctrl+Shift+C
  (cam doc; Toonen uses Shift+P and Shift+C).
- Camera settings: Details > Current Camera Settings > Filmback (preset or sensor mm), Lens
  Settings, Current Focal Length, Current Aperture, Focus Settings (Focus Method Manual or Tracking,
  Manual Focus Distance, Tracking Focus Settings > Actor to Track and Relative Offset, Draw Debug
  Focus Plane), Crop Settings (2.39), Constrain Aspect Ratio (cam doc).
- Spawnable or possessable: drag from the Content Browser (spawnable) or the Outliner (possessable)
  into Sequencer; hold Ctrl (possessable) or Shift (spawnable) while dropping an actor in the level;
  right-click a binding > Convert Selected Binding(s) To > Spawnable / Possessable (bind doc; tips
  doc). Lightning-bolt overlay = spawnable.
- Animation: binding (+) Track > Animation > pick the asset; drag the section's left edge before the
  shot start for pre-roll.
- Subsequences: Tracks (+) > Subsequence Track > add a Level Sequence (name it `<shot>_LGT`).
- Audio: Tracks (+) > Audio Track > add the SoundWave; hold Shift while dropping to snap to the
  playhead (tips doc).
- Empty-level test: File > New Level > Empty Level, open the master, play; then reopen the real map
  (yOcgYMcxr3Q [00:13:15]).
- Visibility that persists: Window > Levels, toggle the sub-level's eye (the Outliner eye is not
  saved, yOcgYMcxr3Q [00:02:23]); per shot: Tracks (+) > Level Visibility [verify label] in the shot
  or a discipline subsequence.
- Long lens: select the Cine Camera > Details > Camera Options > Use Field of View for LOD on (cam
  doc).
- Multi-mesh character: open its Blueprint > Construction Script > Set Leader Pose Component on each
  secondary skeletal mesh, target the main mesh (GLITCH [00:18:46]).

## Board and cut (P4, P5)

- Lock the viewport to camera cuts: the camera icon in the Sequencer toolbar (ywtvn1uncZo
  [00:04:44]).
- Two panes (5.6+): viewport layout menu (top right) > Two Panes; left pane: Perspective menu > shot
  camera, Allow Cinematic Control on, Cinematic Viewport on; right pane: Allow Cinematic Control off
  (E7C1xbpEA_Q [00:08:48]).
- Screenshots: viewport options > High Resolution Screenshot; or console `HighResShot 1920x804`.
- Constant keys: select keys, press 5 (mAMp6qCt7kc [00:15:04]).
- Trim, split, move shots: right-click a shot > Edit > Trim Left, Trim Right, Split; Auto Size after
  retiming inside a shot (tips doc).
- Takes: right-click a shot > New Take; switch via Takes (the active take has a star) (shots doc).
- Duplicate the edit: Content Browser > duplicate the master (remember it shares the shots;
  S4Iyzbl-oaE [00:41:34]).
- Sandboxes (5.8): the Sandbox browser > create, work, Persist the chosen assets (5SJA1FfRPWs
  [00:22:47]) [verify menu].
- Isolation: Sequencer toolbar > Evaluate Sub Sequences In Isolation (to preview pre-roll without
  the previous shot; tips doc).

## Cameras and constraints (P6, P7)

- Rails and cranes: Place Actors > Cinematic > Camera Rig Rail / Camera Rig Crane; drag the camera
  onto the rig in the Outliner; key the rail position with + Track > Properties (cam doc).
- Camera rig with offset and shake layers: select the camera Control Rig binding > Animation Mode;
  Animation Layers panel for weighted shake layers (E7C1xbpEA_Q [00:03:58] [00:05:17]).
- Constraints: Animation Mode > Animation panel > Constraints > Add Constraint (+), eyedropper the
  parent; right-click an entry > Compensate Key or Bake (cons doc). The first constraint creates a
  Constraints Manager actor in the level.
- Accumulation DOF: add the Accumulation DOF component to the Cine Camera and set its samples;
  preview under the level viewport scalability menu > Accumulation DOF (5.8 notes) [verify].
- Ultrawide safety for real-time cinematics: Level Sequence Actor > Override Aspect Ratio Axis
  Constraint, Maintain Y-Axis FOV (tips doc).

## Render (P8, P9)

- Queue: Window > Cinematics > Movie Render Queue (opens on the 5.8 Basic config: resolution,
  format, path tracer toggle; "save as graph") (5SJA1FfRPWs [00:34:41]).
- Graph: Content Browser > Cinematics > Movie Render Graph Config; in the queue, Settings column
  dropdown > Movie Render Graph; Tab or right-click for nodes; Members panel for Outputs and
  Variables; right-click a node property > expose as pin, right-click the pin > Promote to Variable;
  Evaluate Graph under Active Render Settings (mrg doc; 8o2yaZzfHCA [00:28:03]).
- Nodes for the template (procedures P8): Global Output Settings, Sampling Method, Warm Up Settings,
  Camera Settings, Global Game Overrides, Render Layer, Deferred Renderer (Disable Tone Curve,
  anti-aliasing override), EXR Sequence (compression incl. DWAA/DWAB in 5.8), Set Metadata
  Attributes, Accumulation DOF modifier (camera default), Execute Script (Editor Only mode for
  Python).
- Execute Script: select the node, Script class `CineWrittenFiles` (listed only once
  `Content/Python/init_unreal.py` imports `cine_render_callbacks`), mode Editor Only. Per-shot
  callbacks: Global Output Settings > Flush Disk Writes Per Shot on (stalls at every shot end)
  (mrq-cli; 5.8 notes) [verify labels].
- Slow render diagnosis: add a Debug Settings node (Unreal Insights trace; its RenderDoc capture
  does not apply to Metal on Mac, version deltas) to a copy of the graph, not the shared template
  (mrq-cli, MRQ to MRG mapping).
- Render (Local) renders in the editor process; Render (Remote) spawns a process reading saved
  assets and prints its command line in the Output Log (a template for farm scripts) (mrg doc).
- Save the queue for the command line: Movie Render Queue > Unsaved Queue > Save Queue As (mrq-cli).
- Quick Render (5.6+) for quick review renders: main toolbar three dots > Quick Render mode; Apply
  Viewport Look carries the OCIO view into the render (mrg doc).

## Color and review

- OCIO: enable the OpenColorIO plugin; Content Browser > OpenColorIO Configuration asset, built-in
  config, color spaces Linear sRGB and ACEScg, display view ACES SDR video [verify 5.8 view names,
  OCIO 2.5.1 with ACES 2.0]; viewport Lit menu > OCIO Display > Enable Display (2Q3CybANHKE
  [00:02:40] [00:10:28]).
- Post process: unbound PPV (Infinite Extent); Blue Correction and Expand Gamut 0 optional
  (2Q3CybANHKE [00:05:19]); camera exposure on the Cine Camera's own post process (manual metering,
  Apply Physical Camera Exposure, ISO).
- Resolve: File > Project Settings (timeline resolution and frame rate); Color page, ACES Transform
  (Effects) as the first node (2Q3CybANHKE [00:08:30] [00:09:05]):
  | Render                                                                                                                                                                                                                  | Input         | Output       |
  | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ------------ |
  | tone curve on                                                                                                                                                                                                           | sRGB (Linear) | sRGB Texture |
  | tone curve off (linear)                                                                                                                                                                                                 | Linear sRGB   | sRGB         |
  | OCIO to ACEScg                                                                                                                                                                                                          | ACEScg        | sRGB         |
  | A log output (for example Canon Log 3) instead of sRGB lets the colorist use LUTs (2Q3CybANHKE [00:11:33]). The two linear renders look identical and about one stop darker than the viewport (2Q3CybANHKE [00:09:39]). |

## Take Recorder (virtual camera and performance passes)

- Window > Cinematics > Take Recorder; + Source (actors, camera cuts, Live Link, microphone); slate
  and take; Record Speed for slow-motion recording; disable Auto Lock to edit takes; 5.8 records
  with spawnables as references and parents (take doc; 5SJA1FfRPWs [00:27:25]). Target Record Class
  can be a Cine Assembly (S4Iyzbl-oaE [00:34:35]).
