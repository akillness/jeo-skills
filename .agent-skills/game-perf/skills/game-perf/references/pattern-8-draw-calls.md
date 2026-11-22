# Pattern 8: Unbatched Draw Calls

## The Problem

WebGL에서 오브젝트마다 개별적으로 `gl.bindTexture()` + `gl.drawArrays()`를
호출하면 CPU-GPU 통신 오버헤드가 프레임 예산을 초과합니다. Canvas 2D에서도
매 오브젝트마다 `ctx.save()`/`ctx.restore()` + `ctx.fillStyle` 변경이 같은 문제를 일으킵니다.

Each WebGL draw call costs 10-50 microseconds of CPU overhead. Per-object
state changes (texture bind, shader switch, buffer bind) between draw calls
force GPU pipeline flushes, multiplying the cost.

## Why It Kills FPS

CPU overhead per WebGL operation:

| Operation | CPU Cost | GPU Pipeline Effect |
|-----------|----------|-------------------|
| `gl.drawArrays` / `gl.drawElements` | 10-50us | Command submission |
| `gl.bindTexture` | 5-10us | Texture unit reconfigure |
| `gl.useProgram` | 20-50us | Shader program switch + revalidation |
| `gl.bindBuffer` | 2-5us | Buffer pointer update |
| `gl.bindFramebuffer` | 10-30us | Render target switch |
| `gl.uniform*` | 1-3us | Uniform upload |

At 1000 objects with individual textures:

```
1000 x bindTexture  = 5-10ms
1000 x drawArrays   = 10-50ms
1000 x bindBuffer   = 2-5ms
Total CPU overhead   = 17-65ms per frame
Frame budget         = 16.6ms
→ Impossible to hit 60fps even with 0ms GPU work!
```

**Rule of thumb**: Keep draw calls under 200 on desktop, under 50 on mobile.

## Real-World Example: Sprite Rendering

### WebGL Sprites (Unbatched)
```typescript
// BEFORE — 1 draw call per sprite (1000 sprites = 1000 draw calls)
function renderSprites(sprites: Sprite[]) {
  sprites.forEach(sprite => {
    gl.bindTexture(gl.TEXTURE_2D, sprite.texture);  // state change
    gl.bindBuffer(gl.ARRAY_BUFFER, sprite.buffer);   // state change

    // Upload per-sprite uniforms
    gl.uniform2f(uPosition, sprite.x, sprite.y);
    gl.uniform2f(uScale, sprite.w, sprite.h);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);  // 1 draw call
  });
}
// 1000 sprites → 1000 draw calls → ~30ms CPU
```

```typescript
// AFTER — texture atlas + instanced rendering (1 draw call total)
// Step 1: Pack all sprite textures into a single atlas
const atlas = createTextureAtlas(allSpriteTextures);
gl.bindTexture(gl.TEXTURE_2D, atlas.texture); // bind ONCE

// Step 2: Use instanced rendering
const instanceBuffer = new Float32Array(sprites.length * 4); // x, y, u, v
sprites.forEach((sprite, i) => {
  const offset = i * 4;
  instanceBuffer[offset] = sprite.x;
  instanceBuffer[offset + 1] = sprite.y;
  instanceBuffer[offset + 2] = atlas.getU(sprite.id);
  instanceBuffer[offset + 3] = atlas.getV(sprite.id);
});

gl.bindBuffer(gl.ARRAY_BUFFER, instanceVBO);
gl.bufferSubData(gl.ARRAY_BUFFER, 0, instanceBuffer);
gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, sprites.length); // 1 call!
// 1000 sprites → 1 draw call → ~0.05ms CPU
```

### Three.js (InstancedMesh)
```typescript
// BEFORE — 1000 individual meshes = 1000 draw calls
trees.forEach(tree => {
  const mesh = new THREE.Mesh(treeGeometry, treeMaterial);
  mesh.position.copy(tree.pos);
  mesh.rotation.y = tree.rotation;
  scene.add(mesh);
});
// renderer.info.render.calls = 1000+

// AFTER — InstancedMesh = 1 draw call
const instancedTrees = new THREE.InstancedMesh(
  treeGeometry, treeMaterial, trees.length
);
const _matrix = new THREE.Matrix4();
const _quaternion = new THREE.Quaternion();

trees.forEach((tree, i) => {
  _quaternion.setFromEuler(new THREE.Euler(0, tree.rotation, 0));
  _matrix.compose(tree.pos, _quaternion, new THREE.Vector3(1, 1, 1));
  instancedTrees.setMatrixAt(i, _matrix);
});
instancedTrees.instanceMatrix.needsUpdate = true;
scene.add(instancedTrees);
// renderer.info.render.calls = 1 (for all trees)
```

### Three.js (BatchedMesh — r160+)
```typescript
// For different geometries that share the same material
const batchedMesh = new THREE.BatchedMesh(
  maxMeshCount, maxVertexCount, maxIndexCount, material
);

const boxId = batchedMesh.addGeometry(boxGeometry);
const sphereId = batchedMesh.addGeometry(sphereGeometry);
const coneId = batchedMesh.addGeometry(coneGeometry);

// Add instances
objects.forEach(obj => {
  const geoId = obj.type === 'box' ? boxId
    : obj.type === 'sphere' ? sphereId : coneId;
  const instanceId = batchedMesh.addInstance(geoId);
  batchedMesh.setMatrixAt(instanceId, obj.matrix);
});
// Multiple different geometries, still 1 draw call
```

### Canvas 2D — State Change Minimization
```typescript
// BEFORE — state change per object
function render(objects: GameObject[]) {
  objects.forEach(obj => {
    ctx.save();                        // push state
    ctx.fillStyle = obj.color;         // state change
    ctx.globalAlpha = obj.alpha;       // state change
    ctx.translate(obj.x, obj.y);       // state change
    ctx.rotate(obj.rotation);          // state change
    ctx.fillRect(-obj.w/2, -obj.h/2, obj.w, obj.h);
    ctx.restore();                     // pop state
  });
}
// 1000 objects = 1000 save/restore pairs + 4000 state changes

// AFTER — sort by state, minimize changes
function render(objects: GameObject[]) {
  // Sort by color to minimize fillStyle changes
  objects.sort((a, b) => a.color.localeCompare(b.color));

  let currentColor = '';
  let currentAlpha = 1;

  objects.forEach(obj => {
    // Only change state when needed
    if (obj.color !== currentColor) {
      currentColor = obj.color;
      ctx.fillStyle = currentColor;
    }
    if (obj.alpha !== currentAlpha) {
      currentAlpha = obj.alpha;
      ctx.globalAlpha = currentAlpha;
    }

    // Use transform instead of save/restore
    ctx.setTransform(
      Math.cos(obj.rotation), Math.sin(obj.rotation),
      -Math.sin(obj.rotation), Math.cos(obj.rotation),
      obj.x, obj.y
    );
    ctx.fillRect(-obj.w/2, -obj.h/2, obj.w, obj.h);
  });

  ctx.setTransform(1, 0, 0, 1, 0, 0); // reset once at end
}
// Much fewer state changes, no save/restore overhead
```

### OffscreenCanvas for Heavy Rendering
```typescript
// BAD — heavy rendering on main thread
function renderParticles() {
  particles.forEach(p => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  });
}

// GOOD — offload to Web Worker with OffscreenCanvas
// main.js
const offscreen = canvas.transferControlToOffscreen();
const worker = new Worker('render-worker.js');
worker.postMessage({ canvas: offscreen }, [offscreen]);

// render-worker.js
self.onmessage = ({ data }) => {
  const ctx = data.canvas.getContext('2d');
  function renderLoop() {
    // Heavy rendering here — doesn't block main thread
    ctx.clearRect(0, 0, width, height);
    particles.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    });
    requestAnimationFrame(renderLoop);
  }
  renderLoop();
};
```

## Detection Nuances

### True Positives
- `gl.drawArrays`/`gl.drawElements` inside `for`/`forEach` loop with `gl.bindTexture` in same loop
- Individual `new THREE.Mesh()` calls in a loop adding to scene (instead of InstancedMesh)
- `ctx.save()`/`ctx.restore()` wrapping every single object draw
- `renderer.info.render.calls` > 200 logged or checked

### False Positives
- Post-processing passes (multi-pass rendering is expected: bloom, SSAO, etc.)
- Shadow map rendering (one pass per shadow-casting light is normal)
- Already using `InstancedMesh`, `BatchedMesh`, or `InstancedBufferGeometry`
- Canvas 2D with < 50 objects (overhead is negligible)

## Diagnostic: Measure Draw Calls

```typescript
// Three.js
console.log('Draw calls:', renderer.info.render.calls);
console.log('Triangles:', renderer.info.render.triangles);
renderer.info.reset(); // reset counters after reading

// WebGL (manual)
let drawCallCount = 0;
const origDrawArrays = gl.drawArrays.bind(gl);
gl.drawArrays = (...args) => { drawCallCount++; origDrawArrays(...args); };
// Check drawCallCount at end of frame
```
