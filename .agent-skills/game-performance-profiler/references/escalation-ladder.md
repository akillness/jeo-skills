# Escalation Ladder

Use this reference to decide when to stay with a quick packet and when to escalate.

## Stage 1 — quick packet
Stay here when you only need to answer:
- is the complaint real on the target build/device?
- is the first signal CPU, GPU, memory, streaming, or platform/device specific?
- what route or context should the team capture next?

Typical tools:
- Unity Profiler screenshot attached to player
- Unreal `stat unit` / `stat gpu`
- Steam Deck overlay or MangoHud screenshot

## Stage 2 — engine-native profiler
Move here when the quick packet is not enough to separate the likely bottleneck.

Typical tools:
- Unity Profiler modules
- Unity Profile Analyzer
- Unity Frame Debugger / Memory Profiler
- Unreal Insights
- Unreal GPU Visualizer or more focused stat captures

## Stage 3 — graphics / vendor tools
Escalate here only when the engine-native signal still leaves a render/GPU mystery.

Typical tools:
- RenderDoc
- PIX
- Nsight

## Rule of thumb
- Prefer the smallest capture that upgrades confidence.
- Do not jump to deep GPU tooling when the real missing piece is a reproducible route, packaged build, or device context.
- Do not stay at screenshot level forever if the team is already blocked on ownership or a likely root-cause family.
