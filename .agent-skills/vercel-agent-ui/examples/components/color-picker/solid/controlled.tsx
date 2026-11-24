import {
  ColorPicker,
  ColorPickerArea,
  ColorPickerAreaThumb,
  ColorPickerInput,
  ColorPickerSlider,
  ColorPickerSliderThumb,
  createColorPickerController,
} from "@ui-sdk/solid/color-picker"
import { createSignal } from "solid-js"
import { useLog } from "../../../shared/solid/log"

function Example() {
  const log = useLog()
  const picker = createColorPickerController()
  const [value, setValue] = createSignal("#0ea5e9")

  return (
    <div>
      <div data-slot="controls">
        <button type="button" onClick={() => picker.setValue("#663399")}>
          Use Purple
        </button>
      </div>
      <ColorPicker
        aria-label="Theme color"
        value={value()}
        onValueChange={(next) => setValue(next)}
        onValueCommit={(next, details) =>
          log(`committed: ${next} (${details.reason})`)
        }
        controller={picker}
      >
        <ColorPickerArea>
          <ColorPickerAreaThumb />
        </ColorPickerArea>
        <ColorPickerSlider channel="hue">
          <ColorPickerSliderThumb />
        </ColorPickerSlider>
        <ColorPickerInput aria-label="Hex" />
      </ColorPicker>
    </div>
  )
}

export { Example }
