<!--
@component
One span's row. Its `--waterfall-start` and `--waterfall-size` place the span's bar.
@experimental
-->
<script lang="ts">
  import {
    waterfall,
    type WaterfallRowProps,
    type WaterfallRowState,
  } from "@ui-sdk/core/waterfall"
  import { setContext } from "svelte"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"
  import { RowKey, type RowContext } from "./context"

  let {
    value,
    ...rest
  }: PartProps<"div", WaterfallRowState> & WaterfallRowProps = $props()

  setContext<RowContext>(RowKey, { partProps: () => ({ value }) })
  const row = usePart(waterfall, "row", () => ({ value }))
</script>

<Part tag="div" part={row} props={rest} />
