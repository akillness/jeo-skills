"use client"

import * as React from "react"
import {
  createCheckboxController,
  type CheckedState,
} from "@ui-sdk/core/checkbox"
import { Checkbox, CheckboxIndicator } from "@ui-sdk/react/checkbox"
import { CheckIcon } from "lucide-react"
import { useLog } from "../../../shared/react/log"

function Example() {
  const log = useLog()
  const [updates] = React.useState(() => createCheckboxController())
  const [checked, setChecked] = React.useState<CheckedState>(false)

  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <button type="button" onClick={() => updates.toggle()}>
          Toggle
        </button>
      </div>
      <label data-slot="label">
        <Checkbox
          checked={checked}
          onCheckedChange={(next, details) => {
            setChecked(next)
            log(
              `${next === "indeterminate" ? "Mixed" : next ? "Checked" : "Unchecked"} (${details.reason})`
            )
          }}
          controller={updates}
        >
          <CheckboxIndicator>
            <CheckIcon aria-hidden="true" />
          </CheckboxIndicator>
        </Checkbox>
        Email me about product updates
      </label>
    </div>
  )
}

export { Example }
