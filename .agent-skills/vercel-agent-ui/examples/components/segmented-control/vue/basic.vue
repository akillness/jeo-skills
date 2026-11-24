<script setup lang="ts">
import { Field, FieldLabel } from "@ui-sdk/vue/field"
import {
  SegmentedControl,
  SegmentedControlIndicator,
  SegmentedControlItem,
} from "@ui-sdk/vue/segmented-control"
</script>

<template>
  <Field>
    <FieldLabel>View</FieldLabel>
    <SegmentedControl default-value="list">
      <SegmentedControlIndicator />
      <SegmentedControlItem value="list">List</SegmentedControlItem>
      <SegmentedControlItem value="grid">Grid</SegmentedControlItem>
      <SegmentedControlItem value="board">Board</SegmentedControlItem>
    </SegmentedControl>
  </Field>
</template>
