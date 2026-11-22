---
name: scenario-godot-audio
description: "Use when adding or fixing sound in Godot 4.7: audio buses and effects, volume sliders, 'too many sounds', combat audio with hundreds of enemies, sounds clipping or distorting, 3D sound too quiet or not panning, reverb zones not working, occlusion, adaptive or interactive music (AudioStreamInteractive, layers, stingers), music loops with gaps, SFX that repeat, AudioStreamRandomizer, AudioStreamGenerator, import settings, or importing AI-generated music, SFX and voice from Scenario or ElevenLabs."
license: MIT
---

# Godot audio (audio implementer)

Target: Godot 4.7.2.stable, macOS Apple Silicon.

At expert level, the mix is designed as data and then measured. Bus layouts, music transitions and
voice limits are written as specs. Every claim gets checked with numbers read from the mixer, since
an agent cannot listen. Experts spend more effort deciding which sounds not to play than on playing
them. That is the core of combat audio. If a sibling skill named here is missing from your available
skills, load it with `skill_get` (Scenario MCP) or ask the user to install it
(https://github.com/scenario-labs/skills#install); unattended, proceed from tool schemas and flag
the gap.

**REQUIRED BACKGROUND:** scenario-godot-expert (channels, `gd_run`, the review loop, 4.7 traps).

**Status (2026-10-02):** 18 live jobs in 12 test groups, the round-2 checks (P15) and 13 offline
tests all pass in Godot 4.7.2 ([`references/procedures.md`](references/procedures.md),
`tests/code/godot-audio/`).

## Stance (the expert delta)

1. **Measure headless; do not trust the "no sound" warning.** The version deltas say `--headless`
   uses the Dummy driver and is silent. That is true for the speakers only. In 4.7.2 the Dummy
   driver still mixes in real time at 44.1 kHz. Peak meters, `AudioEffectCapture` and
   `AudioEffectRecord` all work there, and a -24.08 dBFS file reads -24.07 (observed). For timing,
   render offline with `AudioStreamPlayback.mix_audio()` (`audio_meter.render_stream`),
   sample-exact; real-time recordings start about 0.2 s late (observed).
2. **Good combat audio comes from not playing sounds.** Somberg: "a lot of audio technology is about
   not playing sounds" (Vjm-- 00:05:20). Cap each sound type, keep about two plays within a radius,
   and cull by distance before spending a voice. Measured here with 200 enemies firing at 10 Hz: the
   naive mix peaks at +32.4 dBFS before the limiter, while a 32-voice pool with caps peaks at +8.5
   (P6).
3. **Watch out for synchronous starts.** With a hard cap and no cooldown, all 12 voices start on the
   same tick and end together. The mix then pulses in bursts (waveform sheet, P6). A per-type
   cooldown of 25 ms plus 4 randomized takes spreads them out, and the peak drops to -13.9 dBFS
   [added, measured].
4. **Write music as a transition table and audit every reachable pair.** Octodemy builds the matrix
   cell by cell (spBa 00:03:59). Bittmann wants every state change designed (dPXa 00:18:07). An
   unlisted pair is not a hard cut. In 4.7.2 it waits for the next beat, then fades the source out
   over about one beat (observed, P9). `music_builder.audit_interactive` lists the missing pairs.
5. **Put hold on the transition that leaves the clip you want to come back to.** Docs and Octodemy
   describe "hold previous" plus return-to-hold (spBa 00:07:49). In 4.7.2 the return only works when
   hold is set on the earlier transition, the one that leaves the interrupted clip. With hold on the
   transition into the stinger, all 6 variants went silent after the stinger (observed, P9).
6. **Route everything through named buses, and reference them by name.** Create Music and SFX buses
   first (DevWorm 07Ky, Game Dev Artisan h3_1). A player whose bus is renamed reads back `"Master"`
   and plays there. It recovers once the name is restored (observed). Audit scenes for players on
   Master or on missing buses (P13).
7. **Measure spatial audio on the real curve.** With 4.7.2 defaults (unit_size 10, max_db +3), a 3D
   source is flat from 1 m to 7 m, drops 3 dB at 10 m and 21 dB at 80 m. A low-pass removes a
   further 22 dB of 8 kHz at 20 m. `area_mask` defaults to 0, so Area3D reverb overrides do nothing
   until it is set to 1 (P7).
8. **Condition generated audio before import, and verify it on the loaded resource.** AI MP3s arrive
   hot (one test file: -8.4 LUFS, peak +0.99 dB) with silent padding. Normalize long files with
   two-pass loudnorm. Level short one-shots by peak, because loudnorm missed its target by 3 LU on a
   0.5 s hit (observed, P4).

## Establish first

| Input                           | Why it changes the plan                                                                                  | Default if not given                                |
| ------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Platform (desktop, mobile, web) | Web plays in Sample mode by default (`default_playback_type.web` = 1), which bypasses bus effects (docs) | desktop                                             |
| 2D or 3D, listener              | AudioStreamPlayer2D or 3D, unit size, max distance                                                       | 3D, Camera3D listener                               |
| Peak simultaneous sources       | pool size, caps                                                                                          | 200 enemies, 32 voices                              |
| Music style (rhythmic, ambient) | bar or beat exits versus immediate, BPM import                                                           | rhythmic, 4/4                                       |
| Asset source                    | conditioning: AI (scenario-audio, scenario-elevenlabs) or a sound designer                               | AI files, conditioned                               |
| Middleware (FMOD, Wwise)        | native nodes versus plugin banks                                                                         | native Godot                                        |
| Loudness targets                | per-kind LUFS                                                                                            | -18 LUFS SFX, voice and music; -24 ambience [added] |

## Workflow

1. **Buses as data (P1, P2).** Build the layout from `audio_buses.COMBAT_LAYOUT` with
   `build_layout`, save it to the file named by `audio/buses/default_bus_layout`, and reload it in a
   fresh process. GATE: `audit_layout` returns no flags, and the HardLimiter is on Master after the
   reload. A slider at 0.5 sets -6.02 dB, and the output drops 6.02 dB.
2. **Import settings (P3).** Edit `.import` keys with `gd_audio.set_import_params`, run
   `gd_run.import_project`, then read the loaded resource. GATE: music has `loop`, `bpm` and
   `beat_count` set on the loaded stream, and `gd_audio.audit_imports` returns no flags.
3. **Generated assets (P4).** `prepare_ai_audio(src, dst, kind)` trims silence, levels the file and
   converts SFX to mono WAV. `bars_for(seconds, bpm)` gives `beat_count`. GATE: a loudness spread
   under 1 LU per kind, no lead silence, and a loop seam with a lag of 0 samples from
   `audio_meter.loop_seam(stream)`.
4. **SFX variation (P5).** Use AudioStreamRandomizer with 3 or more takes, pitch in semitones and a
   volume offset. GATE: no repeats over 24 plays, all takes used, and the measured pitch within the
   set range.
5. **Voices (P6).** Use `SfxPool` with per-type `limit`, `radius_m`, `radius_limit`, `cooldown_ms`,
   `max_distance_m` and priority stealing. GATE: on the 200-enemy burst, live voices stay within the
   cap, the node count stays flat, and the peak before the limiter is under 0 dBFS. Then open the
   waveform sheet and look at it.
6. **Space (P7, P8, P15).** Listener first: in 3D with no current Camera3D or AudioListener3D, every
   3D player is silent (-200 dB). `AudioListener3D.make_current()` overrides the camera (moved 40 m
   off: -12.1 to -29.8 dB, sides swapped). In 2D without a listener the viewport center hears: put
   an `AudioListener2D` on the player (DevWorm 07Ky 00:33:25, First Pancake 1PDU 00:04:05). Then
   unit_size, max_distance, `area_mask = 1` for room buses, and occlusion (one ray at play time for
   shots, `Occluder3D` for long emitters). GATE: one current listener; every positional player on a
   named non-Master bus (`audio_audit.scan`); measured levels per distance, left/right balance, and
   an 8 kHz drop of 12 dB or more when blocked.
7. **Music (P9).** Build the interactive stream with `music_builder.build_interactive(spec)`, audit
   it and save it as `.tres`. Use AudioStreamSynchronized stems for layers. GATE: a tone-tracked
   offline render shows each switch on its bar or beat, and the stinger returns to the held clip.
8. **Mix states keyed on game state (P2, P15).** Just Cause 4 mutes ambience above 5 engaged enemies
   and moves the combat mix in about 1 s (uN8R 00:19:07 to 00:21:12). Write the state as a function
   of the game, not of the audio:
   ```gdscript
   static func combat_mix(engaged: int) -> Dictionary:
   	if engaged == 0: return {"Ambience": -6.0, "Music": -8.0}
   	if engaged <= 5: return {"Ambience": -12.0, "Music": -6.0}
   	return {"Ambience": -80.0, "Music": -4.0}
   # on change: audio_buses.apply_state(self, combat_mix(n), 1.0)
   ```
   GATE: for 0, 3 and 8 engaged, each bus reaches its target within the fade (measured exact at 0.25
   s). Do not toggle buses by hand for silence: Godot disables a silent bus after a few seconds by
   itself (audio buses doc).
9. **Render the mix (P12).** Run Movie Maker with `--write-movie x.avi --fixed-fps 60` (windowed,
   160x90), then `gd_audio.movie_audio`. GATE: 48 kHz output, two seeded renders with identical MD5,
   integrated loudness inside the target, a true peak under -1 dBTP, and a spectrogram that you
   open.

## Numbers

| Value                          | Measured or source                                                                | Relative to                                              |
| ------------------------------ | --------------------------------------------------------------------------------- | -------------------------------------------------------- |
| 3D level, flat region          | 1 to 7 m at 0 dB, -3 dB at 10 m, -8.9 at 20, -14.8 at 40, -20.7 at 80 (500 Hz)    | inverse model, unit_size 10, max_db +3                   |
| Distance low-pass              | none at 10 m; 8 kHz a further -22 dB at 20 m, -29 at 40 m                         | defaults 5000 Hz, filter_db -24; filter_db 0 disables it |
| Pan, 5 m to the right          | L -16.0 / R -10.0 dB                                                              | panning_strength 1.0 times project 3d 0.5                |
| Linear slider                  | 0.5 is -6.02 dB; mute under 0.05                                                  | Game Dev Artisan (h3_1 00:09:23)                         |
| Pool                           | 32 voices, ring of players                                                        | Michael Games (H-6p 00:09:44)                            |
| Radius rule                    | keep about 2 plays per radius                                                     | Somberg (00:05:52), Murch's "rule of two and a half"     |
| Combat peak before the limiter | naive +32.4, pooled +8.5, tuned -13.9 dBFS                                        | 200 enemies, 10 Hz, 2 s (P6)                             |
| Occlusion                      | 8 kHz -58 dB through a 1 kHz low-pass; Occluder3D 20 kHz to 800 Hz in about 0.5 s | P8                                                       |
| Loudness targets               | -18 LUFS SFX, voice, music; -24 ambience; true peak -1 dBTP                       | [added] starting points                                  |
| Short-sound threshold          | under 3 s, peak level to -3 dBFS                                                  | loudnorm missed by 3 LU on 0.5 s (P4)                    |
| Master                         | never above 0 dB; work in -60 to 0 dB                                             | audio buses doc                                          |

## Quality gates

- **Measurable:** a clean `audit_layout`; a clean `audit_interactive`, with no missing reachable
  pairs; a clean `audit_imports`; a clean `audio_audit.scan` (no players on Master, no missing
  streams, `area_mask` set where an Area overrides the bus). On the stress burst, the peak before
  the limiter is under 0 dBFS, live voices are at or under the cap, and the node count is stable.
  `analyze()` per file: loudness within 1 LU of target, true peak at or under -1 dBTP,
  `lead_silence_s` under 0.01 for one-shots. Loop seams show lag 0. Generator `get_skips()` is 0.
- **Visual:** a waveform contact sheet of naive, pooled and tuned stress renders, and a spectrogram
  of the Movie Maker mix. Open them and look for walls of clipping, periodic bursts and missing
  switches.
- **By ear (the user):** musicality of transitions, repetition feel, reverb naturalness. Say so; do
  not claim it.

## Common mistakes

| Mistake                                                  | What it looks like                              | Fix                                                                                         |
| -------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------- |
| One AudioStreamPlayer3D per enemy, play on every shot    | +32 dBFS wall, limiter pumping, 200 live voices | SfxPool with caps, radius rule, cooldown                                                    |
| A cap without a cooldown                                 | Mix pulses every clip length                    | `cooldown_ms` 25 or more, Randomizer takes                                                  |
| Area3D reverb zone does nothing                          | Room bus reads -200 dB                          | `area_mask = 1` on players (4.7 default 0)                                                  |
| Bus renamed in the layout                                | Player shows `Master`, ignores the slider       | Keep names stable; `audio_audit.scan`                                                       |
| Hold set on the transition into the stinger              | Music silent after the stinger                  | Hold on the transition leaving the held clip                                                |
| Trusting the `.import` text                              | Loop still off in game                          | Check the loaded stream's `loop` and `bpm`                                                  |
| loudnorm on a 0.5 s hit                                  | -21 LUFS instead of -18                         | Peak-level short sounds (`prepare_ai_audio`)                                                |
| Music as WAV, SFX in stereo                              | Large builds, wasted mono fold                  | `audit_imports`: Ogg or MP3 music, mono SFX                                                 |
| Awaiting `finished` on looping audio                     | Code hangs                                      | `finished` fired 0 times in 1 s on a looping 0.2 s clip, once without loop (docs, P15)      |
| No current listener in 3D                                | Every 3D sound silent, no error                 | a current Camera3D or `AudioListener3D` (P15)                                               |
| Setting both `random_pitch` and `random_pitch_semitones` | The second silently overwrites the first        | one property: 2 semitones is `random_pitch` 1.1225; all variation defaults to 0 (docs, P15) |
| Footstep timer tested with `==`                          | No steps at all: 0 in 10 s                      | `timer <= 0.0`, then `timer += interval`: 28 steps (FinePointCGI 7kD7 00:38:17, P15)        |
| `AudioEffectLimiter` on Master                           | Deprecated warning                              | `AudioEffectHardLimiter`, ceiling -1 dB                                                     |
| Bus effects on web                                       | No reverb or filters in the browser             | Playback type Stream for those players (docs)                                               |
| Ogg made with ffmpeg's native `vorbis` encoder           | Loop wraps 32 samples late (8.0007 s file)      | Use libvorbis or MP3 with a gapless header; check `audio_meter.loop_seam`                   |

## Handoffs

- **Receives:** MP3/WAV with prompt, BPM and duration from scenario-audio and scenario-elevenlabs
  (through `prepare_ai_audio`, then P3); events, positions and the engaged-enemy count from
  scenario-godot-gameplay; autoload placement from scenario-godot-architecture; slider nodes from
  scenario-godot-ui.
- **Delivers:** bus names and `save_volumes`/`load_volumes` to scenario-godot-ui; a
  `play(type, pos)` API returning an int id to scenario-godot-gameplay; pool stats and the web
  Sample-mode list to scenario-godot-performance-export; the live test file to
  scenario-godot-pipeline-automation.
- **Packet:** project path, layout and music specs, result JSONs, waveform sheet, spectrogram,
  `analyze()` table, open issues.

## Godot 4.7 notes

- `area_mask` defaults to 0 on AudioStreamPlayer2D and 3D (4.7). Area bus overrides need it set to 1
  (verified).
- `AudioEffectLimiter` is deprecated; use `AudioEffectHardLimiter`.
  `AudioEffectSpectrumAnalyzer.tap_back_pos` is removed.
- `set_bus_volume_linear`, `volume_linear` and `max_polyphony` (default 1) exist.
  AudioStreamInteractive, Synchronized and Playlist date from 4.3.
- MP3 carries `bpm` and `beat_count` like Ogg (verified). AudioStreamWAV has no `bpm`, so
  beat-synced clips must be Ogg or MP3.
- WAV imports default to QOA (`compress/mode` 2, format 3).
- Headless mixes through the Dummy driver (stance 1). Movie Maker needs a window.
- Godot 3 habits to drop: `yield`, Tween nodes, `ResourceSaver.save(path, res)`.

## References

- [`references/procedures.md`](references/procedures.md) (P1 to P15 with code and results;
  generator, pool cost and Movie Maker numbers are there),
  [`expert-notes.md`](references/expert-notes.md) (principles by expert, timestamps),
  [`critique.md`](references/critique.md) (rubric), [`gui-paths.md`](references/gui-paths.md) (Audio
  panel, transition matrix, Import dock, Profiler), [`sources.md`](references/sources.md).
- [`scripts/gd_audio.py`](scripts/gd_audio.py): install, import edit and audit, `analyze`, tone
  tracking, AI intake, movie audio, pictures.
- [`scripts/agentkit/audio/`](scripts/agentkit/audio/): `audio_meter`, `audio_buses`,
  `music_builder`, `sfx_pool`, `occluder_3d`, `tone_generator`, `audio_audit`.
