# Pattern 10: Variable Timestep Physics

## The Problem

물리 연산에서 `deltaTime`을 직접 곱하면 프레임레이트에 따라 물리 결과가 달라집니다.
30fps에서는 60fps보다 2배 큰 delta → 벽 관통, 스프링 발산, 멀티플레이어 동기화 깨짐.

Using raw `deltaTime` directly in physics calculations (`position += velocity * delta`)
without a fixed-timestep accumulator causes frame-rate-dependent physics behavior,
collision tunneling, spring instability, and non-deterministic simulation.

## Why It Causes Bugs (Not Just FPS)

This pattern doesn't directly cause frame drops, but causes **physics bugs** that
appear as gameplay issues:

### 1. Collision Tunneling
```
60fps: bullet moves 10px/frame → wall at 12px → collision detected
30fps: bullet moves 20px/frame → wall at 12px → bullet PASSES THROUGH
```

### 2. Spring/Damper Instability
```
Camera follow spring at 60fps: smooth tracking, stable
Camera follow spring at 30fps: delta doubles → spring overshoots → oscillation
Camera follow spring after GC pause (delta = 100ms): explosion
```

### 3. Non-Determinism
```
Player A at 60fps: jumps, lands at x=100
Player B at 30fps: same inputs → lands at x=97
Replay at 144fps: lands at x=102
→ Multiplayer desync, replay divergence
```

### 4. Tab Switch Death Spiral
```
1. User switches tabs → requestAnimationFrame pauses
2. Returns after 5 seconds → first delta = 5000ms
3. entity.x += entity.vx * 5.0 → entity teleports to x=5000
4. If not clamped: physics explosion, NaN positions, crashes
```

## Real-World Examples

### Variable Timestep (Broken)
```typescript
// BEFORE — physics depends on frame rate
let lastTime = performance.now();

function gameLoop() {
  const now = performance.now();
  const delta = (now - lastTime) / 1000; // seconds
  lastTime = now;

  // Physics with variable delta
  entities.forEach(e => {
    e.vy += GRAVITY * delta;         // gravity
    e.x += e.vx * delta;            // horizontal movement
    e.y += e.vy * delta;            // vertical movement

    // Collision check — can miss at low fps!
    if (e.y > groundY) {
      e.y = groundY;
      e.vy = -e.vy * BOUNCE;
    }
  });

  render();
  requestAnimationFrame(gameLoop);
}
// At 30fps: delta=33ms, bullet moves 2x per step → tunnels through walls
// After tab switch: delta=5000ms → everything teleports
```

### Fixed Timestep Accumulator (Correct)
```typescript
// AFTER — deterministic physics with interpolated rendering
const FIXED_STEP = 1 / 60;      // 60Hz physics
const MAX_FRAME_TIME = 0.25;     // prevent spiral of death
let accumulator = 0;
let prevTime = performance.now() / 1000;

// Store previous + current state for interpolation
interface PhysicsState {
  x: number; y: number; vx: number; vy: number;
}
let prevStates: PhysicsState[] = [];
let currStates: PhysicsState[] = [];

function physicsStep(dt: number) {
  // Always called with FIXED dt — deterministic!
  entities.forEach((e, i) => {
    prevStates[i] = { ...currStates[i] }; // save previous for interpolation

    e.vy += GRAVITY * dt;
    e.x += e.vx * dt;
    e.y += e.vy * dt;

    // Collision is reliable because dt is always small (1/60)
    if (e.y > groundY) {
      e.y = groundY;
      e.vy = -e.vy * BOUNCE;
    }

    currStates[i] = { x: e.x, y: e.y, vx: e.vx, vy: e.vy };
  });
}

function gameLoop() {
  const now = performance.now() / 1000;
  let frameTime = now - prevTime;
  prevTime = now;

  // Clamp: prevent spiral of death after tab switch
  if (frameTime > MAX_FRAME_TIME) frameTime = MAX_FRAME_TIME;

  accumulator += frameTime;

  // Fixed timestep physics — may run 0, 1, or multiple times
  while (accumulator >= FIXED_STEP) {
    physicsStep(FIXED_STEP);
    accumulator -= FIXED_STEP;
  }

  // Interpolation factor for smooth rendering between physics steps
  const alpha = accumulator / FIXED_STEP;
  render(alpha);

  requestAnimationFrame(gameLoop);
}

function render(alpha: number) {
  entities.forEach((e, i) => {
    // Interpolate between previous and current physics state
    const renderX = prevStates[i].x * (1 - alpha) + currStates[i].x * alpha;
    const renderY = prevStates[i].y * (1 - alpha) + currStates[i].y * alpha;
    drawEntity(e, renderX, renderY);
  });
}
```

## Framework-Specific Variants

### Phaser 3 (Built-in Fixed Step)
```typescript
// Phaser's Arcade Physics uses fixed step by default
// But Matter.js integration may not!

// BAD — manual physics in update (variable timestep)
update(time, delta) {
  this.player.x += this.player.vx * (delta / 1000);
}

// GOOD — use Phaser's built-in physics
create() {
  this.player = this.physics.add.sprite(100, 100, 'player');
  this.player.setVelocityX(200); // Phaser handles fixed step
}

// Phaser config for custom fixed step
const config = {
  physics: {
    arcade: {
      fps: 60,           // fixed physics rate
      timeScale: 1,
    }
  }
};
```

### Three.js / React Three Fiber
```typescript
// BAD — variable delta in useFrame
useFrame((state, delta) => {
  meshRef.current.position.x += velocity.x * delta;
  meshRef.current.position.y += velocity.y * delta;
});

// GOOD — fixed step accumulator
const accumulatorRef = useRef(0);
const FIXED_STEP = 1 / 60;

useFrame((state, delta) => {
  accumulatorRef.current += Math.min(delta, 0.25);

  while (accumulatorRef.current >= FIXED_STEP) {
    // Fixed-step physics
    physicsBody.x += physicsBody.vx * FIXED_STEP;
    physicsBody.y += physicsBody.vy * FIXED_STEP;
    accumulatorRef.current -= FIXED_STEP;
  }

  // Interpolate for smooth rendering
  const alpha = accumulatorRef.current / FIXED_STEP;
  meshRef.current.position.x = lerp(prevX, physicsBody.x, alpha);
  meshRef.current.position.y = lerp(prevY, physicsBody.y, alpha);
});
```

### Physics Engine Integration
```typescript
// cannon.js / cannon-es
const world = new CANNON.World();
world.step(1/60);  // Already fixed step — GOOD!

// rapier (Rust WASM)
world.step();  // Fixed step internally — GOOD!

// matter.js
Matter.Engine.update(engine, 1000/60);  // Fixed step — GOOD!
// BUT: don't pass variable delta!
// BAD: Matter.Engine.update(engine, delta);

// p2.js
world.step(1/60);  // Fixed step — GOOD!
```

### Frame-Rate Locked Physics (Also Bad)
```typescript
// BAD — no delta at all, physics tied to frame rate
function update() {
  entity.x += entity.speed;        // 5px at 60fps, 5px at 30fps
  entity.y += GRAVITY;             // same gravity regardless of frame rate
}
// Game runs at half speed on 30fps devices

// GOOD — at minimum, multiply by delta
function update(delta: number) {
  entity.x += entity.speed * delta;
  entity.y += GRAVITY * delta;
}
// Better: use fixed timestep accumulator (see above)
```

## Detection Nuances

### True Positives
- `position += velocity * delta` without `accumulator` in the same file
- `this.x += this.vx * dt` without `fixedTimeStep` or `PHYSICS_STEP`
- `position += speed` without any delta multiplication (frame-locked)
- `Matter.Engine.update(engine, delta)` with variable delta

### False Positives
- Visual-only interpolation: `mesh.position.lerp(target, 0.1)` (not physics)
- CSS/DOM animations (not physics simulation)
- Already using physics engine with built-in fixed step (cannon.js, rapier, p2.js)
- Delta is clamped: `Math.min(delta, MAX_DELTA)` (mitigates tab-switch, but still variable)
- Using `setTimeout(fn, 1000/60)` as a fixed-rate timer (poor man's fixed step)

## The "Spiral of Death" Problem

If physics takes longer than FIXED_STEP to compute:

```
Frame 1: accumulator += 16ms, 1 physics step (OK)
Frame 2: physics takes 20ms, frame takes 36ms
Frame 3: accumulator += 36ms, needs 2 steps (catching up)
Frame 4: 2 steps take 40ms, frame takes 56ms
Frame 5: accumulator += 56ms, needs 3 steps (falling behind!)
→ Each frame needs more steps → each frame takes longer → spiral!
```

**Fix**: Clamp `frameTime` to `MAX_FRAME_TIME` (0.25s typical):
```typescript
if (frameTime > MAX_FRAME_TIME) frameTime = MAX_FRAME_TIME;
```
This means physics "slows down" under extreme load instead of spiraling.

## Migration Checklist

1. Find all `position += velocity * delta` patterns
2. Check if a fixed-step accumulator exists in the file
3. If not:
   a. Define `FIXED_STEP` constant (1/60 for 60Hz physics)
   b. Add `accumulator` variable
   c. Add `MAX_FRAME_TIME` clamp (0.25s)
   d. Wrap physics in `while (accumulator >= FIXED_STEP)` loop
   e. Add interpolation for smooth rendering (`alpha` factor)
4. If using a physics engine: verify it's called with fixed delta, not variable
5. Test: switch tabs for 5 seconds, return — objects should NOT teleport
