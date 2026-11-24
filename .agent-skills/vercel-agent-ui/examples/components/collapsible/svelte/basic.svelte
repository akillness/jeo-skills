<script lang="ts">
  import { ChevronDownIcon } from "@lucide/svelte"
  import {
    Collapsible,
    CollapsiblePanel,
    CollapsibleTrigger,
  } from "@ui-sdk/svelte/collapsible"

  const items = [
    { name: "Linen shirt", price: "$48.00" },
    { name: "Canvas tote", price: "$18.00" },
    { name: "Wool socks", price: "$18.00" },
  ]
</script>

<Collapsible data-variant="card">
  <CollapsibleTrigger>
    <span data-slot="stack">
      <span>Order #4189</span>
      <span data-slot="hint">3 items, $84.00</span>
    </span>
    <ChevronDownIcon />
  </CollapsibleTrigger>
  <CollapsiblePanel>
    {#each items as item (item.name)}
      <div data-slot="row">
        <span>{item.name}</span>
        <span>{item.price}</span>
      </div>
    {/each}
  </CollapsiblePanel>
</Collapsible>
