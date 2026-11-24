"use client"

import {
  createWaterfallController,
  visibleWaterfallRows,
  Waterfall,
  WaterfallAxis,
  WaterfallBar,
  WaterfallColumnHeader,
  WaterfallHeaderRow,
  WaterfallIndicator,
  WaterfallRow,
  WaterfallRowHeader,
  type WaterfallData,
} from "@ui-sdk/react/waterfall"
import { ChevronRightIcon } from "lucide-react"
import * as React from "react"
import { useLog } from "../../../shared/react/log"

const trace: WaterfallData = [
  {
    value: "checkout",
    label: "POST /checkout",
    start: 0,
    duration: 920,
    children: [
      { value: "auth", label: "auth.verify", start: 12, duration: 64 },
      {
        value: "cart",
        label: "cart.load",
        start: 80,
        duration: 310,
        children: [
          {
            value: "cart-db",
            label: "db.query carts",
            start: 96,
            duration: 140,
          },
          {
            value: "prices",
            label: "pricing.quote",
            start: 240,
            duration: 136,
          },
        ],
      },
      {
        value: "payment",
        label: "payments.charge",
        start: 400,
        duration: 470,
        children: [
          { value: "fraud", label: "fraud.score", start: 410, duration: 120 },
          {
            value: "gateway",
            label: "gateway.capture",
            start: 540,
            duration: 310,
          },
        ],
      },
      { value: "email", label: "email.enqueue", start: 880, duration: 30 },
    ],
  },
]

const milliseconds = {
  style: "unit",
  unit: "millisecond",
  unitDisplay: "narrow",
} as const

function Example() {
  const log = useLog()
  const [spans] = React.useState(() => createWaterfallController())
  const [expanded, setExpanded] = React.useState(["checkout"])
  const [value, setValue] = React.useState<string | null>(null)
  const rows = visibleWaterfallRows(trace, expanded)
  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <button type="button" onClick={() => spans.expandAll()}>
          Expand All
        </button>
        <button type="button" onClick={() => spans.collapseAll()}>
          Collapse All
        </button>
      </div>
      <Waterfall
        aria-label="Checkout trace"
        items={trace}
        controller={spans}
        expanded={expanded}
        onExpandedChange={setExpanded}
        value={value}
        onValueChange={(next) => {
          setValue(next)
          log(`Selected ${next}`)
        }}
        format={milliseconds}
      >
        <WaterfallHeaderRow>
          <WaterfallColumnHeader>Span</WaterfallColumnHeader>
          <WaterfallColumnHeader aria-label="Timeline">
            <WaterfallAxis />
          </WaterfallColumnHeader>
        </WaterfallHeaderRow>
        {rows.map(({ item }) => (
          <WaterfallRow key={item.value} value={item.value}>
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
