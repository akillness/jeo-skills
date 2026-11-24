<script lang="ts">
  import { createLocalStorage, createPreference } from "@ui-sdk/core"
  import { Button } from "@ui-sdk/svelte/button"
  import { Preferences, usePreference } from "@ui-sdk/svelte/preferences"
  import { useLog } from "../../../shared/svelte/log"

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

  const log = useLog()
  const state = usePreference(view)

  function choose(next: "list" | "grid", event: MouseEvent) {
    view.set(next, { reason: "press", event })
    log(`Saved the ${next} view`)
  }
</script>

<Preferences preferences={[view]}>
  <div data-slot="stack">
    <div data-slot="controls" role="group" aria-label="View">
      <Button
        aria-pressed={state.current.value === "list"}
        onclick={(event) => choose("list", event)}
      >
        List
      </Button>
      <Button
        aria-pressed={state.current.value === "grid"}
        onclick={(event) => choose("grid", event)}
      >
        Grid
      </Button>
    </div>
    <ul data-slot="files" aria-label="Files">
      {#each files as file (file.name)}
        <li>
          <span>{file.name}</span>
          <span data-slot="hint">{file.detail}</span>
        </li>
      {/each}
    </ul>
  </div>
</Preferences>
