# game-perf

AI가 만든 게임 코드에서 프레임 드롭을 유발하는 10가지 패턴을 자동 탐지하고 수정하는 Claude Code 플러그인.
React/Zustand UI부터 Three.js, WebGL, PixiJS, Phaser 게임 엔진까지 커버합니다.

[English](./README.md)

---

## 설치

```bash
git clone https://github.com/gykim80/andrew_game_perf.git game-perf
claude --plugin-dir ./game-perf
```

---

## 사용법

```bash
/game-perf              # 전체 프로젝트 스캔
/game-perf src/         # 특정 디렉토리 스캔
/game-perf src/ --fix   # 스캔 + 자동 수정
```

---

## 10가지 패턴

### UI 레이어 (React / 상태 관리)

| # | 패턴 | 등급 | Before | After |
|---|------|------|--------|-------|
| 1 | 루프 안에서 `.find()` — O(n²) | CRITICAL | 10ms/f | 0.5ms |
| 2 | `useState`로 카메라/줌 | CRITICAL | 60 renders/s | 0 |
| 3 | 드래그에서 `setState` | WARNING | 120 renders/s | 1 |
| 4 | Zustand selector 객체 반환 | CRITICAL | 탭 크래시 | 안정 |
| 5 | 대량 리스트 미가상화 | WARNING | 25fps | 60fps |

### 게임 엔진 (Three.js / WebGL / PixiJS / Phaser)

| # | 패턴 | 등급 | Before | After |
|---|------|------|--------|-------|
| 6 | 렌더 루프에서 `new` — GC 압력 | CRITICAL | GC 15ms | 0ms |
| 7 | `scene.remove()`만 — VRAM 누수 | CRITICAL | 320MB 누수 | 0 |
| 8 | 오브젝트마다 개별 draw call | WARNING | 30ms CPU | 0.05ms |
| 9 | 총알/파티클 생성+파괴 반복 | WARNING | GC/1-2s | 0 GC |
| 10 | 가변 타임스텝 물리 | WARNING | 관통/텔레포트 | 결정적 |

---

## 코드 예시

### #1. `.find()` in loop → `Map`

```js
// Before — O(n²), 1000개면 프레임당 100만 번 비교
renderObjects.forEach(obj => {
  const entity = entities.find(e => e.id === obj.entityId);
});

// After — O(n), Map 한 줄 추가
const map = new Map(entities.map(e => [e.id, e]));
renderObjects.forEach(obj => {
  const entity = map.get(obj.entityId);
});
```

### #6. 렌더 루프에서 `new` → 재사용 객체

```js
// Before — 매 프레임 가비지 생성
useFrame(() => {
  const dir = new THREE.Vector3().subVectors(target, pos).normalize();
});

// After — 모듈 스코프 재사용
const _dir = new THREE.Vector3();
useFrame(() => {
  _dir.subVectors(target, pos).normalize();
});
```

### #7. `scene.remove()` → `dispose()` 필수

```js
// 4K 텍스처 1장 = 64MB. 씬 전환 5번 = 320MB 누수
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

## 호환성

| 프레임워크 | 탐지 패턴 |
|-----------|----------|
| React | P1-P5 |
| Zustand / Redux / Jotai | P2, P4 |
| Three.js / React Three Fiber | P1, P2, P6, P7, P8, P10 |
| PixiJS | P1, P5, P6, P9 |
| Phaser | P1, P5, P9, P10 |
| Canvas 2D / WebGL | P2, P3, P6, P7, P8 |
| cannon.js / rapier / matter.js | P10 |

---

## 동작 원리

1. **스캔**: Grep 패턴 매칭 (`*.ts`, `*.tsx`, `*.js`, `*.jsx`)
2. **검증**: 주변 컨텍스트 분석으로 오탐 배제
3. **리포트**: 심각도별 구조화 출력 (CRITICAL → WARNING)
4. **수정** (`--fix`): 수정 코드 제시, 확인 후 적용, 재스캔 검증

---

## License

MIT
