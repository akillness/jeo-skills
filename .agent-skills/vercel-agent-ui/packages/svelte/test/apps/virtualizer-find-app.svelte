<script lang="ts">
  import type { VirtualItem, Virtualizer } from "@ui-sdk/core"

  let { virtual }: { virtual: Virtualizer } = $props()
  let items = $state.raw<VirtualItem[]>([])
  $effect(() => {
    items = virtual.items()
    return virtual.subscribe(() => (items = virtual.items()))
  })
</script>

{#each items as item (item.key)}
  <div data-index={item.index}>
    <span {@attach (span) => virtual.findableText(item.index, span, 0)}></span>
    <span {@attach (span) => virtual.findableText(item.index, span, 1)}></span>
  </div>
{/each}
