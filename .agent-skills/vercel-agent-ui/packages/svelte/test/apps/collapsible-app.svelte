<script lang="ts">
  import {
    Collapsible,
    CollapsiblePanel,
    CollapsibleTrigger,
  } from "../../src/collapsible"

  let {
    defaultOpen,
    panel = {},
  }: {
    defaultOpen?: boolean
    panel?: { hiddenUntilFound?: boolean; keepMounted?: boolean }
  } = $props()
</script>

<Collapsible {defaultOpen}>
  <CollapsibleTrigger>Details</CollapsibleTrigger>
  <CollapsiblePanel {...panel}>Panel</CollapsiblePanel>
</Collapsible>
