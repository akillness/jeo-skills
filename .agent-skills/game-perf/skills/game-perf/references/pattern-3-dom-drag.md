# Pattern 3: setState in Drag/Mouse Handlers

## The Problem

드래그/마우스 이동 이벤트 핸들러에서 `setState`나 `dispatch`를 호출하면
초당 60~120회의 React 렌더가 발생합니다.

Calling `setState`, `dispatch`, or `forceUpdate` inside `onMouseMove`,
`onPointerMove`, `onDrag`, or `onTouchMove` handlers causes 60-120 React
render cycles per second during interaction.

## Why It Kills FPS

Mouse/pointer events fire at the display refresh rate:
- 60Hz display: 60 events/sec
- 120Hz display (ProMotion): 120 events/sec
- Touch devices: 60-120 events/sec with coalesced events

Each `setState` in the handler:
1. Enqueues a React render (~0.1ms)
2. Runs component + children (~1-5ms)
3. Commits DOM changes (~0.5-2ms)
4. Browser layout/paint (~1ms)

**Total per event**: ~3-8ms. At 120Hz: 360-960ms/sec of main thread blocked.
Users perceive this as sluggish, "sticky" drag behavior.

## Real-World Example: Davinci Video Editor Clips

Davinci의 비디오 에디터에서 타임라인 클립 드래그 시 `forceUpdate({})`를 호출하여
React가 매 프레임 리렌더링했습니다. 특히 드래그 종료 시 `el.style.width = ''`이
DOM을 직접 조작하면서 React와 충돌하는 버그도 발생했습니다.

```typescript
// BEFORE — forceUpdate on every drag frame
function Clip({ clip }: Props) {
  const [, forceUpdate] = useState({});
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    const el = containerRef.current;
    if (!el) return;

    const deltaX = e.clientX - startX.current;
    el.style.left = `${initialLeft.current + deltaX}px`;

    // 이 forceUpdate가 매 mousemove마다 React 렌더 트리거
    forceUpdate({}); // 60-120 renders/sec!
  }, []);

  const handleMouseUp = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    // React와 충돌: inline style 제거 시 React가 추적 못함
    el.style.width = '';
    el.style.transform = '';
    el.style.left = '';

    // 최종 위치를 state에 커밋
    updateClipPosition(clip.id, newPosition);
  }, [clip.id]);
}
```

```typescript
// AFTER — pure DOM manipulation during drag, state commit on end
function Clip({ clip }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const hasDraggedRef = useRef(false);
  const posRef = useRef({ x: 0, startX: 0, initialLeft: 0 });

  const handleMouseMove = useCallback((e: MouseEvent) => {
    const el = containerRef.current;
    if (!el) return;

    hasDraggedRef.current = true;
    const deltaX = e.clientX - posRef.current.startX;

    // DOM 직접 조작 — React 렌더 없음
    el.style.transform = `translateX(${deltaX}px)`;
    el.style.zIndex = '100';
    el.style.opacity = '0.8';
  }, []);

  const handleMouseUp = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    if (hasDraggedRef.current) {
      // 실제 드래그 후에만 CSS 정리
      el.style.width = '';
      el.style.transform = '';
      el.style.zIndex = '';
      el.style.opacity = '';

      // 최종 위치를 state에 커밋 (한 번만)
      updateClipPosition(clip.id, calculatedPosition);
    } else {
      // 클릭만 한 경우: width, transform은 건드리지 않음
      el.style.zIndex = '';
      el.style.opacity = '';
    }

    hasDraggedRef.current = false;
  }, [clip.id]);
}
```

**Result**: 드래그 중 렌더링 ~5ms/frame → ~0.1ms/frame (50x improvement)

## Framework-Specific Variants

### React DnD / react-beautiful-dnd
```typescript
// BAD — custom drag with setState
const onDrag = (e) => {
  setPosition({ x: e.clientX, y: e.clientY });
};

// GOOD — use the library's built-in transform
// react-beautiful-dnd and @dnd-kit handle transforms internally
// without triggering setState on every frame
import { useDraggable } from '@dnd-kit/core';
const { attributes, listeners, setNodeRef, transform } = useDraggable({ id });
// transform is applied via CSS transform, not state
```

### Canvas / WebGL Drag
```typescript
// BAD — React state for canvas object position
const onMouseMove = (e) => {
  setSelectedPos({ x: e.offsetX, y: e.offsetY });
  // triggers React render → canvas redraw
};

// GOOD — canvas-only update
const onMouseMove = (e) => {
  selectedObject.set({ left: e.offsetX, top: e.offsetY });
  canvas.requestRenderAll(); // canvas redraws, React untouched
};
```

### Fabric.js
```typescript
// BAD — sync Fabric events to React state
canvas.on('object:moving', (e) => {
  setLayerPosition(e.target.data.layerId, {
    x: e.target.left,
    y: e.target.top,
  }); // React render on every pixel of movement
});

// GOOD — update state only on mouse up
canvas.on('object:modified', (e) => {
  // Fires once after drag/resize/rotate ends
  setLayerPosition(e.target.data.layerId, {
    x: e.target.left,
    y: e.target.top,
  });
});
```

### Three.js Orbit Controls
```typescript
// BAD
controls.addEventListener('change', () => {
  setCameraState({
    position: camera.position.clone(),
    rotation: camera.rotation.clone(),
  }); // setState 60fps
});

// GOOD
controls.addEventListener('change', () => {
  renderer.render(scene, camera); // direct render, no React
});
controls.addEventListener('end', () => {
  // commit to state only when interaction ends
  setCameraState({...});
});
```

## Detection Nuances

### True Positives
- `setState` inside `onMouseMove`/`onPointerMove` handler
- `dispatch` inside a `mousemove` event listener
- `forceUpdate({})` inside any continuous event handler
- `setStore` inside `requestAnimationFrame` loop for visual updates
- State update inside `onDrag` that triggers component re-render

### False Positives
- `setState` for `isDragging` boolean (fires once on dragstart, not continuously)
- `setState` inside RAF but debounced/throttled to 10fps
- `setState` wrapped in `requestAnimationFrame` with frame-skip logic
- `dispatch` in `onMouseMove` but component uses `React.memo` and only re-renders children
- State update for cursor style (doesn't cause layout thrashing)

## The hasDraggedRef Pattern

드래그 핸들러에서 가장 흔한 버그: mouseUp에서 클릭과 드래그를 구분하지 않음.

```typescript
const hasDraggedRef = useRef(false);

// mouseDown: 초기화
hasDraggedRef.current = false;

// mouseMove: 실제 이동 시 true
if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
  hasDraggedRef.current = true;
}

// mouseUp: 드래그한 경우만 CSS 정리 + state 커밋
if (hasDraggedRef.current) {
  // cleanup drag styles, commit position
} else {
  // handle as click — do NOT reset styles!
}
```

This prevents the React-DOM conflict where `el.style.width = ''` on click
removes React-managed inline styles, causing visual glitches.

## Migration Checklist

1. Find all `setState`/`dispatch`/`forceUpdate` in mouse/drag handlers
2. For each:
   a. Is the state used for visual positioning? → Use `ref` + `el.style.transform`
   b. Is the state used for non-visual logic? → Accumulate in `ref`, commit on mouseup
   c. Is the state needed by other components during drag? → Use `store.setState` (non-reactive)
3. Add `hasDraggedRef` to distinguish click vs drag
4. Move CSS cleanup to `if (hasDraggedRef.current)` block only
5. Commit final state in `onMouseUp`/`onPointerUp` (single render)
