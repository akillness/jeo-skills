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

function Ticks(props: { count: number }) {
  return (
    <div data-slot="ticks" aria-hidden="true">
      <For each={Array.from({ length: props.count }, (_, index) => index)}>
        {() => <span />}
      </For>
    </div>
  )
}

function Example() {
  return (
    <div data-slot="stack">
      <Field>
        <Slider
          defaultValue={2010}
          min={1990}
          max={2030}
          step={5}
          format={{ useGrouping: false }}
        >
          <div data-slot="row">
            <FieldLabel>Year</FieldLabel>
            <SliderValue />
          </div>
          <SliderControl>
            <SliderTrack>
              <SliderIndicator />
              <SliderThumb />
            </SliderTrack>
          </SliderControl>
          <Ticks count={9} />
        </Slider>
      </Field>
      <Field>
        <Slider defaultValue={0.5} min={0} max={1} step={0.05}>
          <div data-slot="row">
            <FieldLabel>Opacity</FieldLabel>
            <SliderValue />
          </div>
          <SliderControl>
            <SliderTrack>
              <SliderIndicator />
              <SliderThumb />
            </SliderTrack>
          </SliderControl>
          <Ticks count={21} />
        </Slider>
      </Field>
    </div>
  )
}

export { Example }
