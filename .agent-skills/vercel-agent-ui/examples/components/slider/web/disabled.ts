import "@ui-sdk/web/slider"
import "@ui-sdk/web/field"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-field>
      <ui-slider default-value="50" disabled>
        <div data-slot="row">
          <ui-field-label>Brightness</ui-field-label>
          <ui-slider-value></ui-slider-value>
        </div>
        <ui-slider-control>
          <ui-slider-track>
            <ui-slider-indicator></ui-slider-indicator>
            <ui-slider-thumb></ui-slider-thumb>
          </ui-slider-track>
        </ui-slider-control>
      </ui-slider>
      <ui-field-description>Managed by your organization.</ui-field-description>
    </ui-field>
  `
}

export { mount }
