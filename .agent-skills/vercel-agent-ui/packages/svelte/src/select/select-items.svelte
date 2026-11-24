<!--
@component
Renders data items. Used by data selects, and available for custom layouts.
@stable
-->
<script lang="ts">
  import { select as selectPrimitive, type ListData } from "@ui-sdk/core/select"
  import { useHandle } from "../instance"
  import SelectGroupLabel from "./select-group-label.svelte"
  import SelectGroup from "./select-group.svelte"
  import SelectItem from "./select-item.svelte"
  import Self from "./select-items.svelte"
  import SelectSeparator from "./select-separator.svelte"

  let { items }: { items: ListData<unknown> } = $props()

  const select = useHandle(selectPrimitive)
</script>

{#each items as entry, index (typeof entry === "string" ? entry : "type" in entry ? `${entry.type}-${index}` : select.api.internal.keyOf(entry.value))}
  {#if typeof entry === "string"}
    <SelectItem value={entry}>{entry}</SelectItem>
  {:else if "type" in entry && entry.type === "separator"}
    <SelectSeparator />
  {:else if "type" in entry && entry.type === "group"}
    <SelectGroup>
      {#if entry.label}<SelectGroupLabel>{entry.label}</SelectGroupLabel>{/if}
      <Self items={entry.items} />
    </SelectGroup>
  {:else}
    <SelectItem
      value={entry.value}
      label={entry.label}
      disabled={entry.disabled}
    >
      {entry.label}
    </SelectItem>
  {/if}
{/each}
