import "@ui-sdk/web/field"
import "@ui-sdk/web/textarea"
import { log } from "../../../shared/web/log"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <form data-slot="stack">
      <ui-field name="message">
        <ui-field-label>Message</ui-field-label>
        <ui-textarea>
          <textarea required placeholder="Write a reply to Hollis Grant…"></textarea>
        </ui-textarea>
      </ui-field>
      <div data-slot="row">
        <button type="submit" data-variant="solid">Send Message</button>
      </div>
    </form>
  `
  const form = root.querySelector("form")!
  const message = root.querySelector("ui-textarea")!
  form.addEventListener("submit", (event) => {
    event.preventDefault()
    log(root, `Sent “${new FormData(form).get("message")}”`)
    message.api.clear()
  })
}

export { mount }
