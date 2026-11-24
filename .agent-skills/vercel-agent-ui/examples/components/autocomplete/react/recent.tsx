"use client"

import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteEmpty,
  AutocompleteGroup,
  AutocompleteGroupLabel,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteItemText,
  AutocompleteList,
} from "@ui-sdk/react/autocomplete"

const recent = ["react hooks", "tailwind grid", "web components", "vue v-model"]
const topics = [
  ...recent,
  "react server components",
  "tailwind colors",
  "vue router",
]
const recentSearches = [
  { type: "group" as const, label: "Recent searches", items: recent },
]

function Example() {
  return (
    <Autocomplete
      items={topics}
      emptyItems={recentSearches}
      openOnFocus
      announcement={(change) =>
        change.type === "results"
          ? `${change.count} ${change.count === 1 ? "topic" : "topics"}`
          : null
      }
    >
      <AutocompleteInput
        type="search"
        aria-label="Search docs"
        placeholder="Search docs…"
      />
      <AutocompleteContent>
        <AutocompleteEmpty>No topics found.</AutocompleteEmpty>
        <AutocompleteList>
          {(state) =>
            (state.items as (string | (typeof recentSearches)[number])[]).map(
              (entry) =>
                typeof entry === "string" ? (
                  <AutocompleteItem key={entry} value={entry}>
                    <AutocompleteItemText />
                  </AutocompleteItem>
                ) : (
                  <AutocompleteGroup key={entry.label}>
                    <AutocompleteGroupLabel>
                      {entry.label}
                    </AutocompleteGroupLabel>
                    {entry.items.map((topic) => (
                      <AutocompleteItem key={topic} value={topic}>
                        <AutocompleteItemText />
                      </AutocompleteItem>
                    ))}
                  </AutocompleteGroup>
                )
            )
          }
        </AutocompleteList>
      </AutocompleteContent>
    </Autocomplete>
  )
}

export { Example }
