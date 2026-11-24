import {
  ColorPicker,
  ColorPickerChannelInput,
  ColorPickerEyeDropper,
  ColorPickerSwatches,
  ColorPickerSwatchItem,
} from "@ui-sdk/solid/color-picker"
import { For } from "solid-js"

const presets = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#0ea5e9",
  "#6366f1",
  "#a855f7",
  "#ec4899",
]

function Example() {
  return (
    <ColorPicker
      aria-label="Label color"
      space="srgb"
      format="hex"
      defaultValue="#0ea5e9"
    >
      <ColorPickerSwatches aria-label="Presets">
        <For each={presets}>
          {(preset) => <ColorPickerSwatchItem value={preset} />}
        </For>
      </ColorPickerSwatches>
      <div data-slot="row">
        <ColorPickerChannelInput channel="red" />
        <ColorPickerChannelInput channel="green" />
        <ColorPickerChannelInput channel="blue" />
        <ColorPickerEyeDropper aria-label="Pick from screen">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="m12 9-8.414 8.414A2 2 0 0 0 3 18.828v1.344a2 2 0 0 1-.586 1.414A2 2 0 0 1 3.828 21h1.344a2 2 0 0 0 1.414-.586L15 12" />
            <path d="m18 9 .4.4a1 1 0 1 1-3 3l-3.8-3.8a1 1 0 1 1 3-3l.4.4 3.4-3.4a1 1 0 1 1 3 3z" />
            <path d="m2 22 .414-.414" />
          </svg>
        </ColorPickerEyeDropper>
      </div>
    </ColorPicker>
  )
}

export { Example }
