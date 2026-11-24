import "@ui-sdk/web/otp-input"
import "@ui-sdk/web/field"
import { log } from "../../../shared/web/log"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-field>
      <ui-field-label>One-time password</ui-field-label>
      <ui-otp-input>
        <ui-otp-input-group>
          <ui-otp-input-slot></ui-otp-input-slot>
          <ui-otp-input-slot></ui-otp-input-slot>
          <ui-otp-input-slot></ui-otp-input-slot>
          <ui-otp-input-slot></ui-otp-input-slot>
          <ui-otp-input-slot></ui-otp-input-slot>
          <ui-otp-input-slot></ui-otp-input-slot>
        </ui-otp-input-group>
      </ui-otp-input>
    </ui-field>
  `
  root
    .querySelector("ui-otp-input")!
    .addEventListener("valuechange", (event) => {
      const { value, reason } = event.detail
      log(root, `${value || "Empty"} (${reason})`)
    })
}

export { mount }
