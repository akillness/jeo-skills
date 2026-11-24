<!--
@component
Renders data items. Used by data trees, and available for custom layouts.
@stable
-->
<script lang="ts">
  import type { TreeItemData } from "@ui-sdk/core/tree"
  import { getContext } from "svelte"
  import type { SlotAttributes } from "../use-primitive.svelte"
  import { DataKey, type DataContext } from "./context"
  import TreeGroup from "./tree-group.svelte"
  import TreeItemCheckbox from "./tree-item-checkbox.svelte"
  import TreeItemLabel from "./tree-item-label.svelte"
  import TreeItem from "./tree-item.svelte"
  import Self from "./tree-items.svelte"

  let { items }: { items: TreeItemData[] } = $props()

  const data = getContext<DataContext | undefined>(DataKey)
</script>

{#each items as item (item.value)}
  {#snippet link({ props }: { props: SlotAttributes })}
    <a {...props}>{item.label}</a>
  {/snippet}
  <TreeItem
    value={item.value}
    branch={item.children !== undefined}
    disabled={item.disabled}
  >
    {#if data?.checkable()}<TreeItemCheckbox />{/if}
    <TreeItemLabel href={item.href} render={item.href ? link : undefined}>
      {item.label}
    </TreeItemLabel>
    {#if item.children}
      <TreeGroup>
        <Self items={item.children} />
      </TreeGroup>
    {/if}
  </TreeItem>
{/each}
