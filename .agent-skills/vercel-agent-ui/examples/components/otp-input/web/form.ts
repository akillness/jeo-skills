import "@ui-sdk/web/otp-input"
import "@ui-sdk/web/field"
import { log } from "../../../shared/web/log"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <form id="verify-sign-in">
        <ui-field>
          <ui-field-label>Verification code</ui-field-label>
          <ui-otp-input name="code" required>
            <ui-otp-input-group>
              <ui-otp-input-slot></ui-otp-input-slot>
              <ui-otp-input-slot></ui-otp-input-slot>
              <ui-otp-input-slot></ui-otp-input-slot>
              <ui-otp-input-slot></ui-otp-input-slot>
              <ui-otp-input-slot></ui-otp-input-slot>
              <ui-otp-input-slot></ui-otp-input-slot>
            </ui-otp-input-group>
          </ui-otp-input>
          <ui-field-description>Enter the six-digit code we sent to hollis@example.com.</ui-field-description>
          <ui-field-error></ui-field-error>
        </ui-field>
      </form>
      <ui-field>
        <ui-field-label>Recovery code (optional)</ui-field-label>
        <ui-otp-input name="recovery" form="verify-sign-in" max-length="8" pattern="alphanumeric">
          <ui-otp-input-group>
            <ui-otp-input-slot></ui-otp-input-slot>
            <ui-otp-input-slot></ui-otp-input-slot>
            <ui-otp-input-slot></ui-otp-input-slot>
            <ui-otp-input-slot></ui-otp-input-slot>
            <ui-otp-input-slot></ui-otp-input-slot>
            <ui-otp-input-slot></ui-otp-input-slot>
            <ui-otp-input-slot></ui-otp-input-slot>
            <ui-otp-input-slot></ui-otp-input-slot>
          </ui-otp-input-group>
        </ui-otp-input>
        <ui-field-error></ui-field-error>
      </ui-field>
      <div data-slot="row">
        <button type="reset" form="verify-sign-in">Reset</button>
        <button type="submit" form="verify-sign-in" data-variant="solid">Verify</button>
      </div>
    </div>
  `
  const form = root.querySelector("form")!
  form.addEventListener("submit", (event) => {
    event.preventDefault()
    const data = [...new FormData(form)].map(
      ([name, value]) => `${name}=${value}`
    )
    log(root, `Submitted ${data.join(", ")}`)
  })
}

export { mount }
