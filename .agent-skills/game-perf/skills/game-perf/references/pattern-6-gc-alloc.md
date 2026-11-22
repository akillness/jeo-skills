# Pattern 6: Object Allocation in Hot Loops (GC Pressure)

## The Problem

게임 루프/렌더 루프 안에서 `new Vector3()`, `[...spread]`, `.map()`, `.filter()`,
`.concat()` 등으로 객체를 생성하면 V8 GC가 주기적으로 멈추며 프레임을 날립니다.

Creating objects inside `requestAnimationFrame`, `useFrame`, `update()`, `tick()`,
or `animate()` generates heap garbage that triggers V8's stop-the-world GC pauses.

## Why It Kills FPS

V8 garbage collection mechanics:

| Event | Trigger | Pause Duration | Frequency |
|-------|---------|----------------|-----------|
| Minor GC (Scavenge) | ~4MB young gen | 2-10ms | Every 1-90 seconds |
| Major GC (Mark-Sweep) | ~16MB old gen | 30-100ms | Every few minutes |

At 16.6ms per frame budget:
- A 5ms minor GC → 1 dropped frame
- A 30ms major GC → 2 dropped frames
- A 100ms major GC → 6 dropped frames

Allocation rates in common patterns:

| Code Pattern | Allocation/call | At 60fps |
|-------------|----------------|----------|
| `new THREE.Vector3()` | ~72 bytes | 4.2KB/s |
| `new THREE.Matrix4()` | ~256 bytes | 15KB/s |
| `array.map(fn)` (100 items) | ~800 bytes + result | 47KB/s |
| `array.filter(fn)` (100 items) | ~400 bytes avg | 23KB/s |
| `[...spread]` (100 items) | ~800 bytes | 47KB/s |
| `JSON.parse(JSON.stringify(obj))` | ~2-10KB | 120-600KB/s |

**Combined**: A typical unoptimized game loop allocating 5-10 objects/frame
generates ~50-200KB/s → minor GC every 20-80 seconds.

## Real-World Example: Three.js Animation Loop

```typescript
// BEFORE — allocates every frame
function animate() {
  requestAnimationFrame(animate);

  // 72 bytes — new Vector3
  const direction = new THREE.Vector3(0, 0, -1);
  direction.applyQuaternion(camera.quaternion);

  // 256 bytes — new Matrix4
  const viewMatrix = new THREE.Matrix4();
  viewMatrix.copy(camera.matrixWorldInverse);

  // 72 bytes — new Vector3
  const worldPos = new THREE.Vector3();
  mesh.getWorldPosition(worldPos);

  // ~800 bytes — new array from filter
  const visible = entities.filter(e => e.isVisible);
  visible.forEach(e => e.update());

  renderer.render(scene, camera);
}
// Total: ~1200 bytes/frame = 72KB/s → minor GC every ~55 seconds
```

```typescript
// AFTER — zero allocation in hot loop
const _direction = new THREE.Vector3();
const _viewMatrix = new THREE.Matrix4();
const _worldPos = new THREE.Vector3();

function animate() {
  requestAnimationFrame(animate);

  _direction.set(0, 0, -1).applyQuaternion(camera.quaternion);
  _viewMatrix.copy(camera.matrixWorldInverse);
  mesh.getWorldPosition(_worldPos);

  for (let i = 0; i < entities.length; i++) {
    if (entities[i].isVisible) entities[i].update();
  }

  renderer.render(scene, camera);
}
// Total: 0 bytes/frame — no GC pressure
```

## Framework-Specific Variants

### React Three Fiber (useFrame)
```typescript
// BAD — allocates in useFrame (runs every frame)
useFrame(() => {
  const pos = new THREE.Vector3(targetX, targetY, targetZ);
  meshRef.current.position.lerp(pos, 0.1);

  const color = new THREE.Color(r, g, b);
  meshRef.current.material.color.copy(color);
});

// GOOD — pre-allocate with useMemo
const _pos = useMemo(() => new THREE.Vector3(), []);
const _color = useMemo(() => new THREE.Color(), []);

useFrame(() => {
  meshRef.current.position.lerp(_pos.set(targetX, targetY, targetZ), 0.1);
  meshRef.current.material.color.copy(_color.setRGB(r, g, b));
});
```

### PixiJS Ticker
```typescript
// BAD
app.ticker.add(() => {
  const bounds = sprite.getBounds(); // creates new Rectangle
  const center = new PIXI.Point(bounds.x + bounds.width / 2, ...);
});

// GOOD
const _bounds = new PIXI.Rectangle();
const _center = new PIXI.Point();

app.ticker.add(() => {
  sprite.getBounds(false, _bounds); // reuse existing Rectangle
  _center.set(_bounds.x + _bounds.width / 2, _bounds.y + _bounds.height / 2);
});
```

### Canvas 2D Game Loop
```typescript
// BAD — creates arrays every frame
function update() {
  const activeBullets = bullets.filter(b => b.active);
  const sortedByY = activeBullets.sort((a, b) => a.y - b.y);
  const collisions = activeBullets.map(b => checkCollision(b));
}

// GOOD — mutate in-place, use index-based iteration
function update() {
  let activeCount = 0;
  for (let i = 0; i < bullets.length; i++) {
    if (!bullets[i].active) continue;
    activeCount++;
    // sort not needed if drawing order doesn't matter
    checkCollisionInPlace(bullets[i]);
  }
}
```

### Common Array Allocation Traps
```typescript
// BAD — each creates a new array
const combined = [...arrayA, ...arrayB];   // spread
const filtered = items.filter(predicate);   // filter
const mapped = items.map(transform);        // map
const sliced = items.slice(0, 10);          // slice
const concatenated = a.concat(b);           // concat

// GOOD — pre-allocated buffer or for-loop
// For combining: pre-allocated typed array
const buffer = new Float32Array(maxSize * 3);
let offset = 0;
for (let i = 0; i < items.length; i++) {
  buffer[offset++] = items[i].x;
  buffer[offset++] = items[i].y;
  buffer[offset++] = items[i].z;
}
```

## Detection Nuances

### True Positives
- `new THREE.Vector3()` inside `requestAnimationFrame` callback
- `entities.filter(e => ...)` inside `update()` or `tick()` function
- `[...array]` inside `useFrame()` (React Three Fiber)
- `JSON.parse(JSON.stringify(state))` inside game loop for deep clone

### False Positives
- `new THREE.Vector3()` at module level (pre-allocated, runs once)
- `.map()` in `useEffect([], ...)` (one-time setup)
- `new Float32Array(size)` for WebGL buffer initialization (necessary)
- Array methods in event handlers that fire on user action (not per-frame)

## Diagnostic: Chrome DevTools Memory Panel

1. Open DevTools → Memory → Allocation Timeline
2. Record during gameplay
3. Look for sawtooth pattern (rapid allocation + GC drops)
4. Each drop = GC pause = potential frame drop
5. Click on allocation peaks to see what objects are being created
