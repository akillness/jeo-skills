# Pattern 9: Sprite/Entity Creation in Update Loop (No Object Pooling)

## The Problem

게임 루프에서 스프라이트, 총알, 파티클 등을 `new`로 생성하고 `.destroy()`로 제거하면
수천 개의 단기 객체가 GC 압력을 유발합니다.

Creating game objects (`new Sprite()`, `this.add.sprite()`, `new Particle()`)
in the update loop and destroying them on death/offscreen generates thousands of
short-lived objects per minute, causing frequent GC pauses.

## Why It Kills FPS

Object lifecycle costs:

| Operation | CPU Cost | GC Impact |
|-----------|----------|-----------|
| `new PIXI.Sprite()` | ~0.05ms | ~500-800 bytes allocated |
| `stage.addChild(sprite)` | ~0.01ms | Scene graph node added |
| `sprite.destroy()` | ~0.1ms | Listener cleanup + dereference |
| GC collection of sprite | 0.01-0.1ms | Part of minor GC |

In a bullet-hell game:
- 50 bullets/second created and destroyed
- Each bullet: ~800 bytes (sprite + transform + texture ref + bounds cache)
- = 40KB/s garbage from bullets alone
- + 50 event listener detach operations/sec
- + scene graph reorganization 50x/sec
- Minor GC every ~100 seconds from bullets alone (more frequent with other allocs)

With object pooling:
- 50 pool.get() + 50 pool.release() per second
- 0 bytes allocated, 0 bytes garbage collected
- 0 GC pauses from this system

## Real-World Example: PixiJS Bullet System

```typescript
// BEFORE — create/destroy every frame
class BulletManager {
  private bullets: PIXI.Sprite[] = [];

  fire(x: number, y: number, angle: number) {
    const bullet = new PIXI.Sprite(bulletTexture);  // allocate
    bullet.position.set(x, y);
    bullet.rotation = angle;
    this.stage.addChild(bullet);                     // add to scene graph
    this.bullets.push(bullet);
  }

  update() {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.x += Math.cos(b.rotation) * SPEED;
      b.y += Math.sin(b.rotation) * SPEED;

      if (this.isOffscreen(b)) {
        b.destroy();                                 // GC pressure!
        this.bullets.splice(i, 1);                   // array resize!
      }
    }
  }
}
// 50 bullets/sec * 60 seconds = 3000 create+destroy cycles/minute
```

```typescript
// AFTER — object pool with zero allocation
class BulletPool {
  private pool: PIXI.Sprite[] = [];
  private active: PIXI.Sprite[] = [];

  constructor(
    private stage: PIXI.Container,
    private texture: PIXI.Texture,
    initialSize: number = 100
  ) {
    // Pre-allocate pool
    for (let i = 0; i < initialSize; i++) {
      const sprite = new PIXI.Sprite(texture);
      sprite.visible = false;
      stage.addChild(sprite); // add once, never remove
      this.pool.push(sprite);
    }
  }

  get(x: number, y: number, angle: number): PIXI.Sprite | null {
    const sprite = this.pool.pop();
    if (!sprite) return null; // pool exhausted

    sprite.position.set(x, y);
    sprite.rotation = angle;
    sprite.visible = true;
    this.active.push(sprite);
    return sprite;
  }

  release(sprite: PIXI.Sprite) {
    sprite.visible = false;
    // Swap-remove from active (O(1) instead of splice O(n))
    const idx = this.active.indexOf(sprite);
    if (idx !== -1) {
      this.active[idx] = this.active[this.active.length - 1];
      this.active.pop();
    }
    this.pool.push(sprite);
  }

  update() {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const b = this.active[i];
      b.x += Math.cos(b.rotation) * SPEED;
      b.y += Math.sin(b.rotation) * SPEED;

      if (this.isOffscreen(b)) {
        this.release(b); // return to pool, no GC!
      }
    }
  }
}
// 0 allocations during gameplay, 0 GC pauses from bullets
```

## Framework-Specific Variants

### Phaser 3 (Built-in Group Pooling)
```typescript
// BAD — raw sprite creation in update
update() {
  if (this.input.activePointer.isDown) {
    const bullet = this.add.sprite(player.x, player.y, 'bullet');
    this.physics.add.existing(bullet);
    bullet.body.setVelocityX(500);
  }

  this.bullets.forEach(b => {
    if (b.x > 800) b.destroy(); // GC pressure!
  });
}

// GOOD — Phaser Group with pooling
create() {
  this.bulletGroup = this.physics.add.group({
    classType: Bullet,
    maxSize: 50,           // pool size
    runChildUpdate: true,  // auto-call update() on active children
  });
}

update() {
  if (this.input.activePointer.isDown) {
    const bullet = this.bulletGroup.get(player.x, player.y);
    if (bullet) {
      bullet.setActive(true).setVisible(true);
      bullet.body.setVelocityX(500);
    }
  }
}

// In Bullet class:
preUpdate(time, delta) {
  super.preUpdate(time, delta);
  if (this.x > 800) {
    this.setActive(false).setVisible(false); // return to pool
    this.body.stop();
  }
}
```

### Three.js Particle System
```typescript
// BAD — individual mesh per particle
function emitParticle(pos: THREE.Vector3) {
  const mesh = new THREE.Mesh(particleGeo, particleMat);
  mesh.position.copy(pos);
  scene.add(mesh);
  setTimeout(() => {
    scene.remove(mesh);
    mesh.geometry.dispose(); // even with dispose, still GC pressure
  }, 1000);
}

// GOOD — InstancedMesh pool (or Points for many particles)
class ParticlePool {
  private mesh: THREE.InstancedMesh;
  private pool: number[] = []; // available instance indices
  private matrix = new THREE.Matrix4();

  constructor(geo: THREE.BufferGeometry, mat: THREE.Material, maxCount: number) {
    this.mesh = new THREE.InstancedMesh(geo, mat, maxCount);
    this.mesh.count = 0; // start with 0 visible
    scene.add(this.mesh);
    for (let i = maxCount - 1; i >= 0; i--) this.pool.push(i);
  }

  emit(position: THREE.Vector3): number {
    const idx = this.pool.pop();
    if (idx === undefined) return -1;
    this.matrix.setPosition(position);
    this.mesh.setMatrixAt(idx, this.matrix);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.count = Math.max(this.mesh.count, idx + 1);
    return idx;
  }

  release(idx: number) {
    this.matrix.makeScale(0, 0, 0); // hide by scaling to 0
    this.mesh.setMatrixAt(idx, this.matrix);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.pool.push(idx);
  }
}
```

### Generic TypeScript Pool
```typescript
// Reusable pool class for any game object type
class ObjectPool<T> {
  private pool: T[] = [];
  private factory: () => T;
  private reset: (obj: T) => void;

  constructor(factory: () => T, reset: (obj: T) => void, initialSize = 50) {
    this.factory = factory;
    this.reset = reset;
    for (let i = 0; i < initialSize; i++) {
      this.pool.push(factory());
    }
  }

  get(): T {
    if (this.pool.length > 0) {
      return this.pool.pop()!;
    }
    return this.factory(); // expand pool if exhausted
  }

  release(obj: T) {
    this.reset(obj);
    this.pool.push(obj);
  }
}

// Usage
const bulletPool = new ObjectPool(
  () => new Bullet(),
  (b) => { b.active = false; b.x = 0; b.y = 0; },
  100
);
```

## Detection Nuances

### True Positives
- `new PIXI.Sprite()` inside `update()`, `tick()`, or `requestAnimationFrame`
- `this.add.sprite()` inside Phaser `update()` method
- `.destroy()` called frequently (in update loop or on timer/interval)
- `container.addChild(new ...)` inside animation loop

### False Positives
- Sprite creation in `create()`, `init()`, `preload()`, `constructor` (one-time)
- Using Phaser `Group` with `maxSize` (built-in pooling)
- Object creation on user tap/click (infrequent, acceptable)
- `destroy()` called only in cleanup/scene-transition code

### Ticker Listener Leak Detection
```typescript
// Also check for ticker listeners that are never removed
// BAD — adds new listener every frame or on repeated events
app.ticker.add(someFunction);    // without corresponding .remove()
emitter.on('update', handler);   // without .off() in cleanup

// Look for: ticker.add( / .on('update' without nearby .remove() / .off()
```

## Migration Checklist

1. Identify all `new Sprite/Mesh/Object` calls in update/tick functions
2. Identify all `.destroy()` calls that fire frequently
3. Determine max concurrent objects needed (e.g., max 50 bullets on screen)
4. Create pool with `initialSize = max * 1.5` (headroom for bursts)
5. Replace `new Object()` with `pool.get()`
6. Replace `.destroy()` with `pool.release()` (hide + reset + return)
7. For array management: use swap-remove instead of `.splice()` (O(1) vs O(n))
8. Monitor: if pool exhaustion happens, increase initialSize
