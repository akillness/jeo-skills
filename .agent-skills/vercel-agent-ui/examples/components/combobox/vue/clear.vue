<script setup lang="ts">
import { CheckIcon, ChevronDownIcon, XIcon } from "@lucide/vue"
import {
  Combobox,
  ComboboxClear,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxLabel,
  ComboboxList,
  ComboboxTrigger,
} from "@ui-sdk/vue/combobox"
import { ref } from "vue"
import { useLog } from "../../../shared/vue/log"

const frameworks = [
  { value: "next", label: "Next.js" },
  { value: "sveltekit", label: "SvelteKit" },
  { value: "nuxt", label: "Nuxt" },
  { value: "remix", label: "Remix" },
  { value: "astro", label: "Astro" },
  { value: "solidstart", label: "SolidStart" },
  { value: "qwik", label: "Qwik City" },
]

const frameworkLabel = (value: string) =>
  frameworks.find((framework) => framework.value === value)?.label ?? value

const log = useLog()
const value = ref<string | null>("sveltekit")
</script>

<template>
  <Combobox
    v-model:value="value"
    :item-to-label="frameworkLabel"
    @value-change="
      (next: string | null, details: { reason: string }) =>
        log(`${next ? frameworkLabel(next) : 'Cleared'} (${details.reason})`)
    "
  >
    <div data-slot="stack">
      <ComboboxLabel>Framework</ComboboxLabel>
      <div data-slot="row">
        <ComboboxInput placeholder="Select a framework" />
        <ComboboxClear aria-label="Clear framework">
          <XIcon aria-hidden="true" />
        </ComboboxClear>
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
