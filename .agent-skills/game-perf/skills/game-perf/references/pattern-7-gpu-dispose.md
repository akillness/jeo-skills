# Pattern 7: Missing GPU Resource Disposal (Three.js Memory Leak)

## The Problem

Three.js에서 `scene.remove(mesh)`만 호출하고 `.dispose()`를 하지 않으면
GPU 메모리(VRAM)가 영구적으로 누수됩니다. JavaScript GC는 GPU 리소스를 수거하지 않습니다.

Three.js does NOT garbage-collect GPU resources. Removing an object from the
scene graph without calling `.dispose()` on its geometry, materials, and textures
permanently leaks VRAM.

## Why It Kills FPS

GPU memory (VRAM) is finite and not garbage-collected:

| Resource | VRAM Cost | What Leaks |
|----------|-----------|------------|
| 512x512 RGBA texture | 1MB | Pixel data on GPU |
| 1024x1024 RGBA texture | 4MB | Pixel data on GPU |
| 2048x2048 RGBA texture | 16MB | Pixel data on GPU |
| 4096x4096 RGBA texture | 64MB | Pixel data on GPU |
| 100K vertex geometry | ~2.4MB | Position + normal + UV buffers |
| Compiled shader program | ~0.1-1MB | Compiled GPU code |

What happens when VRAM fills up:
1. **Texture swapping**: GPU swaps textures from system RAM → 5-50ms per swap
2. **Frame stutter**: Random 50-100ms hitches during rendering
3. **Mobile crash**: iOS/Android kill the tab when VRAM exceeds ~256MB-1GB
4. **Shader recompilation**: Evicted shader programs must be recompiled → 100-500ms stall

## Real-World Example: Scene Transitions

```typescript
// BEFORE — VRAM leak on every scene change
function loadNewScene(url: string) {
  // Remove old scene objects
  while (scene.children.length > 0) {
    scene.remove(scene.children[0]); // GPU resources NOT freed!
  }

  // Load new scene
  const loader = new THREE.GLTFLoader();
  loader.load(url, (gltf) => {
    scene.add(gltf.scene);
  });
}
// After 5 scene changes with 4K textures: 5 * 64MB = 320MB VRAM leaked
```

```typescript
// AFTER — proper GPU resource cleanup
function disposeObject(obj: THREE.Object3D) {
  obj.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry?.dispose();

      const materials = Array.isArray(child.material)
        ? child.material : [child.material];

      materials.forEach(mat => {
        // Dispose all texture maps
        if (mat.map) mat.map.dispose();
        if (mat.normalMap) mat.normalMap.dispose();
        if (mat.roughnessMap) mat.roughnessMap.dispose();
        if (mat.metalnessMap) mat.metalnessMap.dispose();
        if (mat.aoMap) mat.aoMap.dispose();
        if (mat.emissiveMap) mat.emissiveMap.dispose();
        if (mat.envMap) mat.envMap.dispose();
        if (mat.lightMap) mat.lightMap.dispose();
        if (mat.bumpMap) mat.bumpMap.dispose();
        if (mat.alphaMap) mat.alphaMap.dispose();
        if (mat.displacementMap) mat.displacementMap.dispose();
        mat.dispose();
      });
    }
  });
}

function loadNewScene(url: string) {
  // Properly dispose old scene
  while (scene.children.length > 0) {
    const child = scene.children[0];
    disposeObject(child);
    scene.remove(child);
  }

  const loader = new THREE.GLTFLoader();
  loader.load(url, (gltf) => {
    scene.add(gltf.scene);
  });
}
```

## Framework-Specific Variants

### React Three Fiber (useEffect cleanup)
```typescript
// BAD — no cleanup on unmount
function DynamicModel({ url }) {
  const gltf = useGLTF(url);
  return <primitive object={gltf.scene} />;
}
// When component unmounts, GPU resources are NOT freed

// GOOD — dispose on unmount
function DynamicModel({ url }) {
  const gltf = useGLTF(url);

  useEffect(() => {
    return () => {
      gltf.scene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry?.dispose();
          if (child.material) {
            const mats = Array.isArray(child.material)
              ? child.material : [child.material];
            mats.forEach(m => m.dispose());
          }
        }
      });
    };
  }, [gltf]);

  return <primitive object={gltf.scene} />;
}
```

### GLTF Loader with ImageBitmap
```typescript
// GLTF textures may use ImageBitmap (not Image)
// ImageBitmap has a .close() method that MUST be called
function disposeGLTFTexture(texture: THREE.Texture) {
  if (texture.source?.data instanceof ImageBitmap) {
    texture.source.data.close(); // Release ImageBitmap
  }
  texture.dispose();
}
```

### Inline Geometry/Material (Hard to Track)
```typescript
// BAD — inline creation makes disposal tracking impossible
scene.add(new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),    // who holds reference?
  new THREE.MeshStandardMaterial()    // who will dispose this?
));

// GOOD — named references for disposal tracking
const geometry = new THREE.BoxGeometry(1, 1, 1);
const material = new THREE.MeshStandardMaterial();
const mesh = new THREE.Mesh(geometry, material);
scene.add(mesh);

// Later:
geometry.dispose();
material.dispose();
scene.remove(mesh);
```

### Render Targets / Framebuffers
```typescript
// Render targets also leak VRAM
const renderTarget = new THREE.WebGLRenderTarget(1024, 1024);
// ...
renderTarget.dispose(); // Must dispose when no longer needed
renderTarget.texture.dispose(); // Texture too!
```

## Detection Heuristics

### Primary Detection
1. Find all `scene.remove(`, `.removeFromParent()` calls
2. Read 15 lines before and after
3. Check if `.dispose()` appears for geometry AND material
4. If neither: flag as CRITICAL

### Secondary Detection
1. Find `new THREE.*Geometry(` and `new THREE.*Material(` inline in function arguments
2. If they're passed directly to `new THREE.Mesh(...)` without a variable: flag as WARNING
3. These are hard to dispose later since no reference is kept

### Monitoring Detection
```typescript
// If this appears, the developer is already monitoring — INFO only
renderer.info.memory.geometries
renderer.info.memory.textures
renderer.info.render.calls
```

## Diagnostic: Monitor VRAM Usage

```typescript
// Add to your render loop or dev tools
function logGPUMemory() {
  const info = renderer.info;
  console.log(`Geometries: ${info.memory.geometries}`);
  console.log(`Textures: ${info.memory.textures}`);
  console.log(`Draw calls: ${info.render.calls}`);
  console.log(`Triangles: ${info.render.triangles}`);
}

// These numbers should stay constant during normal operation.
// If they grow monotonically → you have a leak.
```

## Quick Fix Checklist

1. Create a `disposeObject(obj)` utility function
2. Call it before every `scene.remove()` / `.removeFromParent()`
3. In React Three Fiber: add `useEffect` cleanup that disposes
4. For GLTF: also call `imageBitmap.close()`
5. For render targets: dispose both target and target.texture
6. Monitor `renderer.info.memory` in dev mode
