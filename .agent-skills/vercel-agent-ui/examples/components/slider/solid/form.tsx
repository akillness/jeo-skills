import { Field, FieldLabel } from "@ui-sdk/solid/field"
import {
  Slider,
  SliderControl,
  SliderIndicator,
  SliderThumb,
  SliderTrack,
  SliderValue,
} from "@ui-sdk/solid/slider"
import { createUniqueId } from "solid-js"
import { useLog } from "../../../shared/solid/log"

function Example() {
  const log = useLog()
  const form = createUniqueId()

  return (
    <div data-slot="stack">
      <form
        id={form}
        data-slot="stack"
        onSubmit={(event) => {
          event.preventDefault()
          const data = [...new FormData(event.currentTarget)].map(
            ([name, value]) => `${name}=${value}`
          )
          log(`Submitted ${data.join(", ")}`)
        }}
      >
        <Field>
          <Slider name="price" defaultValue={[200, 800]} max={1000} step={10}>
            <div data-slot="row">
              <FieldLabel>Price</FieldLabel>
              <SliderValue />
            </div>
            <SliderControl>
              <SliderTrack>
                <SliderIndicator />
                <SliderThumb index={0} aria-label="Minimum price" />
                <SliderThumb index={1} aria-label="Maximum price" />
              </SliderTrack>
            </SliderControl>
          </Slider>
        </Field>
        <Field>
          <Slider name="rating" defaultValue={3} min={1} max={5}>
            <div data-slot="row">
              <FieldLabel>Minimum rating</FieldLabel>
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
      </form>
      <Field>
        <Slider
          name="distance"
          form={form}
          defaultValue={25}
          max={100}
          step={5}
          format={{ style: "unit", unit: "kilometer" }}
        >
          <div data-slot="row">
            <FieldLabel>Distance</FieldLabel>
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
      <div data-slot="row">
        <button type="submit" form={form} data-variant="solid">
          Save
        </button>
        <button type="reset" form={form}>
          Reset
        </button>
      </div>
    </div>
  )
}

export { Example }
