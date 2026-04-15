# Solution Landscape: game-performance-profiler modernization

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Unity Profiler | Engine-native CPU/GPU/memory/frame analysis | Fast first-pass, engine-aware modules, easy route into player profiling | Editor misuse is common; screenshots alone can mislead | Best first response for Unity packets |
| Unity Frame Debugger | Render-pass / draw-call inspection | Useful for render-side ambiguity | Not a full performance workflow by itself | Good GPU/render escalation step |
| Unity Profile Analyzer | Repeated capture comparison | Strong for regression and benchmark-pass review | Requires disciplined repeated captures | Supports reproducible benchmark workflows |
| Unity Memory Profiler | Memory/GC/allocation analysis | Strong for hitch/allocation pressure | Easy to overuse when the real problem is elsewhere | Best when spikes smell like allocations or residency |
| Unreal `stat` commands | Quick CPU/GPU/thread overlay triage | Very fast, accessible, screenshot-friendly | Coarse-grained; not enough for deep ambiguity | Strong quick-triage packet surface |
| Unreal Insights | Deep trace-based diagnosis | Best for CPU/thread/load-time investigation | Heavier to capture/share/read | Good escalation after first-pass classification |
| GPU Visualizer / render profiling | Engine-native GPU-side follow-up | Good render-path breakdown | Still engine-specific and less shareable than screenshots | Useful after `stat gpu`/render suspicion |
| RenderDoc | Cross-engine graphics capture | Strong frame-level render investigation | Too heavy for first response | Escalation path, not default intake |
| PIX / Nsight / vendor GPU tools | Vendor/deep GPU diagnosis | Excellent for hard GPU cases | Narrower audience and setup cost | Advanced follow-up only |
| Steam Deck overlay / MangoHud / CapFrameX-style route review | Device and benchmark-route evidence | Cheap, shareable, practical for manual review | Manual and noisy without route discipline | Matches real device-review behavior |

## Categories
- **First-response engine triage**: Unity Profiler, Unreal stat commands, Unreal Insights (light use)
- **Comparative regression / benchmark pass**: Unity Profile Analyzer, repeated benchmark routes, device pass tables
- **GPU/render deep dive**: Frame Debugger, GPU Visualizer, RenderDoc, PIX, Nsight
- **Memory / hitch / streaming analysis**: Memory Profiler, load-time traces, route-based hitch capture
- **Reusable operator artifacts**: profiling plan, quick triage packet, benchmark route brief, device review brief, CPU/GPU split note

## What People Actually Use
Practitioners usually combine quick overlays + screenshots + a reproducible route before they take deep traces. The dominant real workflow is cheap triage first, deep capture later. Packaged-on-target review and device overlays matter disproportionately for Steam Deck, low-spec PCs, and traversal/streaming complaints.

## Frequency Ranking
1. Engine-native quick triage (Unity Profiler, Unreal `stat unit` / `stat gpu`)
2. Repro route / benchmark save / repeated pass workflow
3. Packaged-on-target and device review before trusting editor behavior
4. Screenshot/video evidence packets attached to tracker tickets
5. Deeper GPU tools only after engine-native ambiguity remains

## Key Gaps
- Many solution surfaces document tools, but not the **operator flow** connecting quick screenshots, reproducible routes, packaged-build confirmation, and escalation.
- Teams often lack a reusable **evidence packet template** for sharing performance complaints across QA, production, art, and engineering.
- Device-review workflows (especially Steam Deck) stay manual and are underrepresented in generic optimization docs.
- Benchmark-route hygiene is common in practice but weakly represented in most skill-style guidance.

## Contradictions
- Vendor docs emphasize disciplined profiling, but teams often work from screenshots, overlay captures, and chat/Jira paste-ups because they are faster to share.
- Tool ecosystems suggest deep profiler traces are the norm, but day-to-day triage usually starts with stat overlays, settings screenshots, and benchmark-route notes.
- Generic optimization advice still pushes direct fixes early, while real useful work starts with classifying the bottleneck family and capture context first.

## Key Insight
The strongest modernization path is not to add more profiler-tool coverage. It is to make `game-performance-profiler` a practical **evidence-to-artifact router**: gather a quick triage packet, force packaged-vs-editor and route/device context up front, classify CPU/GPU/memory/streaming/platform risk, then escalate to deeper engine/vendor tools only when the quick packet cannot disambiguate the bottleneck.
