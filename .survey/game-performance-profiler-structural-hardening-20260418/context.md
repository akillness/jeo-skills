# Context: game-performance-profiler structural hardening

## Workflow Context
`game-performance-profiler` already owns the repo's engine-specific frame-time triage lane, but its main `SKILL.md` still carries a lot of detail that now overlaps with support files. Repo-local graph evidence says the collection has complete `references/`, `evals/`, and compact-surface coverage, so the highest-leverage maintenance move is to keep dense front doors small and truthful instead of creating another adjacent wrapper. In the game-development cluster, this skill is the narrow specialist for runtime profiling and next-capture choice, while `bmad-gds`, `game-build-log-triage`, `game-demo-feedback-triage`, and `steam-store-launch-ops` own coordination, build failures, feedback weighting, and launch/store operations.

Primary-source workflow evidence still supports the current operating model:
- Unity documents the Profiler as the central CPU/GPU marker surface and the Frame Debugger as a rendering-event inspection tool, which supports keeping quick packet interpretation separate from deeper render-path escalation.
- Unreal documents `stat` commands for first-pass runtime statistics and Unreal Insights for deeper trace-based profiling, which matches the current packet-first → escalation ladder design.
- Steam Deck docs emphasize compatibility/review on the actual device surface, which supports keeping packaged-on-device review explicit instead of letting editor-only impressions dominate.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Indie / small-studio game developer | Turn a vague "game stutters" report into the next profiling capture | Beginner to intermediate |
| Technical designer / gameplay engineer | Separate gameplay/script spikes from rendering, streaming, or device issues | Intermediate |
| Tech artist / rendering engineer | Decide when a screenshot/stat packet is enough vs when GPU tooling should be used | Intermediate to advanced |
| Producer / QA / performance triage owner | Define benchmark routes, target-device review passes, and handoff artifacts | Beginner to intermediate |

## Current Workarounds
1. Keep all packet intake, bottleneck heuristics, device-review nuance, and escalation guidance inline in `SKILL.md`, which makes the front door longer than similar hardened skills.
2. Treat profiler screenshots or `stat unit` / `stat gpu` captures as if they already prove a root cause, which overstates confidence and blurs the packet-vs-trace boundary.
3. Let editor-only impressions stand in for packaged or on-device evidence, especially for Steam Deck / handheld review, which weakens the triage contract.
4. Reach for generic performance advice or generic `performance-optimization` patterns before deciding whether the issue is actually engine-specific runtime profiling.

## Adjacent Problems
- If the front door stays dense, compact/discovery surfaces can drift even when support files remain correct.
- If route-outs are not sharp, performance triage can sprawl into build-log diagnosis, broad optimization backlogs, or general game-production coordination.
- If benchmark-route and device-review details are not clearly packetized, agents may ask for too much evidence up front instead of the smallest discriminating next capture.
- If the escalation ladder is buried inline, teams may jump to RenderDoc / PIX / Nsight before lower-cost engine-native captures.

## User Voices
- "Placed in code to describe a CPU or GPU event that is then displayed in the Unity Profiler window" — Unity Manual, showing why first-pass packet interpretation should stay anchored in profiler evidence rather than generic optimization advice. Source: https://docs.unity3d.com/Manual/Profiler.html
- "It shows the rendering event information and controls the playback of the frame under construction" — Unity Manual on Frame Debugger, reinforcing that render-path escalation is a separate tool choice. Source: https://docs.unity3d.com/Manual/frame-debugger-window.html
- "Console commands specific to displaying game statistics in Unreal Engine" — Epic docs on `stat` commands, matching the repo skill's quick-packet intake model. Source: https://dev.epicgames.com/documentation/en-us/unreal-engine/stat-commands-in-unreal-engine
- "Profile your project's performance with Unreal Insights." — Epic docs, confirming that Insights belongs in the deeper-trace escalation layer rather than the front-door packet itself. Source: https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-insights-in-unreal-engine
- "Steam Deck Compatibility Review Process" appears directly in Steamworks Steam Deck docs navigation, which is enough to justify keeping packaged-on-device review explicit in the skill boundary. Source: https://partner.steamgames.com/doc/steamdeck
