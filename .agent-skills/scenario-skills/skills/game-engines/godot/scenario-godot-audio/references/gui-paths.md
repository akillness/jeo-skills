# scenario-godot-audio GUI paths (Godot 4.7.2 editor)

These are for a computer-use agent or a human doing the same work by hand. Each one maps to a
procedure that an agent without a mouse runs in code. The names follow the 4.7 editor and docs. The
GUI itself was not driven in this session (not yet run: GUI only).

## Audio bus layout (P1)

- Bottom panel: **Audio** tab.
  - **Add Bus** adds a bus on the right.
  - Drag a bus by its name to reorder it. Sends only go to buses on the left.
  - Each bus has: a name field (double-click), a volume fader, Solo / Mute / Bypass, **Add Effect**
    (a drop-down at the bottom of the bus), and the **send** drop-down at the bottom.
- **Layout** menu at the top right of the Audio panel: Load, Save As, Load Default, Create. The file
  must be the one named in **Project > Project Settings > Audio > Buses > Default Bus Layout**
  (`res://default_bus_layout.tres`).
- Effect settings: click the effect name in the bus, and its properties appear in the Inspector.

## Volume sliders (P2)

- UI: HSlider with Min 0, Max 1, Step 0.05. Connect `value_changed` (**Node** dock > **Signals**) to
  a handler that calls `AudioServer.set_bus_volume_linear` and `set_bus_mute`.

## Import settings (P3)

- **FileSystem** dock: select the file, then open the **Import** dock (next to Scene).
  - **WAV:** Force (8 Bit, Mono, Max Rate, Max Rate Hz), Edit (Trim, Normalize, Loop Mode, Loop
    Begin, Loop End), Compress Mode (Quite OK Audio by default).
  - **Ogg / MP3:** Loop, Loop Offset, BPM, Beat Count, Bar Beats.
  - Press **Reimport**.
- Advanced import dialog: double-click an Ogg or MP3 in FileSystem. It shows a waveform with the
  loop offset, the BPM and beat grid, and a preview player.

## AudioStreamRandomizer (P5)

- Inspector on an AudioStreamPlayer:
  - **Stream** > New AudioStreamRandomizer;
  - **Streams** > Add Element, and drop each take;
  - set **Playback Mode**, **Random Pitch Semitones** and **Random Volume Offset dB**;
  - save the resource (the down-arrow menu > Save As `.tres`).

## Spatial (P7, P8)

- Inspector on an AudioStreamPlayer3D: **Attenuation Model**, **Unit Size**, **Max dB**, **Max
  Distance**, **Panning Strength**, **Area Mask** (4.7 default empty), **Attenuation Filter**
  (Cutoff Hz, dB), **Doppler**.
- Area3D: **Audio Bus** section, with **Override** on and **Name** set to the bus.
- Project Settings > Audio > General: 3D Panning Strength (0.5).

## AudioStreamInteractive (P9)

- Inspector on an AudioStreamPlayer: **Stream** > New AudioStreamInteractive.
  - **Clips**: set the count, then per clip set its Name, Stream, Auto Advance and Next Clip.
  - **Initial Clip**.
- Click **Edit Transitions**. It opens the transition matrix: rows are "from", columns are "to",
  plus an Any row and column.
  - Select one or more cells, then tick **Use Transition**.
  - Set **Transition From Time** (Immediate, Next Beat, Next Bar, Clip End) and **Transition To
    Time** (Same Position, Clip Start, Previous Position).
  - Set **Fade Mode** and **Fade Beats**, **Use Filler Clip** and its Filler Clip, and **Hold
    Previous**.
  - Put Hold Previous on the transition that leaves the clip you want to return to (observed 4.7.2).
- Runtime switch in the Inspector, on the player: **Parameters > Switch to Clip**.
- AudioStreamSynchronized: **Stream Count**, and per stream its Stream and Volume.

## AudioStreamGenerator (P11)

- Only a script can push frames. The Inspector sets **Mix Rate Mode**, **Mix Rate** and **Buffer
  Length**.

## Profiling (P6, not runnable headless)

- Run the game from the editor (F5). Open **Debugger > Profiler** and press **Start**. Watch the
  **Audio Thread** frame time while a stress scene plays (Michael Games, H-6p 00:17:55).
- **Debugger > Monitors**: Audio > Output Latency.

## Movie Maker (P12)

- Toolbar: the **Movie Maker** button (film icon), then **Project Settings > Editor > Movie
  Writer**: Movie File (`.avi` keeps PCM audio), FPS, Mix Rate (48000).
- Command line equivalent: `--write-movie x.avi --fixed-fps 60` (needs a window).

## Web (not runnable here)

- Project Settings > Audio > General > Default Playback Type.web (Sample by default). Bus effects
  need **Stream**, set per player in **Playback Type**.
