import "@ui-sdk/web/slider"
import "@ui-sdk/web/field"
import type { UiSliderElement } from "@ui-sdk/web/slider"
import { log } from "../../../shared/web/log"

function mount(root: HTMLElement) {
  const form = crypto.randomUUID()
  root.innerHTML = `
    <div data-slot="stack">
      <form id="${form}" data-slot="stack">
        <ui-field>
          <ui-slider name="price" default-value="200/800" max="1000" step="10">
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
        <ui-field>
          <ui-slider name="rating" default-value="3" min="1" max="5">
            <div data-slot="row">
              <ui-field-label>Minimum rating</ui-field-label>
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
      </form>
      <ui-field>
        <ui-slider name="distance" form="${form}" default-value="25" max="100" step="5">
          <div data-slot="row">
            <ui-field-label>Distance</ui-field-label>
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
      <div data-slot="row">
        <button type="submit" form="${form}" data-variant="solid">Save</button>
        <button type="reset" form="${form}">Reset</button>
      </div>
    </div>
  `
  root.querySelector<UiSliderElement>('ui-slider[name="distance"]')!.format = {
    style: "unit",
    unit: "kilometer",
  }
  root.querySelector("form")!.addEventListener("submit", (event) => {
    event.preventDefault()
    const data = [...new FormData(event.currentTarget as HTMLFormElement)].map(
      ([name, value]) => `${name}=${value}`
    )
    log(root, `Submitted ${data.join(", ")}`)
  })
}

export { mount }
