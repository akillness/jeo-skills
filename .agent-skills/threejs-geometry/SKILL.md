---
name: threejs-geometry
description: >
  Build and optimize Three.js geometry with built-in primitives, BufferGeometry,
  BufferAttributes, indexed meshes, custom vertex data, lines and points, and instanced
  rendering. Use when creating meshes, editing vertices or UVs, generating shapes,
  reducing draw calls, or diagnosing geometry memory and culling behavior. Triggers on:
  Three.js geometry, BufferGeometry, BufferAttribute, vertices, indices, custom mesh,
  InstancedMesh, instancing, draw calls, line geometry, points, mesh optimization.
allowed-tools: Bash Read Write Edit Glob Grep
license: MIT
metadata:
  tags: three.js, geometry, buffergeometry, bufferattribute, instancing, meshes, webgl
  version: "1.0"
  source: https://github.com/CloudAI-X/threejs-skills/tree/main/skills/threejs-geometry
---

# Three.js Geometry

Use this skill for mesh shape and vertex-data work. Route surface appearance to
`threejs-materials`, image/UV asset handling to `threejs-textures`, and whole-scene setup
to `threejs-fundamentals`.

## When to use this skill

- Choose a built-in primitive, `BufferGeometry`, `ShapeGeometry`, or text geometry
- Generate positions, normals, colors, UVs, and indices for a custom mesh
- Update dynamic attributes safely or fix broken normals, winding, and culling
- Replace repeated identical meshes with `InstancedMesh` after measuring draw-call cost

## Instructions

### Step 1: Select the simplest geometry representation

1. Start with a built-in geometry when its topology matches the feature.
2. Use `BufferGeometry` for generated or imported vertex data; legacy `Geometry` is not a
   current Three.js path.
3. Choose indexed geometry when vertices are genuinely shared. Do not index seams that
   require different normals, UVs, or vertex colors.
4. Treat one mesh's geometry as immutable shared data unless the feature explicitly owns
   it; clone before per-instance mutation.

### Step 2: Build valid attribute buffers

```js
const geometry = new THREE.BufferGeometry();
geometry.setAttribute(
  "position",
  new THREE.Float32BufferAttribute([
    -1, -1, 0,
     1, -1, 0,
     0,  1, 0,
  ], 3),
);
geometry.setIndex([0, 1, 2]);
geometry.computeVertexNormals();
geometry.computeBoundingSphere();

const mesh = new THREE.Mesh(geometry, material);
```

Attribute item sizes must match their semantic: positions/normals are 3, UVs are 2, and
colors are usually 3. Set `attribute.needsUpdate = true` after modifying a GPU-uploaded
attribute. Recompute bounds whenever dynamic positions can move beyond prior bounds.

### Step 3: Apply performance tools only for measured bottlenecks

| Situation | Preferred approach |
|---|---|
| Many copies of one geometry/material | `InstancedMesh` |
| Per-instance color or transform | Instance attributes/matrices |
| Large static terrain or model | Indexed `BufferGeometry`, sensible culling |
| Thousands of tiny particles | `Points` with one geometry/material |
| Debug edges or a technical wireframe | `EdgesGeometry` / `WireframeGeometry` |
| Different topology or material | Separate mesh; do not force instancing |

```js
const instances = new THREE.InstancedMesh(geometry, material, count);
const matrix = new THREE.Matrix4();
for (let i = 0; i < count; i += 1) {
  matrix.makeTranslation(i * 2, 0, 0);
  instances.setMatrixAt(i, matrix);
}
instances.instanceMatrix.needsUpdate = true;
```

### Step 4: Manage ownership and teardown

Call `geometry.dispose()` when a feature-owned geometry has no consumers. Dispose
replacements after swapping them out; do not dispose a cached/shared geometry from an
asset loader until its last user is gone.

### Step 5: Verify shape and budget

- Inspect normals, UV seams, face winding, and bounding volumes with helpers/debug views.
- Check a representative low- and high-density input for holes, NaNs, or backface loss.
- Measure draw calls and GPU/CPU frame time before and after instancing.
- Test dynamic geometry updates through the feature's normal lifecycle and teardown.

## Examples

### Build a disposable procedural grid

Generate attributes from stable input values, validate array lengths before upload, then
store the geometry owner beside its cleanup function. Recreating a large geometry every
frame is almost always a bug; mutate a dynamic attribute only when measurements justify it.

### Center a loaded or generated mesh

Use `geometry.computeBoundingBox()` and derive an offset from its center, then update
bounds. Avoid guessing center from a single vertex or applying a mesh transform when the
asset's local origin is semantically important.

## Best practices

1. Keep coordinate-system and units conventions consistent with the scene.
2. Use typed arrays; do not build hot vertex buffers from object arrays per frame.
3. Recompute normals only when topology/positions require it, not on every render.
4. Update bounds after dynamic position changes so frustum culling stays correct.
5. Treat instancing as a draw-call optimization, not a cure for expensive shaders or
   over-detailed geometry.

## References

- [Three.js Geometry source coverage](https://github.com/CloudAI-X/threejs-skills/tree/main/skills/threejs-geometry)
- [BufferGeometry documentation](https://threejs.org/docs/#api/en/core/BufferGeometry)
- [InstancedMesh documentation](https://threejs.org/docs/#api/en/objects/InstancedMesh)
