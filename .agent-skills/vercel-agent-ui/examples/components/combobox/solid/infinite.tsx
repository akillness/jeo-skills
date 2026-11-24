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
        <ComboboxEmpty>
          {(state) =>
            state.empty && !state.loading ? "No movies found." : null
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
