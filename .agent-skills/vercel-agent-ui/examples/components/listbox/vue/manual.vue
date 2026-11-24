<script setup lang="ts">
import { CheckIcon } from "@lucide/vue"
import { Listbox, ListboxItem, ListboxItemIndicator } from "@ui-sdk/vue/listbox"
import { useLog } from "../../../shared/vue/log"

const frameworks = [
  { value: "next", label: "Next.js" },
  { value: "remix", label: "Remix" },
  { value: "astro", label: "Astro" },
  { value: "nuxt", label: "Nuxt" },
  { value: "sveltekit", label: "SvelteKit" },
]

const log = useLog()
</script>

<template>
  <Listbox
    activation="manual"
    aria-label="Framework"
    @value-change="
      (value, details) => log(`${value ?? 'Nothing'} (${details.reason})`)
    "
  >
    <ListboxItem
      v-for="framework in frameworks"
      :key="framework.value"
      :value="framework.value"
    >
      {{ framework.label }}
      <ListboxItemIndicator>
        <CheckIcon aria-hidden="true" />
      </ListboxItemIndicator>
    </ListboxItem>
  </Listbox>
</template>
