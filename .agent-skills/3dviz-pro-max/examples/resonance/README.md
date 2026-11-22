# Membrane Modes

Analytical normal modes of a fixed circular membrane with visible nodal lines and slowed display motion.

From `examples/`, run `pnpm install` once, then `pnpm dev` and open `/resonance/`. Use `pnpm build` for all examples.

## Generation prompt

> Use 3dviz-pro-max to visualize analytical circular-membrane normal modes. Let me choose angular/radial order, tension, and playback scale; compute the natural frequency from the same state; mark zero-displacement nodes; and clarify that this is a free membrane mode rather than a driven resonance, stiff plate, or sand experiment.

## Explore and implementation

Use Overview and Detail. Choose a mode, vary tension and display time scale, and play/pause. See [scene.js](scene.js), the [shared scene](../shared/art-science/scenes/resonance.js), and [physics helpers](../shared/art-science/scenes/physics-models.js).

## Source and limits

The analytical form follows [UIUC Physics 406](https://courses.physics.illinois.edu/phys406/sp2017/Lecture_Notes/P406POM_Lecture_Notes/P406POM_Lect4_Part2.pdf). Radius is 1.45 m and areal density 0.32 kg/m². Displacement is enlarged and time slowed; no driver, response curve, plate stiffness, or sand motion is modeled.

## Skill rules actually applied

The scene follows [research and truth](../../skills/3dviz-pro-max/references/research-and-truth.md) and [motion and state](../../skills/3dviz-pro-max/references/motion-and-state.md): physical frequency remains separate from playback rate, and visual nodes derive from the analytical state. Mapping is retrospective.
