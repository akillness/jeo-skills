import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteEmpty,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteLabel,
  AutocompleteList,
} from "@ui-sdk/solid/autocomplete"
import { For } from "solid-js"

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
    <Autocomplete autoHighlight loop={false}>
      <div data-slot="stack">
        <AutocompleteLabel>Fruit</AutocompleteLabel>
        <AutocompleteInput placeholder="Type, then Enter" />
      </div>
      <AutocompleteContent>
        <AutocompleteEmpty>No fruits found.</AutocompleteEmpty>
        <AutocompleteList>
          <For each={fruits}>
            {(fruit) => (
              <AutocompleteItem value={fruit}>{fruit}</AutocompleteItem>
            )}
          </For>
        </AutocompleteList>
      </AutocompleteContent>
    </Autocomplete>
  )
}

export { Example }
