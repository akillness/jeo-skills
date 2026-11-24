<script setup lang="ts">
import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteEmpty,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteList,
} from "@ui-sdk/vue/autocomplete"
import { useLog } from "../../../shared/vue/log"

const recent = ["react hooks", "tailwind grid", "web components", "vue v-model"]

const log = useLog()
</script>

<template>
  <form role="search" data-slot="stack" @submit.prevent>
    <Autocomplete
      submit-on-select
      name="q"
      @submit="(value: string) => log(`Searched “${value}”`)"
    >
      <AutocompleteInput
        type="search"
        aria-label="Search"
        placeholder="Search…"
      />
      <AutocompleteContent>
        <AutocompleteEmpty>No results.</AutocompleteEmpty>
        <AutocompleteList>
          <AutocompleteItem
            v-for="search in recent"
            :key="search"
            :value="search"
            >{{ search }}</AutocompleteItem
          >
        </AutocompleteList>
      </AutocompleteContent>
    </Autocomplete>
  </form>
</template>
