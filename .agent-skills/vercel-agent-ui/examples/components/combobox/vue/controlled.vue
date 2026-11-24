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
import { ref } from "vue"
import { useLog } from "../../../shared/vue/log"

const countries = [
  { value: "ar", label: "Argentina" },
  { value: "au", label: "Australia" },
  { value: "at", label: "Austria" },
  { value: "be", label: "Belgium" },
  { value: "br", label: "Brazil" },
  { value: "ca", label: "Canada" },
  { value: "cl", label: "Chile" },
  { value: "dk", label: "Denmark" },
  { value: "fi", label: "Finland" },
  { value: "fr", label: "France" },
  { value: "de", label: "Germany" },
  { value: "gr", label: "Greece" },
  { value: "jp", label: "Japan" },
  { value: "nl", label: "Netherlands" },
  { value: "es", label: "Spain" },
  { value: "se", label: "Sweden" },
  { value: "ch", label: "Switzerland" },
]

const countryLabel = (value: string) =>
  countries.find((country) => country.value === value)?.label ?? value

const value = ref<string | null>("fr")
const query = ref("France")
const open = ref(false)
const log = useLog()
</script>

<template>
  <div data-slot="stack">
    <div data-slot="controls">
      <button type="button" @click="value = 'jp'">Choose Japan</button>
      <button type="button" @click="open = true">Open</button>
    </div>
    <Combobox
      v-model:value="value"
      v-model:query="query"
      v-model:open="open"
      :item-to-label="countryLabel"
      debug
      @value-change="
        (next: unknown, details: { reason: string }) =>
          log(`value: ${next} (${details.reason})`)
      "
      @query-change="
        (next: string, details: { reason: string }) =>
          log(`query: “${next}” (${details.reason})`)
      "
      @open-change="
        (next: boolean, details: { reason: string }) =>
          log(`open: ${next} (${details.reason})`)
      "
    >
      <div data-slot="stack">
        <ComboboxLabel>Country</ComboboxLabel>
        <div data-slot="row">
          <ComboboxInput placeholder="Search countries…" />
          <ComboboxTrigger aria-label="Show countries">
            <ChevronDownIcon />
          </ComboboxTrigger>
        </div>
      </div>
      <ComboboxContent>
        <ComboboxEmpty>No countries found.</ComboboxEmpty>
        <ComboboxList>
          <ComboboxItem
            v-for="country in countries"
            :key="country.value"
            :value="country.value"
            :label="country.label"
          >
            {{ country.label }}
            <ComboboxItemIndicator>
              <CheckIcon />
            </ComboboxItemIndicator>
          </ComboboxItem>
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  </div>
</template>
