# scenario-godot-audio sources

Notes for every source are in `notes/audio/` (digests: `_digest_videos_audio.md`,
`_digest_docs_audio.md`). Credentials marked (unverified) are as stated by the channel. Version
facts come from `sources/godot-version-deltas.md` section 12, re-checked live on 4.7.2 (see
`procedures.md`).

## Videos

| Expert                 | Credential                                 | Video                                                                                                                  | Best for                                               | Best timestamps                        |
| ---------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------- |
| Guy Somberg            | Telltale core programmer, 13 audio engines | [GDC 2014, Vjm--AqG04Y](https://www.youtube.com/watch?v=Vjm--AqG04Y)                                                   | not playing sounds, radius rule, id-returning API      | 00:05:20, 00:05:52, 00:13:20, 00:14:22 |
| Paul Bittmann          | composer and sound designer, 251 Studio    | [GodotFest 2025, dPXapfE7aHQ](https://www.youtube.com/watch?v=dPXapfE7aHQ)                                             | adaptive music framework, native stream limits         | 00:06:28, 00:17:34, 00:19:46, 00:22:08 |
| Octodemy               | Godot educator (unverified)                | [spBakIGn55E](https://www.youtube.com/watch?v=spBakIGn55E)                                                             | AudioStreamInteractive matrix cell by cell, import BPM | 00:03:28, 00:05:04, 00:06:10, 00:07:49 |
| Dominic Vega           | senior sound designer, Avalanche (JC4)     | [GDC 2019, uN8RxOvrxMM](https://www.youtube.com/watch?v=uN8RxOvrxMM)                                                   | mix states, siloed returns, time-modulated mix         | 00:06:11, 00:17:07, 00:19:07           |
| Aarimous               | indie dev, Hexagod (unverified)            | [Egf2jgET3nQ](https://www.youtube.com/watch?v=Egf2jgET3nQ)                                                             | per-type voice limit, fail loudly                      | 00:01:18, 00:03:06, 00:04:56           |
| Michael Games          | (unverified)                               | [H-6pXdzaRSM](https://www.youtube.com/watch?v=H-6pXdzaRSM)                                                             | 32-player pool, audio thread profiling                 | 00:09:44, 00:17:55                     |
| Blekoh                 | Godot dev (unverified)                     | [mHokBQyB_08](https://www.youtube.com/watch?v=mHokBQyB_08)                                                             | per-source reverb and occlusion with rays              | 00:06:51, 00:07:21, 00:10:51           |
| Game Dev Artisan       | Brady (unverified)                         | [h3_1dfPHXDg](https://www.youtube.com/watch?v=h3_1dfPHXDg)                                                             | linear sliders, mute floor, bus by name                | 00:09:23, 00:13:52                     |
| The First Pancake      | Oliver, teacher (unverified)               | [1PDUD2Ot8gw](https://www.youtube.com/watch?v=1PDUD2Ot8gw)                                                             | death sound reparent, listener, pitch variation        | 00:04:05, 00:04:35, 00:05:37           |
| DevWorm                | Godot educator (unverified)                | [07Kyqqg31FI](https://www.youtube.com/watch?v=07Kyqqg31FI)                                                             | full worked system on 4.3, layout file trap            | 00:12:14, 00:27:25, 00:40:57           |
| Amanda (Blizzard)      | audio QA SME, Diablo 4                     | [GDC 2023, Q9ADFeaUpx4](https://www.youtube.com/watch?v=Q9ADFeaUpx4)                                                   | audio QA passes and bug reports                        | 00:06:56, 00:21:43                     |
| FinePointCGI           | Mitch, developer (unverified)              | [7kD7Q3O5P-s](https://www.youtube.com/watch?v=7kD7Q3O5P-s)                                                             | FMOD in Godot, banks, footsteps                        | 00:28:30, 00:30:17, 00:38:17           |
| Vercidium              | graphics and audio dev (unverified)        | [A6bPUXTlic8](https://www.youtube.com/watch?v=A6bPUXTlic8)                                                             | ray-traced audio model (third-party)                   | 00:00:24, 00:01:20                     |
| Mark Brown (GMTK)      | game design critic                         | [b0gvM4q2hdI](https://www.youtube.com/watch?v=b0gvM4q2hdI)                                                             | adaptive music vocabulary                              | whole video                            |
| Werner Mendizabal      | godot-csound author (unverified)           | [RsOCO_rVT90](https://www.youtube.com/watch?v=RsOCO_rVT90), [tl65HJZKCAM](https://www.youtube.com/watch?v=tl65HJZKCAM) | Csound and LV2 procedural music                        | tl65 00:22:10, 00:25:25                |
| Mostly Mad Productions | (unverified)                               | [7Bb7GoU1DHA](https://www.youtube.com/watch?v=7Bb7GoU1DHA)                                                             | looping background music basics                        | whole video (3 min)                    |
| Fama and Garcia        | Wwise integration, GodotCon 2021           | [AX4vwsKxcDk](https://www.youtube.com/watch?v=AX4vwsKxcDk)                                                             | middleware concepts (Godot 3 API, obsolete)            | concepts only                          |

## Official documentation (retrieved 2026-10-02)

| Page                                   | URL                                                                                           | Best for                                      |
| -------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Audio buses                            | https://docs.godotengine.org/en/stable/tutorials/audio/audio_buses.html                       | routing, levels, rename trap, web Sample mode |
| Importing audio samples                | https://docs.godotengine.org/en/stable/tutorials/assets_pipeline/importing_audio_samples.html | import options, QOA, sizes, loop rules        |
| AudioStreamInteractive                 | https://docs.godotengine.org/en/stable/classes/class_audiostreaminteractive.html              | clips, transitions, hold, auto-advance        |
| AudioStreamRandomizer                  | https://docs.godotengine.org/en/stable/classes/class_audiostreamrandomizer.html               | playback modes, coupled pitch properties      |
| AudioStreamGenerator                   | https://docs.godotengine.org/en/stable/classes/class_audiostreamgenerator.html                | procedural audio, GDScript rate advice        |
| Sync the gameplay with audio and music | https://docs.godotengine.org/en/stable/tutorials/audio/sync_with_audio.html                   | rhythm clock methods A and B                  |

Local copies: `sources/docs/audio__*.md`.

## Sister skills

- scenario-audio, scenario-elevenlabs: generate music, SFX, ambience and voice that P4 conditions.
- scenario-godot-expert: the toolkit (`gd_run`, `gd_review`, AgentKit) and routing.
