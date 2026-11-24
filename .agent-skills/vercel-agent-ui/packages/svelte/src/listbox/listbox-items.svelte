<!--
@component
Renders data items. Used by data listboxes, and available for custom layouts.
@stable
-->
<script lang="ts">
  import {
    listbox as listboxPrimitive,
    type ListData,
  } from "@ui-sdk/core/listbox"
  import { useHandle } from "../instance"
  import ListboxGroupLabel from "./listbox-group-label.svelte"
  import ListboxGroup from "./listbox-group.svelte"
  import ListboxItem from "./listbox-item.svelte"
  import Self from "./listbox-items.svelte"
  import ListboxSeparator from "./listbox-separator.svelte"

  let { items }: { items: ListData<unknown> } = $props()

  const listbox = useHandle(listboxPrimitive)
</script>

{#each items as entry, index (typeof entry === "string" ? entry : "type" in entry ? `${entry.type}-${index}` : listbox.api.internal.keyOf(entry.value))}
  {#if typeof entry === "string"}
    <ListboxItem value={entry}>{entry}</ListboxItem>
  {:else if "type" in entry && entry.type === "separator"}
    <ListboxSeparator />
  {:else if "type" in entry && entry.type === "group"}
    <ListboxGroup>
      {#if entry.label}<ListboxGroupLabel>{entry.label}</ListboxGroupLabel>{/if}
      <Self items={entry.items} />
    </ListboxGroup>
  {:else}
    <ListboxItem
      value={entry.value}
      label={entry.label}
      disabled={entry.disabled}
    >
      {entry.label}
    </ListboxItem>
  {/if}
{/each}
