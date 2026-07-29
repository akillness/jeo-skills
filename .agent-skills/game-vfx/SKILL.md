---
name: game-vfx
description: >
  Design, implement, budget, and verify readable real-time game visual effects:
  particles, smoke/fog, lightning, fire, trails, impacts, bloom/glow, and layered
  spell timelines. Use when a user needs a VFX spec, lifecycle, engine handoff,
  particle pooling, effect composition, reduce-motion fallback, or frame-budget
  diagnosis. Triggers on: game VFX, spell effects, particle system, impact burst,
  procedural lightning, smoke, bloom, magic aura, or VFX performance.
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: Engine-neutral workflow with Apple SwiftUI/Canvas/Metal reference routes derived from lev-os/agents research
metadata:
  tags: game-development, vfx, particles, shaders, performance, accessibility
  version: "1.0.0"
  source: https://github.com/lev-os/agents
---

# Game VFX

## When to use this skill

- Turn a gameplay event into a layered, timed VFX specification.
- Implement smoke, fog, particles, fire, lightning, impacts, trails, or bloom.
- Diagnose excessive particles, blur, draw calls, allocation, overdraw, or unreadable effects.
- Create an engine handoff with performance tiers and reduced-motion behavior.

Use `dalamud-vfx-editor` for FFXIV/Dalamud asset editing, direct Three.js skills for renderer-specific GLSL/post-processing implementation, and engine-specific Unity/Godot skills when their APIs are the main problem.

## Instructions

### Step 1: Capture one effect packet

Record:

- gameplay event and communication goal;
- engine/render pipeline, target platform, camera, and target FPS;
- lifecycle phases and total duration;
- layer list, blend modes, attachment space, and depth order;
- particle, draw-call, overdraw, texture, and frame-time budgets;
- audio/screen-shake hooks;
- reduced-motion and low-quality fallbacks;
- acceptance capture: representative gameplay video plus profiler evidence.

If the effect cannot state what the player should understand, do not start with particles.

### Step 2: Select the narrowest effect family

- **Smoke/fog/clouds** — sprite/flipbook emitters for authored forms, noise blobs for light 2D overlays, ray marching only for justified volumetrics.
- **Lightning/electricity** — midpoint displacement for jagged bolts, curves for controlled arcs, recursive branches sparingly.
- **Particles/fire/sparks** — pooled emitters with explicit spawn, update, collision, and recycle rules.
- **Bloom/glow** — threshold → separable blur → additive composite; downsample blur targets.
- **Full spell/ability** — phase state machine plus a layer stack; visual intensity follows gameplay timing.

Read `references/effect-recipes.md` before implementation.

### Step 3: Write a machine-checkable spec

Start from `references/vfx-spec.example.json`, adapt it, then run:

bash
python3 .agent-skills/game-vfx/scripts/validate_vfx_spec.py path/to/vfx-spec.json


The validator checks phase/layer uniqueness, positive timing, finite budgets, particle and draw-call totals, blur limits, and reduced-motion coverage. Passing it is a design-contract check, not proof of runtime performance.

### Step 4: Build by lifecycle, not by isolated emitters

Use explicit phases such as `idle → charging → casting → impact → dissipating`. Drive all layers from shared normalized phase time and deterministic event hooks. Pool mutable instances before gameplay; do not allocate per frame. Keep random seeds controllable for tests and captures.

### Step 5: Establish hierarchy and readability

Give one layer primary visual weight and make supporting layers subordinate. Preserve gameplay silhouettes, telegraphs, hit zones, and UI readability. Use contrast, motion direction, timing, and scale before adding more particles. Sync the strongest visual beat with the gameplay event and audio transient.

### Step 6: Apply platform budgets

Use project measurements as authority. As a conservative starting point from the inspected Apple-oriented upstream reference:

- target 60 FPS within a 16.67 ms total frame;
- keep VFX overlay draw calls under 10 where practical;
- treat more than roughly 500 CPU-updated particles as a prompt to profile GPU/compute approaches;
- keep mobile active particles within an explicit tiered cap (the upstream reference suggests 500–2,000);
- downsample large blur/bloom passes;
- avoid mobile blur radii above roughly 20 points without measurement;
- use 4–8 ray-march samples as a starting real-time tier, not a universal law.

These are hypotheses to validate on the oldest supported target, not guaranteed engine-independent limits.

### Step 7: Verify behavior and performance

Capture:

- frame time, GPU time, particle peak, draw calls, overdraw, and allocations;
- readability during camera motion and effect overlap;
- timing against hit/impact events;
- low-quality and reduced-motion fallbacks;
- cleanup after cancellation, scene unload, pause, and repeated triggers;
- a before/after capture on representative hardware.

Do not claim 60 FPS from a static spec or desktop simulator alone.

## Examples

### Validate a fireball handoff

bash
cp .agent-skills/game-vfx/references/vfx-spec.example.json ./fireball-vfx.json
python3 .agent-skills/game-vfx/scripts/validate_vfx_spec.py ./fireball-vfx.json


### Route an FFXIV AVFX request

Use `dalamud-vfx-editor`; this skill can still supply hierarchy, timing, and performance review, but it does not own the file-format workflow.

## Best practices

1. Design for player communication before spectacle.
2. Use one shared lifecycle and deterministic event timing.
3. Pool resources and profile on target hardware.
4. Downsample expensive screen-space effects.
5. Ship reduced-motion and quality-tier fallbacks with the effect.
6. Treat numerical guidance as starting budgets that measured evidence may replace.

## References

- `references/effect-recipes.md` — engine-neutral recipes and composition rules.
- `references/vfx-spec.example.json` — validator-ready handoff example.
- `references/upstream.md` — provenance and adaptation boundary.
- [lev-os/agents](https://github.com/lev-os/agents)
