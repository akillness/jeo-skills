"use client"

import { Field, FieldLabel } from "@ui-sdk/react/field"
import {
  createSliderController,
  Slider,
  SliderControl,
  SliderIndicator,
  SliderThumb,
  SliderTrack,
  SliderValue,
} from "@ui-sdk/react/slider"
import * as React from "react"
import { useLog } from "../../../shared/react/log"

function Example() {
  const log = useLog()
  const [volume] = React.useState(() => createSliderController<number>())

  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <button type="button" onClick={() => volume.setValue(0)}>
          Mute
        </button>
        <button
          type="button"
          onClick={() => volume.setValue(volume.getValue() + 10)}
        >
          Louder
        </button>
        <button
          type="button"
          onClick={() => log(`Volume is ${volume.getValue()}`)}
        >
          Read
        </button>
        <button type="button" onClick={() => volume.focus()}>
          Focus
        </button>
      </div>
      <Field>
        <Slider
          defaultValue={40}
          controller={volume}
          onValueChange={(value, details) =>
            log(`Volume ${value} (${details.reason})`)
          }
        >
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
    </div>
  )
}

export { Example }
