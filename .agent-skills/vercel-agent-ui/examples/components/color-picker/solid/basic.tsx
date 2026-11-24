import { formatColor, parseColor, type ColorFormat } from "@ui-sdk/solid/color"
import {
  ColorPicker,
  ColorPickerArea,
  ColorPickerAreaThumb,
  ColorPickerEyeDropper,
  ColorPickerInput,
  ColorPickerSlider,
  ColorPickerSliderThumb,
  ColorPickerSwatch,
  ColorPickerSwatches,
  ColorPickerSwatchItem,
} from "@ui-sdk/solid/color-picker"
import { createSignal, For } from "solid-js"

const formats: { label: string; value: ColorFormat }[] = [
  { label: "Hex", value: "hex" },
  { label: "RGB", value: "srgb" },
  { label: "HSL", value: "hsl" },
  { label: "OKLCH", value: "oklch" },
]

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
  const [format, setFormat] = createSignal<ColorFormat>("hex")
  const [value, setValue] = createSignal("#0ea5e9")

  function changeFormat(next: ColorFormat) {
    setFormat(next)
    setValue(formatColor(parseColor(value())!, next))
  }

  return (
    <ColorPicker
      aria-label="Brand color"
      format={format()}
      value={value()}
      onValueChange={(next) => setValue(next)}
    >
      <ColorPickerArea>
        <ColorPickerAreaThumb />
      </ColorPickerArea>
      <div data-slot="row">
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
        <div data-slot="color-picker-sliders">
          <ColorPickerSlider channel="hue">
            <ColorPickerSliderThumb />
          </ColorPickerSlider>
          <ColorPickerSlider channel="alpha">
            <ColorPickerSliderThumb />
          </ColorPickerSlider>
        </div>
        <ColorPickerSwatch />
      </div>
      <div data-slot="row">
        <select
          aria-label="Format"
          value={format()}
          onChange={(event) =>
            changeFormat(event.currentTarget.value as ColorFormat)
          }
        >
          <For each={formats}>
            {(option) => <option value={option.value}>{option.label}</option>}
          </For>
        </select>
        <ColorPickerInput aria-label="Color" />
      </div>
      <ColorPickerSwatches aria-label="Presets">
        <For each={presets}>
          {(preset) => <ColorPickerSwatchItem value={preset} />}
        </For>
      </ColorPickerSwatches>
    </ColorPicker>
  )
}

export { Example }
