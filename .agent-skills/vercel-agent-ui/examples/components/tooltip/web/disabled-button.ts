import "@ui-sdk/web/tooltip"
import "@ui-sdk/web/field"
import "@ui-sdk/web/input"
import { log } from "../../../shared/web/log"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <ui-field>
        <ui-field-label>Post title</ui-field-label>
        <ui-input>
          <input />
        </ui-input>
      </ui-field>
      <ui-tooltip>
        <ui-tooltip-trigger><button data-variant="solid" aria-disabled="true">Publish</button></ui-tooltip-trigger>
        <ui-tooltip-content side="right">Add a title to publish</ui-tooltip-content>
      </ui-tooltip>
    </div>
  `
  const input = root.querySelector("input")!
  const tooltip = root.querySelector("ui-tooltip")!
  const publish = root.querySelector("button")!
  const title = () => input.value.trim()
  input.addEventListener("input", () => {
    const blocked = !title()
    if (blocked) {
      publish.setAttribute("aria-disabled", "true")
    } else {
      publish.removeAttribute("aria-disabled")
    }
    tooltip.disabled = !blocked
  })
  publish.addEventListener("click", () => {
    if (title()) {
      log(root, `Published “${title()}”`)
    }
  })
}

export { mount }
