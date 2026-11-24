import { createLocalStorage, createPreference } from "@ui-sdk/core"
import { Button } from "@ui-sdk/solid/button"
import { Preferences, usePreference } from "@ui-sdk/solid/preferences"
import { For } from "solid-js"
import { useLog } from "../../../shared/solid/log"

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
  const state = usePreference(view)

  const choose = (next: "list" | "grid", event: MouseEvent) => {
    view.set(next, { reason: "press", event })
    log(`Saved the ${next} view`)
  }

  return (
    <Preferences preferences={[view]}>
      <div data-slot="stack">
        <div data-slot="controls" role="group" aria-label="View">
          <Button
            aria-pressed={state().value === "list" ? "true" : "false"}
            onClick={(event) => choose("list", event)}
          >
            List
          </Button>
          <Button
            aria-pressed={state().value === "grid" ? "true" : "false"}
            onClick={(event) => choose("grid", event)}
          >
            Grid
          </Button>
        </div>
        <ul data-slot="files" aria-label="Files">
          <For each={files}>
            {(file) => (
              <li>
                <span>{file.name}</span>
                <span data-slot="hint">{file.detail}</span>
              </li>
            )}
          </For>
        </ul>
      </div>
    </Preferences>
  )
}

export { Example }
