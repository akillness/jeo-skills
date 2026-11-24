"use client"

import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteLabel,
  AutocompleteList,
} from "@ui-sdk/react/autocomplete"

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
    <div data-slot="stack">
      <Autocomplete disabled defaultValue="Banana">
        <div data-slot="stack">
          <AutocompleteLabel>Disabled</AutocompleteLabel>
          <AutocompleteInput />
        </div>
      </Autocomplete>
      <Autocomplete readOnly defaultValue="Cherry">
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
            {fruits.map((fruit, index) => (
              <AutocompleteItem
                key={fruit}
                value={fruit}
                disabled={index % 3 === 0}
              >
                {fruit}
              </AutocompleteItem>
            ))}
          </AutocompleteList>
        </AutocompleteContent>
      </Autocomplete>
    </div>
  )
}

export { Example }
