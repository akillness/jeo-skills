<script setup lang="ts">
import { ChevronDownIcon, XIcon } from "@lucide/vue"
import {
  Autocomplete,
  AutocompleteClear,
  AutocompleteContent,
  AutocompleteEmpty,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteLabel,
  AutocompleteList,
  AutocompleteTrigger,
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
  <Autocomplete default-value="Mango">
    <div data-slot="stack">
      <AutocompleteLabel>Fruit</AutocompleteLabel>
      <div data-slot="row">
        <AutocompleteInput />
        <AutocompleteClear aria-label="Clear">
          <XIcon aria-hidden="true" />
        </AutocompleteClear>
        <AutocompleteTrigger aria-label="Show fruits">
          <ChevronDownIcon aria-hidden="true" />
        </AutocompleteTrigger>
      </div>
    </div>
    <AutocompleteContent>
      <AutocompleteEmpty>No fruits found.</AutocompleteEmpty>
      <AutocompleteList>
        <AutocompleteItem v-for="fruit in fruits" :key="fruit" :value="fruit">{{
          fruit
        }}</AutocompleteItem>
      </AutocompleteList>
    </AutocompleteContent>
  </Autocomplete>
</template>
