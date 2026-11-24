import "@ui-sdk/web/otp-input"
import "@ui-sdk/web/field"
import { createElement, Minus } from "lucide"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-field>
      <ui-field-label>Recovery code</ui-field-label>
      <ui-otp-input max-length="8" pattern="alphanumeric">
        <ui-otp-input-group>
          <ui-otp-input-slot></ui-otp-input-slot>
          <ui-otp-input-slot></ui-otp-input-slot>
          <ui-otp-input-slot></ui-otp-input-slot>
          <ui-otp-input-slot></ui-otp-input-slot>
        </ui-otp-input-group>
        <ui-otp-input-separator>${createElement(Minus, { "aria-hidden": "true" }).outerHTML}</ui-otp-input-separator>
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
