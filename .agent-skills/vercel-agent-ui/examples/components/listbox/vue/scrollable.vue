<script setup lang="ts">
import { CheckIcon } from "@lucide/vue"
import { Listbox, ListboxItem, ListboxItemIndicator } from "@ui-sdk/vue/listbox"
import { useLog } from "../../../shared/vue/log"

const timezones = Array.from({ length: 27 }, (_, index) => {
  const offset = index - 12
  const label = `UTC${offset < 0 ? "−" : "+"}${String(Math.abs(offset)).padStart(2, "0")}:00`
  return { value: `utc${offset}`, label }
})

const log = useLog()

function onHighlight(value: unknown, details: { index: number }) {
  if (value) {
    log(
      `Focused ${timezones[details.index].label} (${details.index + 1} of ${timezones.length})`
    )
  }
}
</script>

<template>
  <Listbox default-value="utc9" aria-label="Time zone" @highlight="onHighlight">
    <ListboxItem
      v-for="(zone, index) in timezones"
      :key="zone.value"
      :value="zone.value"
      :index="index"
    >
      {{ zone.label }}
      <ListboxItemIndicator>
        <CheckIcon aria-hidden="true" />
      </ListboxItemIndicator>
    </ListboxItem>
  </Listbox>
</template>
