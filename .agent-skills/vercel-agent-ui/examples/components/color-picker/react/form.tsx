"use client"

import {
  ColorPicker,
  ColorPickerArea,
  ColorPickerAreaThumb,
  ColorPickerSlider,
  ColorPickerSliderThumb,
  ColorPickerSwatch,
} from "@ui-sdk/react/color-picker"
import { Field, FieldLabel } from "@ui-sdk/react/field"
import { useLog } from "../../../shared/react/log"

function Example() {
  const log = useLog()

  return (
    <form
      data-slot="stack"
      onSubmit={(event) => {
        event.preventDefault()
        log(`Submitted brand=${new FormData(event.currentTarget).get("brand")}`)
      }}
    >
      <Field>
        <FieldLabel>Brand color</FieldLabel>
        <ColorPicker name="brand" defaultValue="#f97316">
          <ColorPickerArea>
            <ColorPickerAreaThumb />
          </ColorPickerArea>
          <div data-slot="row">
            <ColorPickerSwatch />
            <ColorPickerSlider channel="hue">
              <ColorPickerSliderThumb />
            </ColorPickerSlider>
          </div>
        </ColorPicker>
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
