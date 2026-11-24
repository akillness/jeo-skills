<script lang="ts">
  import {
    Collapsible,
    CollapsiblePanel,
    CollapsibleTrigger,
  } from "../../src/collapsible"

  let { seen }: { seen: string[] } = $props()
  let open = $state(false)

  export function set(next: boolean) {
    open = next
  }

  $effect(() => {
    open
    seen.push(
      `${!!document.querySelector(".panel")} ${!!document.querySelector(".own")}`
    )
  })
</script>

<Collapsible bind:open>
  <CollapsibleTrigger>Details</CollapsibleTrigger>
  <CollapsiblePanel class="panel">Details</CollapsiblePanel>
</Collapsible>
{#if open}<p class="own">Own</p>{/if}
