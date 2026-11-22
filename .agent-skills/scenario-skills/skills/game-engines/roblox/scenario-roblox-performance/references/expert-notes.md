# Expert notes: performance and release

Principles and judgment calls, grouped by source, with timestamps. Full source list:
[sources.md](sources.md). Lines marked [added] are this skill's own synthesis. Lines marked "Live"
were measured in Studio 0.743 on 2026-10-19 (see [procedures.md](procedures.md)). Memory, rig and
crowd procedures: [memory-and-crowds.md](memory-and-crowds.md).

## Budgets: Peter McNeill (MrChickenRocket), RDC 2024 (cWDNVvOh4o0)

- Health-check while you build, never as a last pass: optimized games are played longer and make
  more money [00:02:37].
- Six causes cover most problems: triangles, draw calls, CPU, memory, load time and bandwidth
  [00:04:14].
- Benchmark on a 2 GB phone of the iPhone 6s or Galaxy S6 class. About 90 percent of players have
  something better [00:09:10].
- Budget card [00:36:05]: under 500,000 scene triangles, under 500 scene draw calls, under 1.3 GB
  client memory, under 150,000 instances, under 50 KB/s replication downstream, low client CPU.
- UI draw calls count inside the 500 scene budget: 150 UI draws leave about 350 for the world
  [00:16:04].
- A draw call is one mesh and material pair. Identical MeshId and material batch even when color,
  size and rotation differ [00:10:35].
- Batching tier list [00:18:50]: S Color3, SurfaceAppearance Color3, CFrame, Size. A Meshes,
  SurfaceAppearances, Materials. B Parts, Lights (not Future). C Unions. D Textures, Decals,
  Transparency (sometimes). F Beams, Trails, Particles, Adornments.
- A group that cost 2 draws opaque cost 16 once it became transparent [00:14:25].
- Four visible particle emitters cost 5 draw calls in his demo [00:20:20].
- Shadow draws are healthy at up to about 3 times the scene draws [00:17:08].
- Measure any construct by cloning it many times in the sky with render stats open [00:19:29].
- Phones run CPU work at about a quarter of desktop speed: 10 ms on a desktop is about 40 ms on a
  phone [00:22:20].
- Most "crashes" are out-of-memory ejections. Phones start ejecting past about 66 percent of 2 GB,
  so aim under 1.3 GB [00:27:05].
- The F9 memory number "is incorrect in Studio, you need to test live" [00:28:35].
- A 1024 SurfaceAppearance set (color, normal, roughness, alpha) holds about 2.8 MB [00:29:57].
- A part costs about 1 KB of client memory [00:30:30].
- Join replicates about 10,000 instances per second: 300,000 instances take about 30 s [00:33:05].
- Each server-owned moving assembly costs about 1 KB/s of bandwidth [00:34:35].
- "Excessive scripts are usually your fault" [00:25:46]. A spawn of 10,000 coins showed as a
  Heartbeat spike.

## Incidents: McNeill and Lynn, RDC 2025 (rwLEnBtXr30)

- Most top-game problems are client memory crashes, low client frame rate or server CPU overload
  [00:03:50].
- Triage order: make sure the game works, test on a real device, check frame rate, open the stats
  (F2) for scene complexity, then the MicroProfiler [00:29:19].
- Dead Rails: anchoring zombies and disabling their Animators outside combat range halved server CPU
  [00:09:24].
- About 400 parts stayed awake because props clipped into tables. Anchoring pickups out of player
  range fixed it without fixing every placement [00:12:08].
- Resizing a welded server part re-replicates the whole assembly. Cosmetic resizing belongs on the
  client [00:13:45].
- Grow a Garden: a server loop added attributes and tags to every part. They replicate to every
  client, and the crash rate rose from 3 to 4 percent to 45 percent [00:16:34].
- About 600 MB is usable on low-end devices, and past about 1.4 GB the crash rate climbs [00:04:22,
  00:16:34].
- A 12,000-triangle coconut repeated hundreds of times cost the frame rate. A Roblox sphere is about
  432 triangles [00:18:25].
- Make the game testable under load in Studio with debug spawners [00:19:32].
- Server MicroProfiler dumps are now 5 times smaller, carry network traffic and support a
  side-by-side diff [00:24:19].
- Server-only data belongs in Luau tables, not tags and attributes [00:30:58].
- Bake many parts into a few meshes when mesh collision is acceptable: each part carries about 1 KB
  [00:33:09].
- Streaming does nothing when every player stands in one tight area, as at a virtual convention of
  several hundred players. Fit custom replication inside 40 to 50 KB/s and lighten player models on
  clients [00:37:31], [00:38:04].

## Lag fixes: Crusherfire (YWyJHwynM1M)

- Start at Developer Console > Memory, skip core memory, read Place memory [00:02:14].
- Props nobody collides with get Box collision fidelity. Default and Precise cost the most memory
  [00:04:26, 00:05:00].
- Sounds parked in SoundService stay resident. His game fell from about 500 MB to 58 MB of sounds by
  creating them at play time [00:09:04].
- Heavy folders move from ReplicatedStorage to ServerStorage so clients never download them
  [00:11:39].
- Set Workspace.PlayerCharacterDestroyBehavior to Enabled so old characters and players are
  destroyed [00:12:34].
- Make duplicate-looking meshes share one MeshId. Two tire IDs that should be one double the draws
  [00:21:31].
- RenderFidelity Automatic: highest under 250 studs, medium to 500, lowest beyond [00:25:48].
- Static NPCs get EvaluateStateMachine off [00:26:38].
- BulkMoveTo with FireCFrameChanged measured about 0.255 ms against about 0.49 ms of per-part writes
  on his spinner [00:29:30]. The gain shows at hundreds of parts [00:30:39].
- Incoming network under 50 KB/s. A DevForum case fell from 300 to 350 KB/s to about 5 KB/s by
  interpolating NPCs on clients [00:33:07, 00:36:24].
- "Never tween on the server" [00:37:30].

## Leaks: Crusherfire (0moy04A9vFg) and Roblox Learn (x1JgsC8c8VQ)

- Server leaks matter more: a server lives through hundreds or thousands of players (0moy
  [00:02:48]).
- Healthy memory is a sawtooth. A leak is memory that never comes down (x1Jg [00:05:58]).
- Snapshot in the same baseline state, compare, and repeat three or four times. Trust only rows that
  keep rising (0moy [00:09:05]).
- Many RBXScriptConnection objects in Object Classes mean leaked connections. His baseline held
  16,602 (0moy [00:07:39]).
- Memory categories belong to the thread that allocates, defaulting to the script name.
  `debug.setmemorycategory` renames a thread (0moy [00:07:23]).
- Typical leaks: observers never added to a cleanup object, instance-keyed tables never cleared, a
  connection stored in a cleanup object of the wrong lifetime, third-party caches (0moy [00:12:47]
  to [00:18:40]).
- Players and characters are not always destroyed when players leave (x1Jg [00:06:58]).
- Studio client memory read 7 to 9.9 GB in his session, so Studio totals are not game numbers (0moy
  frames [00:04:33] to [00:20:10]).
- Server memory starts at 6.25 GB and rises with player count. An old phone has about 2 GB with 700
  MB used by the system (x1Jg [00:00:43], [00:01:17]).

## Memory, LOD and overview: Roblox Learn (OCUZKJJR-TE, VDO_amtWfDw, Wwj8EkMWFhI)

- Streaming saved about 1 GB on a large scene. Tune it rather than turn it off (OCUZ [00:01:45],
  [00:02:17]).
- Texture memory is pixel count: each size step costs 4 times. 512 is enough unless a surface fills
  the screen (OCUZ [00:02:46], [00:03:19]).
- PBR maps of one set are packed and upscaled to the largest, so mixed sizes save nothing (OCUZ
  [00:04:59]).
- AudioPlayer.AutoLoad false loads audio on demand (OCUZ [00:08:08]).
- Humanoids are heavy: a static NPC needs only an AnimationController and an Animator. 200 players
  in a tight space can challenge any device, so space them out (OCUZ [00:07:29]).
- If streaming is not enough, space players out or lower max players per server, and watch
  `updateInvalidatedFastClusters` (VDO [00:06:07]).
- The device emulator is for UI and controls; its memory numbers are the computer's (OCUZ
  [00:01:08]).
- Keep StreamingMinRadius below StreamingTargetRadius: "When everything's a priority, nothing's a
  priority" (VDO [00:03:58]).
- CPU culprits in order: scripts, physics, lighting. Unanchored parts are the main physics cost (VDO
  [00:06:50], [00:07:24]).
- Raycasts and scene searches every PreRender brought the demo to a crawl (VDO [00:06:52]).
- Do not micro-optimize early; "code is supposed to take time to execute" (VDO [00:08:47]).
- SLIM is the LOD sweet spot in many cases; StreamingMesh needs a target radius of at least 1,000
  studs (Wwj8 [00:03:24], [00:03:51]).
- `Model.LevelOfDetail` is set per model: Automatic or Disabled drops it outside the radius,
  StreamingMesh shows a crude stand-in, SLIM picks generated meshes by distance and still works on
  Persistent models (Wwj8 [00:02:23], [00:04:27]).

## MicroProfiler: Roblox docs and Roblox Learn (XLCZfGEm9tU, eWf-6Sh-9Os)

- Consistent frame times matter more than average fps: 59 frames at 10 ms plus one at 410 ms
  stutters at "60 fps" (XLCZ [00:02:12]).
- Fix the longest lowest-level child label; parents cannot finish before children (XLCZ [00:01:22]).
- Orange bars are CPU jobs, blue is render, red adds GPU wait over 2.5 ms. Colors matter only when
  goals are missed (docs; eWf [00:01:40]).
- Save captures and compare files instead of noting numbers by hand (eWf [00:04:20]).
- Profile on cheap hardware: carry an old phone and an old tablet of about $80 (RDC23 panel, sSVh
  [00:23:25]).

## Docs facts used as gates

- Server heartbeat is capped at 60. Read Steps Per Sec in Server Jobs (identify).
- Server memory is 6.25 GiB plus 100 MiB per player of the largest count, and does not shrink when
  players leave. Keep under half (identify).
- Investigate client crash rates above 2 to 3 percent, especially a jump after an update (identify).
- Android is about 65 percent of players, most with 2 to 4 GB of RAM. A thermal test needs 10 to 15
  minutes of active play (test-on-hardware).
- Preloading all of Workspace lengthens load. Preload the loading screen, menu icons and spawn area
  only (improve).
- Keep ReplicatedStorage and ReplicatedFirst lean; heavy assets wait in ServerStorage (improve).
- `updateInvalidatedFastClusters` over 4 ms in the MicroProfiler often means avatars are created or
  changed too often. Size, scale and other property changes on rigs rebuild FastClusters (improve).
- Skinned MeshParts moving in a Model without a Humanoid sit in spatial FastClusters that rebuild as
  they move. A Humanoid in the model forces one cluster but costs memory: use it only on moving
  models and profile after (improve).
- Static NPCs need no Humanoid; moving ones can use an AnimationController with their own movement
  code. Create NPC Animators on the client, pool respawning NPCs and spawn them only near players
  (improve).
- Server TweenService replicates every frame; tween on the client (improve).
- Restart only servers with outdated versions, with an optional 1 to 60 minute delay.
  `ServerRestartScheduled` gives restartTime, source and attributes (update-games).
- Never Publish when swapping a start place; use Publish As and Overwrite (publish).
- Up to 5 never-released games can be released per day. Fees: 1,000 Robux to publish, 50,000 Robux
  for expedited review (publish).
- Restoring a version creates a new version and does not publish it (version-history).

## Live measurements (Studio 0.743, 2026-10-19)

Lab place: 2,000 coins, 30 simulated players, a leaking effect and a 1,200-cell HUD; one change per
playtest. Test ids point to [procedures.md](procedures.md). Studio values on a desktop, not phone
values.

- Live: anchoring 2,000 coins took server contacts from about 16,300 to 0 and server physics p95
  from 14.5 to 17.6 ms down to under 0.1 ms (C1, two runs).
- Live: anchored coins that the server still spun sent 7.6 to 10 MB/s; spinning them on clients
  brought server sends to 12 KB/s (C3). This matches McNeill's point that server-owned motion costs
  bandwidth.
- Live: one `BulkMoveTo` cost 2.0 ms per frame against 4.2 ms for 2,000 `CFrame` writes (C2).
  Crusherfire measured about half on his spinner.
- Live: the every-frame scan cost 9.8 to 15.3 ms per frame in the MicroProfiler; the 10 Hz grid scan
  cost 0.01 ms (C4b). Server script time fell from 6.5 to 0.46 ms per frame (C4).
- Live: with the leak on, 710 to 780 orbs stayed tracked, unparented SimLab parts rose by about 280
  in a 20 s soak, and the `LabOrbs` memory category grew about 700 KB; with the fix, 5 to 8 tracked,
  0 unparented, 14 to 32 KB (C5).
- Live: writing HUD text only on change cut `TextLabel.Text` time from 0.48 to 0.18 ms per frame;
  cutting the HUD from 1,200 to 60 cells cut 8.5 to 14.6 MB of Gui memory and 5,700 client instances
  (C6, C7).
- Live: client frame p95 went from 129.6 to 30.6 ms after anchoring alone, because Studio runs the
  Server and Client in one process (C1). [added]
- Live: Script Profiler `ms per second` rose after fixes that raised the frame rate, because
  per-frame work ran more often. Compare per frame. [added]
- Live: `ScriptProfilerService`, `HeapProfilerService`, `SceneAnalysisService` and LibMP answer
  Studio's `execute_luau`. A game Script gets "lacking capability Plugin" from the two profilers
  (E2, G1).
- Live: `gcinfo()` inside an `execute_luau` chunk read about 0.9 MB, the chunk's own heap; the
  game's Luau heap is read through `HeapProfilerService` (C5).
- Live: the 3D viewport of a covered Studio window stopped drawing, and its render counters froze
  (R0). Render numbers need a window that draws.
- Live: a table keyed by `Vector2` never found an equal `Vector2` key; `Vector3` keys matched by
  value (U1).

## This skill's own rules [added]

- Gate on frame times and job times, never on fps alone or Studio memory totals.
- Studio runs the playtest server and client in one process, so cost on one side shows in the
  other's frames. Compare the metric that belongs to the fix.
- Change one thing per playtest, measure at the same time offset after start, keep the before and
  after files.
- A leak test reads the floor of the sawtooth over a soak, not the last value.
