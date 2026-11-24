import "@ui-sdk/web/field"
import "@ui-sdk/web/radio"
import { log } from "../../../shared/web/log"

const channels = [
  { value: "email", label: "Email only" },
  { value: "sms", label: "SMS only" },
  { value: "both", label: "Email and SMS" },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <form data-slot="stack">
      <ui-field>
        <ui-field-label>Order updates</ui-field-label>
        <ui-field-description>Choose how we tell you about your orders.</ui-field-description>
        <ui-radio-group name="updates" required>
          ${channels
            .map(
              (channel) => `
                <label data-slot="label">
                  <ui-radio value="${channel.value}">
                    <ui-radio-indicator></ui-radio-indicator>
                  </ui-radio>
                  ${channel.label}
                </label>
              `
            )
            .join("")}
        </ui-radio-group>
        <ui-field-error>Choose how to get order updates.</ui-field-error>
      </ui-field>
      <div data-slot="row">
        <button type="submit" data-variant="solid">Save</button>
      </div>
    </form>
  `
  const form = root.querySelector("form")!
  form.addEventListener("submit", (event) => {
    event.preventDefault()
    log(root, `Saved updates=${new FormData(form).get("updates")}`)
  })
}

export { mount }
