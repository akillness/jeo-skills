import "@ui-sdk/web/color-picker"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-color-picker aria-label="Accent" space="oklch" default-value="oklch(0.62 0.19 259)">
      <ui-color-picker-area>
        <ui-color-picker-area-canvas></ui-color-picker-area-canvas>
        <ui-color-picker-area-thumb></ui-color-picker-area-thumb>
      </ui-color-picker-area>
      <ui-color-picker-slider channel="hue">
        <ui-color-picker-slider-thumb></ui-color-picker-slider-thumb>
      </ui-color-picker-slider>
      <ui-color-picker-slider channel="alpha">
        <ui-color-picker-slider-thumb></ui-color-picker-slider-thumb>
      </ui-color-picker-slider>
      <div data-slot="row">
        <ui-color-picker-swatch></ui-color-picker-swatch>
        <ui-color-picker-input>
          <input aria-label="OKLCH" />
        </ui-color-picker-input>
      </div>
    </ui-color-picker>
  `
}

export { mount }
