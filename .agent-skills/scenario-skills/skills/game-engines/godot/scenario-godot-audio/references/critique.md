# scenario-godot-audio critique rubric

Use this rubric to judge your own output before handing off. Score each line pass, fail, or n/a, and
attach the evidence: a result JSON path, a number, or an image you opened. An agent cannot hear.
Every line marked "ear" goes to the user as an open question, never as a pass.

## 1. Routing and buses

- [ ] The layout file loads in a fresh process. `audit_layout` has no flags: sends point left,
      Master is at or under 0 dB, and no `AudioEffectLimiter` is used.
- [ ] Every player is on a named bus other than Master. `audio_audit.scan` reports no flags.
- [ ] Sliders are linear 0..1, map to the bus through `set_volume_linear`, mute under 0.05, and
      persist with ConfigFile.
- [ ] Mix states (combat, menu, dialogue) are data. A state change reaches its targets within the
      fade.

## 2. Combat load (G8)

- [ ] A stress burst runs at peak enemy count: 200 sources at 10 Hz for 2 s, or the brief's number.
- [ ] The peak before the limiter is under 0 dBFS. Live voices per type are at or under the cap. The
      node count is flat.
- [ ] The waveform sheet was opened and shows no solid wall and no periodic bursts from synchronized
      starts.
- [ ] Frequent sounds use a Randomizer with 3 or more takes, nonzero pitch and volume variation, and
      no immediate repeats.
- [ ] The important sounds survive: the player's weapon and nearby threats keep their voices.
      Priority stealing is set so that distant enemies lose voices first.
- [ ] Ear: does the most important sound shine through (Somberg)? Is repetition audible?

## 3. Space

- [ ] Unit size, max distance and the distance filter have been chosen and measured with the P7 job,
      not taken from defaults.
- [ ] Room buses have `area_mask` set on the players they must reach.
- [ ] Occluded sounds drop at least 12 dB at 8 kHz. Long emitters change smoothly, with no jumps in
      the cutoff trace.
- [ ] Ear: does the reverb sound natural, and does the occlusion match the geometry?

## 4. Music

- [ ] `audit_interactive` shows no missing reachable pairs. Every clip has a stream. Auto-advance
      clips do not loop.
- [ ] Each clip's loaded stream has `bpm` and `beat_count`. Loops show lag 0 in
      `audio_meter.loop_seam`.
- [ ] A tone-tracked render of the scripted timeline shows each switch on its bar or beat, and the
      stinger returns to the held clip.
- [ ] Layers (Synchronized) change level as expected at the switch time.
- [ ] Ear: do transitions land musically? Does the stinger fit the key and tempo?

## 5. Assets and intake

- [ ] `audit_imports` returns no flags: music is Ogg or MP3 and loops, SFX are mono, WAV uses QOA,
      there is no 8-bit.
- [ ] Each kind is within 1 LU of its loudness target. True peak is at or under -1 dBTP. One-shots
      have under 10 ms of lead silence.
- [ ] Generated originals are kept untouched next to their prompts. The conditioned copy is what
      gets imported.
- [ ] The procedure is written down: the Scenario or ElevenLabs model and the CU spent, or "not
      generated" with the reason.

## 6. Final mix render

- [ ] A Movie Maker render is at 48 kHz and seeded, and two runs are bit-identical.
- [ ] Integrated loudness is within the target. The spectrogram was opened and shows the expected
      switches.

## Severity

- **Blocker:** clipping before the limiter in normal play, a missing bus (sound on Master), music
  that goes silent after a stinger, a sound that never stops (`finished` awaited on a loop).
- **Major:** no voice caps, Area overrides ignored, unlevelled generated files (spread over 3 LU),
  gaps at loop points.
- **Minor:** stereo SFX, PCM WAV, an untuned distance curve.
