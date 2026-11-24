<script setup lang="ts">
import { createLocalStorage, createPreference } from "@ui-sdk/core"
import { Button } from "@ui-sdk/vue/button"
import { Preferences, usePreference } from "@ui-sdk/vue/preferences"
import { useLog } from "../../../shared/vue/log"

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

<template>
  <Preferences :preferences="[view]">
    <div data-slot="stack">
      <div data-slot="controls" role="group" aria-label="View">
        <Button
          :aria-pressed="state.value === 'list'"
          @click="choose('list', $event)"
          >List</Button
        >
        <Button
          :aria-pressed="state.value === 'grid'"
          @click="choose('grid', $event)"
          >Grid</Button
        >
      </div>
      <ul data-slot="files" aria-label="Files">
        <li v-for="file in files" :key="file.name">
          <span>{{ file.name }}</span>
          <span data-slot="hint">{{ file.detail }}</span>
        </li>
      </ul>
    </div>
  </Preferences>
</template>
