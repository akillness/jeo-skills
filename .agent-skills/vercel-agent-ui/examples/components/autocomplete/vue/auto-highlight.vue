<script setup lang="ts">
import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteEmpty,
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
  <Autocomplete auto-highlight :loop="false">
    <div data-slot="stack">
      <AutocompleteLabel>Fruit</AutocompleteLabel>
      <AutocompleteInput placeholder="Type, then Enter" />
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
