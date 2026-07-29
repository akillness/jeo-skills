---
name: threejs-fundamentals
description: >
  Build and debug the Three.js scene foundation: renderer setup, cameras, scene graph,
  transforms, resize handling, color management, render loops, and resource disposal.
  Use when creating a Three.js scene, choosing a camera or renderer, fixing coordinate
  space or hierarchy bugs, or establishing a reliable WebGL canvas baseline. Triggers on:
  three.js scene, WebGLRenderer, PerspectiveCamera, OrthographicCamera, Object3D,
  scene graph, camera setup, resize canvas, render loop, coordinate system, transform.
allowed-tools: Bash Read Write Edit Glob Grep
license: MIT
metadata:
  tags: three.js, webgl, scene, camera, renderer, scene-graph, transforms, frontend
  version: "1.0"
  source: https://github.com/CloudAI-X/threejs-skills/tree/main/skills/threejs-fundamentals
---

# Three.js Fundamentals

Use this skill for the rendering foundation of a **general Three.js web experience**.
For a playable game's system, lifecycle, or release work, use `web-game-development`;
for a narrowly scoped rendering concern, route to the matching `threejs-*` skill.

## When to use this skill

- Set up or repair a scene, camera, renderer, canvas ownership, or animation loop
- Choose perspective versus orthographic projection or correct world/local transforms
- Make rendering responsive, color-managed, and safe on high-DPI displays
- Diagnose blank scenes, clipped content, wrong camera framing, or leaking GPU resources

## Instructions

### Step 1: Establish the project contract

1. Read the installed `three` version and existing renderer/canvas ownership before
   changing imports or initialization.
2. Keep one owner for the render loop and resize listener. Framework wrappers such as
   React Three Fiber own those lifecycle concerns; do not add a competing raw loop.
3. Confirm the render backend before using backend-specific APIs. This skill defaults to
   `WebGLRenderer`; verify WebGPU patterns against the installed Three.js revision.

### Step 2: Build the smallest visible scene

Use an explicit scene, camera, renderer, one lit mesh, and a render loop before layering
in loaders, shaders, or post-processing.

```js
import * as THREE from "three";

const width = window.innerWidth;
const height = window.innerHeight;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
camera.position.set(0, 1, 4);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(width, height);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;

const mesh = new THREE.Mesh(
  new THREE.BoxGeometry(),
  new THREE.MeshStandardMaterial({ color: 0x4f8cff }),
);
scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 2));
scene.add(mesh);

function render() {
  renderer.render(scene, camera);
  requestAnimationFrame(render);
}
render();
```

Use a `Group` to give a feature one transform root. Change `position`, `quaternion`, or
`scale` intentionally; local coordinates compose through parents, while world-space
queries require `updateWorldMatrix` when the scene has not rendered yet.

### Step 3: Handle resize and disposal explicitly

```js
function resize(width, height) {
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}

function disposeObject(root) {
  root.traverse((object) => {
    object.geometry?.dispose();
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of materials) material?.dispose();
  });
}
```

Dispose textures and render targets owned by the feature as well. Do not dispose shared
resources until every consumer is gone.

### Step 4: Verify observable rendering behavior

- Confirm a visible mesh and stable camera framing at the intended canvas size.
- Resize through narrow, wide, and high-DPI cases; the drawing buffer must not stretch.
- Check the browser console for WebGL warnings and inspect `renderer.info` only as a
  diagnostic, not as a test oracle.
- Run the repository's build, typecheck, and relevant visual/browser test when present.

## Decision guide

| Need | Use |
|---|---|
| Scene graph, camera, renderer, transforms, lifecycle | This skill |
| Custom vertices, instancing, or BufferGeometry | `threejs-geometry` |
| PBR properties or mesh surface appearance | `threejs-materials` |
| Lights, shadows, or image-based lighting | `threejs-lighting` |
| Maps, UVs, HDR backgrounds, or render targets | `threejs-textures` |
| Model/asset loading and progress | `threejs-loaders` |
| AnimationMixer, clips, bones, or morphs | `threejs-animation` |
| Raycasting, controls, picking, or input | `threejs-interaction` |
| GLSL or material shader extension | `threejs-shaders` |
| EffectComposer screen-space passes | `threejs-postprocessing` |

## Examples

### Perspective product view

Use a `PerspectiveCamera` for a physically familiar object view. Set a deliberately
small near plane only when needed; an unnecessarily tiny `near` value wastes depth
precision and causes z-fighting.

### Isometric-like board view

Use an `OrthographicCamera` when scale must remain constant across depth. Recalculate
left/right/top/bottom from aspect ratio on resize, then call `updateProjectionMatrix()`.

## Best practices

1. Keep one `requestAnimationFrame` owner per canvas.
2. Clamp pixel ratio; unbounded device pixel ratio is a silent GPU-cost multiplier.
3. Use `MeshStandardMaterial` plus intentional lighting for normal PBR work instead of
   compensating for an unlit scene with arbitrary color values.
4. Keep camera clipping planes as tight as the scene permits.
5. Pair every feature-owned GPU allocation with a teardown path.

## References

- [Three.js Fundamentals source coverage](https://github.com/CloudAI-X/threejs-skills/tree/main/skills/threejs-fundamentals)
- [Three.js documentation](https://threejs.org/docs/)
- [Three.js manual: creating a scene](https://threejs.org/manual/#en/creating-a-scene)
