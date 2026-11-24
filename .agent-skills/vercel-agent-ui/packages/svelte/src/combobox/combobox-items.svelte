<!--
@component
Renders data items. Used by data comboboxes, and available for custom layouts.
@stable
-->
<script lang="ts">
  import {
    combobox as comboboxPrimitive,
    type ListData,
  } from "@ui-sdk/core/combobox"
  import { useHandle } from "../instance"
  import ComboboxGroupLabel from "./combobox-group-label.svelte"
  import ComboboxGroup from "./combobox-group.svelte"
  import ComboboxItem from "./combobox-item.svelte"
  import Self from "./combobox-items.svelte"
  import ComboboxSeparator from "./combobox-separator.svelte"

  let { items }: { items: ListData<unknown> } = $props()

  const combobox = useHandle(comboboxPrimitive)
</script>

{#each items as entry, index (typeof entry === "string" ? entry : "type" in entry ? `${entry.type}-${index}` : combobox.api.internal.keyOf(entry.value))}
  {#if typeof entry === "string"}
    <ComboboxItem value={entry}>{entry}</ComboboxItem>
  {:else if "type" in entry && entry.type === "separator"}
    <ComboboxSeparator />
  {:else if "type" in entry && entry.type === "group"}
    <ComboboxGroup>
      {#if entry.label}<ComboboxGroupLabel>{entry.label}</ComboboxGroupLabel
        >{/if}
      <Self items={entry.items} />
    </ComboboxGroup>
  {:else}
    <ComboboxItem
      value={entry.value}
      label={entry.label}
      keywords={entry.keywords}
      disabled={entry.disabled}
    >
      {entry.label}
    </ComboboxItem>
  {/if}
{/each}
