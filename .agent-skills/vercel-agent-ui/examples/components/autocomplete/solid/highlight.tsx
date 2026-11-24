import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteEmpty,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteItemText,
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
    <Autocomplete>
      <div data-slot="stack">
        <AutocompleteLabel>Favorite fruit</AutocompleteLabel>
        <AutocompleteInput placeholder="e.g. berry" />
      </div>
      <AutocompleteContent>
        <AutocompleteEmpty>No fruits found.</AutocompleteEmpty>
        <AutocompleteList>
          <For each={fruits}>
            {(fruit) => (
              <AutocompleteItem value={fruit}>
                <AutocompleteItemText>
                  {(state) =>
                    state.segments.map((segment) =>
                      segment.match ? (
                        <strong>{segment.text}</strong>
                      ) : (
                        segment.text
                      )
                    )
                  }
                </AutocompleteItemText>
              </AutocompleteItem>
            )}
          </For>
        </AutocompleteList>
      </AutocompleteContent>
    </Autocomplete>
  )
}

export { Example }
