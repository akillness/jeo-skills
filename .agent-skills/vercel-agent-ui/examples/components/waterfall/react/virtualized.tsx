"use client"

import {
  visibleWaterfallRows,
  Waterfall,
  WaterfallBar,
  WaterfallIndicator,
  WaterfallRow,
  WaterfallRowHeader,
  type WaterfallData,
} from "@ui-sdk/react/waterfall"
import { ChevronRightIcon } from "lucide-react"
import * as React from "react"

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

const range: [number, number] = [0, 400]
const row = 32
const height = 288

function Example() {
  const scroller = React.useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = React.useState(0)
  const [expanded, setExpanded] = React.useState(["job-1"])
  const rows = React.useMemo(
    () => visibleWaterfallRows(trace, expanded),
    [expanded]
  )
  const start = Math.max(0, Math.floor(scrollTop / row) - 4)
  const end = Math.min(rows.length, Math.ceil((scrollTop + height) / row) + 4)
  return (
    <div
      data-slot="scroll"
      ref={scroller}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
    >
      <Waterfall
        aria-label="Build trace"
        aria-rowcount={rows.length}
        items={trace}
        range={range}
        expanded={expanded}
        onExpandedChange={setExpanded}
        onHighlight={(_value, { index }) => {
          const el = scroller.current
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
        style={{ height: rows.length * row }}
      >
        {rows.slice(start, end).map(({ item, index }) => (
          <WaterfallRow
            key={item.value}
            value={item.value}
            aria-rowindex={index + 1}
            style={{ top: index * row }}
          >
            <WaterfallRowHeader>
              {item.children && (
                <WaterfallIndicator>
                  <ChevronRightIcon aria-hidden="true" />
                </WaterfallIndicator>
              )}
              {item.label}
            </WaterfallRowHeader>
            <WaterfallBar />
          </WaterfallRow>
        ))}
      </Waterfall>
    </div>
  )
}

export { Example }
