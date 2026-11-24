import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteEmpty,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteLabel,
  AutocompleteList,
  createAutocompleteController,
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

const fruit = createAutocompleteController()

function Example() {
  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <button type="button" data-size="sm" onClick={() => fruit.open()}>
          Open
        </button>
        <button
          type="button"
          data-size="sm"
          onClick={() => fruit.setValue("Pea")}
        >
          Type “Pea”
        </button>
        <button type="button" data-size="sm" onClick={() => fruit.clear()}>
          Clear
        </button>
        <button type="button" data-size="sm" onClick={() => fruit.focus()}>
          Focus
        </button>
      </div>
      <Autocomplete controller={fruit}>
        <AutocompleteLabel>Fruit</AutocompleteLabel>
        <AutocompleteInput />
        <AutocompleteContent>
          <AutocompleteEmpty>No fruits found.</AutocompleteEmpty>
          <AutocompleteList>
            <For each={fruits}>
              {(item) => (
                <AutocompleteItem value={item}>{item}</AutocompleteItem>
              )}
            </For>
          </AutocompleteList>
        </AutocompleteContent>
      </Autocomplete>
    </div>
  )
}

export { Example }
