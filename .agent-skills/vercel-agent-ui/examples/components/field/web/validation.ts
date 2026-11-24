import "@ui-sdk/web/field"
import "@ui-sdk/web/input"
import { log } from "../../../shared/web/log"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <form data-slot="stack">
      <ui-field name="email">
        <ui-field-label>Email</ui-field-label>
        <ui-input>
          <input type="email" required placeholder="hollis@example.com" />
        </ui-input>
        <ui-field-description>
          <span data-hide="valid">We'll send you a confirmation link.</span>
          <span data-show="valid">Looks good.</span>
        </ui-field-description>
        <ui-field-error match="valueMissing">Enter your email address.</ui-field-error>
        <ui-field-error match="typeMismatch">Enter an email address like hollis@example.com.</ui-field-error>
      </ui-field>
      <ui-field name="website">
        <ui-field-label>Website</ui-field-label>
        <ui-input>
          <input type="url" required placeholder="https://example.com" />
        </ui-input>
        <ui-field-error></ui-field-error>
      </ui-field>
      <button type="submit" data-variant="solid">Subscribe</button>
    </form>
  `
  const form = root.querySelector("form")!
  form.addEventListener("submit", (event) => {
    event.preventDefault()
    log(root, `Subscribed ${new FormData(form).get("email")}`)
  })
}

export { mount }
