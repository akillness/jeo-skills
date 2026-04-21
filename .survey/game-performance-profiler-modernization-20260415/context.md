# Context: game-performance-profiler modernization

## Workflow Context
Game performance triage usually starts after someone reports low FPS, hitching, bad frame pacing, or device-specific slowdown, but before anyone knows whether the problem is CPU, GPU, memory/GC, streaming, content density, or platform configuration. In practice, teams do not jump straight into deep profiler analysis. They first gather a quick evidence packet: target hardware, editor vs packaged build, exact route/save/scene, one or more overlay or stat-command screenshots, and the symptom shape (steady low FPS vs intermittent hitch).

Across Unity and Unreal, the stable real-world flow is:
1. reproduce on the right build/device
2. run a quick first-pass signal (`stat unit`, `stat gpu`, Unity Profiler attached to player, Steam Deck overlay, MangoHud)
3. classify the likely bottleneck family
4. lock a reproducible benchmark route or save
5. escalate to Unreal Insights / Frame Debugger / Memory Profiler / RenderDoc / PIX / Nsight only if the first-pass signal is still ambiguous
6. hand findings back to gameplay, rendering, technical art, QA, or production as one actionable artifact

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Gameplay engineer | Diagnose CPU/script/system spikes and define the next capture or fix experiment | Medium–high |
| Rendering / graphics engineer | Investigate GPU, shader, draw-call, or frame-pipeline cost | High |
| Technical artist / VFX / level artist | Own content-heavy hotspots like overdraw, lighting, particles, material cost, or scene density | Medium |
| QA / performance QA | Reproduce bad areas, gather benchmark routes, attach overlays/screenshots, compare builds/devices | Medium |
| Producer / lead | Decide whether a performance issue blocks a milestone, demo beat, platform review, or launch | Low–medium |
| Solo / indie developer | Needs a fast triage workflow without a specialist perf team | Low–medium |

## Current Workarounds
1. **Stat overlays first** — teams use `stat unit`, `stat gpu`, Steam Deck overlays, MangoHud, or quick Unity Profiler screenshots because they are cheap and shareable.
2. **Editor-first guesses** — many investigations start in-editor even when packaged-on-target behavior is the real question.
3. **Manual benchmark routes** — teams rely on save files, camera paths, traversal notes, or “run from X to Y” instructions stored in QA docs or chat.
4. **Screenshot-first evidence packets** — profiler panes, device overlays, settings pages, and short videos get pasted into Jira/Slack/Linear more often than deep trace files.
5. **Folklore optimization** — teams jump to pooling, draw-call reduction, or shader guesses before cleanly classifying CPU/GPU/memory/streaming causes.

## Adjacent Problems
- Generic app/web `performance-optimization` is still separate; game frame-time triage depends on engine-native tools, content pipelines, and device-specific review.
- `game-demo-feedback-triage` handles mixed player-facing feedback packets; `game-performance-profiler` should isolate performance evidence and hand back a focused profiling artifact.
- `game-build-log-triage` handles failing builds/cooks/packages rather than runtime frame-time investigation.
- Automated benchmark CI and long-term perf dashboards are adjacent but not the core human-facing triage workflow.

## User Voices
- Teams repeatedly rely on engine-native first-pass tooling before deep capture: [Unity Profiler](https://docs.unity3d.com/Manual/Profiler.html), [Unity profiling a player](https://docs.unity3d.com/Manual/profiling-application.html), [Unreal stat commands](https://dev.epicgames.com/documentation/en-us/unreal-engine/stat-commands-in-unreal-engine), [Unreal Insights](https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-insights-in-unreal-engine).
- Repeatable test conditions matter more than one-off anecdotes: [GPUOpen Unreal Engine Performance Guide](https://gpuopen.com/learn/unreal-engine-performance-guide/).
- Steam Deck/device review often starts with manual overlay-driven passes instead of perfect traces: [Steam Deck docs](https://partner.steamgames.com/doc/steamdeck), [Steam Deck performance guidance](https://partner.steamgames.com/doc/steamdeck/performance), [MangoHud](https://github.com/flightlessmango/MangoHud).
