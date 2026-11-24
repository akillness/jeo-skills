"use client"

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
  type WaterfallData,
} from "@ui-sdk/react/waterfall"
import { ChevronRightIcon } from "lucide-react"
import * as React from "react"

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
  const [range, setRange] = React.useState(full)
  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <button type="button" onClick={() => setRange(zoomed(range, 0.5))}>
          Zoom In
        </button>
        <button type="button" onClick={() => setRange(zoomed(range, 2))}>
          Zoom Out
        </button>
        <button type="button" onClick={() => setRange(full)}>
          Reset
        </button>
      </div>
      <Waterfall
        aria-label="Dashboard render"
        items={trace}
        range={range}
        defaultExpanded={["render"]}
        defaultValue="metrics"
      >
        <WaterfallHeaderRow>
          <WaterfallColumnHeader>Span</WaterfallColumnHeader>
          <WaterfallColumnHeader aria-label="Timeline">
            <WaterfallAxis>
              {({ ticks }) =>
                ticks.map((tick) => (
                  <WaterfallTick key={tick.time} time={tick.time}>
                    {tick.label}
                  </WaterfallTick>
                ))
              }
            </WaterfallAxis>
          </WaterfallColumnHeader>
        </WaterfallHeaderRow>
        {spans.map((span) => (
          <WaterfallRow key={span.value} value={span.value}>
            <WaterfallRowHeader>
              {span.children && (
                <WaterfallIndicator>
                  <ChevronRightIcon aria-hidden="true" />
                </WaterfallIndicator>
              )}
              {span.label}
            </WaterfallRowHeader>
            <WaterfallBar />
          </WaterfallRow>
        ))}
      </Waterfall>
    </div>
  )
}

export { Example }
