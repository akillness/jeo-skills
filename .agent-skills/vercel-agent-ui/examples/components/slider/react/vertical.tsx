"use client"

import { Field, FieldLabel } from "@ui-sdk/react/field"
import {
  Slider,
  SliderControl,
  SliderIndicator,
  SliderThumb,
  SliderTrack,
} from "@ui-sdk/react/slider"

const channels = [
  { label: "Bass", value: 50 },
  { label: "Treble", value: 25 },
]

function Example() {
  return (
    <div data-slot="row">
      {channels.map((channel) => (
        <Field key={channel.label}>
          <Slider orientation="vertical" defaultValue={channel.value}>
            <SliderControl>
              <SliderTrack>
                <SliderIndicator />
                <SliderThumb />
              </SliderTrack>
            </SliderControl>
          </Slider>
          <FieldLabel>{channel.label}</FieldLabel>
        </Field>
      ))}
    </div>
  )
}

export { Example }
