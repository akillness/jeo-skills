<!--
@component
A moment across every row, like DOMContentLoaded, placed by `--waterfall-mark`.
@experimental
-->
<script lang="ts">
  import {
    waterfall,
    type WaterfallTimeProps,
    type WaterfallTimeState,
  } from "@ui-sdk/core/waterfall"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"

  let {
    time,
    ...rest
  }: PartProps<"span", WaterfallTimeState> & WaterfallTimeProps = $props()

  const mark = usePart(waterfall, "mark", () => ({ time }))
</script>

<Part tag="span" part={mark} props={rest} />
