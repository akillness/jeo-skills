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
import { useLog } from "../../../shared/react/log"

function Example() {
  const log = useLog()

  return (
    <Field>
      <Slider
        defaultValue={50}
        onValueCommit={(value, details) =>
          log(`Saved ${value} (${details.reason})`)
        }
      >
        <div data-slot="row">
          <FieldLabel>Brightness</FieldLabel>
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
