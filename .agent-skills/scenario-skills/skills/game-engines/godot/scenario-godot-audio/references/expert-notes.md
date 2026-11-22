# scenario-godot-audio expert notes

Principles and judgment by source, with video id and timestamp `[hh:mm:ss]`. Source notes are in
`notes/audio/`. "Observed" means a live run in Godot 4.7.2 on 2026-10-02 (`procedures.md`). [added]
marks my own additions.

## Mixing and voice management

**Guy Somberg** (Telltale core programmer; wrote 13 audio engines. GDC 2014, Vjm--AqG04Y)

- "A lot of audio technology is about not playing sounds": play limits, stream limits, virtual
  voices, ducking [00:05:20].
- Max-radius rule. Inside a radius, cap how many copies of one sound play at once. He keeps two,
  after Walter Murch's "rule of two and a half" [00:05:52 to 00:07:54]. SfxPool `radius_m` /
  `radius_limit` implements it.
- `play()` returns an integer id, never an object. It returns a valid id even when loading failed,
  because callers poll "is my channel valid?" every frame [00:13:51, 00:14:22]. SfxPool follows
  this.
- Start a voice paused, set its 3D and volume parameters, then unpause to avoid a click [00:13:20].
  In Godot, setting `global_position`, `bus` and `volume_db` before `play()` does the same job
  [added].
- Write dB/linear conversion first. 6 dB is double or half amplitude [00:08:58, 00:09:30].
- Listen on different speakers often. Learn to tell a sample break from a buffer overflow
  [00:18:40]. An agent cannot listen, so it reports the numbers and hands the ear check to the user
  [added].

**Aarimous** (indie dev, Hexagod and Chess Survivors. Egf2jgET3nQ)

- One limit per sound type: a count, `has_open_limit()`, and a decrement on `finished` [00:03:06].
- Use `push_error` for an unconfigured sound so development fails loudly [00:04:56].
- Hundreds of identical sounds in one frame spike and distort. Cap per type [00:01:18]. A limiter on
  Master helps but distorts. Observed: 200 naive voices peak at +32.4 dBFS before the limiter, which
  no limiter hides cleanly.

**Michael Games** (H-6pXdzaRSM)

- A pool of 32 AudioStreamPlayers with a wrapped index. `ignore_pool` for music, UI and critical
  sounds [00:09:44].
- In his stress test the audio thread took about 0.5 ms pooled against 1.9 to 2.25 ms unpooled, read
  in the Profiler [00:17:55 to 00:19:32].
- Node churn is cheap in Godot unless the game is sound-heavy.
- Cap versus recycle is the deciding condition. Recycling cuts old sounds; capping drops new ones.
  SfxPool does both: a cap per type, then stealing by priority and distance [added].

**The First Pancake** (Oliver. 1PDUD2Ot8gw)

- When something dies, reparent its sound to the dying node's parent, connect `finished` to
  `queue_free`, then play: "three lines" [00:05:37 to 00:07:15].
- Use several takes plus pitch randomization for frequent sounds, around pitch 1.1 [00:04:35].
- In 2D, max distance about the screen width (2000 px). A missing listener makes a positional sound
  full volume from one side [00:04:05].
- Live [P15]: in 4.7.2 2D without a listener, the viewport center hears (a source at 1500 px: -23
  dB, right-panned). In 3D with no current camera or AudioListener3D, every 3D player is silent
  (-200 dB). Either way the fix is one current listener on the player or camera.

**Dominic Vega** (senior sound designer, Avalanche, Just Cause 4 mix. uN8RxOvrxMM)

- Silo content into returns so the player's own vehicle skips ducking. One snapshot keyed on
  `is_player_controlled` cut per-vehicle mix work from hours to minutes [00:06:11 to 00:08:03].
- Mix by states, not by compressors [00:17:07].
- Time modulates the mix:
  - a storm is loud on entry, its base drops about 10 dB after 15 s, and lightning is lowered after
    another 10 s;
  - ambience mutes above 5 engaged enemies;
  - the combat mix moves in 1 s [00:19:07 to 00:21:12].
- Live [P15]: `combat_mix(engaged)` (0, up to 5, above 5) through `apply_state` reached every target
  bus level at the end of 0.25 s and 1.0 s fades.
- `audio_buses.apply_state` is the Godot form. Godot has no VCA or return objects; buses and sends
  stand in for them [added].

**Game Dev Artisan** (Brady. h3_1dfPHXDg)

- Slider 0..1 in steps of 0.05, `linear_to_db`, mute under 0.05 [00:09:23 to 00:12:10].
- New players forget the bus and ignore the slider, so audit them [00:13:52].
- Look buses up by name [00:10:30]. In 4.7.2, `set_bus_volume_linear` replaces the manual conversion
  (version deltas). Observed: 0.5 gives -6.021 dB.

**DevWorm** (07Kyqqg31FI, Godot 4.3)

- Save the bus layout to the file the project points to, or it will not load [00:27:25, 00:52:36].
- Put a one-off effect (earthquake distortion) on a new bus routed into Music, so the music slider
  still governs it [00:40:57].
- Start new music players at -20 dB, because a track's loudness is unknown [00:12:14]. An agent
  measures it with `gd_audio.analyze` and sets the gain from `loudness_offset_db` [added].
- He says transitions should always be Immediate [00:17:08]. Octodemy and Bittmann disagree. The
  deciding condition: Immediate with Same Position only for ambient or loop-based music.

**Audio QA, Blizzard** (Amanda, Diablo 4 audio QA. Q9ADFeaUpx4)

- One bad collision setting on one actor silenced a loop. Check the same setting on every actor and
  produce a report per level [00:06:56]. `audio_audit.scan` is the agent's version.
- Test every shipped speaker format [00:21:43].

## Space and acoustics

**Blekoh** (mHokBQyB_08)

- Ten rays per source:
  - reverb wetness from the average hit distance, with each miss lowering it;
  - low-pass cutoff from the blocker-to-listener distance ratio;
  - one ray updated per frame;
  - every value lerped, because hard jumps sound harsh;
  - wet capped below 1.0 [00:06:51 to 00:10:51].
- Occluder3D keeps the smoothing and the per-source bus but casts one ray every 0.1 s [added].
  Observed: the cutoff moves from 20 kHz to 800 Hz in about 0.5 s.

**Vercidium** (A6bPUXTlic8)

- In ray-traced audio, reverb needs few rays but enough bounces to decay: about 50 in the demo, read
  from the echogram [00:01:20].
- Geometry only counts with a non-air material [00:00:24].
- Needs OpenAL Soft or FMOD, so it is third-party. Not run here.

**Godot 4.7 (version deltas, observed)**

- `area_mask` defaults to 0, so Area3D bus overrides (reverb zones, as in FinePointCGI's FMOD video
  7kD7) do nothing until it is set. Observed: the Room bus reads -200 with mask 0 and -6.01 dB with
  mask 1.
- Observed [added]: inside unit_size the 3D level is flat (max_db +3 clamp). The distance low-pass
  starts past unit_size and removes 22 dB of 8 kHz at 20 m.

## Adaptive music

**Octodemy** (spBakIGn55E, 4.3)

- Interactive music fails first at import. Set BPM and Beat Count per clip before touching
  transitions. Lowering Beat Count trims a silent tail [00:03:28].
- Build the matrix cell by cell. Every pair gameplay can request needs a cell, or the any-clip row
  [00:03:59 to 00:05:04].
- Fade beats count from the source clip's beat length [00:05:04].
- Fade In for abrupt arrivals (loop to battle), Cross Fade for returns, exit on the next bar
  [00:06:10 to 00:06:43].
- Hold Previous plus return-to-hold sends a one-shot back to the interrupted clip [00:07:49 to
  00:08:20].
- Observed in 4.7.2: hold must sit on the transition that leaves the clip to return to. On the
  transition into the stinger, the music went silent.
- He presents AudioStreamSynchronized as the stem-toggle tool [00:00:40]. Observed: changing a
  stem's volume on the resource during playback takes effect at once.

**Paul Bittmann** (composer and sound designer, 251 Studio. GodotFest 2025, dPXapfE7aHQ)

- Two axes of interactivity:
  - vertical: layers;
  - horizontal: what follows a section.
- Find the game states unique to your game and build around them. Smoothing is where the time goes
  [00:06:28 to 00:12:23].
- Design every state change [00:18:07].
- Slice melodic layers into 2-bar clips in AudioStreamInteractive, rather than toggling stem volumes
  mid-phrase. He finds Synchronized "not really well synchronized to the beat" [00:19:46].
  - Choose Synchronized for tightly looped stems with fades, and Interactive when a layer must
    change on a bar line.
  - Not yet tested on 4.7.2: whether stems drift against the beat. P9 only measured stem volume
    changes.
- Route gameplay through an event dispatcher with one "blueprint" per event (transition, state,
  filter, bus effect). Game code only emits `music_event` [00:22:08 to 00:23:34].
- Native auto-advance and crossfades were limited or buggy on 4.3 and 4.4: "it might not be you"
  [00:17:34, 00:18:39]. On 4.7.2, auto-advance and crossfades worked as specified (observed). The
  no-rule default is the next beat with a fade.
- His note that only Ogg carries BPM is contradicted on 4.7.2: MP3 keeps bpm 120 and beat_count 16
  after import (observed).

**GMTK** (Mark Brown. b0gvM4q2hdI)

- Vocabulary and patterns: layering, branching, stingers, tempo changes. No technique.

**Werner Mendizabal** (godot-csound author. RsOCO_rVT90, tl65HJZKCAM)

- Procedural and MIDI-driven music through Csound or LV2. He does not use Godot's interactive
  streams or the randomizer [tl65 00:22:10].
- When an instrument is removed, stop note-on but keep sending note-off [tl65 00:25:25]. This is the
  niche route.

## Middleware

**FinePointCGI** (Mitch. 7kD7Q3O5P-s)

- FMOD banks: one per level or character, plus a common bank. Saving the FMOD project inside the
  Godot project pollutes it. A changed bank path may crash. `release()` fades out, `stop()` cuts
  [00:30:17, 00:28:30, 00:54:35, 01:15:17].
- Footstep timer: compare with `<=`, not `==`, because delta overshoots [00:38:17].
- Live [P15]: over 10 s at 60 fps, `==` produced 0 steps (fixed and jittered delta); `<=` with `+=`
  produced 28.

**Fama and Garcia** (Wwise, GodotCon 2021. AX4vwsKxcDk)

- The concepts still hold: events, banks, RTPC, states. The API is Godot 3, so it is obsolete.

Deciding condition: native Godot is enough unless a separate audio designer needs authoring tools or
physical acoustics are central (digest).

## Generated audio [added]

These notes are mine, not from the sources. They are based on observations of synthetic stand-ins,
because no real generation ran.

- Generated music and SFX arrive as MP3 with hot levels (one test file: -8.4 LUFS, true peak +1.1
  dBTP) and silent padding.
- Two-pass loudnorm in linear mode keeps the dynamics of long files.
- Peak levelling is the right tool for one-shots under 3 s. EBU R128 integration needs seconds of
  signal: a 0.5 s hit landed 3 LU off target.
- libmp3lame MP3s loop gaplessly in Godot, with a lag of 0 samples. ffmpeg's native Vorbis encoder
  pads 31 samples and the loop wraps 32 samples late.
- Ask the generator for an exact length on the beat grid (bars × 4 × 60 / BPM). `bars_for` checks
  it.
