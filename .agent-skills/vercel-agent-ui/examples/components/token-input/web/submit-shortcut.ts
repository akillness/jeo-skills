import "@ui-sdk/web/field"
import { toLabel } from "@ui-sdk/web/token-input"
import { log } from "../../../shared/web/log"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <form>
      <ui-field>
        <ui-field-label>Message</ui-field-label>
        <ui-token-input submit-shortcut="mod+enter">
          <ui-token-input-editor placeholder="Write a message…"></ui-token-input-editor>
        </ui-token-input>
      </ui-field>
    </form>
  `
  const message = root.querySelector("ui-token-input")!
  root.querySelector("form")!.addEventListener("submit", (event) => {
    event.preventDefault()
    log(root, `Sent ${toLabel(message.value)}`)
  })
}

export { mount }
