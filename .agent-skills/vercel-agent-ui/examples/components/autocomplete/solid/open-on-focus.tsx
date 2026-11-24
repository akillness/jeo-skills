import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteEmpty,
  AutocompleteGroup,
  AutocompleteGroupLabel,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteList,
} from "@ui-sdk/solid/autocomplete"
import { For } from "solid-js"

const recent = ["react hooks", "tailwind grid", "web components", "vue v-model"]

function Example() {
  return (
    <Autocomplete openOnFocus>
      <AutocompleteInput aria-label="Search" placeholder="Search…" />
      <AutocompleteContent>
        <AutocompleteEmpty>No results.</AutocompleteEmpty>
        <AutocompleteList>
          <AutocompleteGroup>
            <AutocompleteGroupLabel>Recent searches</AutocompleteGroupLabel>
            <For each={recent}>
              {(search) => (
                <AutocompleteItem value={search}>{search}</AutocompleteItem>
              )}
            </For>
          </AutocompleteGroup>
        </AutocompleteList>
      </AutocompleteContent>
    </Autocomplete>
  )
}

export { Example }
