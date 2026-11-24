"use client"

import * as React from "react"
import { createSwitchController } from "@ui-sdk/core/switch"
import { Switch, SwitchThumb } from "@ui-sdk/react/switch"
import { useLog } from "../../../shared/react/log"

function Example() {
  const log = useLog()
  const [wifi] = React.useState(() => createSwitchController())
  const [checked, setChecked] = React.useState(true)

  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <button type="button" onClick={() => wifi.toggle()}>
          Toggle
        </button>
      </div>
      <label data-slot="label">
        Wi-Fi
        <Switch
          checked={checked}
          onCheckedChange={(next, details) => {
            setChecked(next)
            log(`${next ? "On" : "Off"} (${details.reason})`)
          }}
          controller={wifi}
        >
          <SwitchThumb />
        </Switch>
      </label>
    </div>
  )
}

export { Example }
