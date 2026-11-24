import { Field, FieldLabel } from "@ui-sdk/solid/field"
import {
  SegmentedControl,
  SegmentedControlIndicator,
  SegmentedControlItem,
} from "@ui-sdk/solid/segmented-control"

function Example() {
  return (
    <Field>
      <FieldLabel>View</FieldLabel>
      <SegmentedControl defaultValue="list">
        <SegmentedControlIndicator />
        <SegmentedControlItem value="list">List</SegmentedControlItem>
        <SegmentedControlItem value="grid">Grid</SegmentedControlItem>
        <SegmentedControlItem value="board">Board</SegmentedControlItem>
      </SegmentedControl>
    </Field>
  )
}

export { Example }
