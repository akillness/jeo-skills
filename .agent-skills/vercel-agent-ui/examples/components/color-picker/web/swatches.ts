import "@ui-sdk/web/color-picker"
import { createElement, Pipette } from "lucide"

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
    <ui-color-picker aria-label="Label color" space="srgb" format="hex" default-value="#0ea5e9">
      <ui-color-picker-swatches aria-label="Presets">
        ${presets.map((preset) => `<ui-color-picker-swatch-item value="${preset}"></ui-color-picker-swatch-item>`).join("")}
      </ui-color-picker-swatches>
      <div data-slot="row">
        <ui-color-picker-channel-input channel="red"></ui-color-picker-channel-input>
        <ui-color-picker-channel-input channel="green"></ui-color-picker-channel-input>
        <ui-color-picker-channel-input channel="blue"></ui-color-picker-channel-input>
        <ui-color-picker-eye-dropper>
          <button aria-label="Pick from screen">${createElement(Pipette, { "aria-hidden": "true" }).outerHTML}</button>
        </ui-color-picker-eye-dropper>
      </div>
    </ui-color-picker>
  `
}

export { mount }
