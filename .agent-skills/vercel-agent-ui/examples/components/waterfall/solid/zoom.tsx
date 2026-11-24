import {
  Waterfall,
  WaterfallAxis,
  WaterfallBar,
  WaterfallColumnHeader,
  WaterfallHeaderRow,
  WaterfallIndicator,
  WaterfallRow,
  WaterfallRowHeader,
  WaterfallTick,
  type WaterfallAxisState,
  type WaterfallData,
} from "@ui-sdk/solid/waterfall"
import { createSignal, For, Show } from "solid-js"

const trace: WaterfallData = [
  {
    value: "render",
    label: "render /dashboard",
    start: 0,
    duration: 1200,
    children: [
      { value: "session", label: "session", start: 20, duration: 80 },
      { value: "metrics", label: "metrics", start: 110, duration: 640 },
      { value: "alerts", label: "alerts", start: 110, duration: 260 },
      { value: "html", label: "stream html", start: 760, duration: 420 },
    ],
  },
]

const spans = [trace[0], ...trace[0].children!]
const full: [number, number] = [0, 1200]

function zoomed([start, end]: [number, number], factor: number) {
  const center = (start + end) / 2
  const half = Math.min(((end - start) * factor) / 2, full[1] / 2)
  const from = Math.min(Math.max(full[0], center - half), full[1] - half * 2)
  return [from, from + half * 2] as [number, number]
}

function Example() {
  const [range, setRange] = createSignal(full)
  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <button type="button" onClick={() => setRange(zoomed(range(), 0.5))}>
          Zoom In
        </button>
        <button type="button" onClick={() => setRange(zoomed(range(), 2))}>
          Zoom Out
        </button>
        <button type="button" onClick={() => setRange(full)}>
          Reset
        </button>
      </div>
      <Waterfall
        aria-label="Dashboard render"
        items={trace}
        range={range()}
        defaultExpanded={["render"]}
        defaultValue="metrics"
      >
        <WaterfallHeaderRow>
          <WaterfallColumnHeader>Span</WaterfallColumnHeader>
          <WaterfallColumnHeader aria-label="Timeline">
            <WaterfallAxis>
              {(state: WaterfallAxisState) => (
                <For each={state.ticks} keyed={(tick) => tick.time}>
                  {(tick) => (
                    <WaterfallTick time={tick().time}>
                      {tick().label}
                    </WaterfallTick>
                  )}
                </For>
              )}
            </WaterfallAxis>
          </WaterfallColumnHeader>
        </WaterfallHeaderRow>
        <For each={spans}>
          {(span) => (
            <WaterfallRow value={span.value}>
              <WaterfallRowHeader>
                <Show when={span.children}>
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
                {span.label}
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
