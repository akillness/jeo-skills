# Solution Landscape: game-performance-profiler structural hardening

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Unity Profiler | Engine-native runtime profiling | Central CPU/GPU/memory signal for Unity projects; good first-pass packet source | Can encourage screenshot-only overconfidence when build/device context is missing | Primary-source evidence: https://docs.unity3d.com/Manual/Profiler.html |
| Unity Frame Debugger | Render-path inspection | Useful when the packet clearly points at draw-call/render-event investigation | Too deep for every complaint; not the right default for vague hitch reports | Primary-source evidence: https://docs.unity3d.com/Manual/frame-debugger-window.html |
| Unreal `stat` commands | First-pass runtime counters | Fast, lightweight signal for CPU/GPU/frame-time direction | Easy to misread as a full diagnosis without route/build/device context | Primary-source evidence: https://dev.epicgames.com/documentation/en-us/unreal-engine/stat-commands-in-unreal-engine |
| Unreal Insights | Trace-based engine profiler | Good for deeper thread/load-time analysis and reproducible traces | More expensive than screenshot/stat intake; should be deliberate escalation | Primary-source evidence: https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-insights-in-unreal-engine |
| GPUOpen Unreal Performance Guide | Vendor-side optimization/profiling guide | Strong reference for graphics-heavy Unreal investigations | Not a packet router by itself; guidance is broader than the repo skill's front door | Primary-source evidence: https://gpuopen.com/learn/unreal-engine-performance-guide/ |
| Steam Deck docs / review surface | Device-review workflow | Keeps packaged-on-device review and compatibility framing explicit | Does not replace engine-native profiling or benchmark-route planning | Primary-source evidence: https://partner.steamgames.com/doc/steamdeck |
| Repo-local `game-performance-profiler` support files | Packet routing + route-out abstraction | Already covers packet types, benchmark routes, device review, and escalation boundaries | Main front door still repeats too much of what references already own | Repo-local evidence: `.agent-skills/game-performance-profiler/references/*.md` |

## Categories
- **Engine-native first-pass tools:** Unity Profiler, Unreal `stat` commands
- **Engine-native deeper traces:** Unreal Insights, Unity render/debug surfaces
- **Vendor / platform guidance:** GPUOpen Unreal guide, Steam Deck documentation
- **Repo-specific routing abstraction:** `game-performance-profiler` plus its support files

## What People Actually Use
In practice, teams rarely start with a perfect trace. They usually start from screenshots, overlays, `stat unit` / `stat gpu`, or a vague "Steam Deck build feels rough" note, then decide whether they need a reproducible benchmark route, packaged-on-device verification, or a deeper profiler capture. The repo's current skill already matches that real packet-first behavior. The structural gap is that too much of the supporting decision logic still lives inline in `SKILL.md` instead of being pushed into support references and a smaller routing contract.

## Frequency Ranking
1. Engine-native quick signals (`stat` output, profiler screenshots, overlay captures)
2. Repro route / benchmark pass definition
3. Packaged-on-device or target-device review
4. Deeper traces (Unreal Insights, Frame Debugger, GPU tools)
5. Broad optimization guides and vendor references

## Key Gaps
- The repo still has a front-door density gap: `game-performance-profiler` is on the graph watchlist even though its support coverage is already complete.
- The front door can be smaller about mode selection and artifact expectations while leaving deeper heuristics inside references.
- Discovery/compact surfaces will stay easier to keep truthful if the front door emphasizes one primary route-in contract plus explicit route-outs.

## Contradictions
- Tool vendors document many deep profiling surfaces, but real-world intake often begins with much thinner evidence packets than those docs assume.
- A generic performance narrative suggests "optimize the game," while the repo's sharper cluster model says to choose between runtime profiling, build-log diagnosis, game-production coordination, feedback triage, and launch/store operations before acting.

## Key Insight
The market does not need another Steam Deck-only, GPU-tool-only, or generic game-performance wrapper here. The durable win is to harden `game-performance-profiler` in place: keep screenshot/stat/route/device review as the front-door contract, push dense classification detail into references, sharpen route-outs, and sync compact/discovery surfaces so the specialist game lane stays narrow and deterministic.
