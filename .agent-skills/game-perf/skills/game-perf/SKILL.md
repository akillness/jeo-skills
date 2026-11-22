---
name: game-perf
description: |
  Detect and fix 10 common frame-drop patterns in game/interactive app code.
  Covers React/Zustand UI patterns AND game engine patterns (Three.js, WebGL,
  Canvas 2D, PixiJS, Phaser, ECS).
  Triggers: performance, frame drop, fps, jank, stutter, lag, optimization,
  game loop, render loop, requestAnimationFrame, animation performance,
  three.js, webgl, canvas, pixi, phaser, gc, draw call, dispose, pool, timestep
allowed-tools:
  - Grep
  - Glob
  - Read
  - Edit
  - Agent
argument-hint: "[path] [--fix]"
---

# Game Performance Frame-Drop Detector

You are a game performance specialist. You detect and fix the 10 most common
frame-drop patterns found in interactive applications — game engines, editors,
canvas apps, and real-time UIs built with React, Zustand, Redux, Fabric.js,
PixiJS, Three.js, Phaser, Canvas 2D, WebGL, etc.

**Patterns 1-5**: React/Zustand UI layer patterns
**Patterns 6-10**: Game engine / GPU / runtime patterns

## Arguments

Parse `$ARGUMENTS`:
- **path**: File or directory to scan (default: current working directory)
- **--fix**: If present, apply automatic fixes with user confirmation

## The 5 Patterns

### Pattern 1: O(n²) Lookup in Hot Loops — CRITICAL

**What**: `.find()`, `.findIndex()`, `.filter()`, `.indexOf()` called inside
`forEach`, `map`, `for`, `while`, or `reduce` — creating O(n²) complexity
in per-frame synchronization or game logic.

**Why it kills FPS**: With 1000 objects, a nested `.find()` runs ~1M comparisons
per frame. At 60fps that's 60M comparisons/sec. Each comparison costs ~0.01ms,
totaling ~10ms/frame — over half the 16.6ms budget.

**Grep patterns**:
```
forEach.*\n.*\.find\(
\.map\(.*\n.*\.find\(
for\s*\(.*\n.*\.find\(
\.forEach.*\.filter\(
\.map.*\.filter\(
\.reduce.*\.find\(
layers\.find\(
objects\.find\(
entities\.find\(
nodes\.find\(
```

**Detection logic**:
1. Search for `.find(`, `.findIndex(`, `.filter(`, `.indexOf(` calls
2. Check if they appear inside a loop construct (for/forEach/map/reduce/while)
3. Check if the outer scope is a frequently-called function (render, update, sync, tick, loop, animate, draw, onFrame)
4. **False positive exclusions**:
   - One-time setup functions (init, constructor, mount, useEffect with empty deps)
   - Event handlers that fire infrequently (onClick, onSubmit)
   - Arrays known to be small (< 10 items) from context

**Fix**: Convert to `Map` or object lookup built once, queried O(1).

```typescript
// Before — O(n²)
function syncObjects(objects: Obj[], state: State[]) {
  state.forEach(s => {
    const obj = objects.find(o => o.id === s.id); // O(n) per iteration
    if (obj) obj.position = s.position;
  });
}

// After — O(n)
function syncObjects(objects: Obj[], state: State[]) {
  const objectMap = new Map(objects.map(o => [o.id, o])); // O(n) once
  state.forEach(s => {
    const obj = objectMap.get(s.id); // O(1) per iteration
    if (obj) obj.position = s.position;
  });
}
```

---

### Pattern 2: Render-Loop Values in React State — CRITICAL

**What**: Values that change every frame (zoom, pan, mouse position, scroll,
camera position, time) stored in `useState` or subscribed from a store,
causing React re-renders on every frame.

**Why it kills FPS**: Each `setState` triggers React reconciliation — diffing
the virtual DOM, running effects, and updating the real DOM. At 60fps, that's
60 full React render cycles per second for a single value.

**Grep patterns**:
```
useState.*zoom
useState.*pan
useState.*mouse
useState.*scroll
useState.*position
useState.*offset
useState.*camera
useStore.*\.zoom
useStore.*\.pan
useStore.*\.mouse
useStore.*\.scroll
useStore.*\.position
useStore.*\.camera
useEditorStore.*\.zoom
useEditorStore.*\.pan
```

**Detection logic**:
1. Find `useState` or store subscriptions for high-frequency values
2. Check if the value is used in a render-loop context (RAF, animation, drag handler)
3. Check if the component renders canvas/SVG/WebGL overlays
4. **False positive exclusions**:
   - Values that only change on user action (click-to-zoom, not scroll-zoom)
   - Values wrapped in `useDeferredValue` or `useTransition`
   - Components already using `useRef` for the value

**Fix**: Move to `useRef` + direct DOM/canvas manipulation, or use store
`subscribe` for side effects without re-render.

```typescript
// Before — re-render every frame
function Overlay() {
  const zoom = useEditorStore(s => s.canvas.zoom); // re-render on every zoom change
  return <div style={{ transform: `scale(${zoom})` }}>...</div>;
}

// After — ref + subscribe
function Overlay() {
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    return useEditorStore.subscribe(
      s => s.canvas.zoom,
      zoom => {
        if (containerRef.current) {
          containerRef.current.style.transform = `scale(${zoom})`;
        }
      }
    );
  }, []);
  return <div ref={containerRef}>...</div>;
}
```

---

### Pattern 3: setState in Drag/Mouse Handlers — WARNING

**What**: Calling `setState`, `dispatch`, or `forceUpdate` inside
`onMouseMove`, `onDrag`, `onPointerMove`, `onTouchMove`, or
`requestAnimationFrame` handlers.

**Why it kills FPS**: Mouse/pointer events fire at 60-120Hz. Each `setState`
enqueues a React render. Without batching or throttling, the render queue
overwhelms the main thread, causing visible jank during drag operations.

**Grep patterns**:
```
onMouseMove.*setState
onPointerMove.*setState
onDrag.*setState
onTouchMove.*setState
handleDrag.*setState
handleMouseMove.*setState
mousemove.*setState
pointermove.*setState
onMouseMove.*dispatch
onPointerMove.*dispatch
onDrag.*dispatch
handleDrag.*forceUpdate
```

**Detection logic**:
1. Find setState/dispatch/forceUpdate calls inside mouse/pointer/drag handlers
2. Check if calls are NOT wrapped in `requestAnimationFrame` or throttle/debounce
3. Check if the update triggers a visual change (style, className, transform)
4. **False positive exclusions**:
   - Already wrapped in `requestAnimationFrame`
   - Using `unstable_batchedUpdates`
   - Debounced/throttled handlers
   - Simple boolean flags (isDragging)

**Fix**: Direct DOM manipulation during drag, commit to state on mouseup.

```typescript
// Before — setState on every mouse move
function DraggableItem({ id }) {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const onMouseMove = (e) => {
    setPos({ x: e.clientX, y: e.clientY }); // 60+ renders/sec
  };
  return <div style={{ left: pos.x, top: pos.y }} onMouseMove={onMouseMove} />;
}

// After — DOM manipulation during drag, state on end
function DraggableItem({ id }) {
  const ref = useRef<HTMLDivElement>(null);
  const posRef = useRef({ x: 0, y: 0 });

  const onMouseMove = (e) => {
    posRef.current = { x: e.clientX, y: e.clientY };
    if (ref.current) {
      ref.current.style.transform =
        `translate(${posRef.current.x}px, ${posRef.current.y}px)`;
    }
  };

  const onMouseUp = () => {
    // Commit final position to React state
    setPosition(posRef.current);
  };

  return <div ref={ref} onMouseMove={onMouseMove} onMouseUp={onMouseUp} />;
}
```

---

### Pattern 4: Selector Returning New Object/Array — CRITICAL

**What**: Zustand/Redux selectors that return `{ ... }` spread objects or
`[ ... ]` arrays, causing infinite re-renders because `Object.is()` always
returns `false` for new references.

**Why it kills FPS**: Zustand uses `Object.is()` for equality checks. A selector
like `s => ({ width: s.w, height: s.h })` creates a new object every check,
so Zustand always considers it "changed" — triggering an infinite render loop
that freezes the browser tab.

**Grep patterns**:
```
useStore\(.*=>\s*\(\{
useStore\(.*=>\s*\{[^}]*,[^}]*\}
useStore\(.*=>\s*\[
use\w+Store\(.*=>\s*\(\{
use\w+Store\(.*=>\s*\[
createSelector.*=>\s*\(\{
useSelector\(.*=>\s*\(\{
useSelector\(.*=>\s*\[
```

**Detection logic**:
1. Find store hook calls with inline selectors
2. Check if the selector arrow function returns an object literal `({...})` or array `[...]`
3. Check if `shallow` comparator is NOT being used as second argument
4. **False positive exclusions**:
   - Selectors using `shallow` from zustand: `useStore(s => ({...}), shallow)`
   - Selectors using custom equality functions
   - Selectors in `useMemo` or pre-defined outside component
   - Selectors returning a single primitive value

**Fix**: Split into individual primitive selectors, or use `shallow` comparator.

```typescript
// Before — INFINITE LOOP!
const canvasSize = useEditorStore(s => ({
  width: s.canvas.width,
  height: s.canvas.height,
}));

// After (Option A) — individual primitives
const canvasWidth = useEditorStore(s => s.canvas.width);
const canvasHeight = useEditorStore(s => s.canvas.height);

// After (Option B) — shallow comparator
import { shallow } from 'zustand/shallow';
const canvasSize = useEditorStore(
  s => ({ width: s.canvas.width, height: s.canvas.height }),
  shallow
);
```

---

### Pattern 5: Large List Without Virtualization — WARNING

**What**: Rendering 50+ items in a `.map()` loop without virtualization
(react-virtual, react-window, react-virtuoso, etc.), causing DOM bloat
and slow paint times.

**Why it kills FPS**: Each DOM node costs ~0.5KB memory and ~0.1ms paint time.
500 list items = 250KB DOM + ~50ms paint per frame. During scroll, the browser
must composite all 500 elements, far exceeding the 16.6ms budget.

**Grep patterns**:
```
\.map\(.*=>\s*[(<]
\.map\(.*return\s*[(<]
{items\.map
{layers\.map
{entities\.map
{objects\.map
{children\.map
{list\.map
{data\.map
{rows\.map
```

**Detection logic**:
1. Find `.map()` calls that return JSX (contains `<` or returns component)
2. Check if the source array could be large (name suggests collection: items, layers, entities, objects, list, data, rows, children)
3. Check if the file imports any virtualization library
4. Check the parent component for scroll-related props or styles
5. **False positive exclusions**:
   - File already imports `@tanstack/react-virtual`, `react-window`, `react-virtuoso`, or similar
   - Array is known to be small (hardcoded < 20 items, or filtered to a small subset)
   - Items are not visible simultaneously (tabs, accordion)
   - The map is inside a `useMemo` with proper deps and the list is not scrollable

**Fix**: Wrap in `useVirtualizer` from `@tanstack/react-virtual`.

```typescript
// Before — 500 DOM nodes
function LayerList({ layers }) {
  return (
    <div className="overflow-y-auto h-[400px]">
      {layers.map(layer => (
        <LayerItem key={layer.id} layer={layer} />
      ))}
    </div>
  );
}

// After — only visible items rendered
import { useVirtualizer } from '@tanstack/react-virtual';

function LayerList({ layers }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: layers.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 40,
  });

  return (
    <div ref={parentRef} className="overflow-y-auto h-[400px]">
      <div style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map(virtualRow => (
          <LayerItem
            key={layers[virtualRow.index].id}
            layer={layers[virtualRow.index]}
            style={{
              position: 'absolute',
              top: virtualRow.start,
              height: virtualRow.size,
            }}
          />
        ))}
      </div>
    </div>
  );
}
```

---

### Pattern 6: Object Allocation in Hot Loop (GC Pressure) — CRITICAL

**What**: Creating objects (`new Vector3`, `new Float32Array`, `[...spread]`,
`.map()`, `.filter()`, `.slice()`, `.concat()`, `Object.assign({}, ...)`,
`JSON.parse(JSON.stringify(...))`) inside `requestAnimationFrame`, `useFrame`,
`update()`, `tick()`, `animate()`, or any per-frame function.

**Why it kills FPS**: Each allocation goes to the heap. V8's minor GC triggers
at ~4MB of young-generation garbage and takes 2-10ms. Major GC takes 30-100ms.
10 allocations/frame x 60fps = ~43KB/s of garbage → GC pause every ~90 seconds.
In bullet-heavy games, this becomes every 1-2 seconds.

**Grep patterns**:
```
new THREE\.Vector3
new THREE\.Vector2
new THREE\.Matrix4
new THREE\.Quaternion
new THREE\.Euler
new THREE\.Color
new THREE\.Box3
new THREE\.Ray
new Float32Array
new Uint8Array
new Uint16Array
new Array\(
JSON\.parse\(JSON\.stringify
Object\.assign\(\{\}
\.concat\(
\[\.\.\.
\.slice\(
```

**Detection logic**:
1. Find `new THREE.*`, `new Float32Array`, `[...spread]`, `.concat()`, `.slice()`, `.map()`, `.filter()` calls
2. Check if they appear inside animation/update functions: `requestAnimationFrame`, `useFrame`, `animate`, `update`, `tick`, `render`, `draw`, `loop`, `step`, `onFrame`, `setInterval`, `setTimeout` (game loop)
3. For `.map()` and `.filter()`: only flag if result is NOT stored (intermediate garbage)
4. **False positive exclusions**:
   - Module-level / class-level declarations (pre-allocated)
   - Inside `useEffect`, `useMemo`, constructor, `init` (one-time setup)
   - `new Float32Array` for WebGL buffer uploads (necessary, but should be pre-allocated)

**Fix**: Pre-allocate reusable temp objects outside the loop, use `.set()` / `.copy()`.

```typescript
// Before — allocates every frame
function animate() {
  const target = new THREE.Vector3(tx, ty, tz); // 72 bytes/frame
  mesh.position.lerp(target, 0.1);
  const visible = entities.filter(e => e.active); // new array/frame
  visible.forEach(e => e.draw());
  requestAnimationFrame(animate);
}

// After — zero allocations in hot loop
const _tempVec3 = new THREE.Vector3(); // pre-allocated once
function animate() {
  _tempVec3.set(tx, ty, tz);
  mesh.position.lerp(_tempVec3, 0.1);
  for (let i = 0; i < entities.length; i++) {
    if (entities[i].active) entities[i].draw(); // no intermediate array
  }
  requestAnimationFrame(animate);
}
```

---

### Pattern 7: Missing GPU Resource Disposal — CRITICAL

**What**: Removing Three.js objects from the scene (`scene.remove()`,
`.removeFromParent()`) without calling `.dispose()` on their geometry,
material, and textures. GPU memory (VRAM) is never garbage-collected.

**Why it kills FPS**: A single 2K texture leaks ~16MB VRAM; 4K leaks ~64MB.
After loading/unloading a few scenes, VRAM fills up. The GPU must then swap
textures from system RAM (5-50ms per swap) causing severe stutter. On mobile
(256MB-1GB VRAM), this leads to crashes.

**Grep patterns**:
```
scene\.remove\(
\.removeFromParent\(\)
\.remove\(mesh
\.remove\(object
\.remove\(group
\.remove\(sprite
```

**Detection logic**:
1. Find all `scene.remove(`, `.removeFromParent()` calls
2. Check if `.geometry.dispose()` and `.material.dispose()` appear within 15 lines
3. Check if a `dispose` helper function is called on the removed object
4. Also check: `new THREE.*Geometry(` / `new THREE.*Material(` inline (hard to track for disposal)
5. **False positive exclusions**:
   - Object is reparented (removed from one parent, added to another)
   - A `disposeMesh()` / `cleanup()` / `destroyObject()` helper is called
   - The entire renderer is being destroyed (cleanup phase)

**Fix**: Always dispose geometry + material + textures when removing from scene.

```typescript
// Before — VRAM leak
scene.remove(mesh); // GPU resources still allocated!

// After — proper cleanup
function disposeMesh(mesh: THREE.Mesh) {
  mesh.geometry?.dispose();
  const materials = Array.isArray(mesh.material)
    ? mesh.material : [mesh.material];
  materials.forEach(mat => {
    Object.values(mat).forEach(prop => {
      if (prop?.isTexture) prop.dispose();
    });
    mat.dispose();
  });
  scene.remove(mesh);
}
```

---

### Pattern 8: Unbatched Draw Calls — WARNING

**What**: Per-object WebGL state changes (`gl.bindTexture`, `gl.useProgram`,
`gl.bindBuffer`) and draw calls (`gl.drawArrays`, `gl.drawElements`) inside
a loop. Canvas 2D equivalent: excessive `ctx.save()`/`ctx.restore()` and
`ctx.fillStyle` changes per object.

**Why it kills FPS**: Each draw call costs 10-50 microseconds of CPU overhead.
1000 draw calls = 10-50ms. Each texture bind costs ~5-10us. Shader program
switch costs ~20-50us. A sprite game with individual textures per sprite easily
exceeds the 16.6ms budget on draw calls alone.

**Grep patterns**:
```
gl\.drawArrays\(
gl\.drawElements\(
gl\.bindTexture\(
gl\.useProgram\(
gl\.bindBuffer\(
gl\.bindFramebuffer\(
renderer\.info\.render\.calls
ctx\.save\(\)
ctx\.restore\(\)
ctx\.fillStyle\s*=
ctx\.strokeStyle\s*=
ctx\.font\s*=
```

**Detection logic**:
1. Find `gl.drawArrays`/`gl.drawElements` inside `for`/`forEach`/`while` loops
2. Check if `gl.bindTexture`/`gl.useProgram` also appears inside the same loop
3. For Canvas 2D: find `ctx.save()`/`ctx.restore()` inside loops with `ctx.fillStyle` changes
4. For Three.js: search for `renderer.info.render.calls` to check if draw call counting is done
5. Check if `InstancedMesh`, `BatchedMesh`, `InstancedBufferGeometry` are used (already optimized)
6. **False positive exclusions**:
   - Post-processing passes (each pass = 1 draw call, expected)
   - Shadow map rendering (multi-pass by design)
   - Already using `InstancedMesh` / `BatchedMesh` / instanced rendering

**Fix**: Use instanced rendering, texture atlases, or sort by material to minimize state changes.

```typescript
// Before — 1000 draw calls for 1000 trees
trees.forEach(tree => {
  const mesh = new THREE.Mesh(treeGeometry, treeMaterial);
  mesh.position.copy(tree.pos);
  scene.add(mesh); // 1 draw call per tree
});

// After — 1 draw call for 1000 trees
const instancedTrees = new THREE.InstancedMesh(
  treeGeometry, treeMaterial, trees.length
);
const matrix = new THREE.Matrix4();
trees.forEach((tree, i) => {
  matrix.setPosition(tree.pos);
  instancedTrees.setMatrixAt(i, matrix);
});
scene.add(instancedTrees); // 1 draw call total

// Canvas 2D — sort by fillStyle to minimize state changes
objects.sort((a, b) => a.color.localeCompare(b.color));
let currentColor = '';
objects.forEach(obj => {
  if (obj.color !== currentColor) {
    currentColor = obj.color;
    ctx.fillStyle = currentColor; // change only when needed
  }
  ctx.fillRect(obj.x, obj.y, obj.w, obj.h);
});
```

---

### Pattern 9: Sprite/Entity Creation in Update Loop (No Object Pooling) — WARNING

**What**: Creating game objects (`new Sprite()`, `this.add.sprite()`,
`new Graphics()`, `new Bullet()`) in the update/tick loop and destroying
them with `.destroy()`, instead of using an object pool.

**Why it kills FPS**: A `new PIXI.Sprite()` allocates ~500-800 bytes.
50 sprites/sec x 60fps logic = 3000 short-lived objects/minute.
Chrome V8 minor GC triggers at ~4MB = pause every ~1.7 seconds, each 5-15ms.

**Grep patterns**:
```
new PIXI\.Sprite\(
new PIXI\.Graphics\(
new PIXI\.Text\(
new PIXI\.AnimatedSprite\(
new PIXI\.Container\(
new PIXI\.BitmapText\(
this\.add\.sprite\(
this\.add\.image\(
this\.physics\.add\.sprite\(
this\.physics\.add\.image\(
scene\.add\.sprite\(
app\.stage\.addChild\(new
container\.addChild\(new
\.destroy\(\)
\.kill\(\)
```

**Detection logic**:
1. Find `new PIXI.Sprite(`, `this.add.sprite(`, `new Phaser.GameObjects.*` inside update/tick functions
2. Check if `.destroy()` is called frequently (suggests objects are short-lived)
3. Check if object pool patterns exist: `getFirstDead()`, `pool.pop()`, `pool.get()`
4. **False positive exclusions**:
   - Object creation in `create()`, `init()`, `preload()` (one-time setup)
   - Using Phaser Group with `maxSize` (built-in pooling)
   - Objects created on user interaction (click/tap), not per-frame

**Fix**: Object pool pattern — recycle instead of create/destroy.

```typescript
// Before — create/destroy every frame
update() {
  if (shouldFire) {
    const bullet = new PIXI.Sprite(bulletTexture);
    bullet.position.set(player.x, player.y);
    stage.addChild(bullet);
  }
  bullets.forEach(b => {
    if (b.y < 0) { b.destroy(); } // GC pressure!
  });
}

// After — object pool
const bulletPool: PIXI.Sprite[] = [];
function getBullet(): PIXI.Sprite {
  const b = bulletPool.pop() || new PIXI.Sprite(bulletTexture);
  b.visible = true;
  return b;
}
function releaseBullet(b: PIXI.Sprite) {
  b.visible = false;
  bulletPool.push(b);
}

// Phaser built-in pool
const bullets = this.physics.add.group({
  classType: Bullet,
  maxSize: 50,
  runChildUpdate: true,
});
const bullet = bullets.get(x, y); // reuses dead objects
```

---

### Pattern 10: Variable Timestep Physics — WARNING

**What**: Using raw `deltaTime` directly in physics calculations
(`position += velocity * delta`) without a fixed-timestep accumulator.
Also: physics with no delta at all (`position += velocity`), locking
physics to frame rate.

**Why it kills FPS/bugs**: At 30fps, `delta` = 33ms vs 60fps = 16ms.
A bullet at 10px/frame moves 20px/frame at half framerate — it can tunnel
through a 15px wall. Spring/damper physics become unstable with large delta
spikes (GC pause, tab switch). Non-deterministic: replays and multiplayer
desync.

**Grep patterns**:
```
position.*\+=.*velocity.*delta
position\.x\s*\+=.*speed.*delta
this\.x\s*\+=.*this\.vx\s*\*\s*dt
this\.y\s*\+=.*this\.vy\s*\*\s*dt
\.x\s*\+=.*\.vx\s*\*\s*delta
\.y\s*\+=.*\.vy\s*\*\s*delta
pos\s*\+=.*vel\s*\*\s*delta
position\s*\+=.*velocity(?!\s*\*\s*delta)
this\.x\s*\+=\s*this\.speed\b
```

**Detection logic**:
1. Find `position += velocity * delta` patterns (variable timestep)
2. Find `position += velocity` patterns without delta (frame-rate locked)
3. Check if `accumulator`, `fixedTimeStep`, `PHYSICS_STEP`, `TICK_RATE` appear in the file
4. Check if `while (accumulator >= fixedStep)` pattern exists
5. **False positive exclusions**:
   - Visual-only interpolation (lerp for smooth rendering, not physics)
   - CSS/DOM animation (not physics simulation)
   - Already using a physics engine with built-in fixed step (cannon.js, rapier, matter.js)
   - `delta` is clamped: `Math.min(delta, MAX_DELTA)`

**Fix**: Fixed timestep accumulator with interpolation.

```typescript
// Before — variable timestep (broken at low fps)
function update(delta: number) {
  entity.x += entity.vx * delta; // tunneling at 30fps!
  entity.y += entity.vy * delta;
}

// After — fixed timestep accumulator
const FIXED_STEP = 1 / 60;
const MAX_FRAME_TIME = 0.25;
let accumulator = 0;
let prevTime = performance.now() / 1000;

function gameLoop() {
  const now = performance.now() / 1000;
  let frameTime = Math.min(now - prevTime, MAX_FRAME_TIME);
  prevTime = now;
  accumulator += frameTime;

  while (accumulator >= FIXED_STEP) {
    physicsUpdate(FIXED_STEP); // always same dt
    accumulator -= FIXED_STEP;
  }

  const alpha = accumulator / FIXED_STEP;
  render(alpha); // interpolate for smooth visuals
  requestAnimationFrame(gameLoop);
}
```

---

## Execution Flow

When invoked, follow these steps:

### Step 1: Determine Scope
- If `$ARGUMENTS` contains a file path, scan that file only
- If `$ARGUMENTS` contains a directory path, scan `**/*.{ts,tsx,js,jsx}` recursively
- If no path, scan the current working directory recursively

### Step 2: Run Detection

For each pattern (1-10), use `Grep` to find matches:

**UI Layer (Patterns 1-5):**

1. **Pattern 1 (O(n²) Lookup)**: Search for `.find(`, `.findIndex(`, `.filter(` inside loop constructs. Read surrounding 20 lines of context to verify it's inside a hot loop.

2. **Pattern 2 (Render-Loop State)**: Search for `useState` and store hooks subscribed to high-frequency values. Read the component to check if the value drives animation/canvas rendering.

3. **Pattern 3 (setState in Drag)**: Search for `setState`/`dispatch` inside mouse/drag event handlers. Read context to check if wrapped in RAF or throttled.

4. **Pattern 4 (Selector Object Return)**: Search for store hooks with `=> ({` or `=> [` patterns. Check if `shallow` comparator is used.

5. **Pattern 5 (Unvirtualized List)**: Search for `.map()` returning JSX. Check if virtualization library is imported. Read component for scroll containers.

**Game Engine (Patterns 6-10):**

6. **Pattern 6 (GC Pressure)**: Search for `new THREE.Vector3`, `new Float32Array`, `[...spread]`, `.concat()`, `.slice()`, `.map()`, `.filter()` inside animation/update functions. Read context to confirm it's in a hot loop, not one-time setup.

7. **Pattern 7 (GPU Dispose)**: Search for `scene.remove(`, `.removeFromParent()`. Read surrounding 15 lines for `.dispose()` calls. Flag if removal has no corresponding dispose.

8. **Pattern 8 (Draw Calls)**: Search for `gl.drawArrays`, `gl.drawElements` inside loops with `gl.bindTexture`/`gl.useProgram`. For Canvas 2D, check `ctx.save()`/`ctx.restore()` frequency in loops. Check for `InstancedMesh`/`BatchedMesh` usage.

9. **Pattern 9 (No Object Pool)**: Search for `new PIXI.Sprite(`, `this.add.sprite(`, `new Phaser.GameObjects.*` inside update/tick functions. Check for `.destroy()` calls and absence of pool patterns.

10. **Pattern 10 (Variable Timestep)**: Search for `position += velocity * delta` patterns. Check if `accumulator`, `fixedTimeStep`, `PHYSICS_STEP` exist in the file. Also flag frame-rate-locked physics (`position += velocity` without delta).

### Step 3: Generate Report

Output a structured report:

```
## Game Performance Report

**Scanned**: X files in `path/`
**Found**: N issues (C critical, W warnings, I info)

### CRITICAL

#### [P1] O(n²) Lookup — `src/lib/core/sync.ts:45`
layers.find(l => l.id === target.id) inside forEach loop
~1000 layers = ~16ms/frame wasted
**Fix**: Build a Map before the loop

#### [P4] Selector Object Return — `src/components/Overlay.tsx:12`
useEditorStore(s => ({ zoom: s.zoom, pan: s.pan }))
Creates new object every render check → infinite re-render loop
**Fix**: Split into individual selectors or add `shallow`

### WARNING

#### [P3] setState in Drag — `src/components/Canvas.tsx:89`
setState({ x, y }) inside onMouseMove handler
~60 unnecessary re-renders/sec during drag
**Fix**: Use ref + direct DOM manipulation

### SUMMARY TABLE

| # | Pattern | Severity | Count | Files |
|---|---------|----------|-------|-------|
| 1 | O(n²) Lookup | CRITICAL | 3 | 2 |
| 2 | Render-Loop State | CRITICAL | 1 | 1 |
| 3 | setState in Drag | WARNING | 2 | 2 |
| 4 | Selector Object | CRITICAL | 4 | 3 |
| 5 | Unvirtualized List | WARNING | 1 | 1 |
| 6 | GC Alloc in Hot Loop | CRITICAL | 2 | 1 |
| 7 | Missing GPU Dispose | CRITICAL | 1 | 1 |
| 8 | Unbatched Draw Calls | WARNING | 0 | 0 |
| 9 | No Object Pool | WARNING | 3 | 2 |
| 10 | Variable Timestep | WARNING | 1 | 1 |
```

### Step 4: Fix Mode (if --fix)

If `--fix` is present:

1. For each finding, show the current code and proposed fix
2. Ask user to confirm each fix before applying
3. Apply the fix using the `Edit` tool
4. After all fixes, re-run detection to verify no regressions
5. Report: "Fixed X of Y issues. Z remaining."

**Fix priority order**: Pattern 4 first (can crash the tab), then 1, 2, 3, 5.

### Reference Material

For detailed explanations, real-world examples, and framework-specific variants,
see the reference files:

**UI Layer:**
- `references/pattern-1-lookup.md` — O(n²) → O(1) Map lookup
- `references/pattern-2-render-ref.md` — Render loop state separation
- `references/pattern-3-dom-drag.md` — DOM direct manipulation during drag
- `references/pattern-4-selector.md` — Zustand/Redux selector pitfalls
- `references/pattern-5-virtualize.md` — Virtual scrolling for large lists

**Game Engine:**
- `references/pattern-6-gc-alloc.md` — GC pressure from object allocation in hot loops
- `references/pattern-7-gpu-dispose.md` — Three.js GPU resource disposal
- `references/pattern-8-draw-calls.md` — WebGL/Canvas draw call batching
- `references/pattern-9-object-pool.md` — Sprite/entity object pooling
- `references/pattern-10-fixed-timestep.md` — Fixed timestep physics accumulator
