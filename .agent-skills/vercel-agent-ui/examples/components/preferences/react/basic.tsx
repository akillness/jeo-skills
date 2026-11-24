"use client"

import { createLocalStorage, createPreference } from "@ui-sdk/core"
import { Button } from "@ui-sdk/react/button"
import { Preferences, usePreference } from "@ui-sdk/react/preferences"
import { useLog } from "../../../shared/react/log"

const view = createPreference({
  values: ["list", "grid"],
  defaultValue: "list",
  attribute: "data-view",
  storage: createLocalStorage("ui-sdk-preferences-view"),
})

const files = [
  { name: "Q3 roadmap.pdf", detail: "2.4 MB" },
  { name: "Launch checklist.md", detail: "12 KB" },
  { name: "Offsite photos", detail: "24 items" },
  { name: "Brand assets.zip", detail: "18 MB" },
]

function Example() {
  const log = useLog()
  const { value } = usePreference(view)

  const choose = (next: "list" | "grid", event: React.MouseEvent) => {
    view.set(next, { reason: "press", event: event.nativeEvent })
    log(`Saved the ${next} view`)
  }

  return (
    <Preferences preferences={[view]}>
      <div data-slot="stack">
        <div data-slot="controls" role="group" aria-label="View">
          <Button
            aria-pressed={value === "list"}
            onClick={(event) => choose("list", event)}
          >
            List
          </Button>
          <Button
            aria-pressed={value === "grid"}
            onClick={(event) => choose("grid", event)}
          >
            Grid
          </Button>
        </div>
        <ul data-slot="files" aria-label="Files">
          {files.map((file) => (
            <li key={file.name}>
              <span>{file.name}</span>
              <span data-slot="hint">{file.detail}</span>
            </li>
          ))}
        </ul>
      </div>
    </Preferences>
  )
}

export { Example }
