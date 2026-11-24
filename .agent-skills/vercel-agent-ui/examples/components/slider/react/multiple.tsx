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

const thumbs = ["Low", "Medium", "High"]

function Example() {
  return (
    <Field>
      <Slider
        defaultValue={[10, 20, 70]}
        step={10}
        format={{ style: "unit", unit: "percent" }}
      >
        <div data-slot="row">
          <FieldLabel>Alert thresholds</FieldLabel>
          <SliderValue />
        </div>
        <SliderControl>
          <SliderTrack>
            <SliderIndicator />
            {thumbs.map((label, index) => (
              <SliderThumb key={label} index={index} aria-label={label} />
            ))}
          </SliderTrack>
        </SliderControl>
      </Slider>
    </Field>
  )
}

export { Example }
