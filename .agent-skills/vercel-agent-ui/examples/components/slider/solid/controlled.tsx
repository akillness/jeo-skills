import { Field, FieldLabel } from "@ui-sdk/solid/field"
import {
  Slider,
  SliderControl,
  SliderIndicator,
  SliderThumb,
  SliderTrack,
  SliderValue,
} from "@ui-sdk/solid/slider"
import { createSignal } from "solid-js"
import { useLog } from "../../../shared/solid/log"

function Example() {
  const log = useLog()
  const [value, setValue] = createSignal([0.3, 0.7])

  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <button type="button" onClick={() => setValue([0.3, 0.7])}>
          Reset
        </button>
      </div>
      <Field>
        <Slider
          value={value()}
          onValueChange={(next, details) => {
            setValue(next)
            log(`${next.join(" – ")} (${details.reason})`)
          }}
          min={0}
          max={1}
          step={0.1}
        >
          <div data-slot="row">
            <FieldLabel>Temperature</FieldLabel>
            <SliderValue />
          </div>
          <SliderControl>
            <SliderTrack>
              <SliderIndicator />
              <SliderThumb index={0} aria-label="Minimum temperature" />
              <SliderThumb index={1} aria-label="Maximum temperature" />
            </SliderTrack>
          </SliderControl>
        </Slider>
      </Field>
    </div>
  )
}

export { Example }
