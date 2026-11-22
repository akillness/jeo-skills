# game-perf

A Claude Code plugin that detects and fixes 10 common frame-drop patterns in AI-generated game code — from React/Zustand UI to Three.js, WebGL, PixiJS, and Phaser.

[한국어](./README-kr.md)

---

## Install

```bash
git clone https://github.com/gykim80/andrew_game_perf.git game-perf
claude --plugin-dir ./game-perf
```

---

## Usage

```bash
/game-perf              # Scan entire project
/game-perf src/         # Scan specific directory
/game-perf src/ --fix   # Scan + auto-fix
```

---

## 10 Patterns

### UI Layer (React / State Management)

| # | Pattern | Severity | Before | After |
|---|---------|----------|--------|-------|
| 1 | `.find()` in loop — O(n²) | CRITICAL | 10ms/f | 0.5ms |
| 2 | `useState` for camera/zoom | CRITICAL | 60 renders/s | 0 |
| 3 | `setState` in drag handler | WARNING | 120 renders/s | 1 |
| 4 | Zustand selector returning object | CRITICAL | tab crash | stable |
| 5 | Large list without virtualization | WARNING | 25fps | 60fps |

### Game Engine (Three.js / WebGL / PixiJS / Phaser)

| # | Pattern | Severity | Before | After |
|---|---------|----------|--------|-------|
| 6 | `new` in render loop — GC pressure | CRITICAL | GC 15ms | 0ms |
| 7 | `scene.remove()` without dispose — VRAM leak | CRITICAL | 320MB leak | 0 |
| 8 | Per-object draw calls | WARNING | 30ms CPU | 0.05ms |
| 9 | Bullet/particle create+destroy cycle | WARNING | GC/1-2s | 0 GC |
| 10 | Variable timestep physics | WARNING | tunneling | deterministic |

---

## Examples

### #1. `.find()` in loop → `Map`

```js
// Before — O(n²), 1000 entities = 1M comparisons per frame
renderObjects.forEach(obj => {
  const entity = entities.find(e => e.id === obj.entityId);
});

// After — O(n), one Map
const map = new Map(entities.map(e => [e.id, e]));
renderObjects.forEach(obj => {
  const entity = map.get(obj.entityId);
});
```

### #6. `new` in render loop → reusable object

```js
// Before — garbage every frame
useFrame(() => {
  const dir = new THREE.Vector3().subVectors(target, pos).normalize();
});

// After — module-scope reuse
const _dir = new THREE.Vector3();
useFrame(() => {
  _dir.subVectors(target, pos).normalize();
});
```

### #7. `scene.remove()` → `dispose()` required

```js
// 4K texture = 64MB. 5 scene changes = 320MB leak
function disposeObject(obj) {
  obj.traverse(child => {
    if (child.isMesh) {
      child.geometry?.dispose();
      [].concat(child.material).forEach(m => {
        m.map?.dispose();
        m.normalMap?.dispose();
        m.roughnessMap?.dispose();
        m.dispose();
      });
    }
  });
}
```

---

## Compatibility

| Framework | Patterns |
|-----------|----------|
| React | P1-P5 |
| Zustand / Redux / Jotai | P2, P4 |
| Three.js / React Three Fiber | P1, P2, P6, P7, P8, P10 |
| PixiJS | P1, P5, P6, P9 |
| Phaser | P1, P5, P9, P10 |
| Canvas 2D / WebGL | P2, P3, P6, P7, P8 |
| cannon.js / rapier / matter.js | P10 |

---

## How It Works

1. **Scan**: Grep pattern matching on `*.ts`, `*.tsx`, `*.js`, `*.jsx`
2. **Verify**: Context analysis to eliminate false positives
3. **Report**: Structured output by severity (CRITICAL → WARNING)
4. **Fix** (`--fix`): Shows proposed code, applies after confirmation, re-scans

---

## License

MIT
