<script lang="ts">
  import { ChevronRightIcon } from "@lucide/svelte"
  import {
    Tree,
    TreeGroup,
    TreeItem,
    TreeItemIndicator,
    TreeItemLabel,
    type TreeItemData,
  } from "@ui-sdk/svelte/tree"
  import { useLog } from "../../../shared/svelte/log"

  const items: TreeItemData[] = [
    {
      value: "inbox",
      label: "Inbox",
      children: [
        { value: "updates", label: "Updates" },
        { value: "forums", label: "Forums" },
        { value: "promotions", label: "Promotions" },
      ],
    },
    {
      value: "projects",
      label: "Projects",
      children: [
        { value: "website", label: "Website" },
        { value: "mobile", label: "Mobile app" },
      ],
    },
    { value: "archive", label: "Archive" },
    { value: "trash", label: "Trash" },
  ]

  const log = useLog()
</script>

{#snippet treeItems(nodes: TreeItemData[])}
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
          {@render treeItems(item.children)}
        </TreeGroup>
      {/if}
    </TreeItem>
  {/each}
{/snippet}

<Tree
  aria-label="Folders"
  {items}
  mode="multiple"
  defaultValue={["updates", "website"]}
  onValueChange={(value) =>
    log(`${value.length} selected: ${value.join(", ")}`)}
  expandOnPress={false}
  defaultExpanded={["inbox", "projects"]}
>
  {@render treeItems(items)}
</Tree>
