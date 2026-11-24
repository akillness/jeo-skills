import "@ui-sdk/web/slider"
import "@ui-sdk/web/field"
import { log } from "../../../shared/web/log"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-field>
      <ui-slider default-value="50">
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
    </ui-field>
  `
  root.querySelector("ui-slider")!.addEventListener("valuecommit", (event) => {
    const { value, reason } = event.detail
    log(root, `Saved ${value} (${reason})`)
  })
}

export { mount }
