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
import { For, Show } from "solid-js"

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
          <For each={fruitGroups}>
            {(group, index) => (
              <>
                <Show when={index() > 0}>
                  <AutocompleteSeparator />
                </Show>
                <AutocompleteGroup>
                  <AutocompleteGroupLabel>{group.label}</AutocompleteGroupLabel>
                  <For each={group.items}>
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
