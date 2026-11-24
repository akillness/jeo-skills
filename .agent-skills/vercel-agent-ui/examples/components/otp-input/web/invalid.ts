import "@ui-sdk/web/otp-input"
import "@ui-sdk/web/field"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-field invalid>
      <ui-field-label>Verification code</ui-field-label>
      <ui-otp-input default-value="482913">
        <ui-otp-input-group>
          <ui-otp-input-slot></ui-otp-input-slot>
          <ui-otp-input-slot></ui-otp-input-slot>
          <ui-otp-input-slot></ui-otp-input-slot>
          <ui-otp-input-slot></ui-otp-input-slot>
          <ui-otp-input-slot></ui-otp-input-slot>
          <ui-otp-input-slot></ui-otp-input-slot>
        </ui-otp-input-group>
      </ui-otp-input>
      <ui-field-error>That code has expired. Request a new one.</ui-field-error>
    </ui-field>
  `
  const field = root.querySelector("ui-field")!
  root.querySelector("ui-otp-input")!.addEventListener("valuechange", () => {
    field.invalid = false
  })
}

export { mount }
