<!--
@component
A cell of your own, like a status or a size.
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

  const part = usePart(waterfall, "cell", useRow().partProps)
</script>

<Part tag="div" {part} {props} />
