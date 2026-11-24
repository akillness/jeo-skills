import "@ui-sdk/web/button"
import "@ui-sdk/web/field"
import "@ui-sdk/web/input"
import { log } from "../../../shared/web/log"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <form data-slot="stack">
      <ui-field>
        <ui-field-label>Email</ui-field-label>
        <ui-input>
          <input name="email" type="email" value="ada@example.com" />
        </ui-input>
      </ui-field>
      <div data-slot="row">
        <ui-button><button type="submit">Subscribe</button></ui-button>
        <ui-button><button type="reset">Reset</button></ui-button>
      </div>
    </form>
  `
  const form = root.querySelector("form")!
  form.addEventListener("submit", (event) => {
    event.preventDefault()
    log(root, `Subscribed ${new FormData(form).get("email")}`)
  })
}

export { mount }
