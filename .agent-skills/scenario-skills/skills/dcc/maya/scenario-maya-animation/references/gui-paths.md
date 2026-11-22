# GUI paths: menus, hotkeys and editor settings (for a computer-use agent or a human)

Provenance per line: **(doc)** Maya 2027 Help saved in `sources/docs/`; **(video, year)** shown in
an expert video on an older Maya, may have moved; **[added]** long-standing Maya knowledge, not
checked in 2027; **[verify]** unsure in 2027. On macOS, Maya's Ctrl is Control and Alt is Option
(version deltas 2.13). Menus below assume the Animation menu set (F4) (doc).

## Editors

| Editor                 | Path                                                                                                  | Notes                                                                       |
| ---------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Graph Editor           | Windows > Animation Editors > Graph Editor (doc)                                                      | Shift+S tangent marking menu: swipe right tangents, left keys (doc)         |
| Dope Sheet             | Windows > Animation Editors > Dope Sheet (doc)                                                        | summary row retimes every control (Elver jzuxAmadcm8 00:16:44)              |
| Animation Layer Editor | Channel Box / Layer Editor > Anim tab (video 2020)                                                    | green "traffic light" = the layer that receives keys (doc)                  |
| Ghost Editor           | Visualize > Ghost Editor; also Visualize > Ghost Selected (doc)                                       | 2022 video: Windows > Animation Editors > Ghosting Editor                   |
| Motion Trail Editor    | Visualize > Motion Trail Editor (doc, since 2025)                                                     | replaces the Create Editable Motion Trail option box                        |
| Time Editor            | Windows > Animation Editors > Time Editor (doc)                                                       | never with animation layers on the same animation                           |
| Sequencer              | Windows > Animation Editors > Sequencer, Panels > Panel > Sequencer, or the Sequencer workspace (doc) | colors still under "Camera Sequencer" in Color Settings (doc)               |
| HumanIK                | Skeleton > HumanIK [verify]                                                                           | Definition tab, Character and Source menus, Custom Rig tab, Bake menu (doc) |
| Playblast              | Windows > Playblast, or Playback > Playblast option box (doc)                                         | Sequencer has its own Playblast menu in 2027 (doc)                          |
| Preferences            | Windows > Settings/Preferences > Preferences > Animation (doc)                                        | Default in/out tangent, Default Tangent Weight                              |

## Keying and playback hotkeys

- S set key on all keyable channels; Shift+W, Shift+E, Shift+R key translate, rotate, scale only
  [added].
- Insert a key without reshaping: Graph Editor right-click > Insert Key, or hold I (Wade G49wexNmQ-Q
  00:06:53, TMSpauVphNs 00:01:45). Key > Set Key option box > "Set key preserves curve shape"
  (video 2022) [verify location in 2027]. Scripted twin: `A.insert_key`, then `A.curve_diff` on
  sampled snapshots (procedures P4).
- Alt+V play or stop, Esc stop, . and , next and previous key, Alt+. and Alt+, next and previous
  frame, K + drag in a viewport to scrub [added].
- Time Slider right-click: Enable Stepped Preview (doc), Cached Playback modes (doc), audio
  selection (video 2021).
- Time Slider bookmarks: bookmark icon beside the Time Slider; Frame Bookmark sets the range;
  double-click the Time Slider toggles the full range (Newman -vUpqWi8b50 00:06:47).
- Hold on real time: Playback Speed Real-time in the Time Slider preferences [added]; Display >
  Heads Up Display > Frame Rate to confirm (doc).

## Graph Editor (2027 names)

- Tangents: Auto (Auto Span Legacy, Auto Ease, Auto Mix, Auto Custom in a collapsed toolbar group),
  Spline, Clamped, Linear, Flat, Stepped, Stepped Next, Plateau, Fixed; In Tangent and Out Tangent
  separately after Break Tangents; Unify; Lock/Free Tangent Length (was Tangent Weight) (doc).
- Curves: Pre Infinity and Post Infinity > Cycle, Cycle with Offset, Oscillate, Linear, Constant
  (doc); View > Infinity is on by default since 2025.3 (deltas).
- Curves > Euler Filter, Key Reducer Filter, Smooth Filter (Butterworth), Smooth Filter (Gaussian),
  Peak Removal (object selected in the viewport), Resample Curve, Simplify Curve, Key Sync (doc).
- Curves > Buffer Curve > Snapshot, Swap Buffer Curve; View > Show Buffer Curves (doc, Elver
  00:05:27).
- Curves > Weighted Tangents / Non-Weighted Tangents; Curves > Change Rotation Interp (Independent
  Euler default, Synchronized Euler, Quaternion Slerp, Squad, Tangent Dependent) (doc).
- Dial an exaggeration back without re-keying: select the section's keys, Region tool (or Scale
  Keys) about the rest value (Camporota ynXadXE9UjU 00:12:36; the overdone first anticipation,
  FA7fPB7qUhE 00:03:46) [added path]; scripted: `A.scale_curve(..., time=)`.
- Curves > Isolate Curve; Bake Channel (not for IK or dynamics; use Key > Bake Animation); Lock and
  unlock channel H and J (doc).
- View > Absolute, Stacked, Normalized (hotkeys 1, 2, 3 per Wade TMSpauVphNs 00:03:21) [verify];
  View > Curve Name > Active Only (video 2022); View > Highlight Affected Curves; View > Theme
  (video 2020).
- Channel Box > Channels > Sync Selection in Graph Editor, Sync Timeline Display: click "Translate
  X" to select every translate X curve (Wade 00:11:47); Channel Sets and View > Show Pins (2026.3);
  View > Show Lock/Mute Buttons (2027.2) (deltas).
- Curve colors: Windows > Settings/Preferences > Color Settings > Graph Editor, not Edit > Set Curve
  Colors (Wade 00:15:05).

## Dope Sheet

- Time Snap is off by default since 2025.1 (sub-frames survive interactive retimes): turn it on for
  whole-frame work (deltas); Ripple Edit, channel sets, precision mode (2025); Add and Remove
  Inbetween hotkeys (2025) (deltas).
- Retime a section: key all controls at the section start (summary row), select the section, move
  the tail (Elver 00:16:44).

## Animation layers

- Create Layer from Selected; Layers > Create Override Layer From Selected (doc).
- Mute, Solo, Lock buttons; Options > Lock Muted Layers is on by default (doc).
- Layers > Merge Layers option box: turn on Smart Bake once (the setting sticks), Apply (Newman
  5RmqWjfU80s 00:08:23; doc for the menu).
- Middle-drag a layer onto another to parent it (takes) (doc).

## Arc and spacing tools

- Ghost Editor: Create Ghost from Selection; Ghost mode Before and After; Frame Step 2 on a hand
  control; ghost the controller, not the mesh; merge layers first; skinned meshes need Cached
  Playback (Newman Ajx1p5cAzXU; doc).
- Motion Trail Editor: Pinning/Draw Always Draw, Path Mode Before and After, Trail Thickness, Show
  Keyframes, then W to move a trail key; Delete Selected Trail, or delete `motionTrail1Handle` in
  the Outliner (doc). Newman's 2021 settings: Time Slider range, increment 1 for mocap or the
  blocking interval, 10 frames pre and post, thickness 2, key size 3, frame numbers on (aNYr9nc9iM4
  00:03:39).
- Drawovers: Blue Pencil (commands `bluePencil*` since 2023) [verify menu]; or SyncSketch or RV
  outside Maya.

## Viewport review

- Panels > Layouts > Four Panes with one lights-off pane: Lighting > Use All Lights (7) in a scene
  with no lights gives black silhouettes (Camporota FA7fPB7qUhE 00:06:07; Elver 01:03:43) [added
  mechanism].
- Panels > Orthographic > side or front to see snaps on one axis (Newman TIBzcsOt2FU 00:11:06).
- Show > Isolate Select to hide all but the torso (Elver 00:37:57) [added path].
- Cached Playback icon in the playback controls: right-click for mode, preferences, flush; trust
  playback only with a full blue stripe; yellow is Safe Mode (doc).

## Playblast options (doc)

Format (image for frames, movie formats per OS), Encoding, Quality, Display Size (From Window, From
Render Settings, Custom), Scale (default 0.5: set 1.0), Render offscreen, frame padding; sound on
the Time Slider goes into movies; gamma and exposure follow the viewport toolbar (2025.1).

## Sequencer (2027) (doc; Newman SGjxnw6c-IQ)

- Right-click a Time Slider range > Create Shot; or Create Shot from Options (name, start, end,
  camera, placement at the current frame).
- Sync Timeline on: the Time Slider follows the current shot; Time Scale Mode: drag a shot edge to
  scale (slow motion without touching animation); Ripple Edit once structure is settled; colors,
  labels, custom thumbnails; Playblast menu: selected shot, all shots on a track, the whole
  sequence, Re-Playblast Selected Shot.
- Lock cameras: look through the camera, View > Select Camera, lock its channels (Newman 00:08:33).

## HumanIK window (doc)

Definition tab (lock the definition) > Character menu (target) > Source menu (source); Custom Rig
tab: right-click a cell > Assign Selected Effector; HumanIK menu > Edit Character Definition > Edit
HIK Properties (Retarget Specific); Bake menu: Bake To Control Rig, Bake To Skeleton, Bake To Custom
Rig; never Edit > Keys > Bake Simulation for HumanIK.

## Time Editor hotkeys (doc)

I add animation, W split, E trim, R scale, T loop, Y hold, Ctrl+G group, V show keys, M mute track,
N solo, Q mute the Time Editor, K release the cursor lock to scrub, A frame all, F frame selection,
G frame the playback range.

## Feet (posing)

- Foot roll and toe controls live on the rig's IK foot control (Animation Mentor rig: Foot Roll,
  Foot Break, Toe Tap, Heel Twist, ynXadXE9UjU f_00045); drag them in the Channel Box. Key the roll
  in every crouch (Camporota FA7fPB7qUhE 00:07:55); on the frame after a takeoff rotate the foot so
  the toe tip points at the takeoff spot (Elver jzuxAmadcm8 00:11:04) (video).

## Other

- Modify > Match Transformations snaps an object to another (position, rotation) [added]; Newman's
  2021 request for a native snap is met.
- Edit > Delete by Type > Static Channels before playback judgment (doc).
- Autosave: Windows > Settings/Preferences > Preferences > Files/Projects [verify]; the agent uses
  versioned saves instead.
