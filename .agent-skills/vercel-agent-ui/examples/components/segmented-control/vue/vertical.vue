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
    <FieldLabel>Vertical alignment</FieldLabel>
    <SegmentedControl orientation="vertical" default-value="middle">
      <SegmentedControlIndicator />
      <SegmentedControlItem value="top">Top</SegmentedControlItem>
      <SegmentedControlItem value="middle">Middle</SegmentedControlItem>
      <SegmentedControlItem value="bottom">Bottom</SegmentedControlItem>
    </SegmentedControl>
  </Field>
</template>
