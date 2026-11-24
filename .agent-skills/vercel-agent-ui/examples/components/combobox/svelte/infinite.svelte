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

  const movies = useAsyncOptions(searchMoviePages, { immediate: true })
</script>

<Combobox
  items={movies.state.items}
  filter={false}
  status={movies.state.status}
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
      {#snippet children(state)}
        {#if state.empty && !state.loading}No movies found.{/if}
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
    <ComboboxStatus>
      {#snippet children(state)}
        {state.loading
          ? "Loading more…"
          : movies.state.hasMore
            ? `${state.count} loaded`
            : `All ${state.count}`}
      {/snippet}
    </ComboboxStatus>
  </ComboboxContent>
</Combobox>
