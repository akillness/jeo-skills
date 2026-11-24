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

function searchMovies(query: string, { signal }: { signal: AbortSignal }) {
  return new Promise<{ value: string; label: string }[]>((resolve, reject) => {
    const timer = setTimeout(() => {
      const needle = query.trim().toLowerCase()
      resolve(
        movieTitles
          .filter((title) => title.toLowerCase().includes(needle))
          .map((title) => ({
            value: title.toLowerCase().replace(/\W+/g, "-"),
            label: title,
          }))
      )
    }, 500)
    signal.addEventListener("abort", () => {
      clearTimeout(timer)
      reject(signal.reason)
    })
  })
}

function Example() {
  const movies = useAsyncOptions(searchMovies, {
    debounce: 300,
    query: "the",
    immediate: true,
  })

  return (
    <Combobox
      items={movies.items}
      defaultQuery="the"
      filter={false}
      status={movies.status}
      onQueryChange={(query) => movies.setQuery(query)}
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
        <ComboboxStatus>
          {(state) =>
            state.status === "error"
              ? "Couldn't load movies."
              : state.loading
                ? "Searching…"
                : `${state.count} ${state.count === 1 ? "movie" : "movies"}`
          }
        </ComboboxStatus>
        <ComboboxEmpty>
          {(state) =>
            state.empty && !state.loading
              ? `No movies match “${state.query}”.`
              : null
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
      </ComboboxContent>
    </Combobox>
  )
}

export { Example }
