<script setup lang="ts">
import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteLabel,
  AutocompleteList,
} from "@ui-sdk/vue/autocomplete"

const fruits = [
  "Apple",
  "Apricot",
  "Avocado",
  "Banana",
  "Blackberry",
  "Blueberry",
  "Cherry",
  "Grape",
  "Lemon",
  "Mango",
  "Orange",
  "Peach",
  "Pear",
  "Pineapple",
  "Strawberry",
]
</script>

<template>
  <div data-slot="stack">
    <Autocomplete disabled default-value="Banana">
      <div data-slot="stack">
        <AutocompleteLabel>Disabled</AutocompleteLabel>
        <AutocompleteInput />
      </div>
    </Autocomplete>
    <Autocomplete read-only default-value="Cherry">
      <div data-slot="stack">
        <AutocompleteLabel>Read-only</AutocompleteLabel>
        <AutocompleteInput />
      </div>
    </Autocomplete>
    <Autocomplete>
      <div data-slot="stack">
        <AutocompleteLabel>Some suggestions disabled</AutocompleteLabel>
        <AutocompleteInput placeholder="Type “b”" />
      </div>
      <AutocompleteContent>
        <AutocompleteList>
          <AutocompleteItem
            v-for="(fruit, index) in fruits"
            :key="fruit"
            :value="fruit"
            :disabled="index % 3 === 0"
            >{{ fruit }}</AutocompleteItem
          >
        </AutocompleteList>
      </AutocompleteContent>
    </Autocomplete>
  </div>
</template>
