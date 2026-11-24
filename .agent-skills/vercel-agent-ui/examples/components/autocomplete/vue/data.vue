<script setup lang="ts">
import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteEmpty,
  AutocompleteGroup,
  AutocompleteGroupLabel,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteLabel,
  AutocompleteList,
  AutocompleteSeparator,
} from "@ui-sdk/vue/autocomplete"

const fruitGroups = [
  {
    label: "Tree fruits",
    fruits: ["Apple", "Apricot", "Cherry", "Lemon", "Peach", "Pear"],
  },
  {
    label: "Berries",
    fruits: ["Blackberry", "Blueberry", "Grape", "Strawberry"],
  },
  { label: "Tropical", fruits: ["Avocado", "Banana", "Mango", "Pineapple"] },
]
</script>

<template>
  <Autocomplete>
    <div data-slot="stack">
      <AutocompleteLabel>Fruit</AutocompleteLabel>
      <AutocompleteInput placeholder="e.g. Peach" />
    </div>
    <AutocompleteContent>
      <AutocompleteEmpty>No fruits found.</AutocompleteEmpty>
      <AutocompleteList>
        <template v-for="(group, index) in fruitGroups" :key="group.label">
          <AutocompleteSeparator v-if="index > 0" />
          <AutocompleteGroup>
            <AutocompleteGroupLabel>{{ group.label }}</AutocompleteGroupLabel>
            <AutocompleteItem
              v-for="fruit in group.fruits"
              :key="fruit"
              :value="fruit"
            >
              {{ fruit }}
            </AutocompleteItem>
          </AutocompleteGroup>
        </template>
      </AutocompleteList>
    </AutocompleteContent>
  </Autocomplete>
</template>
