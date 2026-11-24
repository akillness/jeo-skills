import "@ui-sdk/web/password-input"
import "@ui-sdk/web/field"
import { Check, createElement, Eye, EyeOff, X } from "lucide"

const rules = [
  {
    label: "At least 8 characters",
    test: (password: string) => password.length >= 8,
  },
  { label: "A number", test: (password: string) => /\d/.test(password) },
  {
    label: "An uppercase and a lowercase letter",
    test: (password: string) =>
      /[a-z]/.test(password) && /[A-Z]/.test(password),
  },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-field>
      <ui-field-label>Create a password</ui-field-label>
      <ui-password-input name="new-password">
        <input autocomplete="new-password" />
        <ui-password-input-toggle>
          <button aria-label="Show password">
            ${createElement(Eye, { "aria-hidden": "true" }).outerHTML}
            ${createElement(EyeOff, { "aria-hidden": "true" }).outerHTML}
          </button>
        </ui-password-input-toggle>
      </ui-password-input>
      <ul data-slot="stack" aria-label="Password requirements">
        ${rules
          .map(
            (rule) => `
              <li data-slot="row">
                ${createElement(X, { "aria-hidden": "true" }).outerHTML}
                ${createElement(Check, { "aria-hidden": "true" }).outerHTML}
                <span data-slot="visually-hidden" data-rule-status>To do:</span>
                ${rule.label}
              </li>
            `
          )
          .join("")}
      </ul>
    </ui-field>
  `
  const items = root.querySelectorAll("li")
  root
    .querySelector("ui-password-input")!
    .addEventListener("valuechange", (event) => {
      rules.forEach((rule, index) => {
        const met = rule.test(event.detail.value)
        items[index].toggleAttribute("data-met", met)
        items[index].querySelector("[data-rule-status]")!.textContent = met
          ? "Done:"
          : "To do:"
      })
    })
}

export { mount }
