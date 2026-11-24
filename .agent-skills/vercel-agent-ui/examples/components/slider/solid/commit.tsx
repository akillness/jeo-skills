import { Field, FieldLabel } from "@ui-sdk/solid/field"
import {
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

  return (
    <Field>
      <Slider
        onValueCommit={(value, details) =>
          log(`Saved ${value} (${details.reason})`)
        }
        defaultValue={50}
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
