import "@ui-sdk/web/slider"
import "@ui-sdk/web/field"
import { log } from "../../../shared/web/log"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <div data-slot="controls">
        <button type="button">Reset</button>
      </div>
      <ui-field>
        <ui-slider default-value="0.3/0.7" min="0" max="1" step="0.1">
          <div data-slot="row">
            <ui-field-label>Temperature</ui-field-label>
            <ui-slider-value></ui-slider-value>
          </div>
          <ui-slider-control>
            <ui-slider-track>
              <ui-slider-indicator></ui-slider-indicator>
              <ui-slider-thumb aria-label="Minimum temperature"></ui-slider-thumb>
              <ui-slider-thumb aria-label="Maximum temperature"></ui-slider-thumb>
            </ui-slider-track>
          </ui-slider-control>
        </ui-slider>
      </ui-field>
    </div>
  `
  const slider = root.querySelector("ui-slider")!
  slider.addEventListener("valuechange", (event) => {
    const { value, reason } = event.detail
    log(root, `${[value].flat().join(" – ")} (${reason})`)
  })
  root
    .querySelector("button")!
    .addEventListener("click", () => (slider.value = [0.3, 0.7]))
}

export { mount }
