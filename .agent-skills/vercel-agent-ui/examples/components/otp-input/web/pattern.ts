import "@ui-sdk/web/otp-input"
import "@ui-sdk/web/field"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-field>
      <ui-field-label>Device code</ui-field-label>
      <ui-otp-input max-length="6" pattern="[0-9A-Fa-f]" input-mode="text">
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
}

export { mount }
