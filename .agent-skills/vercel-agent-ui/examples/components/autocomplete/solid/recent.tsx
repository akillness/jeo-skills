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
} from "@ui-sdk/solid/autocomplete"
import { For } from "solid-js"

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
          {(state) => (
            <For
              each={state.items as (string | (typeof recentSearches)[number])[]}
            >
              {(entry) =>
                typeof entry === "string" ? (
                  <AutocompleteItem value={entry}>
                    <AutocompleteItemText />
                  </AutocompleteItem>
                ) : (
                  <AutocompleteGroup>
                    <AutocompleteGroupLabel>
                      {entry.label}
                    </AutocompleteGroupLabel>
                    <For each={entry.items}>
                      {(topic) => (
                        <AutocompleteItem value={topic}>
                          <AutocompleteItemText />
                        </AutocompleteItem>
                      )}
                    </For>
                  </AutocompleteGroup>
                )
              }
            </For>
          )}
        </AutocompleteList>
      </AutocompleteContent>
    </Autocomplete>
  )
}

export { Example }
