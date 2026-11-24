<script setup lang="ts">
import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteEmpty,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteList,
} from "@ui-sdk/vue/autocomplete"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@ui-sdk/vue/field"
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

const log = useLog()

function submit(event: Event) {
  const data = [...new FormData(event.currentTarget as HTMLFormElement)].map(
    ([name, value]) => `${name}=${value}`
  )
  log(`Submitted ${data.join("&")}`)
}
</script>

<template>
  <form id="order" data-slot="stack" @submit.prevent="submit">
    <Field>
      <FieldLabel>Fruit</FieldLabel>
      <Autocomplete name="fruit" form="order" required default-value="Apple">
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
      <FieldDescription>Any fruit, listed or not.</FieldDescription>
      <div><FieldError /></div>
    </Field>
    <div data-slot="row">
      <button type="submit" data-variant="solid">Submit</button>
      <button type="reset">Reset</button>
    </div>
  </form>
</template>
