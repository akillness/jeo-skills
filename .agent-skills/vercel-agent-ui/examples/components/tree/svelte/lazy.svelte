<script lang="ts">
  import {
    ChevronRightIcon,
    LoaderCircleIcon,
    RotateCwIcon,
  } from "@lucide/svelte"
  import {
    Tree,
    TreeGroup,
    TreeItem,
    TreeItemIndicator,
    TreeItemLabel,
    type TreeAnnouncement,
  } from "@ui-sdk/svelte/tree"

  type Node = { value: string; label: string; branch?: boolean }

  const top: Node[] = [
    { value: "users", label: "users", branch: true },
    { value: "orders", label: "orders", branch: true },
    { value: "archive", label: "archive", branch: true },
  ]

  let archiveAsked = false
  async function fetchChildren(value: string, signal: AbortSignal) {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, 800)
      signal.addEventListener(
        "abort",
        () => (clearTimeout(timer), reject(signal.reason))
      )
    })
    if (value === "archive" && !archiveAsked) {
      archiveAsked = true
      throw new Error("Network error")
    }
    return Array.from({ length: 3 }, (_, index) => ({
      value: `${value}/${index + 1}`,
      label: `${value.slice(0, -1)}_${index + 1}.json`,
    }))
  }

  let loaded: Record<string, Node[]> = $state({})

  async function loadChildren(
    value: string,
    { signal }: { signal: AbortSignal }
  ) {
    loaded[value] = await fetchChildren(value, signal)
  }

  const announcement = ({ type, label }: TreeAnnouncement) =>
    ({
      expanded: "Expanded",
      collapsed: "Collapsed",
      loading: `Loading ${label}`,
      "load-failed": `${label} didn't load. Try again.`,
    })[type]
</script>

{#snippet items(nodes: Node[])}
  {#each nodes as item (item.value)}
    <TreeItem value={item.value} branch={item.branch}>
      <TreeItemLabel>
        {#if item.branch}
          <TreeItemIndicator>
            {#snippet children(state)}
              {#if state.loading}
                <LoaderCircleIcon aria-hidden="true" />
              {:else if state.failed}
                <RotateCwIcon aria-hidden="true" />
              {:else}
                <ChevronRightIcon aria-hidden="true" />
              {/if}
            {/snippet}
          </TreeItemIndicator>
        {/if}
        {item.label}
      </TreeItemLabel>
      {#if loaded[item.value]}
        <TreeGroup>
          {@render items(loaded[item.value])}
        </TreeGroup>
      {/if}
    </TreeItem>
  {/each}
{/snippet}

<Tree aria-label="Database" {loadChildren} {announcement}>
  {@render items(top)}
</Tree>
