import "@ui-sdk/web/slider"
import "@ui-sdk/web/field"

const thumbs = ["Low", "Medium", "High"]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-field>
      <ui-slider default-value="10/20/70" step="10">
        <div data-slot="row">
          <ui-field-label>Alert thresholds</ui-field-label>
          <ui-slider-value></ui-slider-value>
        </div>
        <ui-slider-control>
          <ui-slider-track>
            <ui-slider-indicator></ui-slider-indicator>
            ${thumbs.map((label) => `<ui-slider-thumb aria-label="${label}"></ui-slider-thumb>`).join("")}
          </ui-slider-track>
        </ui-slider-control>
      </ui-slider>
    </ui-field>
  `
  root.querySelector("ui-slider")!.format = { style: "unit", unit: "percent" }
}

export { mount }
