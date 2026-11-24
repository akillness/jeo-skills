import "@ui-sdk/web/otp-input"
import "@ui-sdk/web/field"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-field dir="rtl">
      <ui-field-label>رمز التحقق</ui-field-label>
      <ui-otp-input max-length="6">
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
