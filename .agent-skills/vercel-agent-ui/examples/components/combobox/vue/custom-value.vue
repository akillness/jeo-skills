<script setup lang="ts">
import { CheckIcon } from "@lucide/vue"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxLabel,
  ComboboxList,
} from "@ui-sdk/vue/combobox"
import { ref } from "vue"
import { useLog } from "../../../shared/vue/log"

const titles = [
  "Designer",
  "Engineer",
  "Engineering manager",
  "Product manager",
  "Researcher",
]

const log = useLog()
const value = ref<string | null>(null)
</script>

<template>
  <Combobox
    v-model:value="value"
    allow-custom-value
    @value-change="
      (next: string | null, details: { reason: string }) =>
        log(`${next ? `“${next}”` : 'No title'} (${details.reason})`)
    "
  >
    <div data-slot="stack">
      <ComboboxLabel>Job title</ComboboxLabel>
      <ComboboxInput placeholder="Type any title…" />
    </div>
    <ComboboxContent>
      <ComboboxEmpty v-slot="{ state }">
        <template v-if="state.empty"
          >Press Enter to use “{{ state.query }}”.</template
        >
      </ComboboxEmpty>
      <ComboboxList>
        <ComboboxItem v-for="title in titles" :key="title" :value="title">
          {{ title }}
          <ComboboxItemIndicator>
            <CheckIcon aria-hidden="true" />
          </ComboboxItemIndicator>
        </ComboboxItem>
      </ComboboxList>
    </ComboboxContent>
  </Combobox>
</template>
