<script lang="ts">
  import { Field, FieldLabel } from "@ui-sdk/svelte/field"
  import {
    SegmentedControl,
    SegmentedControlIndicator,
    SegmentedControlItem,
  } from "@ui-sdk/svelte/segmented-control"
</script>

<Field>
  <FieldLabel>View</FieldLabel>
  <SegmentedControl defaultValue="list">
    <SegmentedControlIndicator />
    <SegmentedControlItem value="list">List</SegmentedControlItem>
    <SegmentedControlItem value="grid">Grid</SegmentedControlItem>
    <SegmentedControlItem value="board">Board</SegmentedControlItem>
  </SegmentedControl>
</Field>
