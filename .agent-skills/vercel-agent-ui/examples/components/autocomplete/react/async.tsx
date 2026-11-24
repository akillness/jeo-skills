"use client"

import { useAsyncOptions } from "@ui-sdk/react/async-options"
import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteEmpty,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteLabel,
  AutocompleteList,
  AutocompleteStatus,
} from "@ui-sdk/react/autocomplete"

function searchCities(query: string, { signal }: { signal: AbortSignal }) {
  const cities = [
    "Amsterdam",
    "Athens",
    "Barcelona",
    "Berlin",
    "Boston",
    "Brussels",
    "Buenos Aires",
    "Cairo",
    "Chicago",
    "Copenhagen",
    "Dublin",
    "Lisbon",
    "London",
    "Los Angeles",
    "Madrid",
    "Paris",
    "Prague",
    "Rome",
    "Seoul",
    "Tokyo",
  ]
  return new Promise<string[]>((resolve, reject) => {
    const timer = setTimeout(() => {
      const needle = query.trim().toLowerCase()
      resolve(cities.filter((city) => city.toLowerCase().startsWith(needle)))
    }, 300)
    signal.addEventListener("abort", () => {
      clearTimeout(timer)
      reject(new DOMException("Aborted", "AbortError"))
    })
  })
}

function Example() {
  const results = useAsyncOptions(searchCities, { debounce: 200 })

  return (
    <Autocomplete
      items={results.items}
      filter={false}
      status={results.status}
      onValueChange={(value) => results.setQuery(value)}
      onLoadMore={results.loadMore}
    >
      <div data-slot="stack">
        <AutocompleteLabel>City</AutocompleteLabel>
        <AutocompleteInput placeholder="e.g. Paris" />
      </div>
      <AutocompleteContent>
        <AutocompleteStatus>
          {(state) =>
            state.loading
              ? "Searching…"
              : state.count
                ? `${state.count} ${state.count === 1 ? "city" : "cities"}`
                : ""
          }
        </AutocompleteStatus>
        <AutocompleteEmpty>
          {(state) =>
            state.empty && !state.loading
              ? `No cities start with “${state.query}”.`
              : null
          }
        </AutocompleteEmpty>
        <AutocompleteList>
          {(state) =>
            (state.items as string[]).map((city) => (
              <AutocompleteItem key={city} value={city}>
                {city}
              </AutocompleteItem>
            ))
          }
        </AutocompleteList>
      </AutocompleteContent>
    </Autocomplete>
  )
}

export { Example }
