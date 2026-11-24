import "@ui-sdk/web/password-input"
import "@ui-sdk/web/field"
import { createElement, Eye, EyeOff } from "lucide"

function strength(password: string) {
  return [
    password.length >= 8,
    password.length >= 12,
    /[a-z]/.test(password) && /[A-Z]/.test(password),
    /\d/.test(password) && /[^a-zA-Z\d]/.test(password),
  ].filter(Boolean).length
}

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-field>
      <ui-field-label>New password</ui-field-label>
      <ui-password-input name="new-password">
        <input autocomplete="new-password" />
        <ui-password-input-toggle>
          <button aria-label="Show password">
            ${createElement(Eye, { "aria-hidden": "true" }).outerHTML}
            ${createElement(EyeOff, { "aria-hidden": "true" }).outerHTML}
          </button>
        </ui-password-input-toggle>
      </ui-password-input>
      <div data-slot="strength" aria-hidden="true">
        <div></div>
        <div></div>
        <div></div>
        <div></div>
      </div>
      <output data-slot="output">Type a password to rate it.</output>
    </ui-field>
  `
  const bars = root.querySelectorAll('[data-slot="strength"] > div')
  const output = root.querySelector("output")!
  root
    .querySelector("ui-password-input")!
    .addEventListener("valuechange", (event) => {
      const value = event.detail.value
      const score = strength(value)
      bars.forEach((bar, index) =>
        bar.toggleAttribute("data-on", score > index)
      )
      output.textContent = value
        ? `Strength: ${["Weak", "Weak", "Fair", "Good", "Strong"][score]} (${value.length} characters)`
        : "Type a password to rate it."
    })
}

export { mount }
