---
name: game-performance-profiler
description: >
  Triage Unity and Unreal performance complaints into a quick evidence packet,
  likely bottleneck class, next capture plan, and one profiling artifact. Use
  when a game has low FPS, frame-time spikes, hitches, Steam Deck or device
  review issues, profiler screenshots, `stat unit` / `stat gpu` output, or
  benchmark-route complaints that need interpretation, even if the user only
  says "Unity is stuttering", "Unreal frame time is bad", "Steam Deck
  performance", "GPU or CPU bottleneck?", "help read this profiler capture",
  or "set up a reproducible perf pass".
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  Best for repositories, bug reports, profiler screenshots, Unity Profiler
  captures, Unreal Insights traces, stat-command output, benchmark notes, or
  target-device review packets. Works as a triage and planning workflow, not as
  an automatic optimizer or build-tuning bot.
metadata:
  tags: game-development, unity, unreal, profiling, performance, optimization, frame-time, steam-deck
  version: "1.1"
  source: akillness/oh-my-skills
---

# Game Performance Profiler

Use this skill to turn a vague performance complaint into a short, prioritized profiling brief.

The goal is not to dump generic optimization advice. The goal is to decide **what kind of bottleneck is most likely**, **what evidence should be captured next**, **which route or device context matters**, and **which profiling artifact should be produced first**.

Read [references/profiling-patterns.md](references/profiling-patterns.md) before classifying cross-engine edge cases or choosing between CPU, GPU, memory, streaming, and device-specific hypotheses.
Read [references/capture-packets-and-benchmark-routes.md](references/capture-packets-and-benchmark-routes.md) before asking for more evidence or designing a repeatable perf pass.
Read [references/device-review-and-steam-deck.md](references/device-review-and-steam-deck.md) before handling Steam Deck, low-spec laptop, handheld, or packaged-on-target review requests.
Read [references/escalation-ladder.md](references/escalation-ladder.md) before escalating from quick stat/screenshot packets to Unreal Insights, Frame Debugger, RenderDoc, PIX, or Nsight.

## When to use this skill
- Unity or Unreal projects with low FPS, frame-time spikes, hitches, or performance regressions
- Steam Deck, handheld, mobile, console, VR, or low-spec PC review requests where target-device behavior matters
- Profiler screenshots, Unreal Insights traces, stat-command output, benchmark notes, or overlay screenshots that need interpretation
- Teams asking whether the problem looks CPU-bound, GPU-bound, memory-bound, streaming-bound, or platform-config/device-bound
- Requests for a profiling plan, benchmark route, device review pass, or performance handoff brief instead of instant code edits
- Screenshot-only or chat-thread performance packets that need to be turned into a clean evidence packet before deeper diagnosis

## When not to use this skill
- The main problem is a raw build/cook/package/editor failure with no runtime frame-time investigation → prefer `game-build-log-triage`
- The complaint is one part of a broader demo/playtest/community packet and the real question is what to fix before the next beat → use `game-demo-feedback-triage` after isolating perf evidence here
- The task is generic web/app/service tuning rather than engine-specific frame-time or device review → use `performance-optimization`
- The request is about CI/build reproducibility, cache policy, or release automation rather than runtime bottleneck triage → use `game-ci-cd-pipeline`

## Instructions

### Step 1: Normalize the evidence packet first
Capture the minimum facts before diagnosing.

Record:
- engine: `Unity` | `Unreal` | `Unknown`
- target hardware: PC | Steam Deck / handheld | console | mobile | VR | low-spec laptop | unknown
- environment: editor | packaged/dev build | release/shipping build | unknown
- symptom type: low average FPS | intermittent hitch | traversal hitch | combat spike | loading stall | thermal drift | unknown
- evidence available: profiler screenshot, capture file, stat-command screenshot, overlay screenshot, video, benchmark notes, reproduction steps
- reproduction shape: exact scene / level / encounter / traversal path / save slot / menu / cutscene / unknown
- quality variables: resolution, frame cap, quality preset, dynamic-resolution / upscaler state, battery/power mode if relevant

If the user gives only a vague complaint, say confidence is low and keep the next step focused on evidence capture.

### Step 2: Choose one primary operating mode
Pick exactly one mode for the current run:

1. **quick-triage-packet**
   - Use when the user has a complaint plus screenshots, stat output, or partial evidence and needs the next capture.
2. **bottleneck-classification**
   - Use when there is enough evidence to choose the most likely bottleneck family now.
3. **benchmark-route-plan**
   - Use when the team needs a reproducible traversal path, save slot, or repeated perf pass before diagnosing further.
4. **device-review**
   - Use when packaged-on-target behavior matters more than editor numbers, especially for Steam Deck / handheld / low-spec / console-style review.
5. **tool-escalation**
   - Use when the first-pass signal exists but deeper tooling must be chosen deliberately.

### Step 3: Classify the likely bottleneck before proposing fixes
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
- Resolution or quality changes the problem a lot → suspect `gpu-rendering-shaders-postfx`
- Spikes line up with gameplay events, AI bursts, or managed allocations → suspect `cpu-gameplay-scripting` or `memory-gc-allocation-churn`
- Hitches appear during traversal, asset reveals, or scene transitions → suspect `loading-streaming-io`
- Editor is bad but packaged build differs materially → suspect `platform-config-thermal-device-specific` or measurement mismatch
- Many visible objects, shadows, transparent effects, or overdraw symptoms → suspect `cpu-render-thread-draw-call-pressure` and/or `gpu-rendering-shaders-postfx`
- Steam Deck or handheld review with no packaged-on-device evidence yet → start with `platform-config-thermal-device-specific` until device capture exists

### Step 4: Pick the smallest next capture that can disambiguate the issue
Recommend the smallest next capture that will materially improve confidence.

**For Unity, prefer:**
- Profiler CPU / GPU / Memory modules attached to a player build when possible
- Frame Debugger when the issue looks render-side
- Profile Analyzer when regression comparison or repeated passes matter
- packaged-build / target-device validation when editor numbers are misleading

**For Unreal, prefer:**
- `stat unit`, `stat unitgraph`, `stat gpu`, or nearby stat commands for first direction
- Unreal Insights for deeper thread/load-time traces
- GPU Visualizer or external GPU capture when render cost is the main suspect
- packaged-build / target-device confirmation when editor or PIE behavior is noisy

**Cross-engine escalation:**
- RenderDoc / PIX / Nsight when the issue is clearly graphics-path specific
- benchmark route / replay path / fixed scene when reproducibility is the actual blocker
- memory-focused capture when crashes, spikes, or heavy allocation churn accompany the slowdown

### Step 5: Make route and device context explicit
When the evidence is weak, ask for or define the smallest repeatable perf pass:
- exact save slot, checkpoint, or scene
- start point and traversal path
- duration or repeat count
- warm-up vs measured pass
- target graphics preset / frame cap / power mode
- whether the result is editor-only, packaged-only, or device-only

Do not treat “the market area feels bad” as sufficient evidence if the team needs a durable perf workflow.

### Step 6: Build the profiling brief
Return a concise report with this exact structure:

```markdown
# Game Performance Profiling Brief

## Scope
- Mode: ...
- Engine: ...
- Target: ...
- Environment: ...
- Symptom: ...
- Confidence: high | medium | low

## Evidence packet
- What exists now: ...
- What's missing: ...
- Editor vs packaged / device note: ...

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

## Benchmark route / device review
- Repro route or save: ...
- Repeat / warm-up guidance: ...
- Device or packaged-build checks: ...

## Escalation path
- Stay with quick packet | move to engine profiler | escalate to GPU tool
- Why: ...

## Likely root-cause families
- 2-4 concrete possibilities tied to the chosen bucket

## Recommended next artifact
- Choose one: quick triage packet | profiling plan | benchmark route brief | CPU/GPU split note | memory/GC checklist | streaming hitch checklist | device review brief

## What not to do yet
- 1-3 bullets that prevent premature optimization or blind rewrites
```

### Step 7: Tailor the diagnosis to the request type
**For screenshot-only or stat-only evidence:**
- translate the screenshot into the smallest plausible bottleneck hypothesis
- keep confidence proportional to the screenshot
- ask for the minimum extra route/build/device info that would upgrade confidence

**For low average FPS:**
- decide whether the frame is mostly CPU- or GPU-limited before discussing optimization
- separate content-density problems from systemic engine/config issues

**For intermittent hitches:**
- focus on reproducibility, capture timing, and whether loading/streaming/GC fits better than steady-state rendering cost
- ask for a fixed traversal path or repeatable encounter

**For Steam Deck / handheld / low-spec review:**
- emphasize packaged-build and target-device evidence over editor impressions
- call out thermal, frame-cap, quality-preset, and power-mode risk when evidence is weak
- prefer a `device review brief` or `benchmark route brief` before speculative optimization

**For profiler screenshot or Unreal Insights interpretation:**
- convert the evidence into a bottleneck hypothesis and next capture, not a pretend-perfect diagnosis
- keep engine-native language explicit so the handoff is actionable

### Step 8: Ask for the minimum missing evidence when needed
If confidence is low, request the smallest next packet that would materially improve the triage:
1. one representative profiler/stat/overlay screenshot or short trace summary
2. exact scene / encounter / route where the issue reproduces
3. target hardware and whether the numbers are from editor or packaged build
4. current FPS/frame-time target and observed worst case
5. whether lowering resolution or quality changes the problem noticeably

Do not ask for a full optimization dossier.

## Output format
Always return a short profiling brief, not a broad optimization essay.

Required qualities:
- classify the likely bottleneck before proposing fixes
- recommend the next capture, route, or device review step instead of ten speculative optimizations
- separate evidence from hypothesis
- make editor-vs-packaged and quick-packet-vs-deep-trace boundaries explicit
- keep the report under roughly 300-550 words unless the user asks for more
- use engine-native language such as Profiler, Frame Debugger, Unreal Insights, `stat gpu`, frame time, draw-call pressure, GC, streaming, and packaged build

## Examples

### Example 1: Unity combat spike + suspected GC
**Input**
> Our Unity game drops from 120 to 45 FPS in combat. We have Profiler screenshots and someone thinks GC spikes are the cause. What should we do first?

**Output sketch**
- Mode: `bottleneck-classification`
- Primary hypothesis: `memory-gc-allocation-churn`
- Secondary hypothesis: `cpu-gameplay-scripting`
- Next capture confirms allocations during the combat event and compares before/after passes
- Recommended next artifact: `memory/GC checklist`
- What not to do yet: do not start broad rendering optimization before confirming the spike is not allocation-driven

### Example 2: Unreal open-world traversal hitch
**Input**
> Unreal is fine indoors but frame time explodes in our open world area. Help me figure out whether this is CPU, GPU, streaming, or shaders.

**Output sketch**
- Mode: `benchmark-route-plan` or `bottleneck-classification`
- Primary hypothesis: `loading-streaming-io` or `gpu-rendering-shaders-postfx` depending on evidence
- Next capture uses `stat unit`, `stat gpu`, and a reproducible traversal route
- Recommended next artifact: `benchmark route brief` or `profiling plan`

### Example 3: Steam Deck pre-demo review
**Input**
> We need a Steam Deck performance review plan before the demo. The editor feels rough but we have not profiled the packaged build on device yet.

**Output sketch**
- Mode: `device-review`
- Primary hypothesis: `platform-config-thermal-device-specific` until device capture exists
- Next capture: packaged build on target device, locked repro route, frame-time target, overlay screenshots
- Recommended next artifact: `device review brief`

### Example 4: Screenshot-only packet
**Input**
> I only have a `stat unit` screenshot, a phone photo of our Steam Deck overlay, and a note that the market square gets bad after two minutes.

**Output sketch**
- Mode: `quick-triage-packet`
- Keeps confidence low
- Requests the smallest missing packet: packaged build confirmation, exact route, repeat count, and matching settings snapshot
- Recommended next artifact: `quick triage packet`

## Best practices
1. **Classify the bottleneck before prescribing optimizations** — CPU, GPU, memory, streaming, and device/config issues need different captures.
2. **Prefer representative builds and devices** over editor-only impressions.
3. **Treat reproducibility as part of the diagnosis** — a fixed route or encounter is often more valuable than more theory.
4. **Use quick packets first, deep tools second** — screenshot/stat packets are a valid first step if they lead to a better capture plan.
5. **Recommend one next artifact** instead of a giant performance backlog.
6. **Use engine language the team already uses** so the handoff is immediately actionable.
7. **Keep confidence honest** when the evidence is only a screenshot, overlay, or vague complaint.
8. **Avoid premature micro-optimization** until the primary bottleneck is confirmed.

## References
- [Unity Profiler](https://docs.unity3d.com/Manual/Profiler.html)
- [Unity profiling a player](https://docs.unity3d.com/Manual/profiling-application.html)
- [Unity Frame Debugger](https://docs.unity3d.com/Manual/frame-debugger-window.html)
- [Unity Profile Analyzer](https://docs.unity3d.com/Packages/com.unity.performance.profile-analyzer@latest)
- [Unity Memory Profiler](https://docs.unity3d.com/Manual/com.unity.memoryprofiler.html)
- [Unreal Performance and Profiling Overview](https://dev.epicgames.com/documentation/en-us/unreal-engine/performance-and-profiling-overview-in-unreal-engine)
- [Unreal stat commands](https://dev.epicgames.com/documentation/en-us/unreal-engine/stat-commands-in-unreal-engine)
- [Unreal Insights](https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-insights-in-unreal-engine)
- [GPUOpen Unreal Engine Performance Guide](https://gpuopen.com/learn/unreal-engine-performance-guide/)
- [Steam Deck docs](https://partner.steamgames.com/doc/steamdeck)
