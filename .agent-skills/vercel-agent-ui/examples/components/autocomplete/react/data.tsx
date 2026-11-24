"use client"

import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteEmpty,
  AutocompleteGroup,
  AutocompleteGroupLabel,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteLabel,
  AutocompleteList,
  AutocompleteSeparator,
} from "@ui-sdk/react/autocomplete"
import * as React from "react"

const fruitGroups = [
  {
    label: "Tree fruits",
    fruits: ["Apple", "Apricot", "Cherry", "Lemon", "Peach", "Pear"],
  },
  {
    label: "Berries",
    fruits: ["Blackberry", "Blueberry", "Grape", "Strawberry"],
  },
  { label: "Tropical", fruits: ["Avocado", "Banana", "Mango", "Pineapple"] },
]

function Example() {
  return (
    <Autocomplete>
      <div data-slot="stack">
        <AutocompleteLabel>Fruit</AutocompleteLabel>
        <AutocompleteInput placeholder="e.g. Peach" />
      </div>
      <AutocompleteContent>
        <AutocompleteEmpty>No fruits found.</AutocompleteEmpty>
        <AutocompleteList>
          {fruitGroups.map((group, index) => (
            <React.Fragment key={group.label}>
              {index > 0 && <AutocompleteSeparator />}
              <AutocompleteGroup>
                <AutocompleteGroupLabel>{group.label}</AutocompleteGroupLabel>
                {group.fruits.map((fruit) => (
                  <AutocompleteItem key={fruit} value={fruit}>
                    {fruit}
                  </AutocompleteItem>
                ))}
              </AutocompleteGroup>
            </React.Fragment>
          ))}
        </AutocompleteList>
      </AutocompleteContent>
    </Autocomplete>
  )
}

export { Example }
