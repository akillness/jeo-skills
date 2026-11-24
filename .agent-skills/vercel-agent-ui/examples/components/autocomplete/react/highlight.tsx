"use client"

import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteEmpty,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteItemText,
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
    <Autocomplete>
      <div data-slot="stack">
        <AutocompleteLabel>Favorite fruit</AutocompleteLabel>
        <AutocompleteInput placeholder="e.g. berry" />
      </div>
      <AutocompleteContent>
        <AutocompleteEmpty>No fruits found.</AutocompleteEmpty>
        <AutocompleteList>
          {fruits.map((fruit) => (
            <AutocompleteItem key={fruit} value={fruit}>
              <AutocompleteItemText>
                {(state) =>
                  state.segments.map((segment, index) =>
                    segment.match ? (
                      <strong key={index}>{segment.text}</strong>
                    ) : (
                      segment.text
                    )
                  )
                }
              </AutocompleteItemText>
            </AutocompleteItem>
          ))}
        </AutocompleteList>
      </AutocompleteContent>
    </Autocomplete>
  )
}

export { Example }
