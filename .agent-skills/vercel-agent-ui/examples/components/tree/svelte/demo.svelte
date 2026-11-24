<script lang="ts">
  import {
    ChevronRightIcon,
    FileIcon,
    FolderIcon,
    FolderOpenIcon,
  } from "@lucide/svelte"
  import {
    Tree,
    TreeGroup,
    TreeItem,
    TreeItemIndicator,
    TreeItemLabel,
  } from "@ui-sdk/svelte/tree"

  type Node = { value: string; label: string; children?: Node[] }

  const files: Node[] = [
    {
      value: "app",
      label: "app",
      children: [
        { value: "app/layout.tsx", label: "layout.tsx" },
        { value: "app/page.tsx", label: "page.tsx" },
        {
          value: "app/settings",
          label: "settings",
          children: [{ value: "app/settings/page.tsx", label: "page.tsx" }],
        },
      ],
    },
    {
      value: "components",
      label: "components",
      children: [
        { value: "components/button.tsx", label: "button.tsx" },
        { value: "components/card.tsx", label: "card.tsx" },
      ],
    },
    { value: "components.json", label: "components.json" },
    { value: "package.json", label: "package.json" },
    { value: "README.md", label: "README.md" },
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
          <FolderIcon aria-hidden="true" />
          <FolderOpenIcon aria-hidden="true" />
        {:else}
          <FileIcon aria-hidden="true" />
        {/if}
        <span>{item.label}</span>
      </TreeItemLabel>
      {#if item.children}
        <TreeGroup>
          {@render items(item.children)}
        </TreeGroup>
      {/if}
    </TreeItem>
  {/each}
{/snippet}

<Tree aria-label="Files" defaultExpanded={["app"]} defaultValue="app/page.tsx">
  {@render items(files)}
</Tree>
