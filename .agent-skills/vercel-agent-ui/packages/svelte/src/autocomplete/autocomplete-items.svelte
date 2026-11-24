<!--
@component
Renders data suggestions. Used by data autocompletes, and available for custom layouts.
@stable
-->
<script lang="ts">
  import type { ListData } from "@ui-sdk/core/autocomplete"
  import AutocompleteGroupLabel from "./autocomplete-group-label.svelte"
  import AutocompleteGroup from "./autocomplete-group.svelte"
  import AutocompleteItem from "./autocomplete-item.svelte"
  import Self from "./autocomplete-items.svelte"
  import AutocompleteSeparator from "./autocomplete-separator.svelte"

  let { items }: { items: ListData<string> } = $props()
</script>

{#each items as entry, index (typeof entry === "string" ? entry : "type" in entry ? `${entry.type}-${index}` : entry.value)}
  {#if typeof entry === "string"}
    <AutocompleteItem value={entry}>{entry}</AutocompleteItem>
  {:else if "type" in entry && entry.type === "separator"}
    <AutocompleteSeparator />
  {:else if "type" in entry && entry.type === "group"}
    <AutocompleteGroup>
      {#if entry.label}<AutocompleteGroupLabel
          >{entry.label}</AutocompleteGroupLabel
        >{/if}
      <Self items={entry.items} />
    </AutocompleteGroup>
  {:else}
    <AutocompleteItem
      value={entry.value}
      label={entry.label}
      keywords={entry.keywords}
      disabled={entry.disabled}
    >
      {entry.label}
    </AutocompleteItem>
  {/if}
{/each}
