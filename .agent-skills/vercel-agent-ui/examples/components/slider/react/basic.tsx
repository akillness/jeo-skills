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
      <Slider defaultValue={75}>
        <div data-slot="row">
          <FieldLabel>Volume</FieldLabel>
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
