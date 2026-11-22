# Sources: performance and release

Notes for each source are in the research folder `notes/performance-export-platforms/` (not
shipped). Credentials as stated by the source or the channel; "unverified" means not checked
further.

## Official documentation (retrieved 2026-10-02, stable)

| Doc                                                                                                                    | Best for                                                                             |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| General optimization tips, https://docs.godotengine.org/en/stable/tutorials/performance/general_optimization.html      | measure first, CPU versus GPU bottleneck math                                        |
| Optimizing 3D performance, https://docs.godotengine.org/en/stable/tutorials/performance/optimizing_3d_performance.html | auto-instancing limits, lights bake mode, transparency, occlusion, LOD, large worlds |
| The Profiler, https://docs.godotengine.org/en/stable/tutorials/scripting/debug/the_profiler.html                       | Inclusive versus Self, C# not covered                                                |
| Exporting for Android, https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_android.html              | SDK pieces, keystores, env vars, adaptive icons                                      |
| Exporting for macOS, https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_macos.html                  | signing, notarization, entitlements, env vars                                        |
| Exporting for the Web, https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html                  | Compatibility only, threads and headers, PWA, MIME, compression, audio playback      |

## Videos

| Source                                                                          | Credential                                 | URL                                         | Best for (timestamps)                                                                                                                             |
| ------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dan Does Dev, Analysing Performance in Godot (2025)                             | Godot educator, unverified                 | https://www.youtube.com/watch?v=s2C2RO_WMh0 | staggered polling [00:05:34-00:06:40], measure first [00:07:12], custom monitors [00:09:06]                                                       |
| Firebelley Games, Stop Using Nodes for Everything (2026)                        | indie dev and Udemy instructor, unverified | https://www.youtube.com/watch?v=1PnG3r1rKcs | RenderingServer items 115 ms to 8 ms [00:00:36-00:04:45]                                                                                          |
| Deep Dive Dev, 12 Tips to Boost Godot Performance (2024)                        | indie dev, unverified                      | https://www.youtube.com/watch?v=O5a4AKemkiQ | physics objects and hurtboxes [00:04:33-00:06:25], tick rate and interpolation [00:03:43]                                                         |
| Deep Dive Dev, MultiMeshInstance2D Rendering (2025)                             | indie dev, self-described non-expert       | https://www.youtube.com/watch?v=DwMoEdAhtYQ | cost of empty nodes [00:06:11], MultiMesh manager and shaders [00:09:08-00:15:40]                                                                 |
| Zenva, Occlusion Culling in Godot (2024)                                        | educator, unverified                       | https://www.youtube.com/watch?v=VBiBZBVxu1s | box occluders versus bake [00:03:25-00:06:33], judging cost [00:07:13]                                                                            |
| Ray Hayes, Forward+ vs Mobile vs Compatibility (2024)                           | indie dev, unverified                      | https://www.youtube.com/watch?v=KWhVVMpihsc | renderer fallback [00:05:12], default choice [00:06:03] (opinion)                                                                                 |
| Ian Bolton (Arm), Profiling Godot on Android with Arm Performance Studio (2025) | Arm developer relations, vendor talk       | https://www.youtube.com/watch?v=WrjaUNAXYqk | debug export cost [00:05:20], thermals [00:09:35], Performance Advisor [00:14:43-00:16:22]                                                        |
| Claire Blackshaw, Shipping a VR Game in Godot (2026)                            | ex-PlayStation, Flammable Penguins         | https://www.youtube.com/watch?v=grdqHJOL5F4 | Label3D [00:09:33], compliance [00:12:33], clean builds [00:16:15], compute to MultiMesh [00:21:26], forks [00:27:27]                             |
| Miguel de Icaza, A Year of Shipping Godot on iOS (2026)                         | creator of Mono and Xamarin, SwiftGodot    | https://www.youtube.com/watch?v=8zqjiRuhQLE | crash telemetry [00:03:40], OS majors [00:09:11]                                                                                                  |
| FinePointCGI, Export to iOS Using Godot 4.3 (2024)                              | developer, unverified                      | https://www.youtube.com/watch?v=x_ZFAV2id3I | xcode-select [00:14:41], simulator limit [00:17:04], TestFlight versions [00:40:34], App Store Connect [00:55:11]                                 |
| Artium Nihamkin, Export Godot to macOS: Sign and Notarize (2025)                | macOS app developer, unverified            | https://www.youtube.com/watch?v=_n9l15CANag | Gatekeeper [00:04:05], ETC2/ASTC [00:09:27], keychain profile [00:25:38], duplicate certificates [00:29:16], staple and spctl [00:32:37-00:36:59] |
| Cashew OldDew, Ultimate Godot Export, Demo and DLC Guide (2024)                 | tutorial maker, unverified                 | https://www.youtube.com/watch?v=vv8Wyean9Ng | web over HTTP [00:02:48], feature tags and DLC packs [00:16:06-00:36:01]                                                                          |
| Brett Makes Games, Godot 4 Exports Explained and itch.io (2023)                 | indie dev, unverified                      | https://www.youtube.com/watch?v=r8KFRLd3Tbo | index.html at zip root [00:05:08], embedded pck trade-off [00:12:04] (threaded web era)                                                           |
| Coding Quests, Godot 4.3 Web Export and itch.io (2024)                          | tutorial channel, unverified               | https://www.youtube.com/watch?v=QB9SyW3mZ2s | 4.3 web changes (threads view; the docs prefer single-threaded)                                                                                   |
| Gwizz, Godot 4 Android Export Tutorial (2023)                                   | indie tutorial, unverified                 | https://www.youtube.com/watch?v=dCLYMF32ZBE | basic Android steps (4.1 era, dated)                                                                                                              |
| BluePhoenix, Godot Steam Upload and Achievements (2023)                         | indie dev, unverified                      | https://www.youtube.com/watch?v=J0GrG-AffCI | GodotSteam build, beta branch [00:04:58-00:12:43] (dated API names)                                                                               |
| StayAtHomeDev, Do THIS Before You Publish (2023)                                | Godot educator, unverified                 | https://www.youtube.com/watch?v=3iGHpha-DmE | pre-publish checklist                                                                                                                             |
| StayAtHomeDev, The Godot Console Problem (2025)                                 | Godot educator, sponsored by W4 Games      | https://www.youtube.com/watch?v=oIRJP5uXGpc | console routes and costs [00:00:22-00:06:39]                                                                                                      |
| WisconsiKnight, Mobile Touch Controls in Godot (2024)                           | indie tutorial, unverified                 | https://www.youtube.com/watch?v=uofaDRa7dWM | TouchScreenButton actions [00:03:21], pointing settings [00:03:03]                                                                                |

## Version facts

- `sources/godot-version-deltas.md` in the research folder: web single-threaded default (4.3),
  physics interpolation (2D 4.3, 3D 4.4), Jolt default (4.6), Android permissions (4.3) and template
  layout (4.6), shader baker (4.5+).
- Live checks on Godot 4.7.2 (2026-10-02): `tests/live_evidence/godot-performance-export/`.
