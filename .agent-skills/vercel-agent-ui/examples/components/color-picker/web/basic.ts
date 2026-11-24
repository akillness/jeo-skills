import "@ui-sdk/web/color-picker"
import { formatColor, parseColor, type ColorFormat } from "@ui-sdk/web"
import { createElement, Pipette } from "lucide"

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

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-color-picker aria-label="Brand color" format="hex" default-value="#0ea5e9">
      <ui-color-picker-area>
        <ui-color-picker-area-thumb></ui-color-picker-area-thumb>
      </ui-color-picker-area>
      <div data-slot="row">
        <ui-color-picker-eye-dropper>
          <button aria-label="Pick from screen">${createElement(Pipette, { "aria-hidden": "true" }).outerHTML}</button>
        </ui-color-picker-eye-dropper>
        <div data-slot="color-picker-sliders">
          <ui-color-picker-slider channel="hue">
            <ui-color-picker-slider-thumb></ui-color-picker-slider-thumb>
          </ui-color-picker-slider>
          <ui-color-picker-slider channel="alpha">
            <ui-color-picker-slider-thumb></ui-color-picker-slider-thumb>
          </ui-color-picker-slider>
        </div>
        <ui-color-picker-swatch></ui-color-picker-swatch>
      </div>
      <div data-slot="row">
        <select aria-label="Format">
          ${formats.map((option) => `<option value="${option.value}">${option.label}</option>`).join("")}
        </select>
        <ui-color-picker-input>
          <input aria-label="Color" />
        </ui-color-picker-input>
      </div>
      <ui-color-picker-swatches aria-label="Presets">
        ${presets.map((preset) => `<ui-color-picker-swatch-item value="${preset}"></ui-color-picker-swatch-item>`).join("")}
      </ui-color-picker-swatches>
    </ui-color-picker>
  `
  const picker = root.querySelector("ui-color-picker")!
  root.querySelector("select")!.addEventListener("change", (event) => {
    const format = (event.currentTarget as HTMLSelectElement)
      .value as ColorFormat
    picker.setAttribute("format", format)
    picker.value = formatColor(parseColor(picker.value)!, format)
  })
}

export { mount }
