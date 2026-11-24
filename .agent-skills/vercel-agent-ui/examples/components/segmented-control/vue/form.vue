<script setup lang="ts">
import { Field, FieldDescription, FieldLabel } from "@ui-sdk/vue/field"
import {
  SegmentedControl,
  SegmentedControlIndicator,
  SegmentedControlItem,
} from "@ui-sdk/vue/segmented-control"
import { useLog } from "../../../shared/vue/log"

const log = useLog()

function submit(event: Event) {
  const data = new FormData(event.currentTarget as HTMLFormElement)
  log(`Saved theme=${data.get("theme")}, density=${data.get("density")}`)
}
</script>

<template>
  <form data-slot="stack" @submit.prevent="submit">
    <Field>
      <FieldLabel>Theme</FieldLabel>
      <SegmentedControl name="theme" required default-value="system">
        <SegmentedControlIndicator />
        <SegmentedControlItem value="light">Light</SegmentedControlItem>
        <SegmentedControlItem value="dark">Dark</SegmentedControlItem>
        <SegmentedControlItem value="system">System</SegmentedControlItem>
      </SegmentedControl>
      <FieldDescription>System follows your device's setting.</FieldDescription>
    </Field>
    <Field>
      <FieldLabel>Density</FieldLabel>
      <SegmentedControl name="density" default-value="comfortable">
        <SegmentedControlIndicator />
        <SegmentedControlItem value="compact">Compact</SegmentedControlItem>
        <SegmentedControlItem value="comfortable"
          >Comfortable</SegmentedControlItem
        >
      </SegmentedControl>
    </Field>
    <div data-slot="row">
      <button type="submit" data-variant="solid">Save</button>
      <button type="reset">Reset</button>
    </div>
  </form>
</template>
