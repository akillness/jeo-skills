<script setup lang="ts">
import { CheckIcon, XIcon } from "@lucide/vue"
import {
  Combobox,
  ComboboxChip,
  ComboboxChipRemove,
  ComboboxChips,
  ComboboxChipsOverflow,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxLabel,
  ComboboxList,
  ComboboxValue,
} from "@ui-sdk/vue/combobox"

const countries = [
  { value: "ar", label: "Argentina", keywords: ["república argentina"] },
  { value: "au", label: "Australia", keywords: ["oz"] },
  { value: "at", label: "Austria", keywords: ["österreich"] },
  { value: "be", label: "Belgium", keywords: ["belgië", "belgique"] },
  { value: "br", label: "Brazil", keywords: ["brasil"] },
  { value: "ca", label: "Canada" },
  { value: "cl", label: "Chile" },
  { value: "dk", label: "Denmark", keywords: ["danmark"] },
  { value: "fi", label: "Finland", keywords: ["suomi"] },
  { value: "fr", label: "France" },
  { value: "de", label: "Germany", keywords: ["deutschland"] },
  { value: "gr", label: "Greece", keywords: ["hellas", "ελλάδα"] },
  { value: "jp", label: "Japan", keywords: ["nippon", "日本"] },
  { value: "nl", label: "Netherlands", keywords: ["holland", "nederland"] },
  { value: "es", label: "Spain", keywords: ["españa"] },
  { value: "se", label: "Sweden", keywords: ["sverige"] },
  {
    value: "ch",
    label: "Switzerland",
    keywords: ["schweiz", "suisse", "svizzera"],
  },
]

const countryLabel = (value: string) =>
  countries.find((country) => country.value === value)?.label ?? value
</script>

<template>
  <Combobox
    multiple
    :default-value="['fr', 'jp', 'se', 'de', 'ch']"
    :item-to-label="countryLabel"
  >
    <div data-slot="stack">
      <ComboboxLabel>Countries</ComboboxLabel>
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
        <ComboboxChipsOverflow>
          <template #render="{ props, state }">
            <span
              v-bind="props"
              :title="state.labels.join(', ')"
              data-slot="hint"
            >
              +{{ state.count }}
            </span>
          </template>
        </ComboboxChipsOverflow>
        <ComboboxInput placeholder="Add…" />
      </ComboboxChips>
      <p data-slot="hint">
        <ComboboxValue
          :max-labels="2"
          :get-more-label="(count: number) => `${count} more`"
        />
      </p>
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
            <CheckIcon aria-hidden="true" />
          </ComboboxItemIndicator>
        </ComboboxItem>
      </ComboboxList>
    </ComboboxContent>
  </Combobox>
</template>
