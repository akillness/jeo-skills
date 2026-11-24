<!--
@component
The ruler of round times above the bars, hidden from screen readers. Without children, it renders its ticks.
@experimental
-->
<script lang="ts">
  import {
    waterfall,
    type WaterfallAxisProps,
    type WaterfallAxisState,
  } from "@ui-sdk/core/waterfall"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"
  import WaterfallTick from "./waterfall-tick.svelte"

  let {
    maxTicks,
    children,
    ...rest
  }: PartProps<"div", WaterfallAxisState> & WaterfallAxisProps = $props()

  const axis = usePart(waterfall, "axis", () => ({ maxTicks }))
</script>

{#snippet ticks(state: WaterfallAxisState)}
  {#each state.ticks as tick (tick.time)}
    <WaterfallTick time={tick.time} />
  {/each}
{/snippet}

<Part tag="div" part={axis} props={{ ...rest, children: children ?? ticks }} />
