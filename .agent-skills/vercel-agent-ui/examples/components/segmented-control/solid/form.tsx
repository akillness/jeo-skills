import { Field, FieldDescription, FieldLabel } from "@ui-sdk/solid/field"
import {
  SegmentedControl,
  SegmentedControlIndicator,
  SegmentedControlItem,
} from "@ui-sdk/solid/segmented-control"
import { useLog } from "../../../shared/solid/log"

function Example() {
  const log = useLog()

  return (
    <form
      data-slot="stack"
      onSubmit={(event) => {
        event.preventDefault()
        const data = new FormData(event.currentTarget)
        log(`Saved theme=${data.get("theme")}, density=${data.get("density")}`)
      }}
    >
      <Field>
        <FieldLabel>Theme</FieldLabel>
        <SegmentedControl name="theme" required defaultValue="system">
          <SegmentedControlIndicator />
          <SegmentedControlItem value="light">Light</SegmentedControlItem>
          <SegmentedControlItem value="dark">Dark</SegmentedControlItem>
          <SegmentedControlItem value="system">System</SegmentedControlItem>
        </SegmentedControl>
        <FieldDescription>
          System follows your device's setting.
        </FieldDescription>
      </Field>
      <Field>
        <FieldLabel>Density</FieldLabel>
        <SegmentedControl name="density" defaultValue="comfortable">
          <SegmentedControlIndicator />
          <SegmentedControlItem value="compact">Compact</SegmentedControlItem>
          <SegmentedControlItem value="comfortable">
            Comfortable
          </SegmentedControlItem>
        </SegmentedControl>
      </Field>
      <div data-slot="row">
        <button type="submit" data-variant="solid">
          Save
        </button>
        <button type="reset">Reset</button>
      </div>
    </form>
  )
}

export { Example }
