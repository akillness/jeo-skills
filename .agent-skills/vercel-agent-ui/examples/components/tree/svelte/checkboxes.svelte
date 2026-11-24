<script lang="ts">
  import { ChevronRightIcon } from "@lucide/svelte"
  import {
    Tree,
    TreeGroup,
    TreeItem,
    TreeItemCheckbox,
    TreeItemIndicator,
    TreeItemLabel,
    type TreeItemData,
  } from "@ui-sdk/svelte/tree"
  import { useLog } from "../../../shared/svelte/log"

  const items: TreeItemData[] = [
    {
      value: "frontend",
      label: "Frontend",
      children: [
        { value: "react", label: "React" },
        { value: "vue", label: "Vue" },
        { value: "svelte", label: "Svelte" },
      ],
    },
    {
      value: "backend",
      label: "Backend",
      children: [
        { value: "node", label: "Node" },
        {
          value: "databases",
          label: "Databases",
          children: [
            { value: "postgres", label: "Postgres" },
            { value: "sqlite", label: "SQLite" },
          ],
        },
      ],
    },
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
        <TreeItemCheckbox />
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
  aria-label="Stack"
  {items}
  checkable
  mode="none"
  checkStrategy="trunk"
  defaultChecked={["react", "postgres"]}
  onCheckedChange={(checked) =>
    log(`Checked ${checked.join(", ") || "nothing"}`)}
  defaultExpanded={["frontend", "backend", "databases"]}
>
  {@render treeItems(items)}
</Tree>
