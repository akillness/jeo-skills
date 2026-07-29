---
name: threejs-shaders
description: >
  Create and debug Three.js shaders with ShaderMaterial, RawShaderMaterial, uniforms,
  varyings, GLSL vertex and fragment programs, texture sampling, procedural effects,
  onBeforeCompile extensions, shader chunks, instancing, and GPU performance checks.
  Use when writing custom GLSL, extending a built-in material, animating shader uniforms,
  or diagnosing shader compile, coordinate-space, and rendering issues. Triggers on:
  Three.js shader, ShaderMaterial, RawShaderMaterial, GLSL, uniforms, varyings,
  onBeforeCompile, fragment shader, vertex shader, fresnel, displacement, shader chunk.
allowed-tools: Bash Read Write Edit Glob Grep
license: MIT
metadata:
  tags: three.js, shaders, glsl, shadermaterial, rawshadermaterial, uniforms, webgl
  version: "1.0"
  source: https://github.com/CloudAI-X/threejs-skills/tree/main/skills/threejs-shaders
---

# Three.js Shaders

Use this skill for custom GPU programs and safe built-in material extension. Route PBR
surface selection to `threejs-materials`, textures/UV data to `threejs-textures`, and
full-screen composer effects to `threejs-postprocessing`.

## When to use this skill

- Write a `ShaderMaterial` or `RawShaderMaterial` vertex/fragment program
- Pass time, colors, textures, transforms, or per-instance data through uniforms/varyings
- Implement displacement, fresnel, dissolve, gradients, noise, rim lighting, or custom effects
- Extend a built-in material with `onBeforeCompile` without replacing its PBR behavior
- Diagnose GLSL compilation, coordinate-space, precision, or GPU-cost failures

## Instructions

### Step 1: Choose the least invasive shader path

| Need | Preferred path |
|---|---|
| Full custom mesh rendering | `ShaderMaterial` |
| Full control of declarations/Three.js injection | `RawShaderMaterial` |
| Keep Standard/Physical PBR and add a small effect | `onBeforeCompile` |
| Full-screen screen-space treatment | `ShaderPass` via `threejs-postprocessing` |

Start from a built-in material when it already owns the lighting/PBR behavior you need.
Use a custom material only when the visual model truly differs.

### Step 2: Make data flow explicit

```js
const material = new THREE.ShaderMaterial({
  uniforms: {
    uTime: { value: 0 },
    uColor: { value: new THREE.Color("#4f8cff") },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 uColor;
    varying vec2 vUv;
    void main() {
      gl_FragColor = vec4(uColor * vec3(vUv.y), 1.0);
    }
  `,
});
```

A uniform is constant for a draw call; a varying is written by the vertex shader and
interpolated into the fragment shader. Name coordinate spaces (`local`, `world`, `view`,
`clip`, `uv`) in variables and comments. Most shader bugs are an implicit space mismatch.

### Step 3: Update only the intended uniform values

```js
material.uniforms.uTime.value = elapsedSeconds;
```

Mutate `.value`; do not replace the uniforms object every frame. Reuse `Color`, `Vector`,
and texture objects where possible. For instanced variation, use supported attributes rather
than creating one material per instance.

### Step 4: Extend built-in materials cautiously

`onBeforeCompile` depends on internal shader chunks and can change across Three.js
revisions. Keep replacements narrow, set `material.customProgramCacheKey()` when program
variants depend on application state, and test against the locked project version. Do not
use source-string replacement as a permanent abstraction without a versioned test surface.

### Step 5: Verify compile, visual, and performance behavior

- Check browser shader compile logs and reduce to a minimal shader before debugging details.
- Validate at least one known coordinate/normal/UV case with a diagnostic color output.
- Test precision and derivatives on target mobile hardware if supported by the product.
- Measure fragment overdraw, texture samples, loops, and material variants before shipping.
- Dispose feature-owned custom materials and render targets at teardown.

## Examples

### Fresnel rim signal

Compute/view a normalized normal and view direction in the same space, then derive the rim
term from their dot product. Test front-facing and grazing angles; a negative/incorrect
space conversion often makes a fresnel effect appear inverted or fixed to the camera.

### Vertex displacement

Displace in object/local space and pass the deformed position/normal logic through a
consistent lighting model. High-frequency displacement needs enough geometry density; a
shader cannot create silhouette detail that the mesh does not contain.

## Best practices

1. Start with the smallest shader that renders a constant color, then add data flow.
2. State coordinate spaces and normalize only where mathematically required.
3. Keep uniform updates allocation-free in the render loop.
4. Prefer a built-in material extension over reimplementing PBR lighting.
5. Profile on target GPUs; a visually small fragment effect can dominate frame time.

## References

- [Three.js Shaders source coverage](https://github.com/CloudAI-X/threejs-skills/tree/main/skills/threejs-shaders)
- [ShaderMaterial documentation](https://threejs.org/docs/#api/en/materials/ShaderMaterial)
- [Three.js manual: custom shaders](https://threejs.org/manual/#en/shader)
