<script lang="ts">
  import { Field, FieldLabel } from "@ui-sdk/svelte/field"
  import {
    SegmentedControl,
    SegmentedControlIndicator,
    SegmentedControlItem,
  } from "@ui-sdk/svelte/segmented-control"
</script>

<Field>
  <FieldLabel>Vertical alignment</FieldLabel>
  <SegmentedControl orientation="vertical" defaultValue="middle">
    <SegmentedControlIndicator />
    <SegmentedControlItem value="top">Top</SegmentedControlItem>
    <SegmentedControlItem value="middle">Middle</SegmentedControlItem>
    <SegmentedControlItem value="bottom">Bottom</SegmentedControlItem>
  </SegmentedControl>
</Field>
