---
name: game-ui-ux
description: >
  Design and review an engine-neutral game UI/UX contract for HUDs, menus,
  inventories, shops, maps, settings, overlays, tutorials, notifications, and
  controller flows. Use when a game interface must define player decisions,
  information hierarchy, persistent versus contextual HUD state, screen-stack
  behavior, keyboard/gamepad/touch input, focus order, back behavior, safe areas,
  responsive layout, scalable text, localization, accessibility, event-driven
  data binding, or cross-device verification; when the user asks for game UI
  design, game UI UX, HUD usability, controller navigation, or Three.js game UI
  planning; or when a mockup must be reconciled with a real runtime. Produce and
  validate `game-ui-contract.json`, then route visual concepts and engine widgets
  to their specialist skills.
allowed-tools: Bash Read Write Edit Glob Grep WebFetch
compatibility: >
  Engine-neutral design and review. The bundled validator is read-only, Python
  3.9-compatible, and standard-library only.
metadata:
  version: "1.0"
  source: akillness/jeo-skills
---

# Game UI/UX

This is the canonical generic game-interface contract. It combines the pictured
`game-ui-design`, `game-ui-ux`, and Three.js game-UI planning lanes without duplicating
engine widgets or the project-specific Open Design takeover workflow.

## When to use this skill

Use it to:

- design or review a HUD, menu, inventory, shop, map, settings screen, or overlay;
- map player decisions to information priority and visibility rules;
- design screen flow, pause/overlay behavior, focus order, and back/cancel behavior;
- support mouse, keyboard, controller, touch, and assistive input consistently;
- handle aspect ratios, safe areas, text scaling, localization, and content expansion;
- replace per-frame UI polling with a documented state/event contract;
- compare mockups against real runtime states and target devices;
- build a verification matrix before engine implementation.

Do not use it for a landing-page UI, pure visual moodboard, engine-specific widget code,
moment-to-moment juice, or a Darkbone Archer Open Design takeover. Route those to web design,
Open Design game UI, `game-feel`, Unity, or Three.js specialists.

## Instructions

### 1. Inventory real screens and states

Inspect the runtime, design files, screenshots, controller maps, supported devices, locales,
and accessibility settings. Record each screen, overlay, modal, loading/empty/error state,
and game phase. A mockup is partial evidence and must not delete states or information it does
not show.

For each screen, name the player decision it supports. If an element supports no decision,
feedback, status, or legal requirement, challenge its presence instead of polishing it.

### 2. Define information hierarchy

Classify information by urgency, persistence, and consequence:

- critical and immediate;
- current decision support;
- contextual or reveal-on-demand;
- historical or reference;
- decorative.

Record visibility triggers, dismissal behavior, conflict priority, and what happens under
stress, pause, spectator, reconnect, loading, or reduced-HUD settings. Do not rely on color,
position, audio, motion, or haptics as the only carrier of critical state.

### 3. Model navigation and screen flow

Use explicit screens and transitions rather than scattered booleans. Define push, replace,
overlay, modal, pop/back, resume, disconnect, and destructive-action behavior.

For every input method, define initial focus, directional or sequential focus, activation,
back/cancel, tab/section change, scroll, pointer takeover, and device-switch behavior. Focus
must remain visible, predictable, recoverable after a layout change, and able to leave every
focusable element.

Accessibility settings must be reachable before gameplay and fully navigable with declared
input methods.

### 4. Define responsive layout and safe areas

Use layout constraints, containers, anchors, and content rules rather than one fixed pixel
composition. Record:

- target device and aspect families;
- safe-area and overscan handling;
- persistent anchors and expandable regions;
- text and UI scaling behavior;
- reflow and scroll ownership;
- minimum readable states based on target-device testing;
- split-screen, picture-in-picture, or streaming overlays when applicable.

Do not copy a universal reference resolution, touch target, margin, or text size. Measure the
target devices and apply platform accessibility guidance.

### 5. Make localization a layout state

Externalize player-visible strings and account for expansion, truncation policy, plural,
gender, number/date formatting, bidirectional text, fonts, glyph coverage, line breaks, and
input-glyph substitution. Test real representative strings rather than pseudo-localization
alone.

Never bake English text into art or size a control only for its shortest label unless the
product explicitly accepts that limitation.

### 6. Define the UI data contract

For each element, record its source, event or query, update conditions, stale state,
permission, error state, and owner. Prefer event-driven updates for changes and explicit
initial snapshots. Do not expose hidden multiplayer data through an interface binding.

Keep presentation state distinct from gameplay truth. A disabled control must explain why and
how the player can proceed when that information is safe to reveal.

### 7. Verify the real interaction

Test every required screen and state across the target matrix. Include:

- pointer, keyboard, controller, touch, and assistive paths as declared;
- initial focus, logical traversal, focus restoration, and back behavior;
- aspect, orientation, safe area, UI/text scale, and locale changes;
- loading, empty, error, offline, reconnect, and destructive confirmations;
- HUD conflict under peak gameplay load;
- reduced motion, color-independent state, subtitles/captions, narration, and haptics as
  applicable;
- event update, stale value, unauthorized data, and rapid state-change cases.

Record the exact build, device or viewport, input method, locale, and observed result. A
static screenshot does not prove navigation or state behavior.

### 8. Write and validate the contract

From this skill directory, copy `references/contract-example.json`, replace the example, and
run:

```bash
python3 scripts/validate-game-ui.py game-ui-contract.json
python3 scripts/validate-game-ui.py --self-test
```

Return:

```markdown
### Game UI/UX packet
- Player decision: <primary decision or flow>
- Screens and states: <covered runtime surface>
- Information hierarchy: <critical, contextual, hidden>
- Input and focus: <methods, initial focus, traversal, back>
- Layout and locale: <safe area, scaling, reflow, languages>
- Accessibility: <barriers and alternatives>
- Data contract: <source, update, stale/error behavior>
- Verification: <matrix result and missing evidence>
- Next owner: <concept, engine widgets, Three.js, feel, accessibility, or implementation>
```

## Examples

### Controller cannot navigate settings

Capture the real focus graph, initial focus, back behavior, and device-switch state. Fix the
navigation contract before styling. Test every setting and confirm that scaling or locale
changes preserve logical traversal.

### Three.js HUD request

Use this skill for hierarchy, layout, focus, state, and verification. Route DOM/CSS or canvas
implementation to the appropriate web/Three.js skill. Do not create a second
`threejs-game-ui-designer` skill.

### Darkbone Archer Open Design mockup

Route the concept, preservation handoff, or takeover to the existing Open Design game UI
sequence. Use this generic contract only for cross-project UI/UX questions not owned by that
project workflow.

## Best practices

1. Start from real screens, states, player decisions, and supported devices.
2. Treat every mockup as incomplete until reconciled with runtime behavior.
3. Make focus, back, and device switching explicit state transitions.
4. Use constraints and content-aware layout, not one fixed composition.
5. Treat text scaling and localization as first-class layout states.
6. Keep gameplay truth, hidden data, and presentation state separated.
7. Provide redundant signals for critical information.
8. Test interaction, not only screenshots.
9. Route visual concepts and engine widgets to their established owners.

## References

- `references/interface-contract.md`: hierarchy, navigation, layout, localization, binding, and verification model.
- `references/contract-example.json`: complete validator-accepted contract.
- `references/source-notes.md`: upstream, engine, and accessibility evidence.
- `scripts/validate-game-ui.py`: read-only Python 3.9+ validator.
