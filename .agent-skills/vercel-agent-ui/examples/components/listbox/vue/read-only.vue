<script setup lang="ts">
import { CheckIcon } from "@lucide/vue"
import { Listbox, ListboxItem, ListboxItemIndicator } from "@ui-sdk/vue/listbox"

const frameworks = [
  { value: "next", label: "Next.js" },
  { value: "remix", label: "Remix" },
  { value: "astro", label: "Astro" },
  { value: "nuxt", label: "Nuxt" },
  { value: "sveltekit", label: "SvelteKit" },
]
</script>

<template>
  <Listbox read-only default-value="nuxt" aria-label="Framework">
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
