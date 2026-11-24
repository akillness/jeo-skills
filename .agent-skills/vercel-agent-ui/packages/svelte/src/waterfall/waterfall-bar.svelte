<!--
@component
The cell on the time axis, which screen readers hear as the span's start and duration.
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

  let props: PartProps<"div", WaterfallRowState> & WaterfallRowPartProps =
    $props()

  const part = usePart(waterfall, "bar", useRow().partProps)
</script>

<Part tag="div" {part} {props} />
