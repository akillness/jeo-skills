import "@ui-sdk/web/otp-input"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-otp-input max-length="5" aria-label="Invite code">
      <ui-otp-input-group>
        <ui-otp-input-slot></ui-otp-input-slot>
        <ui-otp-input-slot></ui-otp-input-slot>
        <ui-otp-input-slot></ui-otp-input-slot>
        <ui-otp-input-slot></ui-otp-input-slot>
        <ui-otp-input-slot></ui-otp-input-slot>
      </ui-otp-input-group>
    </ui-otp-input>
  `
}

export { mount }
