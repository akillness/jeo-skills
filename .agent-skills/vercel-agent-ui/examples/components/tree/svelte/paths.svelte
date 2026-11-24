<script lang="ts">
  import { ChevronRightIcon, LoaderCircleIcon } from "@lucide/svelte"
  import {
    Tree,
    TreeGroup,
    TreeItem,
    TreeItemIndicator,
    TreeItemLabel,
    treeFromPaths,
    type TreeItemData,
  } from "@ui-sdk/svelte/tree"
  import { useLog } from "../../../shared/svelte/log"

  const paths = [
    "src/index.ts",
    "src/lib/format.ts",
    "src/lib/parse.ts",
    "src/routes/home.tsx",
    "src/routes/about.tsx",
    "tests/",
    "package.json",
    "tsconfig.json",
  ]

  const items = treeFromPaths(paths)
  const files = new Set(paths.filter((path) => !path.endsWith("/")))

  const log = useLog()

  async function onAction(value: string) {
    if (!files.has(value)) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 600))
    log(`Opened ${value}`)
  }
</script>

{#snippet treeItems(nodes: TreeItemData[])}
  {#each nodes as item (item.value)}
    <TreeItem value={item.value}>
      <TreeItemLabel>
        {#snippet children(state)}
          {#if item.children}
            <TreeItemIndicator>
              <ChevronRightIcon aria-hidden="true" />
            </TreeItemIndicator>
          {/if}
          <span>{item.label}</span>
          {#if state.pending}
            <LoaderCircleIcon aria-hidden="true" />
          {/if}
        {/snippet}
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
  aria-label="Project"
  {paths}
  defaultExpanded={["src"]}
  defaultValue="src/index.ts"
  activation="automatic"
  {onAction}
>
  {@render treeItems(items)}
</Tree>
