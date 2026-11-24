<script setup lang="ts">
import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteEmpty,
  AutocompleteGroup,
  AutocompleteGroupLabel,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteList,
} from "@ui-sdk/vue/autocomplete"

const recent = ["react hooks", "tailwind grid", "web components", "vue v-model"]
</script>

<template>
  <Autocomplete open-on-focus>
    <AutocompleteInput aria-label="Search" placeholder="Search…" />
    <AutocompleteContent>
      <AutocompleteEmpty>No results.</AutocompleteEmpty>
      <AutocompleteList>
        <AutocompleteGroup>
          <AutocompleteGroupLabel>Recent searches</AutocompleteGroupLabel>
          <AutocompleteItem
            v-for="search in recent"
            :key="search"
            :value="search"
            >{{ search }}</AutocompleteItem
          >
        </AutocompleteGroup>
      </AutocompleteList>
    </AutocompleteContent>
  </Autocomplete>
</template>
