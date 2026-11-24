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

  const pages: TreeItemData[] = [
    {
      value: "getting-started",
      label: "Getting started",
      children: [
        { value: "introduction", label: "Introduction", href: "#introduction" },
        { value: "installation", label: "Installation", href: "#installation" },
      ],
    },
    {
      value: "components",
      label: "Components",
      children: [
        { value: "accordion", label: "Accordion", href: "#accordion" },
        { value: "dialog", label: "Dialog", href: "#dialog" },
        { value: "tree", label: "Tree", href: "#tree" },
      ],
    },
    { value: "changelog", label: "Changelog", href: "#changelog" },
  ]

  const links = new Set(
    pages
      .flatMap((page) => [page, ...(page.children ?? [])])
      .filter((page) => page.href)
      .map((page) => page.value)
  )

  let current = $state("tree")
</script>

{#snippet treeItems(nodes: TreeItemData[])}
  {#each nodes as item (item.value)}
    {#snippet link({ props }: { props: Record<string, unknown> })}
      <a {...props} href={item.href}>{item.label}</a>
    {/snippet}
    <TreeItem value={item.value}>
      <TreeItemLabel render={item.href ? link : undefined}>
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
  aria-label="Docs"
  items={pages}
  mode="none"
  {current}
  onAction={(value, { event }) => {
    if (!links.has(value)) {
      return
    }
    event?.preventDefault()
    current = value
  }}
>
  {@render treeItems(pages)}
</Tree>
