# Pattern 4: Selector Returning New Object/Array

## The Problem

Zustand, Redux, Jotai 등의 상태 관리 라이브러리에서 selector가 매번 새 객체/배열을
생성하면 `Object.is()` 비교에서 항상 "변경됨"으로 판단되어 무한 렌더링 루프가
발생합니다.

When a store selector returns a new object `{ ... }` or array `[ ... ]`
on every call, the equality check (`Object.is()`) always returns `false`,
triggering an infinite re-render loop that can freeze the browser tab.

## Why It Kills FPS

This isn't just a performance issue — it's a **crash-level bug**.

```
Render 1: selector returns { width: 100, height: 200 }  → ref_A
Render 2: selector returns { width: 100, height: 200 }  → ref_B
Object.is(ref_A, ref_B) → false (different references!)
→ Zustand: "state changed!" → trigger re-render
→ Render 3: same values, new reference → trigger re-render
→ Render 4: same values, new reference → trigger re-render
→ ... infinite loop → browser tab freezes
```

React 18's automatic batching limits the damage, but:
- The render queue fills up faster than it drains
- Each render recalculates the selector, creating more "changes"
- Memory usage spikes as render queue grows
- Eventually: "Maximum update depth exceeded" error or tab crash

## Real-World Example: Davinci Editor Store

Davinci의 에디터에서 캔버스 크기를 구독하는 selector가 객체를 반환하여
무한 루프가 발생했습니다.

```typescript
// BEFORE — INFINITE LOOP
// 이 selector는 매 호출마다 새 객체를 생성합니다
export const selectCanvasSize = (state: EditorState) => ({
  width: state.canvas.width,
  height: state.canvas.height,
});

function CanvasFrame() {
  // Object.is() 비교 실패 → 무한 리렌더
  const canvasSize = useEditorStore(selectCanvasSize);
  return <div style={{ width: canvasSize.width, height: canvasSize.height }} />;
}
```

```typescript
// AFTER (Option A) — primitive 값만 반환하는 개별 selector
export const selectCanvasWidth = (state: EditorState) => state.canvas.width;
export const selectCanvasHeight = (state: EditorState) => state.canvas.height;

function CanvasFrame() {
  const canvasWidth = useEditorStore(selectCanvasWidth);   // number
  const canvasHeight = useEditorStore(selectCanvasHeight); // number
  return <div style={{ width: canvasWidth, height: canvasHeight }} />;
}
```

```typescript
// AFTER (Option B) — shallow comparator 사용
import { shallow } from 'zustand/shallow';

function CanvasFrame() {
  const canvasSize = useEditorStore(
    s => ({ width: s.canvas.width, height: s.canvas.height }),
    shallow  // shallow comparison: compare each property individually
  );
  return <div style={{ width: canvasSize.width, height: canvasSize.height }} />;
}
```

```typescript
// AFTER (Option C) — useShallow hook (Zustand v4.5+)
import { useShallow } from 'zustand/react/shallow';

function CanvasFrame() {
  const canvasSize = useEditorStore(
    useShallow(s => ({ width: s.canvas.width, height: s.canvas.height }))
  );
  return <div style={{ width: canvasSize.width, height: canvasSize.height }} />;
}
```

## Framework-Specific Variants

### Zustand
```typescript
// BAD — object return
const { zoom, pan } = useStore(s => ({ zoom: s.zoom, pan: s.pan }));

// GOOD — individual selectors
const zoom = useStore(s => s.zoom);
const pan = useStore(s => s.pan);

// GOOD — shallow (when you need multiple values)
import { shallow } from 'zustand/shallow';
const { zoom, pan } = useStore(s => ({ zoom: s.zoom, pan: s.pan }), shallow);

// GOOD — useShallow (Zustand 4.5+)
import { useShallow } from 'zustand/react/shallow';
const { zoom, pan } = useStore(useShallow(s => ({ zoom: s.zoom, pan: s.pan })));
```

### Redux Toolkit
```typescript
// BAD — derived object in useSelector
const viewport = useSelector(s => ({
  zoom: s.editor.zoom,
  panX: s.editor.panX,
  panY: s.editor.panY,
}));

// GOOD — createSelector from reselect (memoized)
import { createSelector } from '@reduxjs/toolkit';
const selectViewport = createSelector(
  (s) => s.editor.zoom,
  (s) => s.editor.panX,
  (s) => s.editor.panY,
  (zoom, panX, panY) => ({ zoom, panX, panY }) // only recomputes when inputs change
);
const viewport = useSelector(selectViewport);

// GOOD — shallowEqual
import { shallowEqual } from 'react-redux';
const viewport = useSelector(
  s => ({ zoom: s.editor.zoom, panX: s.editor.panX }),
  shallowEqual
);
```

### Jotai
```typescript
// BAD — derived atom returning new object
const viewportAtom = atom(get => ({
  zoom: get(zoomAtom),
  pan: get(panAtom),
})); // new object every time any source changes

// GOOD — selectAtom with equality
import { selectAtom } from 'jotai/utils';
const zoomAtom = selectAtom(editorAtom, s => s.zoom);
const panAtom = selectAtom(editorAtom, s => s.pan);
```

### Array Selectors
```typescript
// BAD — filter creates new array every time
const visibleLayers = useStore(s => s.layers.filter(l => l.visible));
// New array reference even if contents are identical!

// GOOD — memoize the selector
const selectVisibleLayers = useMemo(
  () => createSelector(
    (s: State) => s.layers,
    (layers) => layers.filter(l => l.visible)
  ),
  []
);
const visibleLayers = useStore(selectVisibleLayers);

// GOOD — shallow comparison for arrays
const visibleLayers = useStore(
  s => s.layers.filter(l => l.visible),
  shallow
);
```

## Detection Nuances

### True Positives (CRITICAL — will cause infinite loop)
- `useStore(s => ({ ... }))` without `shallow` second argument
- `useStore(s => [ ... ])` without `shallow` second argument
- `useSelector(s => ({ ... }))` without `shallowEqual`
- Inline selector with object spread: `useStore(s => ({ ...s.viewport }))`
- `.filter()` / `.map()` inside selector without memoization

### False Positives (safe, do not flag)
- `useStore(s => ({ ... }), shallow)` — shallow comparator present
- `useStore(useShallow(s => ({ ... })))` — useShallow wrapper present
- `useSelector(selectFoo)` where `selectFoo` is created with `createSelector`
- `useStore(s => s.some.primitive)` — returns primitive, not object
- Selector defined in `useMemo` with stable deps

## Severity Levels

| Scenario | Severity | Impact |
|----------|----------|--------|
| Object return, no equality fn | CRITICAL | Infinite loop, tab crash |
| Array `.filter()`, no equality | WARNING | Re-render on any state change |
| Selector in render body (not memoized) | WARNING | New function ref each render |
| Object return with `shallow` | OK | No issue |

## Quick Fix Decision Tree

```
Selector returns object/array?
├── YES → Does it use shallow/shallowEqual/useShallow?
│   ├── YES → OK, no fix needed
│   └── NO → How many properties?
│       ├── 1-3 → Split into individual primitive selectors
│       └── 4+ → Add shallow comparator
└── NO (primitive) → OK, no fix needed
```
