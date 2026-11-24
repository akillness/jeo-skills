import { useAsyncOptions } from "@ui-sdk/solid/async-options"
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
} from "@ui-sdk/solid/combobox"
import { For } from "solid-js"

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
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
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
          {(state) => (
            <For
              each={
                state.items as {
                  value: string
                  label: string
                  disabled?: boolean
                }[]
              }
            >
              {(item) => (
                <ComboboxItem
                  value={item.value}
                  label={item.label}
                  disabled={item.disabled}
                >
                  {item.label}
                  <ComboboxItemIndicator>
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  </ComboboxItemIndicator>
                </ComboboxItem>
              )}
            </For>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

export { Example }
