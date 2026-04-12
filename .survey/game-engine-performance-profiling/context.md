# Context: game-engine-performance-profiling

## Workflow Context
Performance work in Unity and Unreal usually starts the same way: reproduce a slow scene or hitch, decide whether the frame is CPU-, GPU-, memory-, or streaming-bound, capture one representative trace, then isolate the worst subsystem before proposing fixes. Unity’s built-in workflow centers on the [Profiler](https://docs.unity3d.com/Manual/Profiler.html) and [Frame Debugger](https://docs.unity3d.com/Manual/FrameDebugger.html). Unreal’s workflow centers on [stat commands / profiling overview](https://dev.epicgames.com/documentation/en-us/unreal-engine/introduction-to-performance-profiling-and-configuration-in-unreal-engine) and [Unreal Insights](https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-insights-in-unreal-engine).

The gap is not missing tools. It is missing triage structure. Teams often know how to open the profiler, but not how to turn a vague complaint like "combat tanks FPS" or "Steam Deck hitching" into a short diagnosis brief with the right next capture, likely bottleneck, and next optimization artifact.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Gameplay programmer | Investigate frame-time spikes, scripting cost, and gameplay-event regressions | Intermediate to advanced |
| Technical artist / rendering owner | Diagnose overdraw, draw-call pressure, shader/material cost, and render-pass issues | Intermediate to advanced |
| QA / performance tester | Reproduce hitches, capture evidence, and hand off a usable bug report | Intermediate |
| Indie generalist / small studio lead | Triage performance without dedicated engine specialists | Beginner to intermediate |
| Porting / platform engineer | Validate whether bottlenecks change across PC, Steam Deck, console, or mobile | Advanced |

## Current Workarounds
1. Open the engine-native profiler first, then manually hop between CPU, GPU, memory, rendering, loading, and frame-debugger views until one signal looks suspicious.
2. Use rough heuristics instead of a formal triage path: if lowering resolution helps, suspect GPU; if spikes line up with gameplay events or allocations, suspect CPU / GC; if hitches appear during movement, suspect loading or streaming.
3. Escalate to external tools such as [RenderDoc](https://renderdoc.org/), [PIX](https://devblogs.microsoft.com/pix/documentation/), or [Nsight Graphics](https://developer.nvidia.com/nsight-graphics) only after the built-in tools stop being decisive.
4. Track regressions in screenshots, spreadsheets, or tickets because profiler captures are hard to compare across builds, branches, hardware, and team members.
5. Create a benchmark map, replay path, or fixed camera route just to make captures comparable enough for before/after review.

## Adjacent Problems
- Reproducibility: editor results often do not match target-device or packaged-build behavior.
- Ownership ambiguity: the hotspot might belong to code, assets, shaders, lighting, streaming, or project configuration.
- Fragmented evidence: CPU, GPU, memory, and loading data often live in different tools.
- Weak comparison workflows: teams can inspect a single capture well, but cross-build regression tracking is still manual.
- Platform drift: PC, Steam Deck, mobile, VR, and console performance all require different confirmation passes.

## User Voices
Direct community quote recovery was thin in this run because the normal web search/extract tools returned authentication failures. The recurring user-voice themes still surfaced clearly from official tool positioning and common public discussion entry points:

- "I can tell the frame is slow, but not whether I should start with CPU, GPU, or streaming."
- "The profiler shows a spike, but mapping it to the next concrete fix is the real bottleneck."
- "Editor numbers look bad, but I need to know whether the packaged build or device tells a different story."
- "We keep pasting screenshots and frame times into tickets because the profiling story is spread across too many tools."

These are recorded as thin-evidence workflow signals rather than direct quoted verification for this run.
