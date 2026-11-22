# Pattern 1: O(n²) Lookup in Hot Loops

## The Problem

게임/에디터에서 매 프레임마다 오브젝트를 동기화하는 코드에서 `.find()`, `.filter()`,
`.indexOf()`를 루프 안에서 호출하면 O(n²) 복잡도가 발생합니다.

In game loops and editor sync functions, calling `.find()`, `.filter()`, or
`.indexOf()` inside a loop creates O(n²) complexity that scales quadratically
with entity count.

## Why It Kills FPS

| Objects | .find() calls | Time @ 0.01ms each | Frame budget remaining |
|---------|--------------|--------------------|-----------------------|
| 100     | 10,000       | 0.1ms              | 16.5ms (OK)           |
| 500     | 250,000      | 2.5ms              | 14.1ms (tight)        |
| 1,000   | 1,000,000    | 10ms               | 6.6ms (jank!)         |
| 5,000   | 25,000,000   | 250ms              | -233ms (frozen)       |

## Real-World Example: Davinci SVG Animator

Davinci는 Fabric.js 캔버스의 오브젝트와 레이어 상태를 매 프레임 동기화합니다.
초기 구현에서 `layers.find()`를 `fabricObjects.forEach()` 안에서 호출하여
100개 레이어에서도 눈에 띄는 지연이 발생했습니다.

```typescript
// BEFORE — O(n²) in syncLayersToCanvas()
// 이 함수는 매 프레임 호출됨 (60fps)
function syncLayersToCanvas(layers: Layer[], fabricObjects: fabric.Object[]) {
  fabricObjects.forEach((obj) => {
    // O(n) lookup inside O(n) loop = O(n²)
    const layer = layers.find(l => l.id === obj.data?.layerId);
    if (layer) {
      obj.set({
        left: layer.x,
        top: layer.y,
        scaleX: layer.scaleX,
        angle: layer.rotation,
      });
    }
  });
}
```

```typescript
// AFTER — O(n) with Map pre-built
function syncLayersToCanvas(layers: Layer[], fabricObjects: fabric.Object[]) {
  // Map 생성: O(n) — 한 번만 실행
  const layerMap = new Map(layers.map(l => [l.id, l]));

  fabricObjects.forEach((obj) => {
    // Map.get(): O(1) lookup
    const layer = layerMap.get(obj.data?.layerId);
    if (layer) {
      obj.set({
        left: layer.x,
        top: layer.y,
        scaleX: layer.scaleX,
        angle: layer.rotation,
      });
    }
  });
}
```

**Result**: 1000 layers 기준 ~10ms → ~0.5ms (20x improvement)

## Framework-Specific Variants

### ECS (Entity Component System)
```typescript
// BAD — O(n²) entity lookup
function collisionSystem(entities: Entity[]) {
  entities.forEach(a => {
    entities.filter(b => b.id !== a.id).forEach(b => {
      if (overlaps(a, b)) handleCollision(a, b);
    });
  });
}

// GOOD — Spatial hash grid O(n)
const grid = new SpatialHashGrid(cellSize);
entities.forEach(e => grid.insert(e));
entities.forEach(a => {
  grid.getNearby(a.position, a.radius).forEach(b => {
    if (a.id !== b.id && overlaps(a, b)) handleCollision(a, b);
  });
});
```

### Three.js Scene Graph
```typescript
// BAD — find mesh by name in render loop
function animate() {
  requestAnimationFrame(animate);
  const player = scene.children.find(c => c.name === 'player'); // O(n)
  if (player) player.rotation.y += 0.01;
  renderer.render(scene, camera);
}

// GOOD — cache reference once
const player = scene.getObjectByName('player'); // O(n) once at init
function animate() {
  requestAnimationFrame(animate);
  if (player) player.rotation.y += 0.01; // O(1)
  renderer.render(scene, camera);
}
```

### PixiJS / Phaser
```typescript
// BAD — lookup in update loop
update() {
  this.bullets.forEach(bullet => {
    // O(n) per bullet * O(m) enemies = O(n*m)
    const target = this.enemies.find(e => distance(bullet, e) < 10);
    if (target) target.damage(bullet.power);
  });
}

// GOOD — spatial partitioning
update() {
  this.quadTree.clear();
  this.enemies.forEach(e => this.quadTree.insert(e));
  this.bullets.forEach(bullet => {
    const nearby = this.quadTree.retrieve(bullet.bounds);
    nearby.forEach(e => {
      if (distance(bullet, e) < 10) e.damage(bullet.power);
    });
  });
}
```

## Detection Nuances

### True Positives (탐지해야 함)
- `.find()` inside `requestAnimationFrame` callback
- `.find()` inside `forEach`/`map` in a `sync`/`update`/`tick` function
- `.filter()` chained after `.map()` inside a render function
- `.indexOf()` in a collision detection loop

### False Positives (무시해야 함)
- `.find()` in `useEffect` with `[]` deps (runs once)
- `.find()` in event handlers that fire rarely (onClick, onSubmit)
- `.find()` on arrays known to be small (< 10 items from context/type)
- `.find()` in initialization/setup code (constructor, init, mount)

## Quick Fix Checklist

1. Identify the array being searched (e.g., `layers`, `objects`, `entities`)
2. Identify the key being matched (e.g., `id`, `name`, `type`)
3. Build a `Map` before the loop: `new Map(arr.map(x => [x.key, x]))`
4. Replace `.find(x => x.key === val)` with `map.get(val)`
5. If the array changes rarely, cache the Map and rebuild on change
