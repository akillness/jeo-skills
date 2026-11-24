import { Label } from "@ui-sdk/react/label"
import {
  Slider,
  SliderControl,
  SliderIndicator,
  SliderThumb,
  SliderTrack,
  SliderValue,
} from "@ui-sdk/react/slider"

function Example() {
  return (
    <Slider id="volume" defaultValue={75}>
      <div data-slot="row">
        <Label htmlFor="volume">Volume</Label>
        <SliderValue />
      </div>
      <SliderControl>
        <SliderTrack>
          <SliderIndicator />
          <SliderThumb />
        </SliderTrack>
      </SliderControl>
    </Slider>
  )
}

export { Example }
