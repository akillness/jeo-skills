"use client"

import { Field, FieldLabel } from "@ui-sdk/react/field"
import {
  SegmentedControl,
  SegmentedControlIndicator,
  SegmentedControlItem,
} from "@ui-sdk/react/segmented-control"

function Example() {
  return (
    <Field>
      <FieldLabel>Vertical alignment</FieldLabel>
      <SegmentedControl orientation="vertical" defaultValue="middle">
        <SegmentedControlIndicator />
        <SegmentedControlItem value="top">Top</SegmentedControlItem>
        <SegmentedControlItem value="middle">Middle</SegmentedControlItem>
        <SegmentedControlItem value="bottom">Bottom</SegmentedControlItem>
      </SegmentedControl>
    </Field>
  )
}

export { Example }
