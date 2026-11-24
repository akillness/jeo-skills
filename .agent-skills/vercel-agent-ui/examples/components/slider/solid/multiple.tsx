import { Field, FieldLabel } from "@ui-sdk/solid/field"
import {
  Slider,
  SliderControl,
  SliderIndicator,
  SliderThumb,
  SliderTrack,
  SliderValue,
} from "@ui-sdk/solid/slider"
import { For } from "solid-js"

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
            <For each={thumbs}>
              {(label, index) => (
                <SliderThumb index={index()} aria-label={label} />
              )}
            </For>
          </SliderTrack>
        </SliderControl>
      </Slider>
    </Field>
  )
}

export { Example }
