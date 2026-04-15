# Profiling Patterns Reference

Use this reference to normalize vague performance complaints into a few reusable bottleneck families.

## Cross-engine first pass
1. Confirm target hardware and whether the measurement is from editor, packaged/dev build, or release/shipping build.
2. Lock a reproducible route: exact scene, level, encounter, traversal path, save slot, menu, or camera move.
3. Decide whether the first question is **steady low FPS**, **intermittent hitching**, or **device-review confidence**.
4. Choose the smallest capture that can separate CPU, GPU, memory, and streaming possibilities.
5. Recommend one next artifact after triage rather than a huge optimization backlog.

## Bottleneck families

| Bucket | Typical clues | Unity-first inspection | Unreal-first inspection | Common false move |
|--------|---------------|------------------------|-------------------------|-------------------|
| `cpu-gameplay-scripting` | Frame drops during combat, AI, spawning, or simulation-heavy moments | Profiler CPU module, managed scripts, timeline around the event | `stat unit`, Unreal Insights game-thread/task traces | Jumping straight to shader optimization |
| `cpu-render-thread-draw-call-pressure` | Lots of visible objects, state changes, shadows, or transparency; CPU cost tied to scene density | CPU + Rendering modules, batches, culling, render-thread cost | `stat unit`, draw-call related stats, render-thread traces | Assuming every frame problem is GPU-only |
| `gpu-rendering-shaders-postfx` | Lowering resolution or quality helps a lot; effects-heavy scenes hurt most | GPU module, Frame Debugger, overdraw/shader suspects | `stat gpu`, GPU Visualizer, RenderDoc/PIX/Nsight escalation | Blaming gameplay code without checking GPU sensitivity |
| `memory-gc-allocation-churn` | Spikes line up with allocations, object churn, pooling gaps, or memory pressure | Memory module, GC allocation samples, Profile Analyzer comparisons | Insights/memory traces, allocation-heavy events, platform memory evidence | Treating spikes as generic low FPS |
| `loading-streaming-io` | Traversal hitch, asset reveal stutter, scene transition stalls, streaming pop-in | Loading-related evidence, timeline around traversal, Addressables/content-load suspects | Unreal Insights load-time traces, traversal route, streaming-related timing | Optimizing steady-state render cost first |
| `platform-config-thermal-device-specific` | Editor numbers differ from device, issue appears only on Steam Deck/mobile/VR, or worsens over time | Packaged build/device validation, quality settings, upscaler/frame-cap checks | Target-device capture, packaged build, overlay + device-state notes | Trusting editor results as final truth |

## Recommended next artifacts by bucket
- `cpu-gameplay-scripting` → CPU/GPU split note or profiling plan
- `cpu-render-thread-draw-call-pressure` → benchmark route brief or render-cost checklist
- `gpu-rendering-shaders-postfx` → profiling plan with GPU capture path
- `memory-gc-allocation-churn` → memory/GC checklist
- `loading-streaming-io` → streaming hitch checklist
- `platform-config-thermal-device-specific` → device review brief
- `unknown-needs-better-capture` → quick triage packet

## Minimum evidence request packet
- one representative screenshot or trace summary
- target hardware and build type
- exact repro route, save slot, or encounter
- observed frame-time or FPS range
- whether resolution/quality changes materially shift the issue
- whether the result is editor-only, packaged-only, or device-only
