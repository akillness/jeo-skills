# Fourier Sculpture

A phasor-chain and trace showing finite odd-harmonic synthesis of a square wave.

From `examples/`, run `pnpm install` once, then `pnpm dev` and open `/fourier/`. Use `pnpm build` for all examples.

## Generation prompt

> Use 3dviz-pro-max to build a Fourier-series phasor sculpture for a square-wave approximation. Let me select 1–15 odd harmonics, scrub phase, and play or pause; keep phasor endpoint, trace, formula, and readouts on one state; and show finite-sum ringing rather than hiding it.

## Explore and implementation

Use Overview and Detail, change the number of terms, scrub phase, and play/pause synthesis. See [scene.js](scene.js), the [shared scene](../shared/art-science/scenes/fourier.js), and [math helpers](../shared/art-science/scenes/math-models.js).

## Source and limits

The series follows [MIT ES.1803, §§21–22](https://ocw.mit.edu/courses/es-1803-differential-equations-spring-2024/mites_1803_s24_topic_full.pdf). Each phasor has amplitude `4/[π(2k+1)]` and angular frequency `2k+1`. The trace covers one past period; circle depth is a presentation choice.

## Skill rules actually applied

The artifact corresponds to `recipe.fourier-harmonic-synthesis` in [calculus and fields](../../skills/3dviz-pro-max/references/catalog-directions/calculus-fields.md), with synchronized state and pause behavior from [motion and state](../../skills/3dviz-pro-max/references/motion-and-state.md). Mapping is retrospective, not original retrieval evidence.
