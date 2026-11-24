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
} from "@ui-sdk/solid/autocomplete"
import { For } from "solid-js"

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
          <For each={fruitGroups}>
            {(group, index) => (
              <>
                {index() > 0 && <AutocompleteSeparator />}
                <AutocompleteGroup>
                  <AutocompleteGroupLabel>{group.label}</AutocompleteGroupLabel>
                  <For each={group.fruits}>
                    {(fruit) => (
                      <AutocompleteItem value={fruit}>{fruit}</AutocompleteItem>
                    )}
                  </For>
                </AutocompleteGroup>
              </>
            )}
          </For>
        </AutocompleteList>
      </AutocompleteContent>
    </Autocomplete>
  )
}

export { Example }
