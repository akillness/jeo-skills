<script setup lang="ts">
import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteEmpty,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteLabel,
  AutocompleteList,
  createAutocompleteController,
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

const fruit = createAutocompleteController()
</script>

<template>
  <div data-slot="stack">
    <div data-slot="controls">
      <button type="button" data-size="sm" @click="fruit.open()">Open</button>
      <button type="button" data-size="sm" @click="fruit.setValue('Pea')">
        Type “Pea”
      </button>
      <button type="button" data-size="sm" @click="fruit.clear()">Clear</button>
      <button type="button" data-size="sm" @click="fruit.focus()">Focus</button>
    </div>
    <Autocomplete :controller="fruit">
      <AutocompleteLabel>Fruit</AutocompleteLabel>
      <AutocompleteInput />
      <AutocompleteContent>
        <AutocompleteEmpty>No fruits found.</AutocompleteEmpty>
        <AutocompleteList>
          <AutocompleteItem v-for="item in fruits" :key="item" :value="item">{{
            item
          }}</AutocompleteItem>
        </AutocompleteList>
      </AutocompleteContent>
    </Autocomplete>
  </div>
</template>
