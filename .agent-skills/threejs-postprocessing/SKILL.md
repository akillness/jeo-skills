---
name: threejs-postprocessing
description: >
  Build and optimize Three.js post-processing with EffectComposer, RenderPass, bloom,
  anti-aliasing, SSAO, depth of field, outlines, color correction, custom ShaderPasses,
  render targets, resize handling, and frame-budget controls. Use when adding or fixing
  screen-space effects, composer pass order, render target sizing, or visual-effect cost.
  Triggers on: Three.js postprocessing, EffectComposer, RenderPass, UnrealBloomPass,
  FXAA, SMAA, SSAO, depth of field, bloom, ShaderPass, render target, screen-space effect.
allowed-tools: Bash Read Write Edit Glob Grep
license: MIT
metadata:
  tags: three.js, postprocessing, effectcomposer, bloom, antialiasing, render-target, webgl
  version: "1.0"
  source: https://github.com/CloudAI-X/threejs-skills/tree/main/skills/threejs-postprocessing
---

# Three.js Post-Processing

Use this skill for an intentional screen-space pipeline. Route scene/camera setup to
`threejs-fundamentals`, mesh/material shader work to `threejs-shaders`, and texture/render
target semantics to `threejs-textures`.

## When to use this skill

- Add bloom, anti-aliasing, ambient occlusion, depth of field, outlines, or color grading
- Configure `EffectComposer` and resolve pass ordering or double-rendering bugs
- Write a custom full-screen `ShaderPass` or manage offscreen render targets
- Fix blur, incorrect resolution, missing effects, overly expensive passes, or teardown leaks

## Instructions

### Step 1: Establish the baseline renderer first

1. Make the unprocessed `renderer.render(scene, camera)` view correct before adding passes.
2. Decide whether the effect is a material/scene concern or genuinely screen-space. Do not
   use a full-screen pass to compensate for a wrong light, texture color space, or material.
3. Keep composer ownership with the canvas/render-loop owner; use either renderer render
   or composer render per frame, not both for the same final output.

### Step 2: Build a minimal ordered composer

```js
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(width, height), 0.6, 0.4, 0.85));

function render() {
  composer.render();
  requestAnimationFrame(render);
}
render();
```

Pass order is behavior. Document why each pass precedes/follows the next, especially when
mixing depth-dependent, selection, antialiasing, or color-correction passes.

### Step 3: Handle resolution and color deliberately

```js
function resize(width, height) {
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
  composer.setSize(width, height);
}
```

Match composer resolution to the renderer's configured drawing-buffer strategy. Effects
that sample pixel offsets or depth must receive current size uniforms. Avoid applying
legacy gamma/color correction passes without checking the renderer's current color-output
configuration.

### Step 4: Treat each pass as a budgeted feature

| Need | First choice |
|---|---|
| Normal scene output | `RenderPass` only |
| Bright emissive glow | Bloom after measuring at target resolution |
| Alias smoothing | Built-in MSAA where available, then an appropriate AA pass |
| Object outline | Outline pass or focused custom pass |
| Custom screen-space math | `ShaderPass` with explicit uniforms |
| Strong DOF/SSAO/glitch | Optional quality tier with fallback/off switch |

Use lower-resolution buffers, quality tiers, or selective effects only after validating the
visual contract. Do not stack passes as a substitute for art direction.

### Step 5: Verify effects and cleanup

- Test resize, pixel ratio, dynamic camera movement, and route changes/unmounts.
- Test low- and high-quality settings on target hardware and record frame-time impact.
- Check pass order with each effect toggled independently.
- Dispose composer-owned render targets/passes according to the installed API and feature
  lifecycle; do not leave offscreen GPU buffers after the scene is gone.

## Examples

### Selective bloom

Keep selection/layer rendering explicit and verify the normal scene does not become darker
or duplicate objects. Selective bloom is a multi-render pipeline, not a bloom threshold
flag alone.

### Custom vignette

Use a `ShaderPass` only after confirming a CSS/canvas overlay cannot meet the requirement.
Declare time, resolution, and texture uniforms explicitly and update them through one owner.

## Best practices

1. Start from the plain render path and add one pass at a time.
2. Keep composer and renderer dimensions in sync on every resize.
3. Treat pass order and color pipeline as part of the feature contract.
4. Gate expensive effects behind device-appropriate quality controls.
5. Measure GPU frame time before shipping a visual stack.

## References

- [Three.js Post-Processing source coverage](https://github.com/CloudAI-X/threejs-skills/tree/main/skills/threejs-postprocessing)
- [Three.js manual: post-processing](https://threejs.org/manual/#en/post-processing)
- [EffectComposer documentation](https://threejs.org/docs/#examples/en/postprocessing/EffectComposer)
