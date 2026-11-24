import { Field, FieldLabel } from "@ui-sdk/solid/field"
import {
  createSliderController,
  Slider,
  SliderControl,
  SliderIndicator,
  SliderThumb,
  SliderTrack,
  SliderValue,
} from "@ui-sdk/solid/slider"
import { useLog } from "../../../shared/solid/log"

function Example() {
  const log = useLog()
  const volume = createSliderController<number>()

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
