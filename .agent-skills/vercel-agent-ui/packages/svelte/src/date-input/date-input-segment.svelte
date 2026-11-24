<!--
@component
A segment, like the month: an input arrow keys step and digits fill, named
by its unit. The text between segments renders as a span.
@stable
-->
<script lang="ts">
  import {
    dateInput,
    type DateInputSegmentProps,
    type DateInputSegmentState,
  } from "@ui-sdk/core/date-input"
  import type { PartProps } from "../use-primitive.svelte"
  import Segment from "./segment.svelte"

  let props: PartProps<"input", DateInputSegmentState> & DateInputSegmentProps =
    $props()
</script>

<Segment primitive={dateInput} {...props} />
