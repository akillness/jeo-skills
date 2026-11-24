"use client"

import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteEmpty,
  AutocompleteGroup,
  AutocompleteGroupLabel,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteList,
} from "@ui-sdk/react/autocomplete"

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
            {recent.map((search) => (
              <AutocompleteItem key={search} value={search}>
                {search}
              </AutocompleteItem>
            ))}
          </AutocompleteGroup>
        </AutocompleteList>
      </AutocompleteContent>
    </Autocomplete>
  )
}

export { Example }
