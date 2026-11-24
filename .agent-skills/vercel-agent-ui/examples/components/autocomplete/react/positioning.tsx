import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteEmpty,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteLabel,
  AutocompleteList,
} from "@ui-sdk/react/autocomplete"
import * as React from "react"

const fruits = [
  "Apple",
  "Apricot",
  "Avocado",
  "Banana",
  "Blackberry",
  "Blueberry",
]

export function Example() {
  const [box, setBox] = React.useState<HTMLElement | null>(null)
  return (
    <div ref={setBox} data-slot="card">
      <Autocomplete modal="pointer" container={box}>
        <div data-slot="stack">
          <AutocompleteLabel>Fruit</AutocompleteLabel>
          <AutocompleteInput />
        </div>
        <AutocompleteContent
          side="top"
          align="end"
          sideOffset={10}
          alignOffset={-4}
          collisionPadding={8}
          anchor={box}
          keepMounted
        >
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
    </div>
  )
}
