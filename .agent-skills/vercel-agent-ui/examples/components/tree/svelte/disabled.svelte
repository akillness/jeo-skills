<script lang="ts">
  import { ChevronRightIcon } from "@lucide/svelte"
  import { Switch, SwitchThumb } from "@ui-sdk/svelte/switch"
  import {
    Tree,
    TreeGroup,
    TreeItem,
    TreeItemIndicator,
    TreeItemLabel,
    type TreeItemData,
  } from "@ui-sdk/svelte/tree"

  const items: TreeItemData[] = [
    {
      value: "plans",
      label: "Plans",
      children: [
        { value: "free", label: "Free" },
        { value: "pro", label: "Pro" },
        { value: "enterprise", label: "Enterprise", disabled: true },
      ],
    },
    {
      value: "legacy",
      label: "Legacy plans",
      disabled: true,
      children: [{ value: "starter", label: "Starter" }],
    },
    { value: "custom", label: "Custom" },
  ]

  let focusable = $state(true)
</script>

{#snippet treeItems(nodes: TreeItemData[])}
  {#each nodes as item (item.value)}
    <TreeItem value={item.value} disabled={item.disabled}>
      <TreeItemLabel>
        {#if item.children}
          <TreeItemIndicator>
            <ChevronRightIcon aria-hidden="true" />
          </TreeItemIndicator>
        {/if}
        {item.label}
      </TreeItemLabel>
      {#if item.children}
        <TreeGroup>
          {@render treeItems(item.children)}
        </TreeGroup>
      {/if}
    </TreeItem>
  {/each}
{/snippet}

<div data-slot="stack">
  <div data-slot="controls">
    <label data-slot="label">
      <Switch bind:checked={focusable}>
        <SwitchThumb />
      </Switch>
      Focusable when disabled
    </label>
  </div>
  <Tree
    aria-label="Plans"
    {items}
    defaultExpanded={["plans"]}
    focusableWhenDisabled={focusable}
  >
    {@render treeItems(items)}
  </Tree>
</div>
