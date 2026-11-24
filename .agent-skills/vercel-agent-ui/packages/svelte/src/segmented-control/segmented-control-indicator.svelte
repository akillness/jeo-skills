<!--
@component
Sits behind the checked item. Its box comes from the
`--segmented-control-indicator-*` variables, measured from the root.
@experimental
-->
<script lang="ts">
  import {
    segmentedControl,
    type SegmentedControlIndicatorState,
  } from "@ui-sdk/core/segmented-control"
  import { usePart } from "../instance"
  import Part from "../part.svelte"
  import type { PartProps } from "../use-primitive.svelte"

  let props: PartProps<"span", SegmentedControlIndicatorState> = $props()

  const indicator = usePart(segmentedControl, "indicator")
</script>

<Part tag="span" part={indicator} {props} />
