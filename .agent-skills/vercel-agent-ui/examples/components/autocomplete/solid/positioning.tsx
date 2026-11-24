import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteEmpty,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteLabel,
  AutocompleteList,
} from "@ui-sdk/solid/autocomplete"
import { createSignal, For } from "solid-js"

const fruits = [
  "Apple",
  "Apricot",
  "Avocado",
  "Banana",
  "Blackberry",
  "Blueberry",
]

function Example() {
  const [box, setBox] = createSignal<HTMLElement | null>(null)
  return (
    <div ref={setBox} data-slot="card">
      <Autocomplete modal="pointer" container={box()}>
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
          anchor={box()}
          keepMounted
        >
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
    </div>
  )
}

export { Example }
