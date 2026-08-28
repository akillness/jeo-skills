# Game feel response-chain model

## Unit of work

Tune one existing, functionally correct mechanic in one reproducible context. The context
includes build, scene, target device, input method, frame mode, network/authority state, and
camera. If those change, record a new comparison condition.

## Response chain

Capture as many of these stages as the environment exposes:

1. **Intent:** the action the player is trying to perform.
2. **Device event:** button, key, pointer, touch, stick, sensor, or assistive input state.
3. **Input read:** when the runtime samples or receives the event.
4. **Simulation decision:** state machine, buffer, cancel, cooldown, physics, or authority gate.
5. **Trusted state change:** movement, damage, score, resource, or ability state.
6. **Rendered response:** pose, sprite, mesh, camera, UI, interpolation, and presentation frame.
7. **Feedback channels:** visual, audio, haptic, text, shape, or spatial confirmation.
8. **Recovery:** return to input acceptance, stable camera, rest pose, unscaled timers, and a
   known effect state.

Label each stage `measured`, `observed`, or `inferred`. A synchronized capture can show visible
response but may not reveal the device event, simulation gate, or authoritative state.

## Weak-link classification

- **input:** sampling, mapping, deadzone, focus, or device switching;
- **state:** buffer, cancel, gating, recovery, cooldown, and invalid transitions;
- **simulation:** physics, collision, prediction, reconciliation, and interpolation;
- **animation:** anticipation, startup, contact, follow-through, blending, and rest;
- **camera:** framing, lag, recoil, shake, zoom, and spatial orientation;
- **recognition:** whether the consequence is perceivable and distinguishable;
- **priority:** clutter, conflicting channels, habituation, and repeated intensity;
- **render/performance:** frame pacing, stalls, effects cost, and asset streaming;
- **network/authority:** command transit, validation, state delivery, prediction, and correction.

Fix the earliest weak causal stage that explains the symptom. Later effects cannot make an
authority delay or frame stall disappear.

## Signal hierarchy

For each event, record:

- gameplay importance and consequence;
- information the player needs;
- primary and redundant channels;
- repetition rate and overlap risk;
- accessibility control and replacement signal;
- cleanup/return-to-rest owner.

Critical information cannot depend on only color, sound, haptics, flashing, or camera motion.
Routine events should not compete with damage, threats, objectives, or loss of control.

## Simulation/presentation boundary

Presentation can exaggerate scale, position, rotation, time, camera, audio, and haptics, but it
must not silently alter trusted collision, damage, cooldown, score, authority, or input policy.
If a feel change intentionally changes gameplay, route it back to the mechanic owner and
measure it as a design change, not pure polish.

Each transient change needs a known restoration path, including interruption, pause, scene
change, reconnect, object reuse, and reduced-motion toggle.

## Accessibility replacement

An off/reduced control should preserve necessary information through a stable alternative:

- camera shake -> anchored indicator, directional shape, audio, or haptic according to settings;
- flash -> non-flashing contrast, outline, icon, text, or audio;
- head bob/motion blur -> stable camera with spatial or UI cue;
- haptics -> visual/audio/text confirmation;
- audio-only cue -> caption, icon, directional indicator, or haptic;
- color-only cue -> shape, label, pattern, icon, or position plus focus/state semantics.

Do not merely lower all feedback. Preserve event identity and priority.

## Comparison contract

A controlled comparison keeps mechanic, encounter, device, input method, build conditions,
network state, and capture method matched. Repeat enough to expose inconsistency and player
adaptation based on the project's risk. Define the basis rather than inventing one universal
run count.

Verify trusted state, input acceptance, effect cleanup, readability, accessibility variants,
and project-owned performance budgets alongside the desired feel signal.
