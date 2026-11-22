# scenario-godot-audio procedures (Godot 4.7.2)

Every procedure below ran in Godot 4.7.2 on this Mac through the scenario-godot-expert toolkit
(`gd_run.run_script`, GD_MAX slots, per-project lock). Project: `tests/projects/godot-audio/Audio3D`
(a Base3D clone; Forward+ and Jolt checked by the test). Jobs:
`tests/projects/godot-audio/Audio3D/jobs/*.gd`. Test runner:
`python3 tests/code/godot-audio/test_audio_live.py` (12 groups, 18 jobs), plus
`test_audio_offline.py` (13 checks, no Godot). Evidence:
`tests/live_evidence/godot-audio/live_<stamp>.json` and `<stamp>/` (logs, result JSON, waveform
sheet, spectrogram).

Setup for any project:

```python
import sys; sys.path += ["skills/scenario-godot-expert/scripts", "skills/scenario-godot-audio/scripts"]
import gd_run, gd_audio
gd_audio.install(P)            # copies scripts/agentkit/audio/*.gd to res://addons/agentkit/audio/
gd_run.import_project(P)       # --import, so new audio files have .import files and resources
r = gd_run.run_script(P, "jobs/<job>.gd", timeout=240)   # r["ok"], r["result"] = AGENT_RESULT
```

Test signals were made with ffmpeg so that each one can be identified by its frequency:
`tone_440.wav` (-24.08 dBFS), `hit_1..4.wav` (decaying tones at 470, 640, 810 and 980 Hz plus noise,
0.35 s), `explore.ogg` (330 Hz, with a click every 0.5 s, 8 s, 120 BPM), `combat.ogg` (880 Hz),
`stinger.ogg` (1320 Hz, 2 s), `intro.ogg` (550 Hz, 4 s), `probe_2tone.wav` (500 Hz plus 8 kHz, each
at -12 dBFS, 30 s mono).

---

## P0. Measuring without ears (the channel itself)

Use `audio_meter.gd`:

- Offline: `render_stream(stream, seconds, events=[[t, func(pb): ...]], chunk, from_pos, pitch)`
  pulls frames from `AudioStreamPlayback.mix_audio()`. It is sample-exact and does not go through
  AudioServer or the buses.
- Real time: `record_bus(job, bus, seconds)`, `peak_trace(job, bus, seconds, every)`, or an
  `AudioEffectCapture` placed at index 0 of Master (before the limiter).
- Readouts: `peak_db`, `rms_db`, `channel_rms_db`, `tone_db` (Goertzel), `zero_cross_hz` and
  `loop_seam(stream)` (P4). `write_wav` writes a 16-bit file that `gd_audio.analyze()` reads.

**Live test** `jobs/probe_api.gd`, `jobs/probe_mix.gd`, `jobs/probe_import.gd`.

- Run in Godot 4.7.2 on 2026-10-02: **pass**.
- The headless driver is "Dummy", at 44100 Hz with output latency 0. The capture gets 40960 frames.
  AudioEffectRecord saves a WAV whose peak, -24.07 dB, matches the file (ffmpeg: -24.07).
- All expected APIs are present, and AudioStreamWAV has no `bpm`.
- Defaults read:
  - AudioStreamPlayer3D: unit_size 10, max_db 3, max_distance 0, attenuation filter 5000 Hz at -24
    dB, area_mask 0, panning_strength 1.0, max_polyphony 1.
  - Project settings: `3d_panning_strength` 0.5, `default_playback_type.web` 1 (Sample),
    `movie_writer/mix_rate` 48000.
  - AudioStreamGenerator: 44100 Hz, buffer 0.5 s.
  - AudioStreamRandomizer: `random_pitch` 1.0, which becomes 1.1225 once `random_pitch_semitones` is
    set to 2.
- Imports: `explore.mp3` keeps bpm 120 and beat_count 16. WAV imports as format 3 (QOA).
- Real-time recordings start about 0.2 s late, so assert on timing offline only (observed).

## P1. Bus layout as data, saved, reloaded

```gdscript
const AB = preload("res://addons/agentkit/audio/audio_buses.gd")
var built := AB.build_layout(AB.COMBAT_LAYOUT)   # Master(HardLimiter -1 dB), Music, SFX > Weapons, Impacts,
                                                 # Enemies, Player, SFX_Occluded(LowPass 1 kHz), RoomReverb, Ambience, UI
AB.save_layout()                                 # AudioServer.generate_bus_layout() -> audio/buses/default_bus_layout
var audit := AB.audit_layout(["Music", "SFX", "Weapons"])   # sends must point left, Master <= 0 dB, no Limiter
```

Spec entries look like
`{"name", "send", "volume_db", "effects": [{"type": "AudioEffectX", prop: value}]}`. A send must
name a bus to the left. `build_layout` reports an error when it does not.

**Live test** `jobs/buses_build.gd`, then `jobs/buses_reload.gd` in a second process.

- Run in Godot 4.7.2 on 2026-10-02: **pass**.
- 11 buses built and saved, with no audit flags.
- The fresh process loads them with no code, and the HardLimiter is on Master.

## P2. Volume sliders, the rename trap, mix states

```gdscript
AB.set_volume_linear("SFX", slider.value)        # set_bus_volume_linear + mute under 0.05 (Game Dev Artisan)
AB.save_volumes("user://audio_settings.cfg", ["Music", "SFX"]); AB.load_volumes("user://audio_settings.cfg")
var tw := AB.apply_state(self, {"Music": -6.0, "Ambience": -80.0}, 0.5)   # a snapshot (JC4, Somberg)
await tw.finished
```

**Live test** `jobs/buses_build.gd`. Run in Godot 4.7.2 on 2026-10-02: **pass**.

The slider was measured at the output, with a tone on Weapons going through SFX to Master:

| SFX slider | SFX bus   | Output RMS    |
| ---------- | --------- | ------------- |
| 1.0        | 0 dB      | -12.04 dB     |
| 0.5        | -6.021 dB | -18.06 dB     |
| 0.04       | muted     | -200 (silent) |

- **Rename trap:** after Weapons is renamed to "Guns", the player's `bus` reads back `"Master"` and
  it plays there at the same level (-12.04). Once the name is restored, it reads `"Weapons"` again.
- **Mix state:** it reaches Music -6 dB and Ambience -80 dB in 500 ms.

## P3. Import settings: read, fix, reimport, verify on the resource

```python
gd_audio.read_import("music/explore.ogg")                       # [params] as Godot literals
gd_audio.set_import_params("music/explore.ogg", {"loop": True, "bpm": 120, "beat_count": 16})
gd_run.import_project(P)                                         # --import picks up the edited .import
flags = gd_audio.audit_imports(P, music_dirs=("music",))["flags"]
```

The keys were verified on 4.7.2:

- **WAV:** `force/8_bit`, `force/mono`, `force/max_rate`, `force/max_rate_hz`, `edit/trim`,
  `edit/normalize`, `edit/loop_mode`, `edit/loop_begin`, `edit/loop_end`, and `compress/mode` (2 =
  QOA, the default).
- **Ogg and MP3:** `loop`, `loop_offset`, `bpm`, `beat_count`, `bar_beats` (default 4).

`audit_imports` flags these problems:

- music that does not loop;
- bpm 0, or beat_count 0;
- WAV files longer than 5 s;
- stereo SFX;
- PCM WAV;
- 8-bit forcing;
- files that have not been imported.

**Live test** in `test_audio_live.py` (group intake: `loop` is set false and then true, with an
import and a `loop_seam.gd` read after each). Run in Godot 4.7.2 on 2026-10-02: **pass**. The loaded
`AudioStreamMP3.loop` follows each edit.

Gate on the loaded resource, never on the .import text. Once in this session, an edited `.import`
was not picked up: `loop` stayed false and `bpm` 0 in the resource. Touching the `.import` file
fixed it. The cause was not isolated. `set_import_params` now sets the file's mtime at least 2 s
later than its previous value [added].

## P4. Generated audio intake (scenario-audio, scenario-elevenlabs)

```python
r = gd_audio.prepare_ai_audio("gen/impact.mp3", "audio/sfx/impact.wav", kind="sfx")   # trim, peak or LUFS, mono WAV
r = gd_audio.prepare_ai_audio("gen/loop.mp3", "music/loop.mp3", kind="music")          # two-pass loudnorm, keeps MP3
gd_audio.loudness_offset_db("gen/loop.mp3", -18.0)   # or: leave the file, put the gain in volume_db
gd_audio.bars_for(19.2, 100)                          # {'beat_count': 32, 'on_grid': True} -> .import beat_count
```

Rules:

- Sounds under 3 s are levelled by sample peak to -3 dBFS. Longer sounds go through two-pass EBU
  R128 loudnorm in linear mode.
- Trimmed starts get a 5 ms fade-in.
- `src` is never overwritten. Keep the generated original next to its prompt.

**Live test** `test_audio_live.py` (group intake) on synthetic stand-ins for generated files, in
`tests/projects/godot-audio/gen_in/`. Run in Godot 4.7.2 on 2026-10-02: **pass**.

- **SFX:** a 2.1 s stereo file with 0.39 s of lead silence becomes a 0.523 s mono WAV with a peak of
  -3.00 dBFS and no lead silence.
- **Music:** -8.4 LUFS with a +1.1 dBTP true peak becomes -18.3 LUFS. `loudness_offset_db` gives
  -9.6 dB.
- **Loudnorm on short sounds:** on a 0.5 s hit, loudnorm landed at -21 LUFS against a -18 target.
  That is why short sounds use peak mode.

Loop seams were checked with `audio_meter.loop_seam(stream)` (job `jobs/loop_seam.gd`). It renders
0.3 s on each side of the wrap and lines the result up against the file's own start:

| File          | Encoder                     | Best lag (samples) | Residual      |
| ------------- | --------------------------- | ------------------ | ------------- |
| MP3           | libmp3lame (gapless header) | 0                  | -53 to -65 dB |
| `explore.ogg` | ffmpeg's native `vorbis`    | -32                |               |

The Ogg file is 8.0007 s instead of 8.0 s, because the encoder pads it by about 31 samples. The loop
wraps late even though `beat_count` is 16 at 120 BPM: beat_count does not set the plain loop point
(observed). Use libvorbis (not installed here) or MP3, and check `get_length()`.

**Not yet run:** a real Scenario generation. The Scenario MCP asked which team and project to use,
and a subagent may not choose one, so 0 CU were spent. The intake code is format-agnostic; rerun the
intake group on the first real file.

## P5. SFX variation: AudioStreamRandomizer

```gdscript
var r := AudioStreamRandomizer.new()
for f in takes: r.add_stream(-1, load(f), 1.0)
r.random_pitch_semitones = 1.0       # couples random_pitch (becomes 1.0595)
r.random_volume_offset_db = 3.0
ResourceSaver.save(r, "res://audio/sfx/hit_random.tres")   # (resource, path) in 4.x
```

**Live test** `jobs/sfx_randomizer.gd`. 24 plays were rendered offline, and each take is identified
by its pitch. Run in Godot 4.7.2 on 2026-10-02: **pass**.

- The playback mode defaults to RANDOM_NO_REPEATS (0), and there were 0 immediate repeats.
- Takes used: {7, 6, 4, 7}.
- Measured pitch ratio: 0.950 to 1.075, against ±1.0595 set; the meter is accurate to about 1.5%.
- Volume offsets: -2.45 to +2.35 dB.

## P6. Voices for 200 enemies: SfxPool

```gdscript
const POOL = preload("res://addons/agentkit/audio/sfx_pool.gd")
var pool: Node3D = POOL.new(); pool.voices = 32; add_child(pool)
pool.define(&"rifle", {"stream": rnd, "bus": &"Weapons", "limit": 8, "radius_m": 8.0, "radius_limit": 2,
	"cooldown_ms": 25, "priority": 50, "max_distance_m": 60.0, "volume_db": -6.0, "occlusion": true})
var id := pool.play(&"rifle", muzzle.global_position)    # always an int id (Somberg); culled -> not playing
```

The checks run in this order: cooldown, then distance cull, then the per-type cap and radius rule
(from a per-frame cache), then a free voice, or else steal (lowest priority first, then farthest).
An undefined type calls `push_error` and still returns an id (Aarimous, Somberg).

**Live test** `jobs/combat_voices.gd`: 200 enemies at 3 to 70 m fire at 10 Hz for 2 s. A Capture on
Master, before the limiter, records the mix. Run in Godot 4.7.2 on 2026-10-02: **pass**.

| Setup                                                  | Peak (dBFS) | RMS (dB) | Max live voices | Nodes | Request cost (p50 per tick) |
| ------------------------------------------------------ | ----------- | -------- | --------------- | ----- | --------------------------- |
| Naive: one player per enemy, `play()` per shot         | +32.4       | +22.1    | 200             | 203   | 0.10 ms                     |
| Pooled: limit 12, radius 2 in 8 m, no cooldown         | +8.5        | -8.0     | 12              | 36    | 0.43 ms                     |
| Tuned: Randomizer of 4, cooldown 25 ms, -6 dB, limit 8 | -13.9       | -30.0    | 6               | 36    | 0.27 ms                     |

- Pooled culls: 3355 by the limit, 580 by distance, 5 by radius.
- Tuned culls: 3967 by cooldown, 13 by radius.
- The undefined type logged exactly 1 error.
- The waveform sheet (`<stamp>/combat_wave_sheet.png`) was opened. Naive is a solid clipped wall.
  Pooled shows 5 identical bursts in 2 s, because all 12 voices start together and end together.
  Tuned is sparse and varied.
- Main-thread cost is low in every case. The naive cost lands in the mix: 200 voices, plus the first
  burst that took 91 ms in an earlier run.
- Audio thread milliseconds need the Profiler (GUI). Not yet run.

## P7. Spatial audio, measured

**Live test** `jobs/spatial_measure.gd`: `probe_2tone.wav` on an AudioStreamPlayer3D, with the
Camera3D as listener. Run in Godot 4.7.2 on 2026-10-02: **pass**.

The flat (non-positional) player reads -12.04 dB. The 3D player, at defaults:

| Distance | RMS (dB) | 500 Hz (dB) | 8 kHz (dB) |
| -------- | -------- | ----------- | ---------- |
| 1 m      | -12.05   | -12.05      | -12.05     |
| 3 m      | -12.05   | -12.06      | -12.05     |
| 7 m      | -12.05   | -12.05      | -12.05     |
| 10 m     | -15.05   | -15.06      | -15.05     |
| 20 m     | -23.91   | -20.93      | -43.08     |
| 40 m     | -29.8    | -26.79      | -55.51     |
| 80 m     | -35.71   | -32.71      | -64.44     |

- Inside unit_size, the level is clamped to max_db +3, which cancels the -3 dB center pan. That is
  why a 3D player is flat up close [added interpretation].
- `attenuation_filter_db = 0` turns the distance low-pass off: 500 Hz and 8 kHz are equal at 40 m.
- unit_size 3 scales the same curve.
- `max_distance` 30 makes a source at 40 m silent (-200).
- A source 5 m to the right reads L -16.03 / R -10.01. With `panning_strength` 0, both channels are
  equal.
- An Area3D with `audio_bus_override` to a "Room" bus: with `area_mask` 0 (the 4.7 default) the Room
  bus peaks at -200 (unused); with `area_mask` 1 it peaks at -6.01 dB.

## P8. Occlusion

- One-shots: set `occlusion: true` in the SfxPool type. One ray from the listener to the source at
  play time. If it hits, the voice plays on `SFX_Occluded` (low-pass 1 kHz) at -4 dB.
- Long emitters: add `occluder_3d.gd` as a child of the AudioStreamPlayer3D. It owns an `Occ_<id>`
  bus with a LowPass, casts one ray every 0.1 s, and lerps the cutoff in log space (20 kHz open, 800
  Hz occluded) and the volume (-6 dB), with smoothing 8/s (after Blekoh, mHok 00:06:51). One bus per
  emitter, so keep it to a handful.

**Live test** `jobs/occlusion.gd`: a wall between listener and source at 8 m (inside unit_size, so
no distance filter). Run in Godot 4.7.2 on 2026-10-02: **pass**.

- The pool voice routed to SFX_Occluded. Its 8 kHz level fell from -14.35 to -72.31 dB, a 57.95 dB
  drop.
- The Occluder3D cutoff fell from about 20 kHz to 800 Hz within about 0.5 s, and recovered over a
  similar time once the wall moved away (24 samples, 0.1 s apart).

## P9. Adaptive music: AudioStreamInteractive and AudioStreamSynchronized

```gdscript
const MB = preload("res://addons/agentkit/audio/music_builder.gd")
const SPEC := {"clips": [
		{"name": "intro", "stream": "res://audio/test/intro.ogg", "auto_advance": "next", "next": "explore"},
		{"name": "explore", "stream": "res://audio/test/explore.ogg"},
		{"name": "combat", "stream": "res://audio/test/combat.ogg"},
		{"name": "victory", "stream": "res://audio/test/stinger.ogg", "auto_advance": "hold"}],
	"initial": "intro", "transitions": [
		# hold goes on the transition that LEAVES the clip to come back to (observed 4.7.2)
		{"from": "explore", "to": "combat", "from_time": "bar", "to_time": "start", "fade": "cross", "beats": 1.0, "hold": true},
		{"from": "combat", "to": "victory", "from_time": "beat", "to_time": "start", "fade": "disabled", "beats": 0.0},
		{"from": "*", "to": "*", "from_time": "bar", "to_time": "start", "fade": "auto", "beats": 2.0}]}
var s := MB.build_interactive(SPEC)          # clips first, then add_transition (class doc)
var audit := MB.audit_interactive(s)         # missing reachable pairs, bad indices, looping auto-advance clips
ResourceSaver.save(s, "res://music/combat_music.tres")
MB.switch_to(music_player, &"combat")        # get_stream_playback().switch_to_clip_by_name
# or, as in the Inspector: music_player.set("parameters/switch_to_clip", &"combat")
```

Layers: use `AudioStreamSynchronized` with `stream_count`, `set_sync_stream(i, s)` and
`set_sync_stream_volume(i, db)`. Writing the stem volume on the resource during playback takes
effect at once.

**Live tests** `jobs/music_interactive.gd`, `jobs/music_hold_octo.gd`,
`jobs/music_hold_variants.gd`, `jobs/music_layers.gd`, all rendered offline and tone-tracked with
`gd_audio.tone_track`. Run in Godot 4.7.2 on 2026-10-02: **pass**. The scripted timeline (120 BPM,
so one beat is 0.5 s and one bar is 2 s):

| Event                                | Requested at | Heard at | Note                              |
| ------------------------------------ | ------------ | -------- | --------------------------------- |
| intro auto-advances to explore       |              | 4.00 s   |                                   |
| combat (explore to combat, next bar) | 5.3 s        | 6.00 s   | dominant at 6.25 s, mid-crossfade |
| victory (next beat)                  | 9.1 s        | 9.50 s   |                                   |
| back to the held explore             |              | 11.50 s  | after the 2 s stinger             |
| combat (any-to-any rule, next bar)   | 12.3 s       | 13.50 s  |                                   |

- The audit is clean, and the saved and reloaded `.tres` keeps its transitions.
- A stream with no rules switched on the next beat (1.5 s), not as a hard cut. The source faded out
  by about 1.95 s.
- `parameters/switch_to_clip` works in real time.
- Hold placement: with hold set on the combat-to-stinger transition, all 6 variants tested went
  silent after the stinger. With hold on explore-to-combat (the Octodemy layout), the stinger
  returns to explore at 4.5 s, both offline and in real time.
- Layers: the 880 Hz stem goes from -62.3 dB, muted, to -13.4 dB within 0.5 s of the volume write at
  2.0 s. The 330 Hz stem stays at -13.4 dB.

**Not yet run:** a rhythm clock (sync method B,
`get_playback_position() + AudioServer.get_time_since_last_mix() - get_output_latency()` with a
monotonic guard). No rhythm game is in scope; the formula comes from the sync doc.

## P10. Mix safety on Master

Master gets an `AudioEffectHardLimiter` with ceiling -1 dB (P1). Measure the mix before the limiter:
put a Capture at index 0 of Master. Then fix the cause (P6) rather than leaning on the limiter
(Aarimous: a limiter helps but distorts). **Live:** covered by P1 and P6.

## P11. Procedural audio: AudioStreamGenerator

```gdscript
var g := AudioStreamGenerator.new()
g.mix_rate_mode = AudioStreamGenerator.MIX_RATE_CUSTOM; g.mix_rate = 22050.0; g.buffer_length = 0.1
player.stream = g; player.play()
var pb: AudioStreamGeneratorPlayback = player.get_stream_playback()   # only after play()
# each _process: n = pb.get_frames_available(); build a PackedVector2Array of n; pb.push_buffer(buf)
```

The full node is `tone_generator.gd`. The generator does not resample, so push at its `mix_rate`.

**Live test** `jobs/generator_tone.gd`, headless in real time. Run in Godot 4.7.2 on 2026-10-02:
**pass**.

| Generator rate | Skips (`get_skips()`) | Measured pitch | Mean fill per frame | RMS       |
| -------------- | --------------------- | -------------- | ------------------- | --------- |
| 22050 Hz       | 0                     | 440.00 Hz      | 0.129 ms            | -15.05 dB |
| 44100 Hz       | 0                     | 440.01 Hz      | 0.302 ms            | -15.05 dB |

## P12. Render the whole mix: Movie Maker

```python
r = gd_run.run_script(P, "jobs/movie_render.gd", args={"seconds": 6.0}, headless=False, timeout=180,
                      extra_args=["--write-movie", str(avi), "--fixed-fps", "60"])   # 160x90 window
a = gd_audio.movie_audio(avi, wav)            # extract PCM, then analyze()
gd_audio.spectrogram_png(wav, png)            # open it
```

**Live test** group movie: two windowed runs with the same seed. Interactive music switches from
explore to combat at 2 s, with pooled hits every 0.25 s. Run in Godot 4.7.2 on 2026-10-02: **pass**.

- 6.4 s of 48 kHz stereo audio.
- Peak -6.26 dB, -19.2 LUFS, true peak -6.2 dBTP.
- The two WAVs have identical MD5.
- The spectrogram was opened: combat (880 Hz) enters at the 4.0 s bar.

## P13. Audio scene audit

```gdscript
const AA = preload("res://addons/agentkit/audio/audio_audit.gd")
var res := AA.scan(get_tree().current_scene)   # no stream, missing bus, bus Master, 3D max_distance 0,
                                               # area_mask 0 while an Area overrides the bus
```

**Live test** `jobs/scene_audit.gd`: one correct player plus four mistakes. Run in Godot 4.7.2 on
2026-10-02: **pass**. It reported 4 players and exactly 4 flags.

## P14. Not runnable here

| Item                                            | Why                                                      | Substitute                                                                                                             |
| ----------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Web Sample playback, bus effects in the browser | needs a web export served to a browser                   | set `playback_type` Stream on effect-dependent players (docs); scenario-godot-performance-export runs the browser test |
| Audio thread ms in the Profiler                 | GUI debugger only                                        | Michael Games' method (H-6p 00:17:55); main-thread request cost is measured in P6                                      |
| FMOD, Wwise, Csound, Vercidium ray tracing      | third-party plugins and authoring apps                   | native buses + SfxPool + Occluder3D; see expert-notes for when middleware is worth it                                  |
| Real Scenario or ElevenLabs generation          | Scenario MCP needs a team and project choice by the user | synthetic MP3s with the same defects (lead silence, hot level, off-target loudness)                                    |

## P15. Round 2: listener, looping `finished`, randomizer coupling, footsteps, mix by game state

Added after blind grading (`tests/grading/G8_grade.md`, "missing from both"). Jobs in
`tests/projects/godot-audio/Audio3D/jobs/`: `r2_audio.gd`, `r2_listener2d.gd`, `r2_mix_snippet.gd`
(the SKILL.md step 8 snippet, verbatim). Evidence:
`tests/live_evidence/godot-audio/round2_20261002/`. Sources: DevWorm 07Kyqqg31FI 00:33:25 and First
Pancake 1PDUD2Ot8gw 00:04:05 (listener), importing-audio doc (`finished` on loops),
AudioStreamRandomizer class doc (coupling, defaults), audio-buses doc (silent buses auto-disable,
not measured), FinePointCGI 7kD7Q3O5P-s 00:38:17 (footstep timer), Just Cause 4 uN8RxOvrxMM 00:19:07
to 00:21:12 (ambience muted above 5 engaged enemies).

```gdscript
# Footsteps: compare with <=, carry the remainder.
step_timer -= delta
if step_timer <= 0.0:
	step_timer += step_interval
	sfx.play(&"footstep", global_position)
```

**Live test**, run in Godot 4.7.2 on 2026-10-02 (headless, Dummy driver, `AudioEffectCapture` on
Master, probe_2tone.wav at 5 m to the right): **pass**.

- 3D, no Camera3D and no AudioListener3D: -200 dB on both channels (silent, no error). Current
  Camera3D at the origin: L -16.03 / R -10.01 dB. An `AudioListener3D` made current at x = 45 (40 m
  past the source): -29.8 dB, L -27.76 / R -33.78 (sides swapped), `is_current()` true. After
  `clear_current()`: back to the camera's -12.05 dB.
- 2D (AudioStreamPlayer2D at 1500, 300 px; defaults max_distance 2000, attenuation 1.0, area_mask
  0): no listener -23.1 dB, right-panned (the viewport center listens); AudioListener2D at 0, 300:
  -29.1 dB; at 1400, 300: -18.5 dB, centered.
- `finished` over 1.0 s of a 0.2 s tone: looping (LOOP_FORWARD) 0 emissions and still playing;
  one-shot 1 emission.
- AudioStreamRandomizer defaults: random_pitch 1.0, semitones 0.0, volume offset 0.0, playback_mode
  0 (random, no repeats). Setting `random_pitch_semitones = 2.0` made `random_pitch` 1.1225; setting
  `random_pitch = 1.5` made semitones 7.0195.
- Footstep timer, 0.35 s interval over 600 frames: `==` gave 0 steps at a fixed 1/60 s delta and 0
  with jittered deltas (0.014 to 0.019 s); `<=` with `+=` gave 28 in both.
- Mix by engaged enemies through `audio_buses.apply_state`: 0 engaged gave Ambience -6 / Music -8, 3
  gave -12 / -6, 8 gave -80 / -4, reached at 0.25 s fades (r2_audio) and 1.0 s fades
  (r2_mix_snippet).
- Not measured: the audio-buses doc's automatic disabling of silent buses (no API reports it).
