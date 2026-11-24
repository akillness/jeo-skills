<!--
@component
One option, and the hidden native radio that takes part in the form.
@experimental
-->
<script lang="ts">
  import {
    segmentedControl,
    type SegmentedControlItemProps,
    type SegmentedControlItemState,
  } from "@ui-sdk/core/segmented-control"
  import { usePart } from "../instance"
  import Part from "../part.svelte"
  import type { PartProps } from "../use-primitive.svelte"

  let {
    value,
    disabled,
    ...rest
  }: PartProps<"button", SegmentedControlItemState> &
    SegmentedControlItemProps = $props()

  const item = () => ({ value, disabled })
  const button = usePart(segmentedControl, "item", item)
  const input = usePart(segmentedControl, "input", item)
</script>

<Part tag="button" part={button} props={rest} />
<input {...input.slot()} />
