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

const variants = ["disabled", "readOnly", "item"] as const
</script>

<template>
  <div data-slot="stack">
    <Combobox
      v-for="variant in variants"
      :key="variant"
      :default-value="variant === 'item' ? null : 'fr'"
      :item-to-label="countryLabel"
      :disabled="variant === 'disabled'"
      :read-only="variant === 'readOnly'"
    >
      <div data-slot="stack">
        <ComboboxLabel>
          {{
            variant === "disabled"
              ? "Billing country"
              : variant === "readOnly"
                ? "Shipping from"
                : "Shipping to"
          }}
        </ComboboxLabel>
        <div data-slot="row">
          <ComboboxInput placeholder="Search countries…" />
          <ComboboxTrigger aria-label="Show countries">
            <ChevronDownIcon aria-hidden="true" />
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
            :disabled="country.value === 'dk'"
          >
            {{ country.label }}
            <ComboboxItemIndicator>
              <CheckIcon aria-hidden="true" />
            </ComboboxItemIndicator>
          </ComboboxItem>
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  </div>
</template>
