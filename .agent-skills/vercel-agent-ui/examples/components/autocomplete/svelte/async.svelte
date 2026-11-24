<script lang="ts">
  import {
    Autocomplete,
    AutocompleteContent,
    AutocompleteEmpty,
    AutocompleteInput,
    AutocompleteItem,
    AutocompleteLabel,
    AutocompleteList,
    AutocompleteStatus,
  } from "@ui-sdk/svelte/autocomplete"
  import { useAsyncOptions } from "@ui-sdk/svelte/async-options"

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

  const results = useAsyncOptions(searchCities, { debounce: 200 })
</script>

<Autocomplete
  items={results.state.items}
  filter={false}
  status={results.state.status}
  onValueChange={(value) => results.setQuery(value)}
  onLoadMore={results.loadMore}
>
  <div data-slot="stack">
    <AutocompleteLabel>City</AutocompleteLabel>
    <AutocompleteInput placeholder="e.g. Paris" />
  </div>
  <AutocompleteContent>
    <AutocompleteStatus>
      {#snippet children(state)}
        {state.loading
          ? "Searching…"
          : state.count
            ? `${state.count} ${state.count === 1 ? "city" : "cities"}`
            : ""}
      {/snippet}
    </AutocompleteStatus>
    <AutocompleteEmpty>
      {#snippet children(state)}
        {#if state.empty && !state.loading}No cities start with “{state.query}”.{/if}
      {/snippet}
    </AutocompleteEmpty>
    <AutocompleteList>
      {#snippet children(state)}
        {#each state.items as string[] as city (city)}
          <AutocompleteItem value={city}>
            {city}
          </AutocompleteItem>
        {/each}
      {/snippet}
    </AutocompleteList>
  </AutocompleteContent>
</Autocomplete>
