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
import { ref } from "vue"
import { useLog } from "../../../shared/vue/log"

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

const value = ref("")
const open = ref(false)
const log = useLog()

function changeValue(
  next: string,
  details: { reason: string; cancel: () => void }
) {
  if (next.length > 12) {
    return details.cancel()
  }
  log(`text: ${details.reason}`)
}
</script>

<template>
  <div data-slot="stack">
    <Autocomplete
      v-model:value="value"
      v-model:open="open"
      debug
      @value-change="changeValue"
      @open-change="
        (next: boolean, details: { reason: string }) =>
          log(`${next ? 'opened' : 'closed'}: ${details.reason}`)
      "
      @open-change-complete="
        (next: boolean) => log(`${next ? 'opened' : 'closed'} and settled`)
      "
      @highlight="
        (highlighted: string | null) =>
          highlighted && log(`highlighted ${highlighted}`)
      "
    >
      <AutocompleteLabel>Fruit (12 characters at most)</AutocompleteLabel>
      <AutocompleteInput />
      <AutocompleteContent>
        <AutocompleteEmpty>No fruits found.</AutocompleteEmpty>
        <AutocompleteList>
          <AutocompleteItem
            v-for="fruit in fruits"
            :key="fruit"
            :value="fruit"
            >{{ fruit }}</AutocompleteItem
          >
        </AutocompleteList>
      </AutocompleteContent>
    </Autocomplete>
  </div>
</template>
