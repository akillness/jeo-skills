<!--
@component
The content the trigger shows and hides. Closed, it leaves the page unless `keepMounted` or
`hiddenUntilFound` keeps it.
@stable
-->
<script lang="ts">
  import {
    collapsible,
    type CollapsiblePanelProps,
    type CollapsiblePanelState,
  } from "@ui-sdk/core/collapsible"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"

  let {
    keepMounted,
    hiddenUntilFound,
    ...rest
  }: PartProps<"div", CollapsiblePanelState> & CollapsiblePanelProps = $props()

  const panel = usePart(collapsible, "panel", () => ({
    keepMounted,
    hiddenUntilFound,
  }))
</script>

{#if panel.present}
  <Part tag="div" part={panel} props={rest} />
{/if}
