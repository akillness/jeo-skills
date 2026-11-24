<script setup lang="ts">
import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteEmpty,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteItemText,
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
  <Autocomplete>
    <div data-slot="stack">
      <AutocompleteLabel>Favorite fruit</AutocompleteLabel>
      <AutocompleteInput placeholder="e.g. berry" />
    </div>
    <AutocompleteContent>
      <AutocompleteEmpty>No fruits found.</AutocompleteEmpty>
      <AutocompleteList>
        <AutocompleteItem v-for="fruit in fruits" :key="fruit" :value="fruit">
          <AutocompleteItemText>
            <template #render="{ props, state }">
              <span v-bind="props">
                <template
                  v-for="(segment, index) in state.segments"
                  :key="index"
                >
                  <strong v-if="segment.match">{{ segment.text }}</strong>
                  <template v-else>{{ segment.text }}</template>
                </template>
              </span>
            </template>
          </AutocompleteItemText>
        </AutocompleteItem>
      </AutocompleteList>
    </AutocompleteContent>
  </Autocomplete>
</template>
