"use client"

import { Field, FieldLabel } from "@ui-sdk/react/field"
import {
  Slider,
  SliderControl,
  SliderIndicator,
  SliderThumb,
  SliderTrack,
  SliderValue,
} from "@ui-sdk/react/slider"

function Example() {
  return (
    <Field>
      <Slider
        defaultValue={100}
        min={25}
        max={400}
        largeStep={25}
        format={{ style: "unit", unit: "percent" }}
      >
        <div data-slot="row">
          <FieldLabel>Zoom</FieldLabel>
          <SliderValue />
        </div>
        <SliderControl>
          <SliderTrack>
            <SliderIndicator />
            <SliderThumb />
          </SliderTrack>
        </SliderControl>
      </Slider>
    </Field>
  )
}

export { Example }
