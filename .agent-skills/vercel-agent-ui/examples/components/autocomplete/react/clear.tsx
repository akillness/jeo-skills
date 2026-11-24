"use client"

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
} from "@ui-sdk/react/autocomplete"
import { ChevronDownIcon, XIcon } from "lucide-react"

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

function Example() {
  return (
    <Autocomplete defaultValue="Mango">
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
          {fruits.map((fruit) => (
            <AutocompleteItem key={fruit} value={fruit}>
              {fruit}
            </AutocompleteItem>
          ))}
        </AutocompleteList>
      </AutocompleteContent>
    </Autocomplete>
  )
}

export { Example }
