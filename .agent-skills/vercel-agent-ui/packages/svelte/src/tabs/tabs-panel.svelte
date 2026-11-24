<!--
@component
The content of the tab with the same `value`, shown while that tab is selected.
@stable
-->
<script lang="ts">
  import {
    tabs,
    type TabsPanelProps,
    type TabsPanelState,
  } from "@ui-sdk/core/tabs"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"

  let {
    value,
    keepMounted,
    hiddenUntilFound,
    ...rest
  }: PartProps<"div", TabsPanelState> & TabsPanelProps = $props()

  const panel = usePart(tabs, "panel", () => ({
    value,
    keepMounted,
    hiddenUntilFound,
  }))
</script>

{#if panel.present}
  <Part tag="div" part={panel} props={rest} />
{/if}
