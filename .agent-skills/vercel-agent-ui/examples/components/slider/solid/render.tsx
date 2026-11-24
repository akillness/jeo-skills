import { Field, FieldLabel } from "@ui-sdk/solid/field"
import {
  Slider,
  SliderControl,
  SliderIndicator,
  SliderThumb,
  SliderTrack,
  SliderValue,
} from "@ui-sdk/solid/slider"

function Example() {
  return (
    <Field>
      <Slider defaultValue={60}>
        <div data-slot="row">
          <FieldLabel>Brightness</FieldLabel>
          <SliderValue>{(state) => `${state.text}%`}</SliderValue>
        </div>
        <SliderControl>
          <SliderTrack>
            <SliderIndicator />
            <SliderThumb render={(props) => <span {...props} />}>
              {(state) => <span data-slot="output">{state.thumbValue}</span>}
            </SliderThumb>
          </SliderTrack>
        </SliderControl>
      </Slider>
    </Field>
  )
}

export { Example }
