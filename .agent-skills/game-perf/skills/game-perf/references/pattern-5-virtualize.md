# Pattern 5: Large List Without Virtualization

## The Problem

수백 개 이상의 아이템을 `.map()`으로 한 번에 DOM에 렌더링하면 DOM 노드 수가
폭증하여 스크롤 시 프레임 드롭이 발생합니다.

Rendering 100+ items in a `.map()` loop without virtualization creates
hundreds of DOM nodes, causing slow paint times and scroll jank.

## Why It Kills FPS

Each DOM node costs:
- **Memory**: ~0.5KB per node (element + text + attributes)
- **Layout**: ~0.05ms per node during reflow
- **Paint**: ~0.01ms per node per frame
- **Composite**: ~0.005ms per node during scroll

| Items | DOM Nodes | Memory  | Paint/frame | Scroll FPS |
|-------|-----------|---------|-------------|------------|
| 50    | ~200      | 100KB   | 2ms         | 60fps      |
| 200   | ~800      | 400KB   | 8ms         | 55fps      |
| 500   | ~2000     | 1MB     | 20ms        | 30fps      |
| 1000  | ~4000     | 2MB     | 40ms        | 15fps      |
| 5000  | ~20000    | 10MB    | 200ms       | 3fps       |

With virtualization, only visible items (~10-20) are rendered regardless
of total count. 5000 items render like 20.

## Real-World Example: Davinci Layer Panel

Davinci의 레이어 패널에는 수백 개의 레이어가 표시됩니다. 초기에는 모든 레이어를
`.map()`으로 렌더링하여 200개 이상에서 스크롤이 버벅거렸습니다.

```typescript
// BEFORE — all layers rendered as DOM nodes
function LayerPanel({ layers }: Props) {
  return (
    <div className="overflow-y-auto h-full">
      {layers.map(layer => (
        <LayerItem
          key={layer.id}
          layer={layer}
          isSelected={selectedIds.includes(layer.id)}
          onSelect={() => selectLayer(layer.id)}
        />
      ))}
    </div>
  );
}
// 200 layers = 200 LayerItem components = ~800 DOM nodes
// Scroll performance: ~25fps with visible jank
```

```typescript
// AFTER — @tanstack/react-virtual
import { useVirtualizer } from '@tanstack/react-virtual';

function LayerPanel({ layers }: Props) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: layers.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36, // 각 레이어 항목의 예상 높이 (px)
    overscan: 5,            // 화면 밖 추가 렌더링 (스크롤 부드럽게)
  });

  return (
    <div ref={parentRef} className="overflow-y-auto h-full">
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map(virtualRow => {
          const layer = layers[virtualRow.index];
          return (
            <div
              key={layer.id}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <LayerItem
                layer={layer}
                isSelected={selectedIds.includes(layer.id)}
                onSelect={() => selectLayer(layer.id)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
// 200 layers = ~15 visible LayerItems = ~60 DOM nodes
// Scroll performance: solid 60fps
```

**Result**: 스크롤 시 25fps → 60fps, DOM 노드 ~800 → ~60

## Framework-Specific Variants

### @tanstack/react-virtual (Recommended)
```typescript
import { useVirtualizer } from '@tanstack/react-virtual';

// Vertical list
const rowVirtualizer = useVirtualizer({
  count: items.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 50,
  overscan: 5,
});

// Grid (2D virtualization)
const rowVirtualizer = useVirtualizer({ count: rows, ... });
const colVirtualizer = useVirtualizer({
  count: cols,
  horizontal: true,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 100,
});
```

### react-window (Lighter, simpler API)
```typescript
import { FixedSizeList } from 'react-window';

function ItemList({ items }) {
  const Row = ({ index, style }) => (
    <div style={style}>
      <ItemCard item={items[index]} />
    </div>
  );

  return (
    <FixedSizeList
      height={400}
      width="100%"
      itemCount={items.length}
      itemSize={50}
    >
      {Row}
    </FixedSizeList>
  );
}
```

### react-virtuoso (Auto-sizing, grouping)
```typescript
import { Virtuoso } from 'react-virtuoso';

function ItemList({ items }) {
  return (
    <Virtuoso
      style={{ height: 400 }}
      totalCount={items.length}
      itemContent={(index) => <ItemCard item={items[index]} />}
    />
  );
}
```

### Game Entity Lists (PixiJS / Phaser)
```typescript
// BAD — rendering all entity health bars in React
{entities.map(e => (
  <HealthBar key={e.id} hp={e.hp} x={e.x} y={e.y} />
))}

// GOOD — canvas/WebGL rendering for game entities
// Only use React for the HUD/UI layer, not per-entity rendering
function GameRenderer({ entities }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;

    function drawFrame() {
      ctx.clearRect(0, 0, width, height);
      // Draw only visible entities (camera culling)
      const visible = entities.filter(e =>
        e.x > camera.left && e.x < camera.right &&
        e.y > camera.top && e.y < camera.bottom
      );
      visible.forEach(e => drawHealthBar(ctx, e));
      requestAnimationFrame(drawFrame);
    }
    drawFrame();
  }, [entities]);

  return <canvas ref={canvasRef} />;
}
```

## Detection Nuances

### True Positives
- `.map()` returning JSX inside a scroll container (`overflow-y: auto/scroll`)
- Array name suggests large collection: `items`, `layers`, `entities`, `rows`, `data`, `list`, `results`, `records`
- No import of virtualization library in the file
- Parent has fixed height (necessary for scrolling)

### False Positives
- `.map()` on a small array (tabs, nav items, toolbar buttons — typically < 20)
- `.map()` inside `useMemo` for a non-scrollable display (grid that shows all items)
- File already imports `@tanstack/react-virtual`, `react-window`, or `react-virtuoso`
- Items are in an accordion/tab where only one group is visible
- The `.map()` is inside a canvas rendering function (not DOM)

## When NOT to Virtualize

Virtualization adds complexity. Skip it when:

1. **< 50 items**: DOM handles this fine. Don't over-engineer.
2. **Non-scrollable layout**: All items visible without scrolling.
3. **Complex item interactions**: Drag-and-drop between items is harder with virtualization.
4. **Dynamic heights with animations**: Virtualization + height transitions are tricky.
5. **SSR requirements**: Virtualized lists render empty on server.

## Migration Checklist

1. Identify the scroll container (element with `overflow-y: auto/scroll` and fixed height)
2. Count or estimate the maximum number of items
3. Choose a library:
   - `@tanstack/react-virtual` — most flexible, works with any layout
   - `react-window` — simpler API, good for fixed-size items
   - `react-virtuoso` — auto-sizing, grouping, SSR support
4. Add `ref` to the scroll container
5. Replace `.map()` with virtualizer's render method
6. Add `position: absolute` + `transform: translateY()` to each item
7. Set `estimateSize` (or exact size if fixed)
8. Test scroll performance with the maximum expected item count
9. Add `overscan` (5-10) for smoother fast scrolling
