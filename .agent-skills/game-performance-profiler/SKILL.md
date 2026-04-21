---
name: game-performance-profiler
description: >
  Route Unity and Unreal frame-time complaints into one bottleneck-first profiling
  brief. Use when the main job is interpreting profiler screenshots, `stat unit`
  / `stat gpu` output, benchmark-route complaints, or Steam Deck / target-device
  review packets; choosing the smallest useful next capture; naming one primary
  bottleneck family; and deciding whether to stay with quick packets, move to an
  engine-native profiler, or escalate further. Route generic app/service tuning
  to `performance-optimization`, build/editor/package failures to
  `game-build-log-triage`, broader game-production coordination to `bmad-gds`,
  and mixed demo/community feedback to `game-demo-feedback-triage`.
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  Best for repositories, bug reports, profiler screenshots, Unity Profiler
  captures, Unreal Insights traces, stat-command output, benchmark notes, or
  target-device review packets. Works as a triage and planning workflow, not as
  an automatic optimizer or build-tuning bot.
metadata:
  tags: game-development, unity, unreal, profiling, performance, optimization, frame-time, steam-deck
  version: "1.2"
  source: akillness/oh-my-skills
---

# Game Performance Profiler

Use this skill when the main question is **"what packet do we trust, which bottleneck family is most likely, and what is the next capture or review artifact worth producing?"**

The job is not to dump generic optimization advice.
The job is to normalize the current packet, choose one operating mode, name one primary bottleneck family, recommend the smallest next capture that can improve confidence, and return one profiling artifact teams can actually act on.

Read [references/mode-selection-and-route-outs.md](references/mode-selection-and-route-outs.md) before handling an unfamiliar request shape.
Read [references/capture-packets-and-benchmark-routes.md](references/capture-packets-and-benchmark-routes.md) before designing a reproducible pass.
Read [references/device-review-and-steam-deck.md](references/device-review-and-steam-deck.md) before trusting editor numbers for handheld or target-device review.
Read [references/profiling-patterns.md](references/profiling-patterns.md) before classifying weak or ambiguous evidence.
Read [references/escalation-ladder.md](references/escalation-ladder.md) before jumping from screenshots or stat packets to deeper engine or GPU tools.

## When to use this skill
- Unity or Unreal projects with low FPS, frame-time spikes, hitches, or performance regressions where the bottleneck is not yet isolated
- Profiler screenshots, `stat unit` / `stat gpu` output, Unreal Insights traces, overlay captures, route notes, or benchmark complaints that need interpretation
- Steam Deck, handheld, mobile, console, VR, or low-spec review requests where packaged-on-device behavior matters more than editor impressions
- Requests for a profiling plan, benchmark route, device review packet, CPU/GPU split note, or escalation choice instead of immediate code edits
- Mixed performance packets where the next owner is still unclear and the first job is choosing between quick packet, deeper trace, or neighboring game skill

## When not to use this skill
- **The main issue is a Unity/Unreal build, cook, package, editor, or CI failure with no runtime frame-time diagnosis yet** → use `game-build-log-triage`
- **The main issue is generic web/app/service performance rather than engine-specific runtime capture interpretation** → use `performance-optimization`
- **The real task is broad milestone or production coordination across bugs, playtest notes, launch goals, and roadmap tradeoffs** → use `bmad-gds`
- **The packet is mainly playtest/demo/community feedback and the question is fix-first prioritization** → use `game-demo-feedback-triage`
- **The next move is already a deep implementation change with a confirmed cause**; route to the implementation skill after producing the profiling brief

## Instructions

### Step 1: Frame the packet
Capture the minimum useful context before diagnosing anything.

Record:
- engine: `Unity` | `Unreal` | `Unknown`
- target: PC | Steam Deck / handheld | console | mobile | VR | low-spec laptop | unknown
- environment: editor | packaged/dev build | release/shipping build | unknown
- symptom: low average FPS | intermittent hitch | traversal hitch | combat spike | loading stall | thermal drift | unknown
- evidence available: profiler screenshot, trace/capture file, stat-command screenshot, overlay screenshot, video, benchmark notes, reproduction steps
- reproduction shape: exact scene, save slot, encounter, traversal path, menu, cutscene, or unknown
- quality variables: resolution, preset, frame cap, upscaler state, power mode, battery state if relevant

Quick frame:
```markdown
Engine: Unreal
Target: Steam Deck
Environment: packaged build unknown
Symptom: traversal hitch after two minutes in market square
Evidence: `stat unit` screenshot + overlay photo
Repro: route not yet fixed
```

Rule: if the packet is thin, keep confidence low and make the next capture smaller, not broader.

### Step 2: Choose one primary mode
Use [references/mode-selection-and-route-outs.md](references/mode-selection-and-route-outs.md).

Pick exactly one primary mode:
- `quick-triage-packet`
- `bottleneck-classification`
- `benchmark-route-plan`
- `device-review`
- `tool-escalation`

Rule: one primary mode, optional secondary note. Do not try to handle every mode at once.

### Step 3: Name the likely bottleneck family before proposing fixes
Choose one primary family and an optional secondary family.

Primary families:
- `cpu-gameplay-scripting`
- `cpu-render-thread-draw-call-pressure`
- `gpu-rendering-shaders-postfx`
- `memory-gc-allocation-churn`
- `loading-streaming-io`
- `physics-animation-simulation`
- `platform-config-thermal-device-specific`
- `unknown-needs-better-capture`

Good bottleneck statements:
- "The strongest signal points to streaming / IO hitching during traversal, not steady-state GPU load."
- "The packet suggests GC/allocation spikes during combat more than rendering saturation."
- "This looks device/config-bound because the team is still relying on editor impressions instead of packaged-on-target evidence."

Avoid: "performance is bad overall."

### Step 4: Recommend the smallest next capture
Pick the cheapest capture that can materially separate the likely causes.

Typical next captures:
- one better Unity Profiler CPU/GPU/Memory packet from a representative player build
- one `stat unit` + `stat gpu` pair on the exact Unreal repro route
- one fixed traversal route with warm-up and repeat counts
- one packaged-on-device capture instead of more editor screenshots
- one deeper trace (Unreal Insights, GPU Visualizer, Frame Debugger, or external GPU tool) only after the first packet justifies it

Rule: prefer engine-native captures before vendor GPU tools unless the packet is already clearly render-path specific.

### Step 5: Make route and device context explicit
If reproducibility is missing, define the smallest repeatable pass.

Specify:
- save slot / checkpoint / scene
- start point and traversal path
- warm-up pass count
- measured repeat count or duration
- graphics preset / frame cap / power mode
- whether the packet is editor-only, packaged-only, or target-device

Do not treat "the market area feels bad" as a durable benchmark route.

### Step 6: Return one profiling brief
Always return one concise artifact with this shape:

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

## Recommended next artifact
- Choose one: quick triage packet | profiling plan | benchmark route brief | CPU/GPU split note | memory/GC checklist | streaming hitch checklist | device review brief

## What not to do yet
- 1-3 bullets that prevent premature optimization or blind rewrites
```

## Output format
Required qualities:
- classify the bottleneck before talking about fixes
- separate evidence from hypothesis
- recommend the next capture, route, or device review step instead of a giant backlog
- make editor-vs-packaged and packet-vs-trace boundaries explicit
- keep the report roughly 300-550 words unless the user asks for more
- use engine-native terms such as Unity Profiler, Frame Debugger, Unreal Insights, `stat unit`, `stat gpu`, frame time, draw-call pressure, GC, streaming, and packaged build

## Examples

### Example 1: Unity combat spike
**Input:** "Our Unity game drops from 120 to 45 FPS in combat. We have Profiler screenshots and someone suspects GC spikes. Triage what to look at first."

**Expected shape:** classify around `memory-gc-allocation-churn` or `cpu-gameplay-scripting`, keep the current screenshots as a real packet, recommend the smallest next capture, and avoid jumping to rendering advice first.

### Example 2: Unreal open-world traversal hitch
**Input:** "Unreal is fine indoors but frame time explodes in our open world area. Help me triage whether this is CPU, GPU, streaming, or shaders."

**Expected shape:** use `bottleneck-classification` or `benchmark-route-plan`, recommend `stat unit` / `stat gpu` or Unreal Insights as appropriate, and define a reproducible traversal route instead of guessing fixes.

### Example 3: Steam Deck review packet
**Input:** "We need a Steam Deck performance review plan before our demo release. The editor feels rough but we have not profiled the packaged build on device yet."

**Expected shape:** choose `device-review`, keep confidence limited, prioritize packaged-on-device evidence, and return a device review brief or benchmark route brief.

### Example 4: Route-out to build failure triage
**Input:** "Our Unreal packaged build crashes during cook and we do not even have runtime numbers yet."

**Expected shape:** route to `game-build-log-triage` instead of pretending this is already a profiling problem.

## Best practices
1. Start from the packet the team already has instead of demanding an ideal trace immediately.
2. Name one primary bottleneck family before discussing optimizations.
3. Treat reproducibility as part of the diagnosis, not an optional extra.
4. Prefer packaged-on-device evidence over editor impressions when the release target is a handheld or constrained machine.
5. Escalate from screenshot/stat packets to engine-native profilers before jumping to GPU-vendor tooling.
6. Recommend one next artifact, not a giant optimization backlog.
7. Keep route-outs explicit so game-performance work does not sprawl into build triage, generic app tuning, or production coordination.

## References
- [Unity Profiler](https://docs.unity3d.com/Manual/Profiler.html)
- [Unity Frame Debugger](https://docs.unity3d.com/Manual/frame-debugger-window.html)
- [Unreal Performance and Profiling Overview](https://dev.epicgames.com/documentation/en-us/unreal-engine/performance-and-profiling-overview-in-unreal-engine)
- [Unreal stat commands](https://dev.epicgames.com/documentation/en-us/unreal-engine/stat-commands-in-unreal-engine)
- [Unreal Insights](https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-insights-in-unreal-engine)
- [GPUOpen Unreal Engine Performance Guide](https://gpuopen.com/learn/unreal-engine-performance-guide/)
- [Steam Deck docs](https://partner.steamgames.com/doc/steamdeck)
