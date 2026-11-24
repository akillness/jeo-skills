import "@ui-sdk/web/color-picker"
import { log } from "../../../shared/web/log"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div>
      <div data-slot="controls">
        <button type="button">Use Purple</button>
      </div>
      <ui-color-picker aria-label="Theme color" default-value="#0ea5e9">
        <ui-color-picker-area>
          <ui-color-picker-area-thumb></ui-color-picker-area-thumb>
        </ui-color-picker-area>
        <ui-color-picker-slider channel="hue">
          <ui-color-picker-slider-thumb></ui-color-picker-slider-thumb>
        </ui-color-picker-slider>
        <ui-color-picker-input>
          <input aria-label="Hex" />
        </ui-color-picker-input>
      </ui-color-picker>
    </div>
  `
  const picker = root.querySelector("ui-color-picker")!
  picker.addEventListener("valuecommit", (event) => {
    const { value, reason } = event.detail
    log(root, `committed: ${value} (${reason})`)
  })
  root
    .querySelector('[data-slot="controls"] button')!
    .addEventListener("click", () => picker.api.setValue("#663399"))
}

export { mount }
