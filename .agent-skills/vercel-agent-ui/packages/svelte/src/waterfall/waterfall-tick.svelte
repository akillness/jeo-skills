<!--
@component
One time on the axis, placed by `--waterfall-tick`. Without children, it shows the time.
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
    children,
    ...rest
  }: PartProps<"span", WaterfallTimeState> & WaterfallTimeProps = $props()

  const tick = usePart(waterfall, "tick", () => ({ time }))
</script>

{#snippet label(state: WaterfallTimeState)}{state.label}{/snippet}

<Part tag="span" part={tick} props={{ ...rest, children: children ?? label }} />
