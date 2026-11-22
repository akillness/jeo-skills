# Pattern 2: Render-Loop Values in React State

## The Problem

줌, 팬, 마우스 위치처럼 매 프레임 변하는 값을 `useState`나 store subscription으로
관리하면 프레임마다 React 전체 렌더 사이클이 트리거됩니다.

Values that change every frame — zoom, pan, mouse position, camera angle,
scroll offset — stored in React state or subscribed from a store cause a
full React reconciliation cycle on every frame.

## Why It Kills FPS

React render cycle per state change:
1. `setState` called → render scheduled (~0.1ms)
2. Component function re-executes (~0.5ms for typical component)
3. Virtual DOM diffing (~1-5ms depending on tree size)
4. DOM mutations (~0.5-2ms)
5. Layout/paint (~1-3ms)

**Total**: ~3-10ms per state change. At 60fps, that's 180-600ms per second
just for one continuously-changing value.

## Real-World Example: Davinci Canvas Overlays

Davinci의 에디터에는 캔버스 위에 레이어 라벨, 선택 핸들, 비디오 오버레이 등이
렌더링됩니다. 초기에는 zoom/pan을 Zustand store에서 구독했습니다.

```typescript
// BEFORE — re-render every overlay on zoom/pan change
function LayerLabelsOverlay({ layers }: Props) {
  // 매번 새 객체 반환 → 무한 루프 위험 (Pattern 4와 겹침)
  const canvas = useEditorStore(s => s.canvas);

  return (
    <>
      {layers.map(layer => (
        <div
          key={layer.id}
          style={{
            position: 'absolute',
            left: layer.x * canvas.zoom + canvas.panX,
            top: layer.y * canvas.zoom + canvas.panY,
            transform: `scale(${1 / canvas.zoom})`,
          }}
        >
          {layer.name}
        </div>
      ))}
    </>
  );
}
```

```typescript
// AFTER — useRef + store.subscribe for direct DOM updates
const LayerLabelsOverlay = memo(function LayerLabelsOverlay({ layers }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // store.subscribe로 React 렌더 없이 DOM 직접 업데이트
    const unsubZoom = useEditorStore.subscribe(
      s => s.canvas.zoom,
      (zoom) => updateOverlayPositions(containerRef.current, layers, zoom)
    );
    const unsubPan = useEditorStore.subscribe(
      s => s.canvas.panX,
      () => updateOverlayPositions(containerRef.current, layers)
    );

    return () => { unsubZoom(); unsubPan(); };
  }, [layers]);

  return <div ref={containerRef}>{/* labels rendered once */}</div>;
});

function updateOverlayPositions(
  container: HTMLDivElement | null,
  layers: Layer[],
  zoom?: number
) {
  if (!container) return;
  const state = useEditorStore.getState().canvas;
  const z = zoom ?? state.zoom;
  const labels = container.children;
  layers.forEach((layer, i) => {
    if (labels[i]) {
      (labels[i] as HTMLElement).style.transform =
        `translate(${layer.x * z + state.panX}px, ${layer.y * z + state.panY}px) scale(${1 / z})`;
    }
  });
}
```

**Result**: 오버레이 100개 기준 zoom/pan 시 ~8ms → ~0.3ms per frame

## Framework-Specific Variants

### Zustand Subscribe Pattern
```typescript
// Zustand의 subscribe는 selector 기반으로 변경 감지 가능
// React 렌더 사이클을 우회하여 직접 side effect 실행

useEffect(() => {
  return useGameStore.subscribe(
    s => s.camera.position,    // selector
    (pos) => {                  // 변경 시 콜백 (React 외부)
      renderer.camera.position.set(pos.x, pos.y, pos.z);
    }
  );
}, []);
```

### Redux + React
```typescript
// BAD — useSelector triggers re-render
const mousePos = useSelector(s => s.mouse.position); // re-render 60fps

// GOOD — store.subscribe outside React
useEffect(() => {
  return store.subscribe(() => {
    const pos = store.getState().mouse.position;
    canvasRef.current?.updateCursor(pos);
  });
}, []);
```

### Fabric.js / Canvas 2D
```typescript
// BAD — React state for canvas viewport
const [viewport, setViewport] = useState({ zoom: 1, panX: 0, panY: 0 });
// onWheel → setViewport → re-render → canvas.setViewportTransform

// GOOD — direct canvas API
const viewportRef = useRef({ zoom: 1, panX: 0, panY: 0 });
const onWheel = (e: WheelEvent) => {
  viewportRef.current.zoom *= e.deltaY > 0 ? 0.95 : 1.05;
  const vpt = viewportRef.current;
  canvas.setViewportTransform([vpt.zoom, 0, 0, vpt.zoom, vpt.panX, vpt.panY]);
  canvas.requestRenderAll(); // Fabric redraws without React
};
```

### Three.js
```typescript
// BAD
const [cameraPos, setCameraPos] = useState(new Vector3(0, 5, 10));
useFrame(() => {
  setCameraPos(camera.position.clone()); // React render every frame!
});

// GOOD
const cameraPosRef = useRef(new Vector3(0, 5, 10));
useFrame(() => {
  cameraPosRef.current.copy(camera.position); // No React render
  // UI that needs camera pos reads from ref
  hudRef.current?.updatePosition(cameraPosRef.current);
});
```

## Detection Nuances

### True Positives
- `useState` for zoom/pan/scroll in a canvas editor component
- Store subscription for mouse position in overlay component
- `useState` for camera angle in a 3D viewport
- Store subscription for timeline currentTime in video editor

### False Positives
- `useState` for zoom that only changes on button click (not continuous)
- Store subscription for position that only updates on drag end
- `useState` for scroll position read only in event handler (not in render)
- Values wrapped in `useDeferredValue` (intentionally deferred)

## Migration Checklist

1. Identify the high-frequency value (zoom, pan, mouse, scroll, camera, time)
2. Check all components subscribing to this value
3. For each component:
   a. Does it use the value in its JSX/render output? → Use `useRef` + DOM manipulation
   b. Does it use the value in a side effect only? → Use `store.subscribe`
   c. Does it need the value for event calculations? → Use `store.getState()` at call time
4. Remove the `useState`/`useStore` call
5. Add `useRef` + `useEffect` with `subscribe` or direct DOM updates
6. Verify the component no longer re-renders on value change (React DevTools Profiler)
