import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteEmpty,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteList,
} from "@ui-sdk/solid/autocomplete"
import { For } from "solid-js"
import { useLog } from "../../../shared/solid/log"

const recent = ["react hooks", "tailwind grid", "web components", "vue v-model"]

function Example() {
  const log = useLog()
  return (
    <form
      role="search"
      data-slot="stack"
      onSubmit={(event) => event.preventDefault()}
    >
      <Autocomplete
        submitOnSelect
        name="q"
        onSubmit={(value) => log(`Searched “${value}”`)}
      >
        <AutocompleteInput
          type="search"
          aria-label="Search"
          placeholder="Search…"
        />
        <AutocompleteContent>
          <AutocompleteEmpty>No results.</AutocompleteEmpty>
          <AutocompleteList>
            <For each={recent}>
              {(search) => (
                <AutocompleteItem value={search}>{search}</AutocompleteItem>
              )}
            </For>
          </AutocompleteList>
        </AutocompleteContent>
      </Autocomplete>
    </form>
  )
}

export { Example }
