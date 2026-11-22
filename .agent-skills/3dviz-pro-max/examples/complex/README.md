# Complex Observatory

A Riemann-sphere study comparing `z` and `1/z` through stereographic projection.

From `examples/`, run `pnpm install` once, then `pnpm dev` and open `/complex/`. Use `pnpm build` for all examples.

## Generation prompt

> Use 3dviz-pro-max to visualize stereographic projection on the Riemann sphere and compare a complex number z with its reciprocal. Let me control real and imaginary parts, send z exactly to zero, and trace an ellipse; keep sphere points and numeric readouts exact when far plane markers leave the display frame.

## Explore and implementation

Use Overview and Detail. Adjust the real and imaginary parts, send `z` to zero, or play/pause the ellipse. See [scene.js](scene.js) and the [shared scene](../shared/art-science/scenes/complex.js).

## Source and limits

The mapping follows [MIT 18.04, §4.4](https://math.mit.edu/~dunkel/Teach/18.04_2019S/notes/1804_Main.pdf): `z=(X+iY)/(1−Z)`. Zero maps to infinity under reciprocal inversion. Frame clipping hides only far plane markers, not the exact state or readout.

## Skill rules actually applied

The scene uses boundary-state handling from [motion and state](../../skills/3dviz-pro-max/references/motion-and-state.md) and claim/model/visual tracing from [research and truth](../../skills/3dviz-pro-max/references/research-and-truth.md). The mapping is retrospective; no historical dataset retrieval is claimed.
