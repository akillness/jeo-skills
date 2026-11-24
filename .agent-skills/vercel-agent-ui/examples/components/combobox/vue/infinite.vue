<script setup lang="ts">
import { CheckIcon, ChevronDownIcon } from "@lucide/vue"
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
} from "@ui-sdk/vue/combobox"
import { useAsyncOptions } from "@ui-sdk/vue/async-options"

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

const {
  state: movies,
  setQuery,
  loadMore,
} = useAsyncOptions(searchMoviePages, { immediate: true })
</script>

<template>
  <Combobox
    :items="movies.items"
    :filter="false"
    :status="movies.status"
    @query-change="(query: string) => setQuery(query)"
    @load-more="loadMore"
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
      <ComboboxEmpty v-slot="{ state }">
        <template v-if="state.empty && !state.loading"
          >No movies found.</template
        >
      </ComboboxEmpty>
      <ComboboxList v-slot="{ state }">
        <ComboboxItem
          v-for="item in state.items as {
            value: string
            label: string
            disabled?: boolean
          }[]"
          :key="item.value"
          :value="item.value"
          :label="item.label"
          :disabled="item.disabled"
        >
          {{ item.label }}
          <ComboboxItemIndicator>
            <CheckIcon aria-hidden="true" />
          </ComboboxItemIndicator>
        </ComboboxItem>
      </ComboboxList>
      <ComboboxStatus v-slot="{ state }">
        {{
          state.loading
            ? "Loading more…"
            : movies.hasMore
              ? `${state.count} loaded`
              : `All ${state.count}`
        }}
      </ComboboxStatus>
    </ComboboxContent>
  </Combobox>
</template>
