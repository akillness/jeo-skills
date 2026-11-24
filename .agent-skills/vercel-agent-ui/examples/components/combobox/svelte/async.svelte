<script lang="ts">
  import { CheckIcon, ChevronDownIcon } from "@lucide/svelte"
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
  } from "@ui-sdk/svelte/combobox"
  import { useAsyncOptions } from "@ui-sdk/svelte/async-options"

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
    return new Promise<{ value: string; label: string }[]>(
      (resolve, reject) => {
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
      }
    )
  }

  const movies = useAsyncOptions(searchMovies, {
    debounce: 300,
    query: "the",
    immediate: true,
  })
</script>

<Combobox
  items={movies.state.items}
  defaultQuery="the"
  filter={false}
  status={movies.state.status}
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
      {#snippet children(state)}
        {state.status === "error"
          ? "Couldn't load movies."
          : state.loading
            ? "Searching…"
            : `${state.count} ${state.count === 1 ? "movie" : "movies"}`}
      {/snippet}
    </ComboboxStatus>
    <ComboboxEmpty>
      {#snippet children(state)}
        {#if state.empty && !state.loading}No movies match “{state.query}”.{/if}
      {/snippet}
    </ComboboxEmpty>
    <ComboboxList>
      {#snippet children(state)}
        {#each state.items as { value: string; label: string; disabled?: boolean }[] as item (item.value)}
          <ComboboxItem
            value={item.value}
            label={item.label}
            disabled={item.disabled}
          >
            {item.label}
            <ComboboxItemIndicator>
              <CheckIcon aria-hidden="true" />
            </ComboboxItemIndicator>
          </ComboboxItem>
        {/each}
      {/snippet}
    </ComboboxList>
  </ComboboxContent>
</Combobox>
