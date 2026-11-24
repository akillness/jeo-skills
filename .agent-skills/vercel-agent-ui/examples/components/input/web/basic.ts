import "@ui-sdk/web/field"
import "@ui-sdk/web/input"
import { X, createElement } from "lucide"
import { log } from "../../../shared/web/log"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-field name="website">
      <ui-field-label>Website</ui-field-label>
      <ui-input-group>
        <span>https://</span>
        <ui-input>
          <input placeholder="example.com" value="hollisgrant.com" />
        </ui-input>
        <ui-input-clear>
          <button type="button" aria-label="Clear website">
            ${createElement(X, { "aria-hidden": "true" }).outerHTML}
          </button>
        </ui-input-clear>
      </ui-input-group>
      <ui-field-description>Shown on your public profile.</ui-field-description>
    </ui-field>
  `
  root.querySelector("ui-input")!.addEventListener("valuechange", (event) => {
    const { value, reason } = event.detail
    log(root, `${value ? `“${value}”` : "Empty"} (${reason})`)
  })
}

export { mount }
