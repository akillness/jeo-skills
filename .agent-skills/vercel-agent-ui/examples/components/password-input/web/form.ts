import "@ui-sdk/web/password-input"
import "@ui-sdk/web/field"
import "@ui-sdk/web/input"
import { createElement, Eye, EyeOff } from "lucide"
import { log } from "../../../shared/web/log"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <form data-slot="stack" id="sign-in">
        <ui-field name="email">
          <ui-field-label>Email</ui-field-label>
          <ui-input><input type="email" required autocomplete="username" /></ui-input>
        </ui-field>
      </form>
      <ui-field>
        <ui-field-label>Password</ui-field-label>
        <ui-password-input name="password" form="sign-in" required>
          <input />
          <ui-password-input-toggle>
            <button aria-label="Show password">
              ${createElement(Eye, { "aria-hidden": "true" }).outerHTML}
              ${createElement(EyeOff, { "aria-hidden": "true" }).outerHTML}
            </button>
          </ui-password-input-toggle>
        </ui-password-input>
      </ui-field>
      <div data-slot="row">
        <button type="submit" form="sign-in" data-variant="solid">Sign In</button>
        <button type="reset" form="sign-in">Reset</button>
      </div>
    </div>
  `
  const form = root.querySelector("form")!
  form.addEventListener("submit", (event) => {
    event.preventDefault()
    const data = new FormData(form)
    const length = String(data.get("password")).length
    log(
      root,
      `Signed in as ${data.get("email")}, with a password of ${length} characters`
    )
  })
}

export { mount }
