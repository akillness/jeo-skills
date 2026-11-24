<script lang="ts">
  import { ChevronRightIcon } from "@lucide/svelte"
  import {
    Tree,
    TreeItem,
    TreeItemIndicator,
    TreeItemLabel,
    visibleTreeRows,
    type TreeItemData,
  } from "@ui-sdk/svelte/tree"

  const items: TreeItemData[] = Array.from({ length: 100 }, (_, folder) => ({
    value: `folder-${folder + 1}`,
    label: `Folder ${folder + 1}`,
    children: Array.from({ length: 100 }, (_, file) => ({
      value: `folder-${folder + 1}/file-${file + 1}`,
      label: `File ${file + 1}.txt`,
    })),
  }))

  const row = 32
  const height = 288

  let scroller: HTMLDivElement | undefined = $state()
  let scrollTop = $state(0)
  let expanded = $state(["folder-1"])
  const rows = $derived(visibleTreeRows(items, expanded))
  const start = $derived(Math.max(0, Math.floor(scrollTop / row) - 4))
  const end = $derived(
    Math.min(rows.length, Math.ceil((scrollTop + height) / row) + 4)
  )

  function onHighlight(_value: string, { index }: { index: number }) {
    const el = scroller
    if (!el) {
      return
    }
    const top = index * row
    if (top < el.scrollTop) {
      el.scrollTop = top
    } else if (top + row > el.scrollTop + el.clientHeight - 10) {
      el.scrollTop = top + row - el.clientHeight + 10
    }
    scrollTop = el.scrollTop
  }
</script>

<div
  data-slot="scroll"
  bind:this={scroller}
  onscroll={(event) => (scrollTop = event.currentTarget.scrollTop)}
>
  <Tree
    aria-label="Archive"
    {items}
    bind:expanded
    {onHighlight}
    style="height: {rows.length * row}px"
  >
    {#each rows.slice(start, end) as { item, index } (item.value)}
      <TreeItem value={item.value} style="top: {index * row}px">
        <TreeItemLabel>
          {#if item.children}
            <TreeItemIndicator>
              <ChevronRightIcon aria-hidden="true" />
            </TreeItemIndicator>
          {/if}
          {item.label}
        </TreeItemLabel>
      </TreeItem>
    {/each}
  </Tree>
</div>
