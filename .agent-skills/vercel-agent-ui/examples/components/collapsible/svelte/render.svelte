<script lang="ts">
  import { ChevronDownIcon } from "@lucide/svelte"
  import {
    Collapsible,
    CollapsiblePanel,
    CollapsibleTrigger,
  } from "@ui-sdk/svelte/collapsible"

  const updates = [
    { label: "Out for delivery", time: "07:40" },
    { label: "Arrived at the local depot", time: "05:12" },
    { label: "Left the sorting center", time: "Wed 21:03" },
  ]
</script>

<Collapsible data-variant="card">
  <CollapsibleTrigger>
    {#snippet render({ props, state, children })}
      <h3>
        <button {...props}>{@render children?.(state)}</button>
      </h3>
    {/snippet}
    {#snippet children(state)}
      <span data-slot="stack">
        <span>Track parcel</span>
        <span data-slot="hint"
          >{state.open ? "3 updates" : "Arrives Thursday"}</span
        >
      </span>
      <ChevronDownIcon />
    {/snippet}
  </CollapsibleTrigger>
  <CollapsiblePanel>
    {#snippet render({ props })}
      <ol {...props}>
        {#each updates as update (update.label)}
          <li data-slot="row">
            <span>{update.label}</span>
            <span>{update.time}</span>
          </li>
        {/each}
      </ol>
    {/snippet}
  </CollapsiblePanel>
</Collapsible>
