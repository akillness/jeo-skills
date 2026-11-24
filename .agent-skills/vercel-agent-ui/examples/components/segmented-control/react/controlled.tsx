"use client"

import {
  createSegmentedControlController,
  SegmentedControl,
  SegmentedControlIndicator,
  SegmentedControlItem,
} from "@ui-sdk/react/segmented-control"
import * as React from "react"
import { useLog } from "../../../shared/react/log"

function Example() {
  const log = useLog()
  const [range] = React.useState(() => createSegmentedControlController())
  const [value, setValue] = React.useState<string | null>("week")

  return (
    <div>
      <div data-slot="controls">
        <button type="button" onClick={() => range.setValue("month")}>
          Show Month
        </button>
      </div>
      <SegmentedControl
        aria-label="Range"
        value={value}
        onValueChange={(next, details) => {
          setValue(next)
          log(`value: ${next} (${details.reason})`)
        }}
        controller={range}
      >
        <SegmentedControlIndicator />
        <SegmentedControlItem value="day">Day</SegmentedControlItem>
        <SegmentedControlItem value="week">Week</SegmentedControlItem>
        <SegmentedControlItem value="month">Month</SegmentedControlItem>
      </SegmentedControl>
    </div>
  )
}

export { Example }
