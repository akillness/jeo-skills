<script lang="ts">
  import {
    Autocomplete,
    AutocompleteContent,
    AutocompleteEmpty,
    AutocompleteGroup,
    AutocompleteGroupLabel,
    AutocompleteInput,
    AutocompleteItem,
    AutocompleteList,
  } from "@ui-sdk/svelte/autocomplete"

  const recent = [
    "react hooks",
    "tailwind grid",
    "web components",
    "vue v-model",
  ]
</script>

<Autocomplete openOnFocus>
  <AutocompleteInput aria-label="Search" placeholder="Search…" />
  <AutocompleteContent>
    <AutocompleteEmpty>No results.</AutocompleteEmpty>
    <AutocompleteList>
      <AutocompleteGroup>
        <AutocompleteGroupLabel>Recent searches</AutocompleteGroupLabel>
        {#each recent as search (search)}
          <AutocompleteItem value={search}>
            {search}
          </AutocompleteItem>
        {/each}
      </AutocompleteGroup>
    </AutocompleteList>
  </AutocompleteContent>
</Autocomplete>
