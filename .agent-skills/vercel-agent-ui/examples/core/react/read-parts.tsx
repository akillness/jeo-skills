import * as React from "react"
import { partAttrs, partPresent, partState } from "@ui-sdk/core/testing"
import { readMore } from "./read-more"

function read(open: boolean) {
  const instance = readMore({ id: "more" })
  try {
    if (open) {
      instance.api.toggle()
    }
    const trigger = instance.part("trigger", {})
    const panel = instance.part("panel", {})
    return {
      trigger: JSON.stringify(partAttrs(trigger)),
      state: JSON.stringify(partState(trigger)),
      panel: String(partPresent(panel)),
    }
  } finally {
    instance.destroy()
  }
}

function Example() {
  const [open, setOpen] = React.useState(false)
  const parts = read(open)
  return (
    <div data-slot="stack">
      <label data-slot="label">
        <input
          type="checkbox"
          checked={open}
          onChange={(event) => setOpen(event.target.checked)}
        />
        Open it
      </label>
      <dl data-slot="read-parts-list">
        <dt>partAttrs(trigger)</dt>
        <dd data-attrs>{parts.trigger}</dd>
        <dt>partState(trigger)</dt>
        <dd data-state>{parts.state}</dd>
        <dt>partPresent(panel)</dt>
        <dd data-present>{parts.panel}</dd>
      </dl>
    </div>
  )
}

export { Example }
