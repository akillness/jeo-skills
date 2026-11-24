<script setup lang="ts">
import { CheckIcon, ChevronDownIcon } from "@lucide/vue"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxLabel,
  ComboboxList,
  ComboboxTrigger,
} from "@ui-sdk/vue/combobox"

const frameworks = [
  { value: "next", label: "Next.js" },
  { value: "sveltekit", label: "SvelteKit" },
  { value: "nuxt", label: "Nuxt" },
  { value: "remix", label: "Remix" },
  { value: "astro", label: "Astro" },
  { value: "solidstart", label: "SolidStart" },
  { value: "qwik", label: "Qwik City" },
]
</script>

<template>
  <Combobox>
    <div data-slot="stack">
      <ComboboxLabel>Framework</ComboboxLabel>
      <div data-slot="row">
        <ComboboxInput placeholder="Select a framework" />
        <ComboboxTrigger aria-label="Show frameworks">
          <ChevronDownIcon aria-hidden="true" />
        </ComboboxTrigger>
      </div>
    </div>
    <ComboboxContent>
      <ComboboxEmpty>No frameworks found.</ComboboxEmpty>
      <ComboboxList>
        <ComboboxItem
          v-for="framework in frameworks"
          :key="framework.value"
          :value="framework.value"
          :label="framework.label"
        >
          {{ framework.label }}
          <ComboboxItemIndicator>
            <CheckIcon aria-hidden="true" />
          </ComboboxItemIndicator>
        </ComboboxItem>
      </ComboboxList>
    </ComboboxContent>
  </Combobox>
</template>
