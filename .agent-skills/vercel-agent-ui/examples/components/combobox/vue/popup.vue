<script setup lang="ts">
import { CheckIcon, ChevronDownIcon, SearchIcon } from "@lucide/vue"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValue,
} from "@ui-sdk/vue/combobox"
import { computed, ref, type ComponentPublicInstance } from "vue"

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

const trigger = ref<ComponentPublicInstance | null>(null)
const button = computed(
  () => (trigger.value?.$el ?? null) as HTMLButtonElement | null
)
const query = ref("")
</script>

<template>
  <Combobox
    v-model:query="query"
    default-value="jp"
    :item-to-label="countryLabel"
    @open-change="(open: boolean) => open && (query = '')"
    @open-change-complete="(open: boolean) => !open && button?.focus()"
  >
    <ComboboxTrigger ref="trigger" aria-label="Country">
      <span>
        <ComboboxValue v-slot="{ state }">{{
          state.label || "Select a country"
        }}</ComboboxValue>
      </span>
      <ChevronDownIcon aria-hidden="true" />
    </ComboboxTrigger>
    <ComboboxContent :anchor="button">
      <div data-slot="row">
        <SearchIcon aria-hidden="true" />
        <ComboboxInput
          autofocus
          aria-label="Search countries"
          placeholder="Search…"
        />
      </div>
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
            <CheckIcon aria-hidden="true" />
          </ComboboxItemIndicator>
        </ComboboxItem>
      </ComboboxList>
    </ComboboxContent>
  </Combobox>
</template>
