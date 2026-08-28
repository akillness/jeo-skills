---
name: game-feel
description: >
  Diagnose and tune the response chain from player intent through input,
  simulation, visible motion, camera, animation, VFX, audio, haptics, UI, and
  recovery for an existing game mechanic. Use when movement, combat, jumping,
  firing, hits, pickups, menus, or abilities work mechanically but feel delayed,
  weak, weightless, noisy, inconsistent, nauseating, or unresponsive; when the
  user asks for game feel, juice, punch, hit stop, freeze frames, screenshake,
  squash and stretch, impact feedback, input latency, coyote time, or feedback
  layering; or when a team needs a baseline-versus-variant capture and an
  accessibility-safe tuning contract. Measure before tuning, change one causal
  variable, preserve simulation truth, and validate `game-feel-contract.json`.
allowed-tools: Bash Read Write Edit Glob Grep WebFetch
compatibility: >
  Engine-neutral planning and evidence review. The bundled validator is
  read-only, Python 3.9-compatible, and standard-library only.
metadata:
  version: "1.0"
  source: akillness/jeo-skills
---

# Game Feel

Game feel is the experienced response between intention and consequence. Treat it as a
measured chain, not a checklist of shake, flash, freeze, particles, and sound. Polish must
clarify the mechanic without changing trusted simulation state, blocking input, hiding
readability, or making the game inaccessible.

## When to use this skill

Use it to:

- diagnose a mechanic that works but feels delayed, soft, weightless, slippery, or noisy;
- inspect input-to-visible-response and action-to-consequence timing;
- tune movement, attack, jump, dash, fire, impact, pickup, death, or button feedback;
- coordinate animation, camera, VFX, audio, haptics, UI, and recovery;
- compare a baseline and one controlled feel variant;
- add reduced-motion, flash, haptic, or redundant cue alternatives;
- separate actual input latency from animation, camera, rendering, or network delay.

Do not use it to invent the base mechanic, build a camera system, author a VFX effect, mix
sound, or profile a whole frame budget. Route those to the relevant game-design, Three.js,
`game-vfx`, audio, or `game-performance-profiler` skill.

## Instructions

### 1. Freeze one mechanic and context

Record the exact build, scene, mechanic, target devices, input methods, frame mode, network
state, camera, and player context. Define what "better" means in observable terms, such as
clearer confirmation, faster perceived response, stronger impact distinction, or easier
control recovery.

If the mechanic is not functionally correct, route to debugging or implementation first.
Game feel cannot hide broken collision, authority, state transitions, or frame pacing.

### 2. Capture the baseline response chain

Capture video or telemetry that can connect:

`intent -> device event -> input read -> simulation decision -> state change -> rendered motion -> feedback channels -> return to control/rest`

Use frame stepping, input event timestamps, engine profiler markers, or a synchronized camera
only where available. Report which stages were measured and which are inferred. Do not claim
input latency from a visual impression alone.

### 3. Name the first weak link

Classify the primary problem before adding effects:

- input sampling or device mapping;
- state-machine gating, buffer, cancel, or recovery;
- simulation response or interpolation;
- animation startup, anticipation, contact, follow-through, or return;
- camera framing or secondary motion;
- impact recognition across visual, audio, haptic, or UI channels;
- feedback priority, clutter, habituation, or accessibility;
- rendering, frame pacing, network, or authority delay.

Choose one primary hypothesis. Route a real frame-time or network bottleneck outward instead
of masking it with more feedback.

### 4. Design one controlled variant

Change the earliest causal variable that could explain the problem. Examples include input
buffer policy, animation phase, easing, anticipation, contact pose, visual-only recoil,
secondary motion, event priority, or one redundant feedback channel.

Keep gameplay truth separate from presentation. Camera shake moves a visual camera layer, not
the authoritative body. Hit pause must not duplicate actions, deadlock scaled timers, violate
multiplayer authority, or discard buffered input. Every transient effect must return to a
known rest state.

Do not stack a fixed number of effects or copy another game's durations, amplitudes, coyote
window, input buffer, or shake curve. Proposed values need a mechanics rationale and capture
plan for the target build and device.

### 5. Preserve signal hierarchy

Map each event to importance and necessary information. Stronger events may receive stronger
or additional channels, but routine events must not compete with threats, damage, objectives,
or player control.

Use redundant channels for critical information so color, sound, haptics, or motion is not
the sole carrier. Avoid overlapping feedback that makes contact timing or state unreadable.

### 6. Build accessibility controls with the effect

Provide a real off or reduction path for camera shake, head bob, motion blur, repeated motion,
flashing, and haptics where applicable. Preserve the gameplay signal through another channel.
Settings must apply immediately enough to verify and persist according to the product's
settings contract.

Do not treat reduced motion as "less feedback." Replace vestibular or flashing intensity with
stable spatial, shape, text, audio, or haptic signals appropriate to the player's settings.

### 7. Compare baseline and variant

Use the same mechanic, route, build conditions, device, and capture method. Repeat enough to
observe consistency, not just one attractive take. Check:

- response and consequence are easier to read;
- input remains accepted according to the mechanic's policy;
- collision, authority, scoring, and cooldown state are unchanged;
- effects end and restore camera, scale, time, audio, and haptic state;
- routine repetition does not become noisy or uncomfortable;
- reduced-motion and alternate-channel variants preserve information;
- frame time and memory remain within project-owned budgets.

Return evidence, not only implementation details.

### 8. Write and validate the contract

From this skill directory, copy `references/contract-example.json`, replace the example, and
run:

```bash
python3 scripts/validate-game-feel.py game-feel-contract.json
python3 scripts/validate-game-feel.py --self-test
```

Return:

```markdown
### Game feel packet
- Mechanic and context: <build, scene, device, input, network>
- Baseline evidence: <measured response chain>
- Primary weak link: <one stage>
- Controlled change: <one causal variable>
- Signal hierarchy: <event and channels>
- Accessibility alternative: <off/reduced path and replacement signal>
- Verification: <baseline versus variant result>
- Next owner: <implementation, VFX, audio, profiler, network, or UI route>
```

## Examples

### Attack lands but feels weak

First verify contact, damage, and animation timing. Change one causal element such as contact
pose or visual-only recoil, then compare the same attack. Add channels only when the missing
information is identified; do not begin with a full shake/flash/freeze bundle.

### Jump feels laggy

Trace device event, input read, state transition, physics update, interpolation, animation,
and render. A delayed visible pose and a late input sample require different fixes. Measure
before changing coyote time or the jump arc.

### Frame rate collapses during combat

Route the bottleneck to `game-performance-profiler`. Do not label a performance failure as
"game feel" and cover it with stronger feedback.

## Best practices

1. Tune one existing mechanic in one reproducible context.
2. Measure the response chain and label inferred stages.
3. Fix the earliest weak causal link before layering polish.
4. Keep trusted simulation and presentation effects separate.
5. Derive every numeric parameter from mechanics and target-device evidence.
6. Use event importance to prevent feedback inflation.
7. Build reduced-motion and alternate-channel signals alongside the effect.
8. Compare baseline and one controlled variant under matched conditions.
9. Leave engine-specific implementation to the narrowest specialist.

## References

- `references/response-chain.md`: capture, classification, channel, recovery, and comparison model.
- `references/contract-example.json`: complete validator-accepted contract.
- `references/source-notes.md`: book, upstream, engine, and accessibility evidence.
- `scripts/validate-game-feel.py`: read-only Python 3.9+ validator.
