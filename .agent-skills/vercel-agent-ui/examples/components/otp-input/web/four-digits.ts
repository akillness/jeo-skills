import "@ui-sdk/web/otp-input"
import "@ui-sdk/web/field"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-field>
      <ui-field-label>PIN</ui-field-label>
      <ui-otp-input max-length="4" text-align="center">
        <ui-otp-input-group>
          <ui-otp-input-slot></ui-otp-input-slot>
          <ui-otp-input-slot></ui-otp-input-slot>
          <ui-otp-input-slot></ui-otp-input-slot>
          <ui-otp-input-slot></ui-otp-input-slot>
        </ui-otp-input-group>
      </ui-otp-input>
    </ui-field>
  `
}

export { mount }
