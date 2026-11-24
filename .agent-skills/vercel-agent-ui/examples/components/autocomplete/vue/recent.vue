<script setup lang="ts">
import type { ListAnnouncement } from "@ui-sdk/core/autocomplete"
import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteEmpty,
  AutocompleteGroup,
  AutocompleteGroupLabel,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteItemText,
  AutocompleteList,
} from "@ui-sdk/vue/autocomplete"

const recent = ["react hooks", "tailwind grid", "web components", "vue v-model"]
const topics = [
  ...recent,
  "react server components",
  "tailwind colors",
  "vue router",
]
const recentSearches = [
  { type: "group" as const, label: "Recent searches", items: recent },
]

function announcement(change: ListAnnouncement) {
  return change.type === "results"
    ? `${change.count} ${change.count === 1 ? "topic" : "topics"}`
    : null
}
</script>

<template>
  <Autocomplete
    :items="topics"
    :empty-items="recentSearches"
    open-on-focus
    :announcement="announcement"
  >
    <AutocompleteInput
      type="search"
      aria-label="Search docs"
      placeholder="Search docs…"
    />
    <AutocompleteContent>
      <AutocompleteEmpty>No topics found.</AutocompleteEmpty>
      <AutocompleteList v-slot="{ state }">
        <template
          v-for="entry in state.items as (
            string | (typeof recentSearches)[number]
          )[]"
          :key="typeof entry === 'string' ? entry : entry.label"
        >
          <AutocompleteItem v-if="typeof entry === 'string'" :value="entry">
            <AutocompleteItemText />
          </AutocompleteItem>
          <AutocompleteGroup v-else>
            <AutocompleteGroupLabel>{{ entry.label }}</AutocompleteGroupLabel>
            <AutocompleteItem
              v-for="topic in entry.items"
              :key="topic"
              :value="topic"
            >
              <AutocompleteItemText />
            </AutocompleteItem>
          </AutocompleteGroup>
        </template>
      </AutocompleteList>
    </AutocompleteContent>
  </Autocomplete>
</template>
