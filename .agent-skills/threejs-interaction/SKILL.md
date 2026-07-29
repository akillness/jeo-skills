---
name: threejs-interaction
description: >
  Implement and debug Three.js interaction with Raycaster, pointer and touch coordinate
  conversion, hover/selection state, camera controls, dragging, keyboard input, and
  world-to-screen projection. Use when picking objects, adding OrbitControls or
  PointerLockControls, handling mouse/touch input, or fixing interactive 3D behavior.
  Triggers on: Three.js interaction, Raycaster, raycast, picking, click mesh, hover,
  object selection, OrbitControls, drag controls, pointer events, touch controls.
allowed-tools: Bash Read Write Edit Glob Grep
license: MIT
metadata:
  tags: three.js, interaction, raycaster, picking, controls, pointer-events, touch, webgl
  version: "1.0"
  source: https://github.com/CloudAI-X/threejs-skills/tree/main/skills/threejs-interaction
---

# Three.js Interaction

Use this skill for direct 3D input, object picking, camera manipulation, and selection
state. Route semantic HTML controls, keyboard accessibility, and focus management to
`web-accessibility`; route game-input architecture to `web-game-development`.

## When to use this skill

- Raycast a pointer/touch against selectable scene objects
- Add or repair camera controls, object dragging, transform handles, or pointer lock
- Convert coordinates between client, normalized device, world, and screen space
- Fix missed clicks, stale hover state, pointer capture issues, or excessive raycasting

## Instructions

### Step 1: Define the interaction boundary

1. Identify the canvas element and its `getBoundingClientRect()`; never normalize pointer
   coordinates against the full window when the canvas is offset or resized.
2. Define an explicit pickable collection or layer. Raycasting `scene.children` without
   a boundary produces accidental targets and grows costly with scene size.
3. Separate input events from visual state changes so a hover/selection can be tested and
   cleared independently.

### Step 2: Raycast from the actual canvas

```js
const pointer = new THREE.Vector2();
const raycaster = new THREE.Raycaster();

function pick(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);
  return raycaster.intersectObjects(pickables, true)[0] ?? null;
}
```

Resolve a nested hit to its semantic selectable root, rather than making every child mesh
a separate product-level target. Guard zero-sized canvases and ignore events outside the
canvas bounds.

### Step 3: Choose controls and input behavior deliberately

| Requirement | Appropriate tool |
|---|---|
| Orbit around a target | `OrbitControls` |
| First-person browser view | `PointerLockControls` |
| Map/pan constraints | `MapControls` |
| Manipulate an object's transform | `TransformControls` |
| Drag known objects | `DragControls` or explicit ray-plane logic |
| Accessible command/UI action | DOM controls plus `web-accessibility` |

Import controls from the installed Three.js add-ons path and dispose them when the
canvas/scene unmounts. Do not update controls in more than one render loop.

### Step 4: Throttle work and clean state

Raycast on pointer movement only when the interaction requires hover. For large scenes,
use layers, bounds, broad-phase filtering, or a target list before considering more
complex acceleration structures. Clear hover state on `pointerleave`, lost capture,
object removal, and scene teardown.

### Step 5: Verify input behavior

- Test mouse, touch, keyboard-mediated alternatives, and a resized/offset canvas.
- Test empty-space clicks, nested meshes, occluded objects, and rapid enter/leave events.
- Confirm controls release listeners and pointer lock/drag state on teardown.
- Verify focus-visible DOM affordances for every action that must work without a pointer.

## Examples

### Hover without material corruption

Keep each selectable's baseline visual state in a map. On hover change, restore the old
selection before applying the next highlight. Avoid mutating a shared material color when
only one mesh should appear highlighted; clone or use a supported per-object signal.

### Place an object on a ground plane

Build a `THREE.Plane`, cast a ray from the pointer, and use `ray.intersectPlane`. This is
more predictable than guessing a depth from screen coordinates and works with any camera.

## Best practices

1. Normalize against the canvas rectangle, not `window.innerWidth` and `innerHeight`.
2. Keep semantic pick targets explicit and resolve child intersections to a root object.
3. Use pointer events and pointer capture for drag interactions rather than separate mouse
   and touch implementations.
4. Dispose controls and remove custom listeners with the scene lifecycle.
5. Do not make raycasting the only way to activate a necessary product action.

## References

- [Three.js Interaction source coverage](https://github.com/CloudAI-X/threejs-skills/tree/main/skills/threejs-interaction)
- [Raycaster documentation](https://threejs.org/docs/#api/en/core/Raycaster)
- [Three.js manual: picking](https://threejs.org/manual/#en/picking)
