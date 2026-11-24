<script setup lang="ts">
import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteEmpty,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteLabel,
  AutocompleteList,
  AutocompleteStatus,
} from "@ui-sdk/vue/autocomplete"
import { useAsyncOptions } from "@ui-sdk/vue/async-options"

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

const {
  state: results,
  setQuery,
  loadMore,
} = useAsyncOptions(searchCities, { debounce: 200 })
</script>

<template>
  <Autocomplete
    :items="results.items"
    :filter="false"
    :status="results.status"
    @value-change="(value: string) => setQuery(value)"
    @load-more="loadMore"
  >
    <div data-slot="stack">
      <AutocompleteLabel>City</AutocompleteLabel>
      <AutocompleteInput placeholder="e.g. Paris" />
    </div>
    <AutocompleteContent>
      <AutocompleteStatus v-slot="{ state }">
        {{
          state.loading
            ? "Searching…"
            : state.count
              ? `${state.count} ${state.count === 1 ? "city" : "cities"}`
              : ""
        }}
      </AutocompleteStatus>
      <AutocompleteEmpty v-slot="{ state }">
        <template v-if="state.empty && !state.loading"
          >No cities start with “{{ state.query }}”.</template
        >
      </AutocompleteEmpty>
      <AutocompleteList v-slot="{ state }">
        <AutocompleteItem
          v-for="city in state.items as string[]"
          :key="city"
          :value="city"
          >{{ city }}</AutocompleteItem
        >
      </AutocompleteList>
    </AutocompleteContent>
  </Autocomplete>
</template>
