"use client"

import * as React from "react"
import { createSwitchController } from "@ui-sdk/core/switch"
import { Switch, SwitchThumb } from "@ui-sdk/react/switch"
import { LoaderCircleIcon } from "lucide-react"
import { useLog } from "../../../shared/react/log"

const save = (_checked: boolean) =>
  new Promise((resolve) => setTimeout(resolve, 800))

function Example() {
  const log = useLog()
  const [backups] = React.useState(() => createSwitchController())
  const [saving, setSaving] = React.useState(false)
  const pending = React.useRef(false)

  return (
    <label data-slot="label">
      Automatic backups
      <Switch
        controller={backups}
        aria-busy={saving}
        onCheckedChange={(next, details) => {
          if (details.reason === "imperative") {
            return
          }
          details.cancel()
          if (pending.current) {
            return
          }
          pending.current = true
          setSaving(true)
          log("Saving…")
          save(next).then(() => {
            pending.current = false
            backups.setChecked(next, { reason: "imperative" })
            setSaving(false)
            log(`Saved: ${next ? "on" : "off"}`)
          })
        }}
      >
        <SwitchThumb>
          {saving && (
            <LoaderCircleIcon data-slot="spinner" aria-hidden="true" />
          )}
        </SwitchThumb>
      </Switch>
    </label>
  )
}

export { Example }
