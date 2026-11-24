import "@ui-sdk/web/color-picker"
import "@ui-sdk/web/popover"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-color-picker aria-label="Background" default-value="#22c55e">
      <ui-popover>
        <ui-popover-trigger>
          <button aria-label="Background">
            <ui-color-picker-swatch></ui-color-picker-swatch>
          </button>
        </ui-popover-trigger>
        <ui-popover-content>
          <ui-color-picker-area>
            <ui-color-picker-area-thumb></ui-color-picker-area-thumb>
          </ui-color-picker-area>
          <ui-color-picker-slider channel="hue">
            <ui-color-picker-slider-thumb></ui-color-picker-slider-thumb>
          </ui-color-picker-slider>
          <ui-color-picker-input>
            <input aria-label="Hex" />
          </ui-color-picker-input>
        </ui-popover-content>
      </ui-popover>
    </ui-color-picker>
  `
}

export { mount }
