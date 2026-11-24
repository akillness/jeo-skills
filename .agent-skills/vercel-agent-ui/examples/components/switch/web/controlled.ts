import "@ui-sdk/web/switch"
import { log } from "../../../shared/web/log"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <div data-slot="controls">
        <button type="button">Toggle</button>
      </div>
      <label data-slot="label">
        Wi-Fi
        <ui-switch default-checked>
          <ui-switch-thumb></ui-switch-thumb>
        </ui-switch>
      </label>
    </div>
  `
  const wifi = root.querySelector("ui-switch")!
  root
    .querySelector("button")!
    .addEventListener("click", () => wifi.api.toggle())
  wifi.addEventListener("checkedchange", (event) => {
    const { value, reason } = event.detail
    log(root, `${value ? "On" : "Off"} (${reason})`)
  })
}

export { mount }
