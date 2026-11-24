import "@ui-sdk/web/button"
import "@ui-sdk/web/field"
import "@ui-sdk/web/input"
import { log } from "../../../shared/web/log"

function mount(root: HTMLElement) {
  const hintId = `publish-hint-${crypto.randomUUID()}`
  root.innerHTML = `
    <div data-slot="stack">
      <ui-field>
        <ui-field-label>Title</ui-field-label>
        <ui-input>
          <input />
        </ui-input>
      </ui-field>
      <div data-slot="row">
        <ui-button disabled focusable-when-disabled>
          <button aria-describedby="${hintId}">Publish</button>
        </ui-button>
        <p id="${hintId}" data-slot="hint">Add a title to publish.</p>
      </div>
    </div>
  `
  const title = root.querySelector("input")!
  const publish = root.querySelector("ui-button")!
  const hint = root.querySelector("p")!
  title.addEventListener("input", () => {
    const ready = title.value.trim() !== ""
    publish.disabled = !ready
    hint.textContent = ready ? "Ready to publish." : "Add a title to publish."
  })
  publish.addEventListener("action", () =>
    log(root, `Published “${title.value}”`)
  )
}

export { mount }
