import "@ui-sdk/web/otp-input"
import { createElement, Minus } from "lucide"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-otp-input max-length="6" aria-label="Verification code">
      <ui-otp-input-group>
        <ui-otp-input-slot></ui-otp-input-slot>
        <ui-otp-input-slot></ui-otp-input-slot>
      </ui-otp-input-group>
      <ui-otp-input-separator>${createElement(Minus, { "aria-hidden": "true" }).outerHTML}</ui-otp-input-separator>
      <ui-otp-input-group>
        <ui-otp-input-slot></ui-otp-input-slot>
        <ui-otp-input-slot></ui-otp-input-slot>
      </ui-otp-input-group>
      <ui-otp-input-separator>${createElement(Minus, { "aria-hidden": "true" }).outerHTML}</ui-otp-input-separator>
      <ui-otp-input-group>
        <ui-otp-input-slot></ui-otp-input-slot>
        <ui-otp-input-slot></ui-otp-input-slot>
      </ui-otp-input-group>
    </ui-otp-input>
  `
}

export { mount }
