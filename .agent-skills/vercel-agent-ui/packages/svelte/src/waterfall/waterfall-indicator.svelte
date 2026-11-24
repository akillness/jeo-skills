<!--
@component
The arrow that expands and collapses a span with children.
@experimental
-->
<script lang="ts">
  import {
    waterfall,
    type WaterfallRowPartProps,
    type WaterfallRowState,
  } from "@ui-sdk/core/waterfall"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"
  import { useRow } from "./context"

  let props: PartProps<"span", WaterfallRowState> & WaterfallRowPartProps =
    $props()

  const part = usePart(waterfall, "indicator", useRow().partProps)
</script>

<Part tag="span" {part} {props} />
