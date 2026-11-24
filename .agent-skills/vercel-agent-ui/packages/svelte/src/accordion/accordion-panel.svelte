<!--
@component
The content its item's trigger shows and hides.
@stable
-->
<script lang="ts">
  import {
    accordion,
    type AccordionPanelProps,
    type AccordionPanelState,
  } from "@ui-sdk/core/accordion"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"
  import { useItemValue } from "./context"

  let {
    keepMounted,
    hiddenUntilFound,
    ...rest
  }: PartProps<"div", AccordionPanelState> & AccordionPanelProps = $props()

  const value = useItemValue()
  const panel = usePart(accordion, "panel", () => ({
    value: value(),
    keepMounted,
    hiddenUntilFound,
  }))
</script>

{#if panel.present}
  <Part tag="div" part={panel} props={rest} />
{/if}
