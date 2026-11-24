import "@ui-sdk/web/color-picker"
import "@ui-sdk/web/field"
import { log } from "../../../shared/web/log"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <form data-slot="stack">
      <ui-field>
        <ui-field-label>Brand color</ui-field-label>
        <ui-color-picker name="brand" default-value="#f97316">
          <ui-color-picker-area>
            <ui-color-picker-area-thumb></ui-color-picker-area-thumb>
          </ui-color-picker-area>
          <div data-slot="row">
            <ui-color-picker-swatch></ui-color-picker-swatch>
            <ui-color-picker-slider channel="hue">
              <ui-color-picker-slider-thumb></ui-color-picker-slider-thumb>
            </ui-color-picker-slider>
          </div>
        </ui-color-picker>
      </ui-field>
      <div data-slot="row">
        <button type="submit" data-variant="solid">Save</button>
        <button type="reset">Reset</button>
      </div>
    </form>
  `
  const form = root.querySelector("form")!
  form.addEventListener("submit", (event) => {
    event.preventDefault()
    log(root, `Submitted brand=${new FormData(form).get("brand")}`)
  })
}

export { mount }
