# Routing and handoffs (the team of scenario-unity-* skills)

The lead turns a brief into numbers, picks the chain of specialists, and checks every handoff
packet. Specialists never receive a vague brief and never hand back a claim without evidence.

## 1. Route by what the brief asks for

| Brief says (user words)                                                                                                                                           | Owner                              | Usually also                                                                |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------- |
| architecture, "how should systems talk", ScriptableObjects, events, save/load, Input System, rebinding, project setup, version control, merge conflicts on scenes | scenario-unity-architecture        | scenario-unity-pipeline-automation (tests, CI)                              |
| terrain, island, level, blockout, ProBuilder, modular kit, set dressing, foliage, streaming, additive scenes, procedural level                                    | scenario-unity-world-building      | scenario-unity-rendering-lighting, scenario-unity-performance               |
| URP vs HDRP, quality tiers, lighting, lightmaps, APV, light probes, reflections, post-processing, exposure, "it looks flat", AA, STP                              | scenario-unity-rendering-lighting  | scenario-unity-shaders, scenario-unity-performance                          |
| Shader Graph, HLSL, water, dissolve, toon, full-screen effect, renderer feature, compute, "pink materials", shader variants                                       | scenario-unity-shaders             | scenario-unity-rendering-lighting, scenario-unity-vfx                       |
| VFX Graph, particles, explosion, fireball, trail, impact, magic, smoke                                                                                            | scenario-unity-vfx                 | scenario-unity-shaders, scenario-unity-performance                          |
| Animator, blend tree, Mixamo, humanoid, root motion, IK, Animation Rigging, Timeline, cutscene, Cinemachine, camera jitter                                        | scenario-unity-animation           | scenario-unity-gameplay (controllers)                                       |
| 2D, sprites, pixel art, tilemap, rule tile, 2D lights, platformer feel, pixel perfect                                                                             | scenario-unity-2d                  | scenario-unity-ui, scenario-unity-mobile                                    |
| menu, HUD, settings screen, uGUI, UI Toolkit, "UI scales wrong on phones", data binding, fonts                                                                    | scenario-unity-ui                  | scenario-unity-mobile (safe areas), scenario-unity-architecture (rebinding) |
| physics, character controller, enemy AI, NavMesh, state machine, DOTS, multiplayer, Netcode, audio                                                                | scenario-unity-gameplay            | scenario-unity-animation, scenario-unity-performance                        |
| import pipeline, AssetPostprocessor, Addressables, batch mode, Build Profiles, CI, "make a command-line build", tests                                             | scenario-unity-pipeline-automation | the lead (channels, toolkit)                                                |
| "my game stutters", fps, Profiler, memory, GC, draw calls, batching, LOD, build size, IL2CPP                                                                      | scenario-unity-performance         | the owner of the hot spot                                                   |
| Android, iOS, phones, thermal, touch, safe area, signing, Google Play, App Store, ads, IAP                                                                        | scenario-unity-mobile              | scenario-unity-performance, scenario-unity-ui                               |
| WebGL, Web build, itch.io, compression, server headers, WebGPU, JavaScript interop, portals                                                                       | scenario-unity-web                 | scenario-unity-performance                                                  |

Sister teams: scenario-blender-expert, scenario-maya-expert, scenario-zbrush-expert (content
authored outside Unity, 1 unit = 1 m on import, scale checked by `AgentAudit.AuditModel`),
scenario-unreal-expert (comparisons only); scenario-3d, scenario-textures, scenario-skyboxes
generate meshes, textures and skyboxes that arrive through the import audit.

## 2. Seams: items two owners each assumed the other covered

Blind grading round 1 (`tests/grading/Y*_grade.md`, "missing from both") found expert items that
fell between two skills. The lead names ONE owner and the proof in the brief:

| Item                                                                                                                                                                          | Owner                                                                          | With                                                                  | Proof the lead asks for                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First-use shader hitches: PSO tracing with `GraphicsStateCollection` (one collection per graphics API and platform), `WarmUpProgressively`, Shader Build Settings per profile | scenario-unity-shaders                                                         | scenario-unity-performance (proof), scenario-unity-rendering-lighting | no `Shader.CreateGPUProgram` or `CreateGraphicsGraphicsPipelineImpl` markers during gameplay of a development build (shaders docs digest 7; Y3, Y4, Y10)                           |
| GPU Resident Drawer                                                                                                                                                           | scenario-unity-rendering-lighting (URP asset, Forward+, BRG variants Keep All) | scenario-unity-performance                                            | renderers listed under "Hybrid Batch Group" in the Frame Debugger, batch counts before and after, gain measured standalone, not in the Editor (performance docs digest 2; Y3, Y10) |
| Game VFX shaders (mobile uber particle shader, LUT ramps, erosion, custom vertex streams)                                                                                     | scenario-unity-vfx                                                             | scenario-unity-shaders (keywords, variants)                           | one material for every variant; variant count reported (Y4)                                                                                                                        |
| NavMesh through doors and multi-story buildings (NavMesh Modifier on door frames, Height Mesh)                                                                                | scenario-unity-gameplay                                                        | scenario-unity-world-building (door widths, kit)                      | `PathComplete` through every doorway and up every stair (Y2, Y8)                                                                                                                   |
| Agent and animation coupling (foot sliding)                                                                                                                                   | scenario-unity-gameplay                                                        | scenario-unity-animation (clip speeds)                                | `OnAnimatorMove` drives the agent from `deltaPosition`, or `updatePosition = false` with a drift pull; foot slide measured (Y8)                                                    |
| Layer order and focus between uGUI canvases and UI Toolkit panels                                                                                                             | scenario-unity-ui                                                              | scenario-unity-architecture (input maps)                              | explicit sort orders; a test that opens settings over the HUD and checks who receives input (Y7)                                                                                   |
| Player-typed text on WebGL 2 (no system fonts)                                                                                                                                | scenario-unity-web                                                             | scenario-unity-ui (font assets, fallbacks)                            | fallback fonts in the build; a capture of non-Latin names (web docs digest 25; Y12)                                                                                                |
| Code stripping against content loaded only from bundles                                                                                                                       | scenario-unity-web, scenario-unity-mobile                                      | scenario-unity-pipeline-automation                                    | `link.xml` or `assetBundleManifestPath`; no `Could not produce class with ID` in a release build (web docs digest 15; Y12)                                                         |
| Addressables duplication and hard references                                                                                                                                  | scenario-unity-pipeline-automation                                             | scenario-unity-performance (memory)                                   | no build-list scene hard-references Addressable content; duplicate-dependency report empty (Y9, Y10)                                                                               |
| Static state with domain reload off (the 6.6 default)                                                                                                                         | scenario-unity-architecture                                                    | every code owner                                                      | static-state audit: each static field and static event has a reset (editor-architecture docs digest 1; Y1, Y8)                                                                     |

## 3. Persona pipelines (chains the lead runs)

| Brief                           | Chain (in order)                                                                                                 | Lead's gate between steps                                                                                             |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 3D game prototype               | architecture, world-building, gameplay, animation, rendering-lighting, vfx, ui, performance, pipeline-automation | EditMode tests green after each system; captures of the bookmarks; a profile in Play mode before polish               |
| Lit environment or hero shot    | world-building (blockout), rendering-lighting, shaders (special surfaces), performance                           | exposure and image checks on every capture; bake time and lightmap count recorded                                     |
| 2D game                         | 2d, ui, gameplay (if physics or AI), mobile or web                                                               | pixel crispness captures at three resolutions; controller feel tests                                                  |
| Frame-rate rescue               | performance first; fixes routed to the owner of the hot spot (shaders, vfx, ui, gameplay)                        | before and after captures from the same views (`ut_review.compare`), before and after CSVs (`ut_stat.compare_frames`) |
| Ship to phones                  | mobile, performance, ui (safe areas), pipeline-automation (signed builds)                                        | build report size, device profile at 65% of the frame budget                                                          |
| Ship to the web                 | web, performance, pipeline-automation                                                                            | build size, server header check, browser boot capture                                                                 |
| Asset drop from DCC or Scenario | pipeline-automation (import rules), the lead's `AuditAssets`, then the consuming domain                          | zero audit errors before anything is placed                                                                           |

## 4. The handoff packet (every direction: lead to specialist, specialist to lead, specialist to specialist)

```
HANDOFF <from> -> <to>
Project   <absolute path>  (Unity 6000.3.21f1, URP 17.3, active target, quality level)
Channel   batch | bridge (GUI editor open: yes/no) ; lock state from ut_env.project_lock
Brief     one paragraph with numbers: platform and device class, frame budget in ms (per thread when
          known), resolution, scale (objects, characters, world size), style references
Done      saved assets and scenes (paths); each toolkit call with its Unity call (toolkit-map.md)
Evidence  audit report JSON + counts; captures: contact sheet path + image_checks flags (looked at: yes);
          profile CSV + budget_check verdict; NUnit totals; build summary (result, size MB, time s)
Verified  what ran, with the job id / number / frame that proves it
Assumed   everything not run in Unity, [verify] names, defaults taken because the brief was silent
Open      known issues, owner of each
Fence     what the receiver must not change (folders, scenes, settings)
```

The receiver re-runs the evidence it depends on (one audit, one capture) before building on it: a
packet is a claim until reproduced.

## 5. What the lead checks before accepting a packet

1. Envelopes `ok` with job ids; no compile errors; zero new CS0618 warnings; no `grace_kill` left
   unexplained.
2. Every PNG in the packet passes `ut_review.image_checks` (no blank, no magenta) and the lead
   opened the contact sheet.
3. Numbers against the brief's budgets (`ut_stat.budget_check`, `build_summary(max_mb=...)`).
4. The Assumed list is honest: GUI-only steps (Shader Graph, VFX Graph, Animator window, UI Builder,
   Tile Palette painting) are named as such with their substitute or human path.
5. Agent-built layouts checked for the classic misses: blocked doorways, floating props,
   grid-perfect clutter (Code Monkey, ppFshgFOgXU [00:10:52]).
6. Every toolkit call in the packet names the Unity API or command line beneath it
   (`toolkit-map.md`). Blind graders could not open `scripts/` and judged every wrapper only through
   the engine call written next to it (`tests/grading/SUMMARY.md`).

## 6. Verification habits (every owner; the lead enforces them)

| Habit                                                                                                                                                                                         | Why                                                                                                                                  | Source                                                    |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| Pin `build_target` (`-buildTarget` or `-activeBuildProfile`) on every stage: import, tests, build                                                                                             | the first import picks the default platform and build target is an import dependency: unpinned stages re-import for another platform | automation `doc-command-line-batchmode-ci`; Y9            |
| Tests: no `-quit` with `-runTests`; an expected error is `LogAssert.Expect`ed, any other logged error fails the test; UI Toolkit interaction tests use `com.unity.ui.test-framework` 6.3.0    | a test run that silently loses its verdict or passes over logged errors proves nothing                                               | 6.3 Manual; automation docs digest 12; deltas 1.3         |
| Frame time: p95 AND worst frame over many frames; before and after as two captures of about 200 frames (Profile Analyzer compare)                                                             | a mean hides the hitch the player feels                                                                                              | YOtDVv5-0A4 [00:17:00]; ZkvK0mX-id4 [00:23:59]            |
| The verdict comes from a development player on the target device class, with native profilers there; PC development-build numbers are not the target's                                        | Editor and desktop numbers flatter mobile, web and laptops                                                                           | ZkvK0mX-id4 [00:10:27]; profiling e-book                  |
| One development-build run before code is called done                                                                                                                                          | only development builds check Unity API calls made off the main thread; release builds just crash                                    | editor-architecture `doc-awaitable-async` (continuations) |
| Size on the shipped output on disk, never a development build, never the do-not-ship folders                                                                                                  | BuildReport `totalSize` counted 1.7 GB of IL2CPP symbols for an 8 MB game                                                            | scenario-unity-performance live test                      |
| Scene list checked before every build                                                                                                                                                         | an empty or stale list builds nothing                                                                                                | bF_eUuxGEcA [00:04:02]                                    |
| Anything wrong ONLY in an Editor capture (metal reflections, Overlay UI, bind pose, missing 2D lights) is re-checked in a player or with the documented capture path before anyone "fixes" it | four capture artifacts were found live this round                                                                                    | `unity-6.3-traps.md` sections 1 and 2                     |
