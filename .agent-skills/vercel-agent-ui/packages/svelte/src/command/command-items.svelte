<!--
@component
Renders data commands. Used by data command lists, and available for custom layouts.
@stable
-->
<script lang="ts">
  import type { CommandData } from "@ui-sdk/core/command"
  import { setContext } from "svelte"
  import { DataKey } from "./context"
  import CommandGroupLabel from "./command-group-label.svelte"
  import CommandGroup from "./command-group.svelte"
  import CommandItem from "./command-item.svelte"
  import Self from "./command-items.svelte"
  import CommandSeparator from "./command-separator.svelte"

  let { items }: { items: CommandData } = $props()

  // Data commands' shortcuts are bound by the root, not by each command.
  setContext(DataKey, true)
</script>

{#each items as entry, index (typeof entry === "string" ? entry : "type" in entry ? `${entry.type}-${index}` : entry.value)}
  {#if typeof entry === "string"}
    <CommandItem value={entry}>{entry}</CommandItem>
  {:else if "type" in entry && entry.type === "separator"}
    <CommandSeparator />
  {:else if "type" in entry && entry.type === "group"}
    <CommandGroup>
      {#if entry.label}<CommandGroupLabel>{entry.label}</CommandGroupLabel>{/if}
      <Self items={entry.items} />
    </CommandGroup>
  {:else}
    <CommandItem
      value={entry.value}
      label={entry.label}
      keywords={entry.keywords}
      disabled={entry.disabled}
      shortcut={entry.shortcut}
    >
      {entry.label}
    </CommandItem>
  {/if}
{/each}
