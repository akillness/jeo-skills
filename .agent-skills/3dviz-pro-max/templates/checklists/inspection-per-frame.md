# Frame and interaction inspection

Inspect the rendered result, not only the source or build log. Use the available authorized browser;
automated capture is optional and must respect the user's exclusions. Apply
[visual review](visual-anti-slop.md) alongside the functional checks below.

## Views and states to inspect

- An overview at the actual delivery size, including the UI around it.
- A useful close-up of each important object family. Look for identity, structure, material and
  precision appropriate to that subject; no universal distance or feature count applies.
- A representative motion state when motion is expected, including contacts and attachments.
- Important control transitions and edge cases: zero, extrema, singular/discrete states, interrupted
  playback, visibility changes and reset where relevant.
- Error/loading and navigation behavior when the artifact owns those asynchronous states.

Inspect multiple views as needed to understand the geometry. Do not require every screenshot to
show sky, three depth layers, surface noise or a real-world scale prop. Source selection and omitted
parts should remain distinguishable from damage, missing tissue or a failed load.

## Checks

1. **Runtime errors:** inspect available console/page logs and visible error messages.
2. **Framing:** important geometry and labels remain readable; UI, near-plane clipping and unintended
   occluders do not conceal the subject. Deliberate section cuts should be recognizable as such.
3. **Depth and materials:** check z-fighting, transparency sorting, shadow consistency and whether
   reflection/highlight choices obscure shape. Review clipped geometry in the shadow pass too.
4. **Spatial relationships:** supported objects meet their supports, attached parts stay attached,
   and movement has the intended clearance. Floating abstract objects and exploded views are valid
   representations; a contact shadow alone does not prove physical support.
5. **Behavior:** the actual model state changes as promised. A solver result, source playback,
   authored illustration and decorative motion must not be conflated.
6. **Controls:** inspect visible and numerical feedback as appropriate. A control can correctly
   leave some pixels unchanged; verify its intended effect rather than requiring any pixel change.
7. **Reset and recovery:** check the declared reset semantics and whether playback, controls, camera
   and displayed errors return to a coherent state. Returning from another scene must not use stale state.
8. **Motion/accessibility:** reduced motion starts in a readable state; pause and completion can park
   the loop. Interaction must invalidate a parked view. Do not demand perpetual ambient animation.
9. **Factual correspondence:** compare the relevant source/equation/state against the rendered form,
   labels, units and direction of change. Numerical tests do not certify scene wiring or anatomy.
10. **Cost:** reuse geometry and materials where practical; avoid allocation-heavy frame loops and
    unnecessary redraws. Report performance measurements only if actually measured and authorized.

When automated capture is permitted:

```sh
python3 scripts/capture.py --dir dist --all-views --click "#control" --out captures
```

Add `--motion-check 2000 --expect-motion` only for an interval where motion is expected.
`--expect-usable` detects gross image failures, not artistic quality; diagnose the image and scene
intent before treating a numeric flag as a defect. A deliberate dark view is different from a failed load.

## When lighting is being changed

Read [lighting direction and scale](../../references/lighting-direction-and-scale.md). Compare key,
practicals and combined illumination at fixed exposure where applicable. Inspect an informative
receiver/occluder while changing direction; exercise output zero, a useful nonzero value and reset.
Readouts and slider steps must represent the actual light state, including preset values. On leaving
a lighting mode, check temporary material/light changes and the prior motion/camera preferences.
Use authorized visible inspection when headless capture is excluded; do not substitute build success
for these observations. These checks constrain correctness, not palettes or the number of lights.

## Refine and report

Fix the highest-impact observed problem and inspect again. If repeated edits do not improve the
result, reconsider representation, asset suitability, construction or composition. Do not stop useful
work after an arbitrary three passes, or churn indefinitely on a failing approach.

State what was inspected, what passed, and what remains uncertain. Use a validation report when the
project wants one; internal experiments can use concise conversational observations. Never invent
captures, hardware measurements or passing checks, and never describe a frame you did not open.
