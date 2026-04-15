# Capture Packets and Benchmark Routes

Use this reference when the current evidence is too vague to classify a bottleneck confidently.

## Quick triage packet
Capture the smallest shareable packet first:
- target device / hardware
- editor vs packaged build
- one `stat unit` / `stat gpu` / overlay / profiler screenshot
- exact scene, save slot, menu, or route name
- quality preset, frame cap, resolution, and upscaler state
- one sentence describing the symptom shape: steady low FPS, traversal hitch, combat spike, load spike, or thermal drift

## Benchmark route brief
When screenshots are not enough, define a repeatable pass:
1. start point / save slot / map
2. fixed traversal path or camera move
3. warm-up pass count
4. measured repeat count
5. expected frame-time budget or FPS target
6. where to capture screenshots or traces

## Why this matters
- Performance complaints are often location-specific, not global.
- Screenshot-only evidence is faster to share but too weak without route/build/device context.
- Repeatable routes let QA, engineering, and production compare builds without arguing about whether they tested the same thing.

## Bad packets to avoid
- "the market area feels bad" with no route or settings
- editor-only measurements when the decision is about packaged or target-device behavior
- a single screenshot with no build number, device, or repro steps
