---
name: game-performance-profiler
description: >
  Triage Unity and Unreal performance complaints into a profiling plan, likely bottleneck class,
  evidence checklist, and next optimization artifact. Use when a game has low FPS, frame-time spikes,
  hitches, GC stalls, GPU bottlenecks, streaming problems, Steam Deck/mobile/per-platform performance
  regressions, or profiler screenshots that need interpretation, even if the user only says
  "Unity is stuttering", "Unreal frame time is bad", "GPU or CPU bottleneck?", "Steam Deck performance",
  or "help read this profiler capture".
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  Best for repositories, bug reports, profiler screenshots, Unity Profiler captures, Unreal Insights traces,
  stat command output, benchmark notes, or hardware target details. Works as a triage and planning workflow,
  not as an automatic optimizer or build-tuning bot.
metadata:
  tags: game-development, unity, unreal, profiling, performance, optimization, frame-time, steam-deck
  version: "1.0"
  source: akillness/oh-my-skills
---

# Game Performance Profiler

Use this skill to turn a vague performance complaint into a short, prioritized profiling brief.

The goal is not to dump generic optimization advice. The goal is to decide **what kind of bottleneck is most likely**, **what evidence should be captured next**, and **which optimization artifact should be produced first**.

Read [references/profiling-patterns.md](references/profiling-patterns.md) before classifying cross-engine edge cases or choosing between CPU, GPU, memory, and streaming hypotheses.

## When to use this skill
- Unity or Unreal projects with low FPS, frame-time spikes, hitches, or performance regressions
- Steam Deck, mobile, VR, console, or low-spec PC review requests where target-device performance matters
- Profiler screenshots, Unreal Insights traces, stat command output, or benchmark notes that need interpretation
- Teams asking whether the problem looks CPU-bound, GPU-bound, memory-bound, or loading/streaming-bound
- Requests for a profiling plan, benchmark pass, or performance handoff brief instead of instant code edits

If performance findings are only one part of a larger demo or playtest feedback packet, use this skill to isolate the bottleneck evidence and then roll the result into `game-demo-feedback-triage` for overall priority ordering.

## Instructions

### Step 1: Label the evidence and target
Capture the minimum facts before diagnosing.

Record:
- engine: `Unity` | `Unreal` | `Unknown`
- target hardware: PC | Steam Deck | console | mobile | VR | unknown
- environment: editor | packaged/dev build | release build | unknown
- symptom type: low average FPS | intermittent hitch | combat spike | traversal hitch | loading stall | thermal drift | unknown
- evidence available: profiler screenshot, capture file, stat output, frame-time notes, video, reproduction steps
- reproduction shape: exact scene / level / encounter / movement path / menu / cutscene / unknown

If the user gives only a vague complaint, say confidence is low and keep the next step focused on evidence capture.

### Step 2: Classify the likely bottleneck first
Do not jump to fixes before deciding what bucket is most likely.

Use one primary bucket and optional secondary bucket.

**Primary buckets**
- `cpu-gameplay-scripting`
- `cpu-render-thread-draw-call-pressure`
- `gpu-rendering-shaders-postfx`
- `memory-gc-allocation-churn`
- `loading-streaming-io`
- `physics-animation-simulation`
- `platform-config-thermal-device-specific`
- `unknown-needs-better-capture`

**Quick heuristics**
- Resolution scaling changes the problem a lot → suspect `gpu-rendering-shaders-postfx`
- Spikes line up with gameplay events, AI bursts, or managed allocations → suspect `cpu-gameplay-scripting` or `memory-gc-allocation-churn`
- Hitches appear during traversal, asset reveals, or scene transitions → suspect `loading-streaming-io`
- Editor is bad but packaged build differs materially → suspect `platform-config-thermal-device-specific` or measurement mismatch
- Many draw calls, shadows, transparent effects, or overdraw symptoms → suspect `cpu-render-thread-draw-call-pressure` and/or `gpu-rendering-shaders-postfx`

### Step 3: Pick the correct capture path
Recommend the smallest next capture that can disambiguate the bottleneck.

**For Unity, prefer:**
- Profiler CPU / GPU / Memory modules
- Frame Debugger for render-pass questions
- Profile Analyzer for before/after capture comparison
- target-device or packaged-build checks when editor numbers are misleading

**For Unreal, prefer:**
- `stat unit`, `stat gpu`, or related stat commands for first direction
- Unreal Insights for thread/load-time traces
- GPU Visualizer or external GPU capture when render cost is the main suspect
- target-device or packaged-build confirmation when editor behavior is noisy

**Cross-engine escalation:**
- RenderDoc / PIX / Nsight when the issue is clearly graphics-path specific
- benchmark route / replay path / fixed scene when reproducibility is the actual blocker
- memory-focused capture when crashes or heavy allocation churn accompany the slowdown

### Step 4: Build the profiling brief
Return a concise report with this exact structure:

```markdown
# Game Performance Profiling Brief

## Scope
- Engine: ...
- Target: ...
- Environment: ...
- Symptom: ...
- Confidence: high | medium | low

## Current strongest signal
- 1-2 bullets on what the evidence most strongly suggests

## Primary bottleneck hypothesis
- Bucket: ...
- Why it fits: ...
- Evidence: ...

## Secondary hypothesis
- Bucket: ...
- Why it still matters: ...

## Next capture
1. ...
2. ...
3. ...

## Inspection targets
- Unity / Unreal views, counters, or subsystems to inspect
- Reproduction route or benchmark scene to lock down
- Device/build checks to confirm

## Likely root-cause families
- 2-4 concrete possibilities tied to the chosen bucket

## Recommended next artifact
- Choose one: profiling plan | benchmark scene brief | CPU/GPU split note | memory/GC checklist | streaming hitch checklist | platform review brief

## What not to do yet
- 1-3 bullets that prevent premature optimization or blind rewrites
```

### Step 5: Tailor the diagnosis to the symptom shape
**For low average FPS:**
- decide whether the frame is mostly CPU- or GPU-limited before discussing optimization
- separate content density problems from systemic engine/config issues

**For intermittent hitches:**
- focus on reproducibility, capture timing, and whether loading/streaming/GC fits better than steady-state rendering cost
- ask for a fixed traversal path or repeatable encounter

**For Steam Deck / low-spec / mobile review:**
- emphasize packaged-build and device evidence over editor impressions
- call out thermal or platform-configuration risk when evidence is weak

**For profiler screenshot interpretation:**
- translate the screenshot into a bottleneck hypothesis and next capture, not a pretend-perfect diagnosis
- keep confidence proportional to what the screenshot can actually prove

### Step 6: Ask for the minimum missing evidence when needed
If confidence is low, request the smallest next packet that would materially improve the triage:
1. one representative profiler screenshot or trace summary
2. exact scene / encounter / path where the issue reproduces
3. target hardware and whether the numbers are from editor or packaged build
4. current FPS/frame-time target and observed worst case
5. whether lowering resolution or quality changes the problem noticeably

Do not ask for a full optimization dossier.

## Output format
Always return a short profiling brief, not a broad optimization essay.

Required qualities:
- classify the likely bottleneck before proposing fixes
- recommend the next capture, not ten speculative optimizations
- separate evidence from hypothesis
- keep the report under roughly 300-500 words unless the user asks for more
- use engine-native language such as Profiler, Frame Debugger, Unreal Insights, stat gpu, frame time, draw-call pressure, GC, and streaming

## Examples

### Example 1: Unity combat spike + suspected GC
**Input**
> Our Unity game drops from 120 to 45 FPS in combat. We have Profiler screenshots and someone thinks GC spikes are the cause. What should we do first?

**Output sketch**
- Scope: Unity, combat spike, profiler screenshots
- Primary hypothesis: `memory-gc-allocation-churn`
- Secondary hypothesis: `cpu-gameplay-scripting`
- Next capture: confirm allocation spikes during the combat event, compare before/after encounter, and inspect managed allocations / hot scripts
- Recommended next artifact: memory/GC checklist
- What not to do yet: do not start broad rendering optimization before confirming the spike is not allocation-driven

### Example 2: Unreal open-world frame-time blowup
**Input**
> Unreal is fine indoors but frame time blows up in our open world area. Help me figure out whether this is CPU, GPU, streaming, or shaders.

**Output sketch**
- Scope: Unreal, traversal/open-world slowdown
- Primary hypothesis: `loading-streaming-io` or `gpu-rendering-shaders-postfx` depending on evidence
- Next capture: `stat unit`, `stat gpu`, reproducible traversal path, Unreal Insights trace if the hitch is intermittent
- Recommended next artifact: profiling plan or streaming hitch checklist

### Example 3: Steam Deck review prep
**Input**
> We need a Steam Deck performance review plan before the demo. The editor feels rough but we do not know what to measure on device.

**Output sketch**
- Scope: device-specific review
- Primary hypothesis: `platform-config-thermal-device-specific` until device capture exists
- Next capture: packaged build on target device, locked repro route, frame-time target, CPU/GPU split checks
- Recommended next artifact: platform review brief

## Best practices
1. **Classify the bottleneck before prescribing optimizations** — CPU, GPU, memory, streaming, and platform issues need different captures.
2. **Prefer representative builds and devices** over editor-only impressions.
3. **Treat reproducibility as part of the diagnosis** — a fixed route or encounter is often more valuable than more theory.
4. **Recommend one next artifact** instead of a giant performance backlog.
5. **Use engine language the team already uses** so the handoff is immediately actionable.
6. **Keep confidence honest** when the evidence is only a screenshot or a vague complaint.
7. **Avoid premature micro-optimization** until the primary bottleneck is confirmed.

## References
- [Unity Profiler](https://docs.unity3d.com/Manual/Profiler.html)
- [Unity Frame Debugger](https://docs.unity3d.com/Manual/FrameDebugger.html)
- [Unity Profile Analyzer](https://docs.unity3d.com/Packages/com.unity.performance.profile-analyzer@latest)
- [Unity Memory Profiler](https://docs.unity3d.com/Packages/com.unity.memoryprofiler@latest)
- [Introduction to Performance Profiling and Configuration in Unreal Engine](https://dev.epicgames.com/documentation/en-us/unreal-engine/introduction-to-performance-profiling-and-configuration-in-unreal-engine)
- [Unreal Insights](https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-insights-in-unreal-engine)
- [RenderDoc](https://renderdoc.org/)
- [NVIDIA Nsight Graphics](https://developer.nvidia.com/nsight-graphics)
- [Documentation - PIX on Windows](https://devblogs.microsoft.com/pix/documentation/)
