# Mode Selection and Route-outs

Use this reference when the packet shape is clear enough to choose a mode, but not clear enough to start optimizing.

## Primary modes

| Mode | Use when | Main output | Do not confuse with |
|------|----------|-------------|----------------------|
| `quick-triage-packet` | The team has screenshots, stat output, overlay photos, or a vague complaint | A normalized evidence packet plus one next capture | Full root-cause proof |
| `bottleneck-classification` | The current packet is strong enough to name one likely bottleneck family now | CPU/GPU/memory/streaming/device hypothesis brief | A giant optimization plan |
| `benchmark-route-plan` | Reproducibility is the blocker | A fixed route / save / pass definition | Generic perf advice |
| `device-review` | Packaged-on-device behavior matters more than editor numbers | A target-device review brief | Desktop/editor-only tuning |
| `tool-escalation` | First-pass signals exist, but the next question is which profiler or GPU tool to use | A deliberate escalation choice | Blindly opening every tool |

## Fast mode picks
- Screenshot-only packet with no stable route yet → `quick-triage-packet`
- Enough evidence to say "this is probably streaming" or "this is probably GC" → `bottleneck-classification`
- "The market square gets bad after two minutes" with no fixed pass → `benchmark-route-plan`
- Steam Deck / handheld / console-style release review → `device-review`
- The team already has first-pass stats and is deciding between Unreal Insights, Frame Debugger, GPU Visualizer, RenderDoc, PIX, or Nsight → `tool-escalation`

## Route-outs
Route out when the packet reveals a different owning problem:
- build, cook, package, editor launch, CI artifact, or toolchain failure → `game-build-log-triage`
- broad milestone / production coordination across game tasks → `bmad-gds`
- mixed playtest, demo, store, or community feedback prioritization → `game-demo-feedback-triage`
- generic app/service/browser/database tuning outside engine-specific runtime profiling → `performance-optimization`

## Quick anti-patterns
- Treating editor-only numbers as final truth for Steam Deck or other target-device review
- Treating a `stat unit` screenshot as perfect proof instead of first-pass direction
- Jumping to RenderDoc / PIX / Nsight before engine-native evidence says the render path is the real ambiguity
- Mixing benchmark-route design, bottleneck classification, and implementation fixes into the same answer
