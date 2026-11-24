<script lang="ts">
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
  } from "@ui-sdk/svelte/autocomplete"

  const recent = [
    "react hooks",
    "tailwind grid",
    "web components",
    "vue v-model",
  ]
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

<Autocomplete
  items={topics}
  emptyItems={recentSearches}
  openOnFocus
  {announcement}
>
  <AutocompleteInput
    type="search"
    aria-label="Search docs"
    placeholder="Search docs…"
  />
  <AutocompleteContent>
    <AutocompleteEmpty>No topics found.</AutocompleteEmpty>
    <AutocompleteList>
      {#snippet children(state)}
        {#each state.items as (string | (typeof recentSearches)[number])[] as entry (typeof entry === "string" ? entry : entry.label)}
          {#if typeof entry === "string"}
            <AutocompleteItem value={entry}>
              <AutocompleteItemText />
            </AutocompleteItem>
          {:else}
            <AutocompleteGroup>
              <AutocompleteGroupLabel>{entry.label}</AutocompleteGroupLabel>
              {#each entry.items as topic (topic)}
                <AutocompleteItem value={topic}>
                  <AutocompleteItemText />
                </AutocompleteItem>
              {/each}
            </AutocompleteGroup>
          {/if}
        {/each}
      {/snippet}
    </AutocompleteList>
  </AutocompleteContent>
</Autocomplete>
