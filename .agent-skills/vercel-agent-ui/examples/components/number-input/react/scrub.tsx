"use client"

import {
  NumberInput,
  NumberInputControl,
  NumberInputGroup,
  NumberInputScrubArea,
  NumberInputScrubAreaCursor,
} from "@ui-sdk/react/number-input"
import { MoveHorizontalIcon } from "lucide-react"
import * as React from "react"
import { useLog } from "../../../shared/react/log"

const fields = [
  { label: "X position", handle: "X", defaultValue: 120 },
  { label: "Y position", handle: "Y", defaultValue: 48 },
  { label: "Width", handle: "W", defaultValue: 320, min: 0 },
  { label: "Height", handle: "H", defaultValue: 240, min: 0 },
]

function Example() {
  const log = useLog()
  const title = React.useId()

  return (
    <div data-slot="card" role="group" aria-labelledby={title}>
      <h3 id={title}>Frame</h3>
      <div data-slot="grid">
        {fields.map(({ label, handle, ...options }) => (
          <NumberInput
            key={label}
            {...options}
            onValueCommit={(value) => log(`${label} ${value ?? "empty"}`)}
          >
            <NumberInputGroup>
              <NumberInputScrubArea pixelsPerStep={1}>
                <span aria-hidden="true">{handle}</span>
                <NumberInputScrubAreaCursor>
                  <MoveHorizontalIcon aria-hidden="true" />
                </NumberInputScrubAreaCursor>
              </NumberInputScrubArea>
              <NumberInputControl aria-label={label} />
            </NumberInputGroup>
          </NumberInput>
        ))}
      </div>
    </div>
  )
}

export { Example }
