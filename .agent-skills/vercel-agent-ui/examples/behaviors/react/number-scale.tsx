import * as React from "react"
import { Field, FieldControl, FieldLabel } from "@ui-sdk/react/field"
import {
  SegmentedControl,
  SegmentedControlIndicator,
  SegmentedControlItem,
} from "@ui-sdk/react/segmented-control"
import { formatNumber, fractionOf, valueAt } from "@ui-sdk/core/number"

const range = { min: 1, max: 180 }

function Example() {
  const [scale, setScale] = React.useState<"linear" | "log">("log")
  const [angle, setAngle] = React.useState(45)
  const position = fractionOf(angle, range, scale)
  const degrees = `${formatNumber(angle, "en-US", { maximumFractionDigits: 0 })}°`
  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <SegmentedControl
          aria-label="Scale"
          value={scale}
          onValueChange={(next) => next && setScale(next as "linear" | "log")}
        >
          <SegmentedControlIndicator />
          <SegmentedControlItem value="linear">Linear</SegmentedControlItem>
          <SegmentedControlItem value="log">Log</SegmentedControlItem>
        </SegmentedControl>
      </div>
      <div aria-hidden="true" data-slot="number-scale-dial">
        <div
          data-needle
          data-slot="number-scale-needle"
          style={{ rotate: `${-angle}deg` }}
        />
      </div>
      <Field>
        <div data-slot="row">
          <FieldLabel>Rotation</FieldLabel>
          <span data-slot="hint">
            <span data-angle>{degrees}</span>,{" "}
            <span data-position>{Math.round(position * 100)}% along</span>
          </span>
        </div>
        <FieldControl
          type="range"
          aria-valuetext={degrees}
          min={0}
          max={1}
          step={0.001}
          value={position}
          onChange={(event) =>
            setAngle(valueAt(Number(event.target.value), range, scale))
          }
        />
      </Field>
    </div>
  )
}

export { Example }
