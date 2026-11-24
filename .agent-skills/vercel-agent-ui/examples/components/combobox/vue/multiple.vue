<script setup lang="ts">
import { CheckIcon, ChevronDownIcon, XIcon } from "@lucide/vue"
import {
  Combobox,
  ComboboxChip,
  ComboboxChipRemove,
  ComboboxChips,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxLabel,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValue,
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

const frameworkLabel = (value: string) =>
  frameworks.find((framework) => framework.value === value)?.label ?? value
</script>

<template>
  <Combobox
    multiple
    :default-value="['next', 'astro']"
    :item-to-label="frameworkLabel"
  >
    <div data-slot="stack">
      <ComboboxLabel>Frameworks</ComboboxLabel>
      <div data-slot="row">
        <ComboboxChips>
          <ComboboxValue v-slot="{ state }">
            <ComboboxChip
              v-for="(value, index) in state.value as string[]"
              :key="value"
              :value="value"
            >
              {{ state.labels[index] }}
              <ComboboxChipRemove :aria-label="`Remove ${state.labels[index]}`">
                <XIcon aria-hidden="true" />
              </ComboboxChipRemove>
            </ComboboxChip>
          </ComboboxValue>
          <ComboboxInput placeholder="Add a framework…" />
        </ComboboxChips>
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
