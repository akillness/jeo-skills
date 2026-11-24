import "@ui-sdk/web/slider"
import "@ui-sdk/web/field"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-field>
      <ui-slider default-value="0.3" min="0" max="1" step="0.01">
        <div data-slot="row">
          <ui-field-label>Volume</ui-field-label>
          <ui-slider-value></ui-slider-value>
        </div>
        <ui-slider-control>
          <ui-slider-track>
            <ui-slider-indicator></ui-slider-indicator>
            <ui-slider-thumb></ui-slider-thumb>
          </ui-slider-track>
        </ui-slider-control>
      </ui-slider>
      <ui-field-description>How loud notifications play.</ui-field-description>
    </ui-field>
  `
  const slider = root.querySelector("ui-slider")!
  slider.format = { style: "percent" }
}

export { mount }
