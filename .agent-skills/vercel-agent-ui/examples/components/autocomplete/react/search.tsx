"use client"

import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteEmpty,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteList,
} from "@ui-sdk/react/autocomplete"
import { useLog } from "../../../shared/react/log"

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
            {recent.map((search) => (
              <AutocompleteItem key={search} value={search}>
                {search}
              </AutocompleteItem>
            ))}
          </AutocompleteList>
        </AutocompleteContent>
      </Autocomplete>
    </form>
  )
}

export { Example }
