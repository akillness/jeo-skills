<script lang="ts">
  import { ChevronRightIcon } from "@lucide/svelte"
  import {
    createTreeController,
    Tree,
    TreeGroup,
    TreeItem,
    TreeItemIndicator,
    TreeItemLabel,
    type TreeItemData,
  } from "@ui-sdk/svelte/tree"

  const sections: TreeItemData[] = [
    {
      value: "account",
      label: "Account",
      children: [
        { value: "profile", label: "Profile" },
        {
          value: "security",
          label: "Security",
          children: [
            { value: "password", label: "Password" },
            { value: "two-factor", label: "Two-factor authentication" },
          ],
        },
      ],
    },
    {
      value: "workspace",
      label: "Workspace",
      children: [
        { value: "members", label: "Members" },
        { value: "billing", label: "Billing" },
      ],
    },
  ]

  const settings = createTreeController()
</script>

{#snippet items(nodes: TreeItemData[])}
  {#each nodes as item (item.value)}
    <TreeItem value={item.value}>
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
          {@render items(item.children)}
        </TreeGroup>
      {/if}
    </TreeItem>
  {/each}
{/snippet}

<div data-slot="stack">
  <div data-slot="controls">
    <button type="button" onclick={() => settings.expandAll()}
      >Expand All</button
    >
    <button type="button" onclick={() => settings.collapseAll()}
      >Collapse All</button
    >
    <button
      type="button"
      onclick={() => {
        settings.setValue("two-factor")
        settings.reveal("two-factor")
      }}
    >
      Find Two-Factor
    </button>
  </div>
  <Tree aria-label="Settings" items={sections} controller={settings}>
    {@render items(sections)}
  </Tree>
</div>
