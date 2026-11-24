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
    items: ["Apple", "Apricot", "Cherry", "Lemon", "Peach", "Pear"],
  },
  {
    label: "Berries",
    items: ["Blackberry", "Blueberry", "Grape", "Strawberry"],
  },
  { label: "Tropical", items: ["Avocado", "Banana", "Mango", "Pineapple"] },
]

function Example() {
  return (
    <Autocomplete>
      <div data-slot="stack">
        <AutocompleteLabel>Fruit</AutocompleteLabel>
        <AutocompleteInput placeholder="e.g. Pear" />
      </div>
      <AutocompleteContent>
        <AutocompleteEmpty>No fruits found.</AutocompleteEmpty>
        <AutocompleteList>
          {fruitGroups.map((group, index) => (
            <React.Fragment key={group.label}>
              {index > 0 && <AutocompleteSeparator />}
              <AutocompleteGroup>
                <AutocompleteGroupLabel>{group.label}</AutocompleteGroupLabel>
                {group.items.map((fruit) => (
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
