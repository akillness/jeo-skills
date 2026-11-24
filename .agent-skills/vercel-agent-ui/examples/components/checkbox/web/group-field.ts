import "@ui-sdk/web/checkbox"
import "@ui-sdk/web/field"
import { Check, createElement } from "lucide"
import { log } from "../../../shared/web/log"

const channels = [
  { value: "email", label: "Email" },
  { value: "sms", label: "SMS" },
  { value: "push", label: "Push notifications" },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <form data-slot="stack">
      <ui-field>
        <ui-field-label>Notifications</ui-field-label>
        <ui-field-description>Choose how we tell you about your orders.</ui-field-description>
        <ui-checkbox-group name="notifications" required>
          ${channels
            .map(
              (channel) => `
                <label data-slot="label">
                  <ui-checkbox value="${channel.value}">
                    <ui-checkbox-indicator>
                      ${createElement(Check, { "aria-hidden": "true" }).outerHTML}
                    </ui-checkbox-indicator>
                  </ui-checkbox>
                  ${channel.label}
                </label>
              `
            )
            .join("")}
        </ui-checkbox-group>
        <div>
          <ui-field-error>Choose at least one way to be notified.</ui-field-error>
        </div>
      </ui-field>
      <button type="submit">Save</button>
    </form>
  `
  const form = root.querySelector("form")!
  form.addEventListener("submit", (event) => {
    event.preventDefault()
    const entries = [...new FormData(form)].map(
      ([name, value]) => `${name}=${value}`
    )
    log(root, `Saved ${entries.join("&")}`)
  })
}

export { mount }
