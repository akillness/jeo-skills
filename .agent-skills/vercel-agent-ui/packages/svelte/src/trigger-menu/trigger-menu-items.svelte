<!--
@component
Renders data items. Used by data menus, and available for custom layouts.
@stable
-->
<script lang="ts">
  import { triggerMenu, type TriggerMenuData } from "@ui-sdk/core/trigger-menu"
  import { useHandle } from "../instance"
  import TriggerMenuGroupLabel from "./trigger-menu-group-label.svelte"
  import TriggerMenuGroup from "./trigger-menu-group.svelte"
  import TriggerMenuItem from "./trigger-menu-item.svelte"
  import Self from "./trigger-menu-items.svelte"
  import TriggerMenuSeparator from "./trigger-menu-separator.svelte"

  let { items }: { items: TriggerMenuData<unknown> } = $props()

  const menu = useHandle(triggerMenu)
</script>

{#each items as entry, index (typeof entry === "string" ? entry : "type" in entry ? `${entry.type}-${index}` : menu.api.internal.keyOf(entry.value))}
  {#if typeof entry === "string"}
    <TriggerMenuItem value={entry}>{entry}</TriggerMenuItem>
  {:else if "type" in entry && entry.type === "separator"}
    <TriggerMenuSeparator />
  {:else if "type" in entry && entry.type === "group"}
    <TriggerMenuGroup>
      {#if entry.label}<TriggerMenuGroupLabel
          >{entry.label}</TriggerMenuGroupLabel
        >{/if}
      <Self items={entry.items} />
    </TriggerMenuGroup>
  {:else}
    <TriggerMenuItem
      value={entry.value}
      label={entry.label}
      keywords={entry.keywords}
      disabled={entry.disabled}
    >
      {entry.label}
    </TriggerMenuItem>
  {/if}
{/each}
