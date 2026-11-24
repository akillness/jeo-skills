"use client"

import { useAsyncOptions } from "@ui-sdk/react/async-options"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxLabel,
  ComboboxList,
  ComboboxStatus,
  ComboboxTrigger,
} from "@ui-sdk/react/combobox"
import { CheckIcon, ChevronDownIcon } from "lucide-react"

const movieTitles = [
  "The Shawshank Redemption",
  "The Godfather",
  "The Dark Knight",
  "Pulp Fiction",
  "Schindler's List",
  "The Lord of the Rings",
  "Fight Club",
  "Forrest Gump",
  "Inception",
  "The Matrix",
  "Goodfellas",
  "Interstellar",
  "Parasite",
  "Spirited Away",
  "Whiplash",
  "The Prestige",
  "The Departed",
  "Gladiator",
  "Alien",
  "Casablanca",
  "Amélie",
  "Arrival",
]

function searchMoviePages(
  query: string,
  { signal, page }: { signal: AbortSignal; page: number }
) {
  return new Promise<{
    items: { value: string; label: string }[]
    hasMore: boolean
  }>((resolve, reject) => {
    const timer = setTimeout(() => {
      const needle = query.trim().toLowerCase()
      const found = movieTitles
        .filter((title) => title.toLowerCase().includes(needle))
        .map((title) => ({
          value: title.toLowerCase().replace(/\W+/g, "-"),
          label: title,
        }))
      resolve({
        items: found.slice(page * 5, page * 5 + 5),
        hasMore: found.length > page * 5 + 5,
      })
    }, 500)
    signal.addEventListener("abort", () => {
      clearTimeout(timer)
      reject(signal.reason)
    })
  })
}

function Example() {
  const movies = useAsyncOptions(searchMoviePages, { immediate: true })

  return (
    <Combobox
      items={movies.items}
      filter={false}
      status={movies.status}
      onQueryChange={(query) => movies.setQuery(query)}
      onLoadMore={movies.loadMore}
    >
      <div data-slot="stack">
        <ComboboxLabel>Movie</ComboboxLabel>
        <div data-slot="row">
          <ComboboxInput placeholder="Search movies…" />
          <ComboboxTrigger aria-label="Show movies">
            <ChevronDownIcon aria-hidden="true" />
          </ComboboxTrigger>
        </div>
      </div>
      <ComboboxContent>
        <ComboboxEmpty>
          {(state) =>
            state.empty && !state.loading ? "No movies found." : null
          }
        </ComboboxEmpty>
        <ComboboxList>
          {(state) =>
            (
              state.items as {
                value: string
                label: string
                disabled?: boolean
              }[]
            ).map((item) => (
              <ComboboxItem
                key={item.value}
                value={item.value}
                label={item.label}
                disabled={item.disabled}
              >
                {item.label}
                <ComboboxItemIndicator>
                  <CheckIcon aria-hidden="true" />
                </ComboboxItemIndicator>
              </ComboboxItem>
            ))
          }
        </ComboboxList>
        <ComboboxStatus>
          {(state) =>
            state.loading
              ? "Loading more…"
              : movies.hasMore
                ? `${state.count} loaded`
                : `All ${state.count}`
          }
        </ComboboxStatus>
      </ComboboxContent>
    </Combobox>
  )
}

export { Example }
