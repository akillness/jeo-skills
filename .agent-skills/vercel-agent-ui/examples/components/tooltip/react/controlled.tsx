"use client"

import { Checkbox, CheckboxIndicator } from "@ui-sdk/react/checkbox"
import { Tooltip, TooltipContent, TooltipTrigger } from "@ui-sdk/react/tooltip"
import { CheckIcon } from "lucide-react"
import * as React from "react"
import { useLog } from "../../../shared/react/log"

function Example() {
  const log = useLog()
  const [open, setOpen] = React.useState(false)
  const controls = React.useRef<HTMLDivElement>(null)

  return (
    <div data-slot="stack">
      <div data-slot="controls" ref={controls}>
        <label data-slot="label">
          <Checkbox
            checked={open}
            onCheckedChange={(next) => setOpen(next === true)}
          >
            <CheckboxIndicator>
              <CheckIcon aria-hidden="true" />
            </CheckboxIndicator>
          </Checkbox>
          Open
        </label>
      </div>
      <Tooltip
        open={open}
        onOpenChange={(next, details) => {
          const target = details.event?.target
          const inControls =
            target instanceof Node && controls.current?.contains(target)
          if (inControls && details.reason !== "escape-key") {
            return details.cancel()
          }
          setOpen(next)
          log(`${next ? "Opened" : "Closed"} (${details.reason})`)
        }}
      >
        <TooltipTrigger>Export</TooltipTrigger>
        <TooltipContent>Download as CSV</TooltipContent>
      </Tooltip>
    </div>
  )
}

export { Example }
