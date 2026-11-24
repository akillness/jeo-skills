import "@ui-sdk/web/slider"
import "@ui-sdk/web/field"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-field>
      <ui-slider default-value="25/50" step="5">
        <div data-slot="row">
          <ui-field-label>Price</ui-field-label>
          <ui-slider-value></ui-slider-value>
        </div>
        <ui-slider-control>
          <ui-slider-track>
            <ui-slider-indicator></ui-slider-indicator>
            <ui-slider-thumb aria-label="Minimum price"></ui-slider-thumb>
            <ui-slider-thumb aria-label="Maximum price"></ui-slider-thumb>
          </ui-slider-track>
        </ui-slider-control>
      </ui-slider>
    </ui-field>
  `
  const slider = root.querySelector("ui-slider")!
  slider.format = {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }
}

export { mount }
