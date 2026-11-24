<script lang="ts">
  import { ChevronRightIcon } from "@lucide/svelte"
  import {
    Tree,
    TreeGroup,
    TreeItem,
    TreeItemIndicator,
    TreeItemLabel,
  } from "@ui-sdk/svelte/tree"

  type Node = { value: string; label: string; children?: Node[] }

  const folders: Node[] = [
    {
      value: "documents",
      label: "المستندات",
      children: [
        { value: "reports", label: "التقارير" },
        { value: "invoices", label: "الفواتير" },
      ],
    },
    {
      value: "photos",
      label: "الصور",
      children: [
        { value: "trips", label: "الرحلات" },
        { value: "family", label: "العائلة" },
      ],
    },
    { value: "downloads", label: "التنزيلات" },
  ]
</script>

{#snippet items(nodes: Node[])}
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

<div dir="rtl">
  <Tree aria-label="الملفات" defaultExpanded={["documents"]}>
    {@render items(folders)}
  </Tree>
</div>
