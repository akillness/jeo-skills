import "@ui-sdk/web/slider"
import "@ui-sdk/web/field"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-field>
      <ui-slider default-value="100" min="25" max="400" large-step="25">
        <div data-slot="row">
          <ui-field-label>Zoom</ui-field-label>
          <ui-slider-value></ui-slider-value>
        </div>
        <ui-slider-control>
          <ui-slider-track>
            <ui-slider-indicator></ui-slider-indicator>
            <ui-slider-thumb></ui-slider-thumb>
          </ui-slider-track>
        </ui-slider-control>
      </ui-slider>
    </ui-field>
  `
  const slider = root.querySelector("ui-slider")!
  slider.format = { style: "unit", unit: "percent" }
}

export { mount }
