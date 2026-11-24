import {
  visibleWaterfallRows,
  Waterfall,
  WaterfallBar,
  WaterfallIndicator,
  WaterfallRow,
  WaterfallRowHeader,
  type WaterfallData,
} from "@ui-sdk/solid/waterfall"
import { createMemo, createSignal, For, Show } from "solid-js"

const trace: WaterfallData = Array.from({ length: 2000 }, (_, job) => ({
  value: `job-${job + 1}`,
  label: `job ${job + 1}`,
  start: job * 4,
  duration: 60,
  children: Array.from({ length: 4 }, (_, step) => ({
    value: `job-${job + 1}/step-${step + 1}`,
    label: `step ${step + 1}`,
    start: job * 4 + step * 15,
    duration: 15,
  })),
}))

const row = 32
const height = 288

function Example() {
  let scroller: HTMLDivElement | undefined
  const [scrollTop, setScrollTop] = createSignal(0)
  const [expanded, setExpanded] = createSignal(["job-1"])
  const rows = createMemo(() => visibleWaterfallRows(trace, expanded()))
  const start = () => Math.max(0, Math.floor(scrollTop() / row) - 4)
  const end = () =>
    Math.min(rows().length, Math.ceil((scrollTop() + height) / row) + 4)
  return (
    <div
      data-slot="scroll"
      ref={scroller}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
    >
      <Waterfall
        aria-label="Build trace"
        aria-rowcount={rows().length}
        items={trace}
        range={[0, 400]}
        expanded={expanded()}
        onExpandedChange={setExpanded}
        onHighlight={(_value, { index }) => {
          const el = scroller
          if (!el) {
            return
          }
          const top = index * row
          if (top < el.scrollTop) {
            el.scrollTop = top
          } else if (top + row > el.scrollTop + el.clientHeight) {
            el.scrollTop = top + row - el.clientHeight
          }
          setScrollTop(el.scrollTop)
        }}
        style={{ height: `${rows().length * row}px` }}
      >
        <For
          each={rows().slice(start(), end())}
          keyed={(visible) => visible.item.value}
        >
          {(visible) => (
            <WaterfallRow
              value={visible().item.value}
              aria-rowindex={visible().index + 1}
              style={{ top: `${visible().index * row}px` }}
            >
              <WaterfallRowHeader>
                <Show when={visible().item.children}>
                  <WaterfallIndicator>
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <path d="m9 18 6-6-6-6" />
                    </svg>
                  </WaterfallIndicator>
                </Show>
                {visible().item.label}
              </WaterfallRowHeader>
              <WaterfallBar />
            </WaterfallRow>
          )}
        </For>
      </Waterfall>
    </div>
  )
}

export { Example }
